// «Обзор» панели администратора: новые ученики, открывавшие приложение, выученные слова, сданные викторины.
//
// Дни считаются по Иерусалиму (как неделя таблицы лидеров). Прошедшие дни считаются один раз и сохраняются в
// daily_stats: при следующих открытиях панели они читаются одной строкой. Сегодняшние цифры считаются на лету
// по индексам (миграция 0006). Так панель почти не тратит общий с уроками лимит чтений D1 (вопрос 26).
import {
  LEADERBOARD_TZ,
  epochDayToIso,
  localDayStartMs,
  localEpochDay,
  type AdminOverviewResponse,
  type DayNumbers,
  type OverviewDay,
} from "@milav/shared";

/** Сколько прошедших дней показывает «Обзор» (и сколько нужно для сравнения двух недель). */
export const OVERVIEW_DAYS = 14;

const TZ = LEADERBOARD_TZ;

/** Момент начала дня `day` по Иерусалиму (мс). */
export const dayStartMs = (day: number): number => localDayStartMs(TZ, day);

/** Время в формате базы (`YYYY-MM-DD HH:MM:SS`, UTC). */
const dbTime = (ms: number) => new Date(ms).toISOString().replace("T", " ").slice(0, 19);

/** Четыре запроса за один день: новые, открывавшие, выученные слова и буквы, сданные викторины. */
function dayStatements(db: D1Database, day: number) {
  const from = dbTime(dayStartMs(day));
  const to = dbTime(dayStartMs(day + 1));
  return [
    db.prepare("SELECT COUNT(*) AS n FROM users WHERE created_at >= ?1 AND created_at < ?2").bind(from, to),
    db.prepare("SELECT COUNT(*) AS n FROM activity_days WHERE day = ?1").bind(day),
    db.prepare("SELECT COUNT(*) AS n FROM word_progress WHERE completed_at >= ?1 AND completed_at < ?2").bind(from, to),
    db.prepare("SELECT COUNT(*) AS n FROM quiz_attempts WHERE passed = 1 AND created_at >= ?1 AND created_at < ?2").bind(from, to),
  ];
}

type CountResult = { results?: unknown[] };
const countOf = (r: CountResult | undefined) => Number((r?.results?.[0] as { n?: number } | undefined)?.n ?? 0);

function toNumbers(results: CountResult[], offset: number): DayNumbers {
  return {
    newUsers: countOf(results[offset]),
    active: countOf(results[offset + 1]),
    learned: countOf(results[offset + 2]),
    quizzesPassed: countOf(results[offset + 3]),
  };
}

const ZERO: DayNumbers = { newUsers: 0, active: 0, learned: 0, quizzesPassed: 0 };

function sum(days: DayNumbers[]): DayNumbers {
  return days.reduce(
    (acc, d) => ({
      newUsers: acc.newUsers + d.newUsers,
      active: 0,
      learned: acc.learned + d.learned,
      quizzesPassed: acc.quizzesPassed + d.quizzesPassed,
    }),
    ZERO,
  );
}

function isDayNumbers(value: unknown): value is DayNumbers {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return ["newUsers", "active", "learned", "quizzesPassed"].every((k) => typeof v[k] === "number");
}

/** Номер сегодняшнего дня по Иерусалиму. */
export const todayDay = (nowMs: number) => localEpochDay(TZ, nowMs);

/**
 * Собирает «Обзор». Недостающие прошедшие дни (первое открытие панели за сутки) считаются и сохраняются одним пакетом.
 * «Открывали за неделю» это разные люди за 7 дней, а не сумма дневных цифр: считается по activity_days на лету.
 */
export async function buildOverview(db: D1Database, nowMs: number): Promise<AdminOverviewResponse> {
  const today = todayDay(nowMs);
  const first = today - OVERVIEW_DAYS;

  const { results: stored } = await db
    .prepare("SELECT day, data FROM daily_stats WHERE day >= ?1 AND day < ?2")
    .bind(first, today)
    .all<{ day: number; data: string }>();
  const past = new Map<number, DayNumbers>();
  for (const row of stored) {
    try {
      const data = JSON.parse(row.data) as unknown;
      if (isDayNumbers(data)) past.set(row.day, data);
    } catch {
      // Испорченная строка будет пересчитана.
    }
  }
  const missing: number[] = [];
  for (let day = first; day < today; day++) if (!past.has(day)) missing.push(day);

  // Один пакет: сегодня, недостающие дни, разные люди за две недели, всего учеников, первый день посещений.
  const statements = [
    ...dayStatements(db, today),
    ...missing.flatMap((day) => dayStatements(db, day)),
    db.prepare("SELECT COUNT(DISTINCT user_id) AS n FROM activity_days WHERE day > ?1 AND day <= ?2").bind(today - 7, today),
    db.prepare("SELECT COUNT(DISTINCT user_id) AS n FROM activity_days WHERE day > ?1 AND day <= ?2").bind(today - 14, today - 7),
    db.prepare("SELECT COUNT(*) AS n FROM users"),
    db.prepare("SELECT MIN(day) AS n FROM activity_days"),
  ];
  const results = (await db.batch(statements)) as CountResult[];

  const todayNumbers = toNumbers(results, 0);
  missing.forEach((day, i) => past.set(day, toNumbers(results, 4 + i * 4)));
  const tail = 4 + missing.length * 4;
  const weekActive = countOf(results[tail]);
  const prevWeekActive = countOf(results[tail + 1]);
  const totalUsers = countOf(results[tail + 2]);
  const firstActivity = (results[tail + 3]?.results?.[0] as { n?: number | null } | undefined)?.n ?? null;

  if (missing.length > 0) {
    const builtAt = Math.floor(nowMs / 1000);
    await db.batch(
      missing.map((day) =>
        db
          .prepare("INSERT OR REPLACE INTO daily_stats (day, data, built_at) VALUES (?1, ?2, ?3)")
          .bind(day, JSON.stringify(past.get(day)), builtAt),
      ),
    );
  }

  const numbersOf = (day: number) => (day === today ? todayNumbers : (past.get(day) ?? ZERO));
  const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => numbersOf(from + i));
  const days: OverviewDay[] = [];
  for (let day = today - 1; day >= first; day--) days.push({ date: epochDayToIso(day), ...numbersOf(day) });

  return {
    today: { date: epochDayToIso(today), ...todayNumbers },
    week: { ...sum(range(today - 6, today)), active: weekActive },
    prevWeek: { ...sum(range(today - 13, today - 7)), active: prevWeekActive },
    days,
    totalUsers,
    activeSince: firstActivity === null ? null : epochDayToIso(firstActivity),
  };
}

/** Отмечает, что человек открывал приложение сегодня (по Иерусалиму). Повторная отметка ничего не пишет. */
export async function recordActivity(db: D1Database, userId: number, nowMs: number): Promise<void> {
  await db.prepare("INSERT OR IGNORE INTO activity_days (day, user_id) VALUES (?1, ?2)").bind(todayDay(nowMs), userId).run();
}

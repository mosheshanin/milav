// Геймификация: достижения, настройки, таблица лидеров, сравнение (docs/GAMIFICATION.md, раздел 10).
// Клиент присылает только свои настройки и часовой пояс: очки, бейджи, дни и места считает сервер.
import { Hono } from "hono";
import {
  DAILY_GOAL_OPTIONS,
  MAX_SEEN_IDS,
  RHYTHM_DAYS_PER_WEEK,
  isValidTimeZone,
  localEpochDay,
  statusPath,
  viewPlay,
  type AchievementsResponse,
  type PlayInfo,
  type SettingsRequest,
} from "@milav/shared";
import { catalog } from "@milav/content";
import { requireUser } from "./auth";
import type { AuthUser } from "./auth";
import { buildLeaderboard, type Board } from "./board";
import { parseJson, readBodyLimited } from "./body";
import { buildCohort } from "./cohort";
import { ensureUser } from "./db";
import type { AppEnv, Bindings } from "./env";
import { rateLimit } from "./rateLimit";
import { ensureStats, loadStats, metricsOf, nextTimezone, reconcileBadges, type Stats } from "./stats";

export const nowSeconds = () => Math.floor(Date.now() / 1000);

export const leaderboardEnabled = (env: Bindings): boolean => env.LEADERBOARD_ENABLED === "1";

/** Сколько бейджей человек ещё не видел (поздравление не показано или ответ потерялся). */
export async function countUnseen(db: D1Database, userId: number): Promise<number> {
  const row = await db
    .prepare("SELECT COUNT(*) AS n FROM user_badges WHERE user_id = ? AND seen = 0")
    .bind(userId)
    .first<{ n: number }>();
  return row?.n ?? 0;
}

/** Блок «Мой путь» для приложения. */
export function buildPlayInfo(stats: Stats, unseenBadges: number, now: number, env: Bindings): PlayInfo {
  const view = viewPlay(stats.play, localEpochDay(stats.tz, now * 1000), stats.dailyGoal);
  return {
    tz: stats.tz,
    statusPath: statusPath(stats.passedLessons),
    week: {
      days: view.days,
      todayIndex: view.todayIndex,
      daysThisWeek: view.daysThisWeek,
      target: RHYTHM_DAYS_PER_WEEK,
      wordsThisWeek: view.wordsThisWeek,
      rhythmWeeks: view.rhythmWeeks,
      rhythmLast8: view.rhythmLast8,
    },
    goal: view.goal,
    activeDays: stats.play.activeDays,
    unseenBadges,
    recap: view.recap,
    settings: { dailyGoal: stats.dailyGoal, leaderboard: stats.lbOptin && !stats.lbBanned, cohortExcluded: stats.cohortExcluded },
    features: { leaderboard: leaderboardEnabled(env) },
  };
}

/** Счётчики пользователя; строка создаётся, если её ещё нет (в том числе пользователь в users). */
export async function statsFor(db: D1Database, user: AuthUser, now: number, tz?: string): Promise<Stats> {
  const existing = await loadStats(db, user.id);
  if (existing) return existing;
  await ensureUser(db, user);
  return ensureStats(db, user.id, { now, tz });
}

/** Меняет часовой пояс, если приложение прислало другой и сегодня его ещё не меняли. */
export async function applyTimezone(db: D1Database, stats: Stats, requested: unknown, now: number): Promise<Stats> {
  const next = nextTimezone(stats, requested, now);
  if (!next) return stats;
  await db.prepare("UPDATE user_stats SET tz = ?, tz_changed_day = ? WHERE user_id = ?").bind(next.tz, next.changedDay, stats.userId).run();
  return { ...stats, tz: next.tz, tzChangedDay: next.changedDay };
}

async function readJson<T>(request: Request): Promise<T | null> {
  const bytes = await readBodyLimited(request, 16 * 1024);
  return bytes ? parseJson<T>(bytes) : null;
}

export const playRoutes = new Hono<AppEnv>();

// Полученные бейджи и счётчики для полос «7 из 10». Заодно лечит потерянную выдачу: недостающие бейджи выдаются здесь.
playRoutes.get("/api/achievements", requireUser, async (c) => {
  const user = c.get("user");
  const now = nowSeconds();
  const stats = await statsFor(c.env.DB, user, now);
  await reconcileBadges(c.env.DB, stats, { now, retro: false });
  const { results } = await c.env.DB
    .prepare("SELECT badge_id, earned_at, retro, seen FROM user_badges WHERE user_id = ?")
    .bind(user.id)
    .all<{ badge_id: string; earned_at: number; retro: number; seen: number }>();
  const body: AchievementsResponse = {
    earned: results
      .filter((r) => catalog.byId.has(r.badge_id))
      .map((r) => ({ id: r.badge_id, earnedAt: r.earned_at, seen: !!r.seen, retro: !!r.retro })),
    counters: metricsOf(stats),
    catalogVersion: catalog.version,
  };
  return c.json(body);
});

// Человек увидел поздравление: отметка только по своим бейджам.
playRoutes.post("/api/achievements/seen", requireUser, rateLimit("seen"), async (c) => {
  const body = await readJson<{ ids?: unknown }>(c.req.raw);
  if (!body || !Array.isArray(body.ids) || body.ids.length > MAX_SEEN_IDS || body.ids.some((id) => typeof id !== "string" || id.length > 64)) {
    return c.json({ error: "bad_request" }, 400);
  }
  const ids = [...new Set(body.ids as string[])];
  if (ids.length === 0) return c.json({ ok: true, marked: 0 });
  const marks = ids.map(() => "?").join(", ");
  const res = await c.env.DB
    .prepare(`UPDATE user_badges SET seen = 1 WHERE user_id = ? AND seen = 0 AND badge_id IN (${marks})`)
    .bind(c.get("user").id, ...ids)
    .run();
  return c.json({ ok: true, marked: res.meta?.changes ?? 0 });
});

const SETTING_KEYS = new Set(["leaderboard", "dailyGoal", "tz", "cohortExcluded"]);

// Настройки: цель дня, участие в таблице, учёт в сравнении, часовой пояс.
playRoutes.put("/api/settings", requireUser, rateLimit("settings"), async (c) => {
  const user = c.get("user");
  const body = await readJson<Record<string, unknown>>(c.req.raw);
  if (typeof body !== "object" || body === null || Array.isArray(body)) return c.json({ error: "bad_request" }, 400);
  if (Object.keys(body).some((key) => !SETTING_KEYS.has(key))) return c.json({ error: "bad_request" }, 400);
  const req = body as SettingsRequest;

  if (req.leaderboard !== undefined && typeof req.leaderboard !== "boolean") return c.json({ error: "bad_request" }, 400);
  if (req.cohortExcluded !== undefined && typeof req.cohortExcluded !== "boolean") return c.json({ error: "bad_request" }, 400);
  if (req.dailyGoal !== undefined && !(DAILY_GOAL_OPTIONS as readonly unknown[]).includes(req.dailyGoal)) {
    return c.json({ error: "bad_goal" }, 400);
  }
  if (req.tz !== undefined && !isValidTimeZone(req.tz)) return c.json({ error: "bad_tz" }, 400);
  // Вступить в таблицу можно только когда она включена; выйти можно всегда.
  if (req.leaderboard === true && !leaderboardEnabled(c.env)) return c.json({ error: "feature_disabled" }, 403);

  const now = nowSeconds();
  let stats = await statsFor(c.env.DB, user, now);
  if (req.tz !== undefined) stats = await applyTimezone(c.env.DB, stats, req.tz, now);

  // Имена столбцов фиксированы здесь, значения идут параметрами.
  const sets: string[] = [];
  const values: number[] = [];
  if (req.leaderboard !== undefined) {
    sets.push("lb_optin = ?");
    values.push(req.leaderboard ? 1 : 0);
  }
  if (req.dailyGoal !== undefined) {
    sets.push("daily_goal = ?");
    values.push(req.dailyGoal);
  }
  if (req.cohortExcluded !== undefined) {
    sets.push("cohort_excluded = ?");
    values.push(req.cohortExcluded ? 1 : 0);
  }
  if (sets.length > 0) {
    await c.env.DB.prepare(`UPDATE user_stats SET ${sets.join(", ")} WHERE user_id = ?`).bind(...values, user.id).run();
  }

  const fresh = (await loadStats(c.env.DB, user.id)) ?? stats;
  return c.json({ play: buildPlayInfo(fresh, await countUnseen(c.env.DB, user.id), now, c.env) });
});

// Таблица лидеров: «неделя» или «всё время». Выключена, пока не выпущена политика конфиденциальности.
playRoutes.get("/api/leaderboard", requireUser, async (c) => {
  if (!leaderboardEnabled(c.env)) return c.json({ error: "feature_disabled" }, 404);
  const board = c.req.query("board") ?? "week";
  if (board !== "week" && board !== "all") return c.json({ error: "bad_request" }, 400);
  const now = nowSeconds();
  const viewer = await statsFor(c.env.DB, c.get("user"), now);
  return c.json(await buildLeaderboard(c.env.DB, board as Board, viewer, now));
});

// Сравнение с теми, кто начал учиться в то же время: только числа, без имён.
playRoutes.get("/api/cohort", requireUser, async (c) => {
  const now = nowSeconds();
  const viewer = await statsFor(c.env.DB, c.get("user"), now);
  return c.json(await buildCohort(c.env.DB, viewer, now));
});

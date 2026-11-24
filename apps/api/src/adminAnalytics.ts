// «Аналитика» панели администратора (этап 4, 24.11.2026, docs/ADMIN.md «Аналитика: как сделано»): удержание по неделям
// прихода, воронка, уроки (где бросают, сдача, средний балл), трудные слова и произношение.
//
// Считается на лету одним пакетом запросов при открытии раздела. Панель открывает только команда и редко, а самые
// большие чтения (word_progress по урокам) растут вместе с учениками: при 100 учениках около 50 тысяч строк за открытие
// из 5 миллионов бесплатных чтений в день (docs/DEPLOY.md, «Нагрузка и бесплатный тариф»). Если станет дорого,
// уроки можно кэшировать в daily_stats, как «Обзор».
import { allLessons, alphabetAll, findLetter, findWord, getAnyLesson } from "@milav/content";
import {
  ALPHABET_ALL_ID,
  LEADERBOARD_TZ,
  QUESTION_TITLES,
  epochDayToIso,
  isAlphabetLesson,
  localEpochDay,
  parseDbTime,
  weekIndex,
  weekStartDay,
  type AdminAnalyticsResponse,
  type AnyLesson,
  type FunnelStep,
  type HardItem,
  type LessonAnalytics,
  type QuestionType,
  type RetentionCohort,
} from "@milav/shared";

const TZ = LEADERBOARD_TZ;
/** Сколько недель прихода показывает удержание. */
export const RETENTION_WEEKS = 8;
/** Слово попадает в «трудные», если его спросили этим типом хотя бы столько раз (иначе одна ошибка даёт 100%). */
export const HARD_MIN_ASKED = 5;
export const HARD_LIMIT = 20;
export const SPEECH_HARD_LIMIT = 10;
/** Через сколько дней после прихода смотрим, вернулся ли человек. */
const RETURN_AFTER = [1, 7, 30] as const;

/** Название урока для панели: «Животные 1. Домашние», «Алфавит 2. …», «Общая викторина по алфавиту». */
export function lessonLabel(lesson: AnyLesson | undefined, id: string): string {
  if (id === ALPHABET_ALL_ID) return "Общая викторина по алфавиту";
  if (!lesson) return id;
  const topic = isAlphabetLesson(lesson) ? "Алфавит" : lesson.topic;
  return `${topic} ${lesson.number}. ${lesson.title}`;
}

/** Номер дня по Иерусалиму для времени из базы. */
const dbDay = (value: string): number | null => {
  const ms = parseDbTime(value);
  return Number.isNaN(ms) ? null : localEpochDay(TZ, ms);
};

/** Иврит и перевод слова или буквы по id (вопросы викторины спрашивают и то и другое). */
function itemText(itemId: string): { he: string; ru: string; lessonTitle: string } {
  const word = findWord(itemId);
  if (word) return { he: word.word.he, ru: word.word.ru, lessonTitle: lessonLabel(word.lesson, word.lesson.id) };
  const letter = findLetter(itemId);
  if (letter) return { he: letter.letter.he, ru: letter.letter.name.ru, lessonTitle: lessonLabel(letter.lesson, letter.lesson.id) };
  return { he: "", ru: itemId, lessonTitle: "" };
}

const questionTitle = (type: string) => QUESTION_TITLES[type as QuestionType] ?? type;

type Row = Record<string, unknown>;
const rows = (r: { results?: unknown[] } | undefined) => (r?.results ?? []) as Row[];
const num = (v: unknown) => Number(v ?? 0);

/**
 * Удержание: для каждой из последних недель прихода доля новичков, открывавших приложение через 1, 7 и 30 дней и позже
 * (последний день посещения не раньше дня прихода + N). Считаются только те, у кого N дней уже прошло; если таких нет,
 * значение null («рано»). Недели до появления таблицы посещений (activity_days) не показываются: там нечего считать.
 */
export function retentionOf(
  users: { createdDay: number; lastDay: number | null }[],
  today: number,
  activeSince: number | null,
): RetentionCohort[] {
  if (activeSince === null) return [];
  const thisWeek = weekIndex(today);
  const firstWeek = Math.max(thisWeek - RETENTION_WEEKS + 1, weekIndex(activeSince));
  const cohorts: RetentionCohort[] = [];
  for (let week = thisWeek; week >= firstWeek; week--) {
    const members = users.filter((u) => weekIndex(u.createdDay) === week);
    const rate = (n: number): number | null => {
      const eligible = members.filter((u) => u.createdDay + n <= today);
      if (eligible.length === 0) return null;
      const back = eligible.filter((u) => u.lastDay !== null && u.lastDay >= u.createdDay + n).length;
      return back / eligible.length;
    };
    const [d1, d7, d30] = RETURN_AFTER.map(rate);
    cohorts.push({ week: epochDayToIso(weekStartDay(week)), size: members.length, d1: d1 ?? null, d7: d7 ?? null, d30: d30 ?? null });
  }
  return cohorts;
}

/** Самые трудные пары «слово + тип вопроса» по доле ошибок (при равенстве чаще спрошенные выше). */
export function hardestOf(stats: { itemId: string; type: string; asked: number; correct: number }[], limit: number): HardItem[] {
  return stats
    .filter((s) => s.asked >= HARD_MIN_ASKED && s.correct < s.asked)
    .sort((a, b) => a.correct / a.asked - b.correct / b.asked || b.asked - a.asked)
    .slice(0, limit)
    .map((s) => ({ itemId: s.itemId, ...itemText(s.itemId), questionType: s.type, questionTitle: questionTitle(s.type), asked: s.asked, correct: s.correct }));
}

export async function buildAnalytics(db: D1Database, nowMs: number): Promise<AdminAnalyticsResponse> {
  const today = localEpochDay(TZ, nowMs);
  const since = today - RETENTION_WEEKS * 7 - 7;
  // С запасом в день: дни по Иерусалиму, а время в базе UTC; лишних учеников отсечёт сравнение недель.
  const sinceDb = new Date((since - 1) * 86_400_000).toISOString().replace("T", " ").slice(0, 19);

  const [newUsers, firstActivity, funnelRow, fiveRow, progressRows, attemptRows, passedRows, questionRows] = await db.batch([
    db
      .prepare("SELECT u.created_at AS created, (SELECT MAX(day) FROM activity_days a WHERE a.user_id = u.id) AS last FROM users u WHERE u.created_at >= ?")
      .bind(sinceDb),
    db.prepare("SELECT MIN(day) AS n FROM activity_days"),
    db.prepare(
      `SELECT (SELECT COUNT(*) FROM users) AS joined,
              (SELECT COUNT(DISTINCT user_id) FROM word_progress WHERE completed_at IS NOT NULL) AS firstItem,
              (SELECT COUNT(DISTINCT user_id) FROM quiz_attempts) AS firstQuiz,
              (SELECT COUNT(DISTINCT user_id) FROM lesson_passed) AS firstPassed`,
    ),
    db.prepare("SELECT COUNT(*) AS n FROM (SELECT user_id FROM lesson_passed GROUP BY user_id HAVING COUNT(*) >= 5)"),
    db.prepare(
      `SELECT lesson_id AS lesson, COUNT(*) AS rows, SUM(completed_at IS NOT NULL) AS done
       FROM word_progress GROUP BY lesson_id, user_id`,
    ),
    db.prepare(
      `SELECT lesson_id AS lesson, COUNT(*) AS attempts, SUM(passed) AS passed, AVG(correct * 100.0 / total) AS avg
       FROM quiz_attempts WHERE total > 0 GROUP BY lesson_id`,
    ),
    db.prepare("SELECT lesson_id AS lesson, COUNT(*) AS n FROM lesson_passed GROUP BY lesson_id"),
    db.prepare("SELECT word_id AS item, question_type AS type, asked, correct FROM question_stats"),
  ]);

  // Удержание.
  const activeSinceDay = (rows(firstActivity)[0]?.n as number | null | undefined) ?? null;
  const cohortUsers = rows(newUsers)
    .map((r) => ({ createdDay: dbDay(String(r.created)), lastDay: r.last === null || r.last === undefined ? null : num(r.last) }))
    .filter((u): u is { createdDay: number; lastDay: number | null } => u.createdDay !== null);
  const retention = retentionOf(cohortUsers, today, activeSinceDay);

  // Воронка.
  const f = rows(funnelRow)[0] ?? {};
  const funnel: FunnelStep[] = [
    { key: "joined", title: "Открыли приложение", users: num(f.joined) },
    { key: "firstItem", title: "Выучили первую букву или слово", users: num(f.firstItem) },
    { key: "firstQuiz", title: "Закончили первую викторину", users: num(f.firstQuiz) },
    { key: "firstPassed", title: "Сдали первый урок", users: num(f.firstPassed) },
    { key: "fivePassed", title: "Сдали 5 уроков", users: num(rows(fiveRow)[0]?.n) },
  ];

  // Уроки: начали, прошли все слова, попытки, сдали. Порядок как на главной.
  const started = new Map<string, number>();
  const learnedAll = new Map<string, number>();
  for (const r of rows(progressRows)) {
    const id = String(r.lesson);
    started.set(id, (started.get(id) ?? 0) + 1);
    const lesson = getAnyLesson(id);
    const size = lesson ? (isAlphabetLesson(lesson) ? lesson.letters.length : lesson.words.length) : Infinity;
    if (num(r.done) >= size) learnedAll.set(id, (learnedAll.get(id) ?? 0) + 1);
  }
  const attempts = new Map(rows(attemptRows).map((r) => [String(r.lesson), r]));
  const passed = new Map(rows(passedRows).map((r) => [String(r.lesson), num(r.n)]));
  const order = [...allLessons.map((l) => l.id), ALPHABET_ALL_ID];
  const lessons: LessonAnalytics[] = order
    .filter((id) => started.has(id) || attempts.has(id))
    .map((id) => {
      const a = attempts.get(id);
      const avg = a?.avg;
      return {
        lessonId: id,
        title: lessonLabel(id === ALPHABET_ALL_ID ? alphabetAll : getAnyLesson(id), id),
        started: started.get(id) ?? 0,
        learnedAll: learnedAll.get(id) ?? 0,
        attempts: num(a?.attempts),
        passedAttempts: num(a?.passed),
        avgPercent: avg === null || avg === undefined ? null : Math.round(Number(avg)),
        passedUsers: passed.get(id) ?? 0,
      };
    });

  // Трудные слова и произношение.
  const stats = rows(questionRows).map((r) => ({ itemId: String(r.item), type: String(r.type), asked: num(r.asked), correct: num(r.correct) }));
  const speak = stats.filter((s) => s.type === "speak");

  return {
    activeSince: activeSinceDay === null ? null : epochDayToIso(activeSinceDay),
    retention,
    funnel,
    lessons,
    hardMinAsked: HARD_MIN_ASKED,
    hardItems: hardestOf(stats, HARD_LIMIT),
    speech: {
      asked: speak.reduce((n, s) => n + s.asked, 0),
      correct: speak.reduce((n, s) => n + s.correct, 0),
      hardest: hardestOf(speak, SPEECH_HARD_LIMIT),
    },
  };
}

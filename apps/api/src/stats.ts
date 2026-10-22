// Счётчики, ритм и бейджи пользователя в D1 (таблицы user_stats и user_badges, миграция 0005).
// Описание и расчёт расхода: docs/GAMIFICATION.md, разделы 5, 9 и 11.
import { catalog, contentInfo, getAnyLesson } from "@milav/content";
import {
  DEFAULT_DAILY_GOAL,
  DEFAULT_LEARNER_GENDER,
  DEFAULT_TZ,
  EMPTY_PLAY,
  LEADERBOARD_TZ,
  POINTS_PER_WORD,
  REPEAT_LAST_BOX,
  SECTION_BITS,
  applyActivity,
  closedTopics,
  crossedBadges,
  eligibleBadges,
  isGender,
  isValidTimeZone,
  localEpochDay,
  parseDbTime,
  popcount,
  statusForPassedLessons,
  utcEpochDay,
  viewPlay,
  weekIndex,
  type Gender,
  type Metrics,
  type PlayState,
  type StatusInfo,
} from "@milav/shared";

/** Сведения о контенте считаются один раз: контент не меняется, пока работает Worker. */
export const INFO = contentInfo();

export interface Stats {
  userId: number;
  wordsDone: number;
  lettersDone: number;
  passedLessons: number;
  alphabetLessons: number;
  perfectQuizzes: number;
  topicsClosed: number;
  sectionsMask: number;
  /** Повторение слов: сколько раз вспомнил и сколько слов дошло до последней коробки. */
  repeatsDone: number;
  wordsMastered: number;
  tz: string;
  tzChangedDay: number;
  /** Дни, недели ритма, цель дня и возвращения (минимальный конечный автомат из пакета shared). */
  play: PlayState;
  dailyGoal: number;
  lbOptin: boolean;
  lbBanned: boolean;
  lbWeekIdx: number;
  lbWeekPoints: number;
  lbUpdatedAt: number;
  cohortWeek: number;
  cohortExcluded: boolean;
  /** Род ученика для фраз-примеров (миграция 0010). */
  gender: Gender;
  badgesVer: number;
  createdAt: number;
}

interface StatsRow {
  user_id: number;
  words_done: number;
  letters_done: number;
  passed_lessons: number;
  alphabet_lessons: number;
  perfect_quizzes: number;
  topics_closed: number;
  sections_mask: number;
  repeats_done: number;
  words_mastered: number;
  returns: number;
  tz: string;
  tz_changed_day: number;
  active_days: number;
  last_day: number;
  week_idx: number;
  week_days: number;
  week_words: number;
  rhythm_weeks: number;
  rhythm_hist: number;
  prev_week_idx: number;
  prev_week_days: number;
  prev_week_words: number;
  daily_goal: number;
  goal_day: number;
  goal_words: number;
  goal_days: number;
  lb_optin: number;
  lb_banned: number;
  lb_week_idx: number;
  lb_week_points: number;
  lb_updated_at: number;
  cohort_week: number;
  cohort_excluded: number;
  gender: string | null;
  badges_ver: number;
  created_at: number;
}

function fromRow(r: StatsRow): Stats {
  return {
    userId: r.user_id,
    wordsDone: r.words_done,
    lettersDone: r.letters_done,
    passedLessons: r.passed_lessons,
    alphabetLessons: r.alphabet_lessons,
    perfectQuizzes: r.perfect_quizzes,
    topicsClosed: r.topics_closed,
    sectionsMask: r.sections_mask,
    repeatsDone: r.repeats_done ?? 0,
    wordsMastered: r.words_mastered ?? 0,
    tz: r.tz,
    tzChangedDay: r.tz_changed_day,
    play: {
      activeDays: r.active_days,
      lastDay: r.last_day,
      weekIdx: r.week_idx,
      weekDays: r.week_days,
      weekWords: r.week_words,
      rhythmWeeks: r.rhythm_weeks,
      rhythmHist: r.rhythm_hist,
      prevWeekIdx: r.prev_week_idx,
      prevWeekDays: r.prev_week_days,
      prevWeekWords: r.prev_week_words,
      returns: r.returns,
      goalDay: r.goal_day,
      goalWords: r.goal_words,
      goalDays: r.goal_days,
    },
    dailyGoal: r.daily_goal,
    lbOptin: !!r.lb_optin,
    lbBanned: !!r.lb_banned,
    lbWeekIdx: r.lb_week_idx,
    lbWeekPoints: r.lb_week_points,
    lbUpdatedAt: r.lb_updated_at,
    cohortWeek: r.cohort_week,
    cohortExcluded: !!r.cohort_excluded,
    gender: isGender(r.gender) ? r.gender : DEFAULT_LEARNER_GENDER,
    badgesVer: r.badges_ver,
    createdAt: r.created_at,
  };
}

/** Счётчики, по которым выдаются бейджи. */
export function metricsOf(s: Stats): Metrics {
  return {
    words: s.wordsDone,
    letters: s.lettersDone,
    lessons: s.passedLessons,
    alphabetLessons: s.alphabetLessons,
    perfectQuizzes: s.perfectQuizzes,
    topicsClosed: s.topicsClosed,
    sections: popcount(s.sectionsMask),
    activeDays: s.play.activeDays,
    rhythmWeeks: s.play.rhythmWeeks,
    goalDays: s.play.goalDays,
    returns: s.play.returns,
    repeats: s.repeatsDone,
    mastered: s.wordsMastered,
  };
}

export interface Totals {
  points: number;
  passedLessons: number;
  status: StatusInfo;
}

/** Очки и статус из счётчиков (раньше считались двумя COUNT(*) по таблицам прогресса при каждом запросе). */
export function totalsOf(s: Stats): Totals {
  return {
    points: (s.wordsDone + s.lettersDone) * POINTS_PER_WORD,
    passedLessons: s.passedLessons,
    status: statusForPassedLessons(s.passedLessons),
  };
}

export async function loadStats(db: D1Database, userId: number): Promise<Stats | null> {
  const row = await db.prepare("SELECT * FROM user_stats WHERE user_id = ?").bind(userId).first<StatsRow>();
  return row ? fromRow(row) : null;
}

/** Id сданных уроков пользователя. */
export async function loadPassedIds(db: D1Database, userId: number): Promise<Set<string>> {
  const { results } = await db.prepare("SELECT lesson_id FROM lesson_passed WHERE user_id = ?").bind(userId).all<{ lesson_id: string }>();
  return new Set(results.map((r) => r.lesson_id));
}

const isAlphabetId = (lessonId: string): boolean => (getAnyLesson(lessonId)?.section ?? (lessonId.startsWith("alphabet-") ? "alphabet" : "")) === "alphabet";

/** Время из базы в секундах Unix; битая строка даёт `fallback`. */
function dbSeconds(value: string | null | undefined, fallback: number): number {
  const ms = value ? parseDbTime(value) : NaN;
  return Number.isNaN(ms) ? fallback : Math.floor(ms / 1000);
}

/** Моменты событий по счётчикам (секунды Unix, по возрастанию): из них восстанавливается дата бейджей задним числом. */
interface Timelines {
  words: number[];
  letters: number[];
  lessons: number[];
  alphabetLessons: number[];
  activeDays: number[];
}

interface Recount {
  stats: Stats;
  passed: Set<string>;
  timelines: Timelines;
}

/**
 * Пересчёт всех счётчиков по таблицам прогресса. Нужен один раз на пользователя (при первом запросе после выпуска):
 * так подхватывается прежний прогресс. Цель дня задним числом не засчитывается (цель появилась только сейчас).
 */
async function recount(db: D1Database, userId: number, tz: string, now: number): Promise<Recount> {
  const [progress, passedRows, attemptRows, userRows, repeatRows] = await db.batch([
    db.prepare("SELECT lesson_id, completed_at FROM word_progress WHERE user_id = ? AND completed_at IS NOT NULL").bind(userId),
    db.prepare("SELECT lesson_id, first_passed_at FROM lesson_passed WHERE user_id = ?").bind(userId),
    db.prepare("SELECT lesson_id, correct, total, created_at FROM quiz_attempts WHERE user_id = ?").bind(userId),
    db.prepare("SELECT created_at FROM users WHERE id = ?").bind(userId),
    db.prepare(`SELECT COALESCE(SUM(reps), 0) AS reps, COALESCE(SUM(best_box >= ${REPEAT_LAST_BOX}), 0) AS mastered FROM repeat_state WHERE user_id = ?`).bind(userId),
  ]);
  const repeat = (repeatRows?.results?.[0] as { reps?: number; mastered?: number } | undefined) ?? {};

  const timelines: Timelines = { words: [], letters: [], lessons: [], alphabetLessons: [], activeDays: [] };
  const dayWords = new Map<number, number>();
  const addDay = (seconds: number, words: number) => {
    const day = localEpochDay(tz, seconds * 1000);
    dayWords.set(day, (dayWords.get(day) ?? 0) + words);
  };

  let wordsDone = 0;
  let lettersDone = 0;
  for (const r of (progress?.results ?? []) as { lesson_id: string; completed_at: string }[]) {
    const at = dbSeconds(r.completed_at, now);
    if (isAlphabetId(r.lesson_id)) {
      lettersDone += 1;
      timelines.letters.push(at);
    } else {
      wordsDone += 1;
      timelines.words.push(at);
    }
    addDay(at, 1);
  }

  const passed = new Set<string>();
  let alphabetLessons = 0;
  let sectionsMask = 0;
  for (const r of (passedRows?.results ?? []) as { lesson_id: string; first_passed_at: string }[]) {
    passed.add(r.lesson_id);
    const at = dbSeconds(r.first_passed_at, now);
    timelines.lessons.push(at);
    const lesson = getAnyLesson(r.lesson_id);
    if (lesson) sectionsMask |= SECTION_BITS[lesson.section] ?? 0;
    if (isAlphabetId(r.lesson_id)) {
      alphabetLessons += 1;
      timelines.alphabetLessons.push(at);
    }
  }

  // Попытки: безошибочные викторины (по одной на урок) и дни, в которые викторина была завершена. Прерванная викторина
  // нигде не записана, поэтому «сдан с первой попытки» и «после неудачи» посчитать нельзя: завершённая викторина всегда сдана.
  const perfectLessons = new Set<string>();
  for (const a of (attemptRows?.results ?? []) as { lesson_id: string; correct: number; total: number; created_at: string }[]) {
    if (a.correct === a.total) perfectLessons.add(a.lesson_id);
    addDay(dbSeconds(a.created_at, now), 0);
  }
  const perfectQuizzes = perfectLessons.size;

  // Дни занятий проигрываются тем же автоматом, что и живые события.
  let play: PlayState = EMPTY_PLAY;
  for (const day of [...dayWords.keys()].sort((a, b) => a - b)) {
    const result = applyActivity(play, { day, words: dayWords.get(day)! }, 0);
    if (result.newDay) timelines.activeDays.push(day * 86_400);
    play = result.state;
  }

  const created = dbSeconds((userRows?.results?.[0] as { created_at?: string } | undefined)?.created_at, now);
  for (const list of Object.values(timelines)) list.sort((a: number, b: number) => a - b);

  const stats: Stats = {
    userId,
    wordsDone,
    lettersDone,
    passedLessons: passed.size,
    alphabetLessons,
    perfectQuizzes,
    topicsClosed: closedTopics(INFO, passed).size,
    sectionsMask,
    repeatsDone: repeat.reps ?? 0,
    wordsMastered: repeat.mastered ?? 0,
    tz,
    tzChangedDay: 0,
    play,
    dailyGoal: DEFAULT_DAILY_GOAL,
    lbOptin: false,
    lbBanned: false,
    lbWeekIdx: 0,
    lbWeekPoints: 0,
    lbUpdatedAt: 0,
    cohortWeek: weekIndex(localEpochDay(LEADERBOARD_TZ, created * 1000)),
    cohortExcluded: false,
    gender: DEFAULT_LEARNER_GENDER,
    badgesVer: 0,
    createdAt: now,
  };
  return { stats, passed, timelines };
}

const INSERT_STATS = `
INSERT OR IGNORE INTO user_stats (
  user_id, words_done, letters_done, passed_lessons, alphabet_lessons, perfect_quizzes,
  topics_closed, sections_mask, returns, tz, tz_changed_day, active_days, last_day, week_idx, week_days, week_words,
  rhythm_weeks, rhythm_hist, prev_week_idx, prev_week_days, prev_week_words, daily_goal, goal_day, goal_words, goal_days,
  lb_optin, lb_banned, lb_week_idx, lb_week_points, lb_updated_at, cohort_week, cohort_excluded, badges_ver, created_at,
  repeats_done, words_mastered
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

function insertStatement(db: D1Database, s: Stats) {
  const p = s.play;
  return db
    .prepare(INSERT_STATS)
    .bind(
      s.userId, s.wordsDone, s.lettersDone, s.passedLessons, s.alphabetLessons, s.perfectQuizzes,
      s.topicsClosed, s.sectionsMask, p.returns, s.tz, s.tzChangedDay, p.activeDays, p.lastDay, p.weekIdx, p.weekDays, p.weekWords,
      p.rhythmWeeks, p.rhythmHist, p.prevWeekIdx, p.prevWeekDays, p.prevWeekWords, s.dailyGoal, p.goalDay, p.goalWords, p.goalDays,
      s.lbOptin ? 1 : 0, s.lbBanned ? 1 : 0, s.lbWeekIdx, s.lbWeekPoints, s.lbUpdatedAt, s.cohortWeek, s.cohortExcluded ? 1 : 0,
      s.badgesVer, s.createdAt,
      s.repeatsDone, s.wordsMastered,
    );
}

export interface EnsureOptions {
  /** Часовой пояс из заголовка приложения: используется только при создании строки. */
  tz?: string;
  /** Цель дня нового ученика (настройка из панели); используется только при создании строки. */
  dailyGoal?: number;
  now: number;
}

/**
 * Счётчики пользователя. Строка создаётся лениво пересчётом из таблиц прогресса, вместе с бейджами задним числом.
 * Пользователь уже должен быть в users (внешний ключ).
 */
export async function ensureStats(db: D1Database, userId: number, opts: EnsureOptions): Promise<Stats> {
  const existing = await loadStats(db, userId);
  if (existing) return existing;

  const tz = isValidTimeZone(opts.tz) ? opts.tz : DEFAULT_TZ;
  const { stats, passed, timelines } = await recount(db, userId, tz, opts.now);
  if (opts.dailyGoal !== undefined) stats.dailyGoal = opts.dailyGoal;
  await insertStatement(db, stats).run();
  // Параллельный запрос мог создать строку раньше: тогда INSERT OR IGNORE ничего не сделал, берём то, что в базе.
  const stored = (await loadStats(db, userId)) ?? stats;
  if (stored.badgesVer !== catalog.version) await reconcileBadges(db, stored, { now: opts.now, retro: true, passed, timelines });
  return (await loadStats(db, userId)) ?? stored;
}

interface ReconcileOptions {
  now: number;
  retro: boolean;
  /** Сданные уроки, если уже известны (иначе читаются из базы). */
  passed?: Set<string>;
  timelines?: Timelines;
}

/**
 * Выдаёт все бейджи, условия которых выполнены, а в базе их ещё нет, и запоминает версию каталога.
 * Работает и для старых пользователей (первый вход после выпуска, новые бейджи в каталоге), и как лечение
 * на случай потерянной выдачи (экран «Достижения»). Возвращает id выданных бейджей.
 */
export async function reconcileBadges(db: D1Database, stats: Stats, opts: ReconcileOptions): Promise<string[]> {
  const passed = opts.passed ?? (await loadPassedIds(db, stats.userId));
  const eligible = eligibleBadges(catalog, metricsOf(stats), closedTopics(INFO, passed));
  const { results } = await db.prepare("SELECT badge_id FROM user_badges WHERE user_id = ?").bind(stats.userId).all<{ badge_id: string }>();
  const have = new Set(results.map((r) => r.badge_id));
  const missing = eligible.filter((id) => !have.has(id));

  const dateOf = (id: string): number => {
    const badge = catalog.byId.get(id);
    const line = badge?.metric && opts.timelines ? timelineFor(opts.timelines, badge.metric) : undefined;
    return (badge && line?.[badge.threshold - 1]) || opts.now;
  };

  const versionChanged = stats.badgesVer !== catalog.version;
  if (missing.length === 0 && !versionChanged) return [];

  const statements = missing.map((id) =>
    db
      .prepare("INSERT OR IGNORE INTO user_badges (user_id, badge_id, earned_at, retro, seen) VALUES (?, ?, ?, ?, 0)")
      .bind(stats.userId, id, dateOf(id), opts.retro ? 1 : 0),
  );
  if (versionChanged) {
    statements.push(db.prepare("UPDATE user_stats SET badges_ver = ? WHERE user_id = ?").bind(catalog.version, stats.userId));
  }
  await db.batch(statements);
  return missing;
}

function timelineFor(t: Timelines, metric: string): number[] | undefined {
  switch (metric) {
    case "words":
      return t.words;
    case "letters":
      return t.letters;
    case "lessons":
      return t.lessons;
    case "alphabetLessons":
      return t.alphabetLessons;
    case "activeDays":
      return t.activeDays;
    default:
      return undefined;
  }
}

/** Столбцы ритма и цели дня в UPDATE (порядок совпадает с `playValues`). */
const PLAY_COLUMNS = [
  "active_days", "last_day", "week_idx", "week_days", "week_words", "rhythm_weeks", "rhythm_hist",
  "prev_week_idx", "prev_week_days", "prev_week_words", "returns", "goal_day", "goal_words", "goal_days",
] as const;

const playValues = (p: PlayState): number[] => [
  p.activeDays, p.lastDay, p.weekIdx, p.weekDays, p.weekWords, p.rhythmWeeks, p.rhythmHist,
  p.prevWeekIdx, p.prevWeekDays, p.prevWeekWords, p.returns, p.goalDay, p.goalWords, p.goalDays,
];

/**
 * Запись нового состояния ритма. Выполняется только если состояние в базе всё ещё такое, каким мы его прочитали
 * (сравнение по счётчикам дней и слов): так два одновременных занятия не затрут друг друга. `guard` добавляет
 * условие «сессия викторины с такой меткой»: запись входит в общий пакет с ответом на вопрос.
 */
export function playUpdateStatement(db: D1Database, userId: number, from: PlayState, to: PlayState, guard?: { rev: string }) {
  const set = PLAY_COLUMNS.map((c, i) => `${c} = ?${i + 1}`).join(", ");
  const n = PLAY_COLUMNS.length;
  const where =
    `user_id = ?${n + 1} AND active_days = ?${n + 2} AND last_day = ?${n + 3} AND week_words = ?${n + 4} ` +
    `AND goal_words = ?${n + 5} AND goal_day = ?${n + 6}`;
  const params: (number | string)[] = [...playValues(to), userId, from.activeDays, from.lastDay, from.weekWords, from.goalWords, from.goalDay];
  let sql = `UPDATE user_stats SET ${set} WHERE ${where}`;
  if (guard) {
    sql += ` AND EXISTS (SELECT 1 FROM quiz_sessions WHERE user_id = ?${n + 1} AND rev = ?${n + 7})`;
    params.push(guard.rev);
  }
  return db.prepare(sql).bind(...params);
}

export interface PlayOutcome {
  newBadges: string[];
  goal: { target: number; done: number; met: boolean } | null;
  goalMet: boolean;
}

/**
 * Учитывает `words` слов в ритме и цели дня (запись со сравнением, до 3 попыток при параллельных занятиях).
 * Если запись так и не прошла, `applied` false: ритм догонит следующее занятие.
 */
async function applyWordsToPlay(db: D1Database, initial: Stats, words: number, now: number) {
  let current = initial;
  let after: PlayState = initial.play;
  let today = localEpochDay(initial.tz, now * 1000);
  let goalMet = false;
  let applied = false;

  for (let attempt = 0; attempt < 3 && !applied; attempt++) {
    today = localEpochDay(current.tz, now * 1000);
    const act = applyActivity(current.play, { day: today, words }, current.dailyGoal);
    const res = await playUpdateStatement(db, current.userId, current.play, act.state).run();
    if ((res.meta?.changes ?? 0) > 0) {
      after = act.state;
      goalMet = act.goalMet;
      applied = true;
    } else {
      // Параллельное занятие успело первым: читаем свежее состояние и пробуем снова.
      current = (await loadStats(db, current.userId)) ?? current;
    }
  }
  return { current, after: applied ? after : current.play, today, goalMet, applied };
}

/**
 * Слово или буква пройдены (markStage вернул justCompleted): ритм, цель дня и бейджи.
 * Счётчики слов и очки таблицы уже увеличены в том же пакете, что и сама отметка (см. markStage в db.ts).
 * `initial` — счётчики, прочитанные до отметки.
 */
export async function recordWordCompleted(db: D1Database, initial: Stats, isLetter: boolean, now: number): Promise<PlayOutcome> {
  const { current, after, today, goalMet, applied } = await applyWordsToPlay(db, initial, 1, now);
  const before: Stats = { ...initial, play: current.play };
  const newBadges = await awardBadges(db, initial.userId, badgesForWord(before, applied ? after : before.play, isLetter), now);
  return { newBadges, goal: viewPlay(after, today, current.dailyGoal).goal, goalMet };
}

/**
 * Ответ на повторение слова (repeat.ts): слово засчитывается в цель дня и ритм (очков не даёт, решение владельца
 * 16.10), бейджи «Память». Счётчики repeats_done и words_mastered уже увеличены в одном пакете с ответом.
 */
export async function recordRepeatAnswer(
  db: D1Database,
  initial: Stats,
  delta: { repeats: number; mastered: number },
  now: number,
): Promise<PlayOutcome> {
  const { current, after, today, goalMet, applied } = await applyWordsToPlay(db, initial, 1, now);
  const before: Stats = { ...initial, play: current.play };
  const afterStats: Stats = {
    ...before,
    repeatsDone: before.repeatsDone + delta.repeats,
    wordsMastered: before.wordsMastered + delta.mastered,
    play: applied ? after : before.play,
  };
  const crossed = crossedBadges(catalog, metricsOf(before), metricsOf(afterStats), new Set(), new Set());
  const newBadges = await awardBadges(db, initial.userId, crossed, now);
  return { newBadges, goal: viewPlay(after, today, current.dailyGoal).goal, goalMet };
}

/**
 * Выдаёт бейджи, которые это событие пересекло, и возвращает те, что действительно выданы сейчас.
 * Повторная выдача невозможна: первичный ключ (user_id, badge_id) и INSERT OR IGNORE.
 */
export async function awardBadges(db: D1Database, userId: number, ids: string[], now: number): Promise<string[]> {
  if (ids.length === 0) return [];
  const results = await db.batch(
    ids.map((id) =>
      db.prepare("INSERT OR IGNORE INTO user_badges (user_id, badge_id, earned_at, retro, seen) VALUES (?, ?, ?, 0, 0)").bind(userId, id, now),
    ),
  );
  return ids.filter((_, i) => (results[i]?.meta?.changes ?? 0) > 0);
}

/** Новые бейджи слова: счётчики до и после события. */
export function badgesForWord(before: Stats, afterPlay: PlayState, isLetter: boolean): string[] {
  const beforeMetrics = metricsOf(before);
  const afterMetrics = metricsOf({
    ...before,
    wordsDone: before.wordsDone + (isLetter ? 0 : 1),
    lettersDone: before.lettersDone + (isLetter ? 1 : 0),
    play: afterPlay,
  });
  return crossedBadges(catalog, beforeMetrics, afterMetrics, new Set(), new Set());
}

/** Можно ли сменить часовой пояс (не чаще раза в сутки по UTC) и какой пояс запомнить. */
export function nextTimezone(stats: Stats, requested: unknown, now: number): { tz: string; changedDay: number } | null {
  if (!isValidTimeZone(requested) || requested === stats.tz) return null;
  const today = utcEpochDay(now * 1000);
  if (stats.tzChangedDay >= today) return null;
  return { tz: requested, changedDay: today };
}

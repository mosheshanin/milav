import { STAGES, type LessonProgressResponse, type Stage, type WordProgress } from "@milav/shared";
import type { AuthUser } from "./auth";

const STAGE_COLUMN: Record<Stage, string> = {
  listen: "stage_listen",
  speak: "stage_speak",
  write: "stage_write",
  type: "stage_type",
};

interface ProgressRow {
  word_id: string;
  stage_listen: number;
  stage_speak: number;
  stage_write: number;
  stage_type: number;
  completed_at: string | null;
}

function toProgress(wordId: string, row?: ProgressRow | null): WordProgress {
  return {
    wordId,
    listen: !!row?.stage_listen,
    speak: !!row?.stage_speak,
    write: !!row?.stage_write,
    type: !!row?.stage_type,
    completed: !!row?.completed_at,
  };
}

/** Создаёт пользователя, если его ещё нет (нужно для внешних ключей). */
export async function ensureUser(db: D1Database, user: AuthUser): Promise<void> {
  await db
    .prepare("INSERT OR IGNORE INTO users (id, first_name, last_name, username, language_code) VALUES (?, ?, ?, ?, ?)")
    .bind(user.id, user.firstName, user.lastName ?? null, user.username ?? null, user.languageCode ?? null)
    .run();
}

/** Создаёт или обновляет профиль и время последнего входа. Вызывается при запуске приложения. */
export async function touchUser(db: D1Database, user: AuthUser): Promise<void> {
  await db
    .prepare(
      `INSERT INTO users (id, first_name, last_name, username, language_code) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET first_name = excluded.first_name, last_name = excluded.last_name,
         username = excluded.username, language_code = excluded.language_code, last_seen_at = datetime('now')`,
    )
    .bind(user.id, user.firstName, user.lastName ?? null, user.username ?? null, user.languageCode ?? null)
    .run();
}

export async function getLessonProgress(
  db: D1Database,
  userId: number,
  lessonId: string,
  wordIds: string[],
): Promise<WordProgress[]> {
  const { results } = await db
    .prepare("SELECT * FROM word_progress WHERE user_id = ? AND lesson_id = ?")
    .bind(userId, lessonId)
    .all<ProgressRow>();
  const byWord = new Map(results.map((r) => [r.word_id, r]));
  return wordIds.map((id) => toProgress(id, byWord.get(id)));
}

/**
 * Прогресс сразу нескольких уроков для главной: три запроса одним пакетом вместо двух-трёх на каждый урок.
 * Строки читаются только этого пользователя (индексы по user_id), уроки без строк получают пустой прогресс.
 */
export async function getHomeProgress(
  db: D1Database,
  userId: number,
  lessons: readonly { id: string; itemIds: readonly string[] }[],
): Promise<Record<string, LessonProgressResponse>> {
  const [progress, best, passed] = await db.batch<unknown>([
    db.prepare("SELECT * FROM word_progress WHERE user_id = ?").bind(userId),
    db
      .prepare("SELECT lesson_id, MAX(correct) AS best FROM quiz_attempts WHERE user_id = ? GROUP BY lesson_id")
      .bind(userId),
    db.prepare("SELECT lesson_id FROM lesson_passed WHERE user_id = ?").bind(userId),
  ]);
  const rows = new Map<string, Map<string, ProgressRow>>();
  for (const row of (progress?.results ?? []) as (ProgressRow & { lesson_id: string })[]) {
    const inLesson = rows.get(row.lesson_id) ?? new Map<string, ProgressRow>();
    inLesson.set(row.word_id, row);
    rows.set(row.lesson_id, inLesson);
  }
  const bestBy = new Map(
    ((best?.results ?? []) as { lesson_id: string; best: number | null }[]).map((r) => [r.lesson_id, r.best]),
  );
  const passedSet = new Set(((passed?.results ?? []) as { lesson_id: string }[]).map((r) => r.lesson_id));
  const out: Record<string, LessonProgressResponse> = {};
  for (const lesson of lessons) {
    const inLesson = rows.get(lesson.id);
    out[lesson.id] = {
      words: lesson.itemIds.map((id) => toProgress(id, inLesson?.get(id))),
      quiz: { passed: passedSet.has(lesson.id), bestCorrect: bestBy.get(lesson.id) ?? null },
    };
  }
  return out;
}

/** Что обновить в счётчиках в том же пакете, что и отметку этапа (см. markStage). */
export interface StageCounters {
  /** Буква алфавита (иначе слово). */
  isLetter: boolean;
  /** Номер недели таблицы лидеров (одна для всех, по Иерусалиму). */
  boardWeek: number;
  /** Секунды Unix: когда очки обновлены в последний раз (при равенстве очков выше набравший раньше). */
  now: number;
}

export interface StageResult {
  progress: WordProgress;
  /** true, если именно этот этап завершил слово (начислены очки). */
  justCompleted: boolean;
}

/**
 * Отмечает этап слова (или буквы) пройденным. Когда пройдены все обязательные этапы, элемент считается выученным
 * и приносит очко: у слова это все четыре этапа, у буквы три (`required`, см. `stagesFor`).
 */
export async function markStage(
  db: D1Database,
  userId: number,
  lessonId: string,
  wordId: string,
  stage: Stage,
  required: readonly Stage[] = STAGES,
  counters?: StageCounters,
): Promise<StageResult> {
  const column = STAGE_COLUMN[stage];
  // Имена столбцов берутся только из STAGE_COLUMN, подставлять в запрос пользовательский текст нельзя.
  const allDone = required.map((s) => `${STAGE_COLUMN[s]} = 1`).join(" AND ");
  // Счётчик очков растёт в том же пакете и только если слово завершено именно этим запросом (changes() относится к
  // предыдущему оператору, то есть к отметке completed_at). Повторная отметка очков не даёт. Строки user_stats к этому
  // моменту уже есть (ensureStats), иначе счётчик восстановит пересчёт.
  const counter = counters
    ? [
        db
          .prepare(
            `UPDATE user_stats SET
               words_done = words_done + ?1, letters_done = letters_done + ?2,
               lb_week_points = CASE WHEN lb_week_idx = ?3 THEN lb_week_points + 1 ELSE 1 END,
               lb_week_idx = ?3, lb_updated_at = ?4
             WHERE user_id = ?5 AND changes() > 0`,
          )
          .bind(counters.isLetter ? 0 : 1, counters.isLetter ? 1 : 0, counters.boardWeek, counters.now, userId),
      ]
    : [];
  const [, completion, ...rest] = await db.batch([
    db
      .prepare(
        `INSERT INTO word_progress (user_id, word_id, lesson_id, ${column}) VALUES (?, ?, ?, 1)
         ON CONFLICT(user_id, word_id) DO UPDATE SET ${column} = 1`,
      )
      .bind(userId, wordId, lessonId),
    db
      .prepare(
        `UPDATE word_progress SET completed_at = datetime('now')
         WHERE user_id = ? AND word_id = ? AND completed_at IS NULL
           AND ${allDone}`,
      )
      .bind(userId, wordId),
    ...counter,
    db.prepare("SELECT * FROM word_progress WHERE user_id = ? AND word_id = ?").bind(userId, wordId),
  ]);
  const row = (rest[rest.length - 1]?.results as ProgressRow[] | undefined)?.[0];
  return {
    progress: toProgress(wordId, row),
    justCompleted: (completion?.meta?.changes ?? 0) > 0,
  };
}

export interface QuizOutcome {
  passed: boolean;
  firstTimePassed: boolean;
}

export async function recordQuizAttempt(
  db: D1Database,
  userId: number,
  lessonId: string,
  correct: number,
  total: number,
  passed: boolean,
): Promise<QuizOutcome> {
  const statements = [
    db
      .prepare("INSERT INTO quiz_attempts (user_id, lesson_id, correct, total, passed) VALUES (?, ?, ?, ?, ?)")
      .bind(userId, lessonId, correct, total, passed ? 1 : 0),
  ];
  if (passed) {
    statements.push(
      db.prepare("INSERT OR IGNORE INTO lesson_passed (user_id, lesson_id) VALUES (?, ?)").bind(userId, lessonId),
    );
  }
  const results = await db.batch(statements);
  const firstTimePassed = passed && (results[1]?.meta?.changes ?? 0) > 0;
  return { passed, firstTimePassed };
}

export async function getQuizSummary(
  db: D1Database,
  userId: number,
  lessonId: string,
): Promise<{ passed: boolean; bestCorrect: number | null }> {
  const best = await db
    .prepare("SELECT MAX(correct) AS best FROM quiz_attempts WHERE user_id = ? AND lesson_id = ?")
    .bind(userId, lessonId)
    .first<{ best: number | null }>();
  const passed = await db
    .prepare("SELECT 1 AS ok FROM lesson_passed WHERE user_id = ? AND lesson_id = ?")
    .bind(userId, lessonId)
    .first<{ ok: number }>();
  return { passed: !!passed, bestCorrect: best?.best ?? null };
}

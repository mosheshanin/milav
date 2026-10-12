import {
  POINTS_PER_WORD,
  statusForPassedLessons,
  type Stage,
  type StatusInfo,
  type WordProgress,
} from "@milav/shared";
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

export interface Totals {
  points: number;
  passedLessons: number;
  status: StatusInfo;
}

export async function getTotals(db: D1Database, userId: number): Promise<Totals> {
  const words = await db
    .prepare("SELECT COUNT(*) AS n FROM word_progress WHERE user_id = ? AND completed_at IS NOT NULL")
    .bind(userId)
    .first<{ n: number }>();
  const lessons = await db
    .prepare("SELECT COUNT(*) AS n FROM lesson_passed WHERE user_id = ?")
    .bind(userId)
    .first<{ n: number }>();
  const passedLessons = lessons?.n ?? 0;
  return {
    points: (words?.n ?? 0) * POINTS_PER_WORD,
    passedLessons,
    status: statusForPassedLessons(passedLessons),
  };
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

export interface StageResult {
  progress: WordProgress;
  /** true, если именно этот этап завершил слово (начислены очки). */
  justCompleted: boolean;
}

/** Отмечает этап слова пройденным. Когда пройдены все четыре, слово считается выученным. */
export async function markStage(
  db: D1Database,
  userId: number,
  lessonId: string,
  wordId: string,
  stage: Stage,
): Promise<StageResult> {
  const column = STAGE_COLUMN[stage];
  const [, completion, select] = await db.batch([
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
           AND stage_listen = 1 AND stage_speak = 1 AND stage_write = 1 AND stage_type = 1`,
      )
      .bind(userId, wordId),
    db.prepare("SELECT * FROM word_progress WHERE user_id = ? AND word_id = ?").bind(userId, wordId),
  ]);
  const row = (select?.results as ProgressRow[] | undefined)?.[0];
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

// Сессия викторины в D1: вопросы выдаёт сервер, каждый ответ проверяется и записывается здесь.
// Схема и объяснение метки состояния (rev): migrations/0003_quiz_sessions.sql.
import {
  MAX_MISTAKES,
  PASS_SCORE,
  QUIZ_SESSION_TTL_SECONDS,
  SPEAK_ATTEMPTS_IN_QUIZ,
  statusForPassedLessons,
  type QuizAnswerResponse,
  type QuizQuestion,
  type QuizResult,
} from "@milav/shared";
import { getQuizSummary, getTotals } from "./db";

export type SessionStatus = "active" | "done" | "aborted";

export interface QuizSession {
  userId: number;
  id: string;
  lessonId: string;
  questions: QuizQuestion[];
  nextIndex: number;
  correct: number;
  mistakes: number;
  speakAttempts: number;
  status: SessionStatus;
  rev: string;
  lastAnswer: QuizAnswerResponse | null;
  createdAt: number;
}

interface SessionRow {
  user_id: number;
  id: string;
  lesson_id: string;
  questions: string;
  next_index: number;
  correct: number;
  mistakes: number;
  speak_attempts: number;
  status: SessionStatus;
  rev: string;
  last_answer: string | null;
  created_at: number;
}

function fromRow(row: SessionRow): QuizSession {
  return {
    userId: row.user_id,
    id: row.id,
    lessonId: row.lesson_id,
    questions: JSON.parse(row.questions) as QuizQuestion[],
    nextIndex: row.next_index,
    correct: row.correct,
    mistakes: row.mistakes,
    speakAttempts: row.speak_attempts,
    status: row.status,
    rev: row.rev,
    lastAnswer: row.last_answer ? (JSON.parse(row.last_answer) as QuizAnswerResponse) : null,
    createdAt: row.created_at,
  };
}

/** Случайная строка для id сессии (16 байт, hex). */
function randomId(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Открывает новую викторину пользователя. Прежняя сессия (если была) заменяется. Пользователь уже должен быть в users. */
export async function startSession(
  db: D1Database,
  userId: number,
  lessonId: string,
  questions: QuizQuestion[],
  now: number,
): Promise<string> {
  const id = randomId();
  await db
    .prepare(
      `INSERT OR REPLACE INTO quiz_sessions
         (user_id, id, lesson_id, questions, next_index, correct, mistakes, speak_attempts, status, rev, last_answer, created_at)
       VALUES (?1, ?2, ?3, ?4, 0, 0, 0, 0, 'active', ?5, NULL, ?6)`,
    )
    .bind(userId, id, lessonId, JSON.stringify(questions), crypto.randomUUID(), now)
    .run();
  return id;
}

export async function loadSession(db: D1Database, userId: number): Promise<QuizSession | null> {
  const row = await db.prepare("SELECT * FROM quiz_sessions WHERE user_id = ?").bind(userId).first<SessionRow>();
  return row ? fromRow(row) : null;
}

export type SessionCheck =
  | { kind: "ok"; session: QuizSession; question: QuizQuestion }
  | { kind: "repeat"; response: QuizAnswerResponse }
  | { kind: "error"; status: 404 | 409 | 410; body: { error: string; expected?: number } };

/**
 * Можно ли сейчас отвечать на вопрос `index` в сессии `sessionId`.
 * - чужой или устаревший id сессии (например, викторину открыли на другом устройстве): 404;
 * - прошло больше QUIZ_SESSION_TTL_SECONDS: 410;
 * - повтор вопроса, на который уже ответили последним (обрыв связи, двойное нажатие): тот же ответ, без изменений;
 * - иначе вопросы принимаются строго по порядку, по одному разу.
 */
export function checkSession(session: QuizSession | null, sessionId: unknown, index: unknown, now: number): SessionCheck {
  if (!session || typeof sessionId !== "string" || session.id !== sessionId) {
    return { kind: "error", status: 404, body: { error: "no_session" } };
  }
  if (!Number.isInteger(index) || (index as number) < 0) {
    return { kind: "error", status: 409, body: { error: "bad_index", expected: session.nextIndex } };
  }
  const i = index as number;
  if (i === session.nextIndex - 1 && session.lastAnswer) {
    return { kind: "repeat", response: { ...session.lastAnswer, repeat: true } };
  }
  if (session.status !== "active") return { kind: "error", status: 409, body: { error: "quiz_finished" } };
  if (now - session.createdAt > QUIZ_SESSION_TTL_SECONDS) return { kind: "error", status: 410, body: { error: "session_expired" } };
  if (i !== session.nextIndex) return { kind: "error", status: 409, body: { error: "bad_index", expected: session.nextIndex } };
  return { kind: "ok", session, question: session.questions[i]! };
}

/** Итог одной проверки ответа. */
export interface AnswerStep {
  correct: boolean;
  /** false только у «произнеси», когда попытка ещё осталась. */
  final: boolean;
  heard?: string;
  failedLetters?: number[];
}

/** Результат проверки речи: верно, неверно с оставшейся попыткой или неверно и попытки кончились. */
export function speechStep(session: QuizSession, match: boolean, heard: string): AnswerStep {
  if (match) return { correct: true, final: true, heard };
  const used = session.speakAttempts + 1;
  return { correct: false, final: used >= SPEAK_ATTEMPTS_IN_QUIZ, heard };
}

export type CommitResult = { ok: true; response: QuizAnswerResponse } | { ok: false };

/**
 * Записывает принятый ответ: состояние сессии, статистику по вопросу и, если это последний вопрос,
 * итог викторины (попытка и сданный урок). Всё одной транзакцией и только если с момента чтения состояние
 * не менялось (метка rev). Если менялось, возвращает { ok: false }: параллельный запрос успел раньше, ничего не записано.
 */
export async function commitAnswer(
  db: D1Database,
  session: QuizSession,
  step: AnswerStep,
): Promise<CommitResult> {
  const question = session.questions[session.nextIndex]!;
  const newRev = crypto.randomUUID();
  const total = session.questions.length;

  let correct = session.correct;
  let mistakes = session.mistakes;
  let nextIndex = session.nextIndex;
  let speakAttempts = session.speakAttempts;
  let status: SessionStatus = "active";
  let result: QuizResult | undefined;

  if (step.final) {
    correct += step.correct ? 1 : 0;
    mistakes += step.correct ? 0 : 1;
    nextIndex += 1;
    speakAttempts = 0;
    if (mistakes > MAX_MISTAKES) status = "aborted";
    else if (nextIndex >= total) status = "done";
  } else {
    speakAttempts += 1;
  }

  const passed = status === "done" && correct >= PASS_SCORE;
  if (status === "done") {
    const before = (await getTotals(db, session.userId)).passedLessons;
    const alreadyPassed = (await getQuizSummary(db, session.userId, session.lessonId)).passed;
    const firstTimePassed = passed && !alreadyPassed;
    const passedLessons = before + (firstTimePassed ? 1 : 0);
    result = {
      passed,
      correct,
      total,
      mistakes: total - correct,
      firstTimePassed,
      passedLessons,
      status: statusForPassedLessons(passedLessons),
    };
  }

  const response: QuizAnswerResponse = {
    index: session.nextIndex,
    correct: step.correct,
    final: step.final,
    correctCount: correct,
    mistakes,
    ...(step.final ? {} : { attemptsLeft: Math.max(0, SPEAK_ATTEMPTS_IN_QUIZ - speakAttempts) }),
    ...(step.heard !== undefined ? { heard: step.heard } : {}),
    ...(step.failedLetters ? { failedLetters: step.failedLetters } : {}),
    ...(status === "aborted" ? { aborted: true } : {}),
    ...(result ? { result } : {}),
  };

  // Повторный запрос того же вопроса получит этот ответ. Промежуточная попытка «произнеси» его не меняет.
  const lastAnswer = step.final ? JSON.stringify(response) : session.lastAnswer ? JSON.stringify(session.lastAnswer) : null;

  // Все следующие записи выполняются только если наше обновление сессии прошло: проверяем свежую метку rev.
  const ours = "EXISTS (SELECT 1 FROM quiz_sessions WHERE user_id = ?1 AND rev = ?2)";
  const statements = [
    db
      .prepare(
        `UPDATE quiz_sessions SET next_index = ?1, correct = ?2, mistakes = ?3, speak_attempts = ?4, status = ?5,
           last_answer = ?6, rev = ?7
         WHERE user_id = ?8 AND id = ?9 AND rev = ?10`,
      )
      .bind(nextIndex, correct, mistakes, speakAttempts, status, lastAnswer, newRev, session.userId, session.id, session.rev),
  ];
  if (step.final) {
    statements.push(
      db
        .prepare(
          `INSERT INTO question_stats (word_id, question_type, asked, correct)
           SELECT ?3, ?4, 1, ?5 WHERE ${ours}
           ON CONFLICT (word_id, question_type) DO UPDATE SET asked = asked + 1, correct = correct + excluded.correct`,
        )
        .bind(session.userId, newRev, question.wordId, question.type, step.correct ? 1 : 0),
    );
  }
  if (status === "done") {
    statements.push(
      db
        .prepare(
          `INSERT INTO quiz_attempts (user_id, lesson_id, correct, total, passed)
           SELECT ?1, ?3, ?4, ?5, ?6 WHERE ${ours}`,
        )
        .bind(session.userId, newRev, session.lessonId, correct, total, passed ? 1 : 0),
    );
    if (passed) {
      statements.push(
        db
          .prepare(`INSERT OR IGNORE INTO lesson_passed (user_id, lesson_id) SELECT ?1, ?3 WHERE ${ours}`)
          .bind(session.userId, newRev, session.lessonId),
      );
    }
  }

  const results = await db.batch(statements);
  if ((results[0]?.meta?.changes ?? 0) === 0) return { ok: false };
  return { ok: true, response };
}

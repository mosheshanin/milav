import { Hono } from "hono";
import { findWord, getLesson } from "@milav/content";
import {
  MAX_STAGE_BODY_BYTES,
  PASS_SCORE,
  POINTS_PER_WORD,
  QUIZ_SIZE,
  STAGES,
  isSpeechMatch,
  type Lesson,
  type MeResponse,
  type Stage,
} from "@milav/shared";
import { requireUser } from "./auth";
import {
  ensureUser,
  getLessonProgress,
  getQuizSummary,
  getTotals,
  markStage,
  recordQuizAttempt,
  touchUser,
} from "./db";
import { parseJson, readBodyLimited } from "./body";
import type { AppEnv } from "./env";
import { rateLimit } from "./rateLimit";
import { apiSecurityHeaders } from "./security";
import { verifyTyped, verifyWritten, type ProofResult } from "./stageProof";

const WHISPER_MODEL = "@cf/openai/whisper-large-v3-turbo";
/** Запись слова длится несколько секунд; всё, что больше, это не слово. */
const MAX_AUDIO_BYTES = 1_500_000;

interface SpeechModel {
  run(model: string, input: unknown): Promise<unknown>;
}

/** Доступен ли урок пользователю. Пока платных уроков нет, доступны только бесплатные. */
function canAccessLesson(lesson: Lesson): boolean {
  return lesson.free;
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

/** Читает небольшой JSON из тела запроса. Слишком большое тело и не-JSON дают null. */
async function readJson<T>(request: Request, maxBytes = 64 * 1024): Promise<T | null> {
  const bytes = await readBodyLimited(request, maxBytes);
  return bytes ? parseJson<T>(bytes) : null;
}

export const app = new Hono<AppEnv>();

// Заголовки безопасности на всех ответах API (в том числе на ошибках и 404).
app.use("/api/*", apiSecurityHeaders);

app.get("/api/health", (c) => c.json({ ok: true, service: "milav-api" }));

// Профиль, очки и статус. Приложение вызывает это при запуске.
app.get("/api/me", requireUser, async (c) => {
  const user = c.get("user");
  await touchUser(c.env.DB, user);
  const totals = await getTotals(c.env.DB, user.id);
  const body: MeResponse = {
    user: { id: user.id, firstName: user.firstName, username: user.username },
    ...totals,
  };
  return c.json(body);
});

// Прогресс по словам урока и итог викторины.
app.get("/api/lessons/:lessonId/progress", requireUser, async (c) => {
  const user = c.get("user");
  const lesson = getLesson(c.req.param("lessonId"));
  if (!lesson) return c.json({ error: "lesson_not_found" }, 404);
  if (!canAccessLesson(lesson)) return c.json({ error: "subscription_required" }, 403);

  const words = await getLessonProgress(c.env.DB, user.id, lesson.id, lesson.words.map((w) => w.id));
  const quiz = await getQuizSummary(c.env.DB, user.id, lesson.id);
  return c.json({ words, quiz });
});

// Этапы слушай / пиши / печатай. «Говори» отмечает только проверка речи на сервере.
// «Печатай» и «пиши» принимаются только с доказательством: набранное слово или штрихи букв (см. stageProof.ts).
app.post("/api/progress/stage", requireUser, rateLimit("stage"), async (c) => {
  const user = c.get("user");
  const raw = await readBodyLimited(c.req.raw, MAX_STAGE_BODY_BYTES);
  if (!raw) return c.json({ error: "body_too_large" }, 413);
  const body = parseJson<{ wordId?: string; stage?: string; typed?: unknown; strokes?: unknown }>(raw);
  if (!body?.wordId || !body.stage) return c.json({ error: "bad_request" }, 400);
  if (body.stage === "speak") return c.json({ error: "speak_requires_speech_check" }, 400);
  if (!STAGES.includes(body.stage as Stage)) return c.json({ error: "bad_stage" }, 400);

  const found = findWord(body.wordId);
  if (!found) return c.json({ error: "word_not_found" }, 404);
  if (!canAccessLesson(found.lesson)) return c.json({ error: "subscription_required" }, 403);

  const stage = body.stage as Exclude<Stage, "speak">;
  let proof: ProofResult = { ok: true };
  if (stage === "type") proof = verifyTyped(found.word, body.typed);
  else if (stage === "write") proof = await verifyWritten(found.word, body.strokes);
  if (!proof.ok) {
    return c.json(
      { error: proof.error, ...(proof.failedLetters ? { failedLetters: proof.failedLetters } : {}) },
      proof.status,
    );
  }

  await ensureUser(c.env.DB, user);
  const result = await markStage(c.env.DB, user.id, found.lesson.id, found.word.id, stage);
  const totals = await getTotals(c.env.DB, user.id);
  return c.json({
    progress: result.progress,
    pointsAwarded: result.justCompleted ? POINTS_PER_WORD : 0,
    points: totals.points,
  });
});

// Проверка произношения: тело запроса это запись голоса (audio/*).
app.post("/api/speech/check", requireUser, rateLimit("speech"), async (c) => {
  const user = c.get("user");
  const wordId = c.req.query("wordId");
  const mode = c.req.query("mode") === "study" ? "study" : "quiz";
  const found = wordId ? findWord(wordId) : undefined;
  if (!found) return c.json({ error: "word_not_found" }, 404);
  if (!canAccessLesson(found.lesson)) return c.json({ error: "subscription_required" }, 403);
  if (!c.env.AI) return c.json({ error: "speech_unavailable" }, 503);

  const audio = await readBodyLimited(c.req.raw, MAX_AUDIO_BYTES);
  if (!audio) return c.json({ error: "audio_too_large" }, 413);
  if (audio.byteLength === 0) return c.json({ error: "empty_audio" }, 400);

  let heard = "";
  try {
    const out = (await (c.env.AI as SpeechModel).run(WHISPER_MODEL, {
      audio: toBase64(audio),
      language: "he",
      task: "transcribe",
    })) as { text?: string };
    heard = (out.text ?? "").trim();
  } catch {
    return c.json({ error: "speech_failed" }, 502);
  }

  const match = isSpeechMatch(heard, found.word.he);
  if (match && mode === "study") {
    await ensureUser(c.env.DB, user);
    const result = await markStage(c.env.DB, user.id, found.lesson.id, found.word.id, "speak");
    const totals = await getTotals(c.env.DB, user.id);
    return c.json({
      heard,
      match,
      progress: result.progress,
      pointsAwarded: result.justCompleted ? POINTS_PER_WORD : 0,
      points: totals.points,
    });
  }
  return c.json({ heard, match });
});

// Итог викторины. Принимается только по полностью пройденному уроку.
app.post("/api/quiz/submit", requireUser, rateLimit("quiz"), async (c) => {
  const user = c.get("user");
  const body = await readJson<{ lessonId?: string; correct?: number; total?: number }>(c.req.raw);
  if (!body?.lessonId) return c.json({ error: "bad_request" }, 400);
  const { correct, total } = body;
  if (
    !Number.isInteger(correct) ||
    !Number.isInteger(total) ||
    total !== QUIZ_SIZE ||
    (correct as number) < 0 ||
    (correct as number) > QUIZ_SIZE
  ) {
    return c.json({ error: "bad_result" }, 400);
  }

  const lesson = getLesson(body.lessonId);
  if (!lesson) return c.json({ error: "lesson_not_found" }, 404);
  if (!canAccessLesson(lesson)) return c.json({ error: "subscription_required" }, 403);

  await ensureUser(c.env.DB, user);
  const progress = await getLessonProgress(c.env.DB, user.id, lesson.id, lesson.words.map((w) => w.id));
  if (!progress.every((p) => p.completed)) return c.json({ error: "lesson_not_completed" }, 409);

  const passed = (correct as number) >= PASS_SCORE;
  const outcome = await recordQuizAttempt(c.env.DB, user.id, lesson.id, correct as number, total as number, passed);
  const totals = await getTotals(c.env.DB, user.id);
  return c.json({
    passed,
    correct,
    total,
    mistakes: QUIZ_SIZE - (correct as number),
    firstTimePassed: outcome.firstTimePassed,
    passedLessons: totals.passedLessons,
    status: totals.status,
  });
});

app.notFound((c) => c.json({ error: "not_found" }, 404));

app.onError((err, c) => {
  console.error(err);
  return c.json({ error: "internal_error" }, 500);
});

import { Hono } from "hono";
import { findWord, getLesson } from "@milav/content";
import {
  MAX_STAGE_BODY_BYTES,
  POINTS_PER_WORD,
  STAGES,
  TEMPLATE_VARIANTS_PER_LETTER,
  isSpeechMatch,
  type Lesson,
  type MeResponse,
  type QuizStartResponse,
  type Stage,
  type TemplateSaveResponse,
  type TemplatesResponse,
} from "@milav/shared";
import { requireUser } from "./auth";
import { ensureUser, getLessonProgress, getQuizSummary, getTotals, markStage, touchUser } from "./db";
import { parseJson, readBodyLimited } from "./body";
import type { AppEnv } from "./env";
import { generateQuiz, isChoiceType } from "./quizGen";
import { checkSession, commitAnswer, loadSession, speechStep, startSession, type AnswerStep } from "./quizSession";
import { rateLimit } from "./rateLimit";
import { apiSecurityHeaders } from "./security";
import { readAudio, transcribeHebrew } from "./speech";
import { recognizeLetters, verifyTyped, verifyWritten, type ProofResult } from "./stageProof";
import {
  checkRecorded,
  deleteTemplate,
  listTemplates,
  parseTemplateStrokes,
  parseTemplateTarget,
  requireRecorder,
  saveTemplate,
} from "./templateRecorder";

/** Доступен ли урок пользователю. Пока платных уроков нет, доступны только бесплатные. */
function canAccessLesson(lesson: Lesson): boolean {
  return lesson.free;
}

const nowSeconds = () => Math.floor(Date.now() / 1000);

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

// Проверка произношения на этапе «говори»: тело запроса это запись голоса (audio/*).
// Верное слово отмечает этап. Произношение в викторине проверяет /api/quiz/speech.
app.post("/api/speech/check", requireUser, rateLimit("speech"), async (c) => {
  const user = c.get("user");
  const wordId = c.req.query("wordId");
  const found = wordId ? findWord(wordId) : undefined;
  if (!found) return c.json({ error: "word_not_found" }, 404);
  if (!canAccessLesson(found.lesson)) return c.json({ error: "subscription_required" }, 403);
  if (!c.env.AI) return c.json({ error: "speech_unavailable" }, 503);

  const recording = await readAudio(c.req.raw);
  if (!recording.ok) return c.json({ error: recording.error }, recording.status);

  const heard = await transcribeHebrew(c.env.AI, recording.audio);
  if (heard === null) return c.json({ error: "speech_failed" }, 502);

  const match = isSpeechMatch(heard, found.word.he);
  if (!match) return c.json({ heard, match });

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
});

// ---- Викторина. Вопросы выдаёт сервер, каждый ответ проверяется здесь, итог считается здесь (quizSession.ts). ----

// Начало викторины: только по полностью пройденному уроку. Прежняя открытая викторина пользователя заменяется.
app.post("/api/quiz/start", requireUser, rateLimit("quiz"), async (c) => {
  const user = c.get("user");
  const body = await readJson<{ lessonId?: unknown }>(c.req.raw);
  if (typeof body?.lessonId !== "string") return c.json({ error: "bad_request" }, 400);

  const lesson = getLesson(body.lessonId);
  if (!lesson) return c.json({ error: "lesson_not_found" }, 404);
  if (!canAccessLesson(lesson)) return c.json({ error: "subscription_required" }, 403);

  await ensureUser(c.env.DB, user);
  const progress = await getLessonProgress(c.env.DB, user.id, lesson.id, lesson.words.map((w) => w.id));
  if (!progress.every((p) => p.completed)) return c.json({ error: "lesson_not_completed" }, 409);

  const questions = generateQuiz(lesson.words);
  const sessionId = await startSession(c.env.DB, user.id, lesson.id, questions, nowSeconds());
  const response: QuizStartResponse = { sessionId, lessonId: lesson.id, questions };
  return c.json(response);
});

// Ответ на вопрос с выбором или письмом (и отказ от вопроса «произнеси» или письма).
// Запись голоса для «произнеси» отправляется отдельно: /api/quiz/speech.
app.post("/api/quiz/answer", requireUser, async (c) => {
  const user = c.get("user");
  const raw = await readBodyLimited(c.req.raw, MAX_STAGE_BODY_BYTES);
  if (!raw) return c.json({ error: "body_too_large" }, 413);
  const body = parseJson<{ sessionId?: unknown; index?: unknown; choice?: unknown; strokes?: unknown; giveUp?: unknown }>(raw);
  if (typeof body !== "object" || body === null) return c.json({ error: "bad_request" }, 400);

  const check = checkSession(await loadSession(c.env.DB, user.id), body.sessionId, body.index, nowSeconds());
  if (check.kind === "error") return c.json(check.body, check.status);
  if (check.kind === "repeat") return c.json(check.response);
  const { session, question } = check;

  const found = findWord(question.wordId);
  if (!found) return c.json({ error: "word_not_found" }, 404);

  let step: AnswerStep;
  if (isChoiceType(question.type)) {
    if (typeof body.choice !== "string" || !question.options.includes(body.choice)) {
      return c.json({ error: "bad_choice" }, 400);
    }
    step = { correct: body.choice === question.wordId, final: true };
  } else if (body.giveUp === true) {
    step = { correct: false, final: true };
  } else if (question.type === "speak") {
    return c.json({ error: "speak_requires_recording" }, 400);
  } else {
    // Письмо: штрихи каждой буквы; у не написанной буквы пустой список, вопрос тогда засчитывается неверным.
    const failedLetters = await recognizeLetters(found.word, body.strokes, true);
    if (!failedLetters) return c.json({ error: "proof_required" }, 400);
    step = { correct: failedLetters.length === 0, final: true, failedLetters };
  }

  const committed = await commitAnswer(c.env.DB, session, step);
  if (!committed.ok) return c.json({ error: "answer_conflict" }, 409);
  return c.json(committed.response);
});

// Вопрос «произнеси»: тело запроса это запись голоса. Попыток SPEAK_ATTEMPTS_IN_QUIZ, считает сервер.
app.post("/api/quiz/speech", requireUser, rateLimit("speech"), async (c) => {
  const user = c.get("user");
  const sessionId = c.req.query("sessionId");
  const indexText = c.req.query("index") ?? "";
  const index = /^\d{1,3}$/.test(indexText) ? Number(indexText) : null;

  const check = checkSession(await loadSession(c.env.DB, user.id), sessionId, index, nowSeconds());
  if (check.kind === "error") return c.json(check.body, check.status);
  if (check.kind === "repeat") return c.json(check.response);
  const { session, question } = check;
  if (question.type !== "speak") return c.json({ error: "not_a_speech_question" }, 400);

  const found = findWord(question.wordId);
  if (!found) return c.json({ error: "word_not_found" }, 404);
  if (!c.env.AI) return c.json({ error: "speech_unavailable" }, 503);

  const recording = await readAudio(c.req.raw);
  if (!recording.ok) return c.json({ error: recording.error }, recording.status);

  // Если распознаватель не сработал, попытка не тратится: это не вина ученика.
  const heard = await transcribeHebrew(c.env.AI, recording.audio);
  if (heard === null) return c.json({ error: "speech_failed" }, 502);

  const step = speechStep(session, isSpeechMatch(heard, found.word.he), heard);
  const committed = await commitAnswer(c.env.DB, session, step);
  if (!committed.ok) return c.json({ error: "answer_conflict" }, 409);
  return c.json(committed.response);
});

// ---- Запись шаблонов букв: скрытый инструмент владельца (templateRecorder.ts), доступ по Telegram id из секрета. ----

// Все записанные варианты. Приложение вызывает это при открытии экрана записи, 403 значит «вам сюда нельзя».
app.get("/api/templates", requireUser, requireRecorder, rateLimit("templates"), async (c) => {
  const body: TemplatesResponse = { variants: TEMPLATE_VARIANTS_PER_LETTER, items: await listTemplates(c.env.DB) };
  return c.json(body);
});

// Записать или перезаписать вариант. Рисунок сохраняется всегда, а ответ предупреждает, если он похож на другую букву.
app.put("/api/templates", requireUser, requireRecorder, rateLimit("templates"), async (c) => {
  const raw = await readBodyLimited(c.req.raw, MAX_STAGE_BODY_BYTES);
  if (!raw) return c.json({ error: "body_too_large" }, 413);
  const body = parseJson<{ letter?: unknown; slot?: unknown; strokes?: unknown }>(raw);
  if (typeof body !== "object" || body === null) return c.json({ error: "bad_request" }, 400);

  const target = parseTemplateTarget(body.letter, body.slot);
  if (!target.ok) return c.json({ error: target.error }, 400);
  const drawn = parseTemplateStrokes(body.strokes);
  if (!drawn.ok) return c.json({ error: drawn.error }, drawn.error === "too_small" ? 422 : 400);

  const item = await saveTemplate(c.env.DB, c.get("user").id, target.letter, target.slot, drawn.strokes);
  const response: TemplateSaveResponse = { item, ...checkRecorded(target.letter, drawn.strokes) };
  return c.json(response);
});

// Удалить вариант: ?letter=<буква>&slot=<номер>.
app.delete("/api/templates", requireUser, requireRecorder, rateLimit("templates"), async (c) => {
  const slot = c.req.query("slot");
  const target = parseTemplateTarget(c.req.query("letter"), slot !== undefined && /^\d{1,2}$/.test(slot) ? Number(slot) : null);
  if (!target.ok) return c.json({ error: target.error }, 400);
  const removed = await deleteTemplate(c.env.DB, target.letter, target.slot);
  return removed ? c.json({ ok: true }) : c.json({ error: "not_found" }, 404);
});

app.notFound((c) => c.json({ error: "not_found" }, 404));

app.onError((err, c) => {
  console.error(err);
  return c.json({ error: "internal_error" }, 500);
});

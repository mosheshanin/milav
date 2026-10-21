import { Hono } from "hono";
import { allLessons, catalog, findStudyItem, findWord, getAnyLesson, getQuizLesson } from "@milav/content";
import {
  ALPHABET_ALL_ID,
  CLIENT_LOG_LIMITS,
  CLIENT_LOG_PATH,
  DEFAULT_TZ,
  MAX_STAGE_BODY_BYTES,
  PAID_LESSONS_OPEN,
  POINTS_PER_WORD,
  STAGES,
  TEMPLATE_VARIANTS_PER_LETTER,
  isAlphabetLesson,
  speechMatchDetail,
  lessonItems,
  lessonOpenWithoutPurchase,
  stagesFor,
  type AnyLesson,
  type HomeResponse,
  type LessonContentResponse,
  type MeResponse,
  type QuizAnswerResponse,
  type QuizStartResponse,
  type Stage,
  type TemplateSaveResponse,
  type TemplatesResponse,
} from "@milav/shared";
import { requireUser, userFromHeader } from "./auth";
import { boardWeekNow } from "./board";
import {
  ensureUser,
  getCompletedItemIds,
  getHomeProgress,
  getLessonProgress,
  getQuizSummary,
  markStage,
  touchUser,
  type StageResult,
} from "./db";
import { parseJson, readBodyLimited } from "./body";
import type { AppEnv } from "./env";
import { applyTimezone, buildPlayInfo, countUnseen, featuresFor, nowSeconds, playRoutes, repeatOn } from "./play";
import { repeatRoutes, repeatSummaryFor } from "./repeat";
import { generateLessonQuiz, isChoiceType, isWriteType } from "./quizGen";
import { checkSession, commitAnswer, loadSession, speechStep, startSession, type AnswerStep } from "./quizSession";
import { rateLimit } from "./rateLimit";
import { apiSecurityHeaders } from "./security";
import { readAudio, rivalsOf, speechLogFields, transcribeHebrew } from "./speech";
import { ensureStats, loadStats, reconcileBadges, recordWordCompleted, totalsOf, type PlayOutcome } from "./stats";
import { recognizeLetters, verifyTyped, verifyWritten, type ProofResult } from "./stageProof";
import { createThrottle, describeError, logClientReport, logError, logEvent, logWarn, parseClientReport } from "./telemetry";
import {
  checkRecorded,
  deleteTemplate,
  listTemplates,
  parseTemplateStrokes,
  parseTemplateTarget,
  saveTemplate,
} from "./templateRecorder";
import { adminRoutes, loadConfig, ownerIds, requireAdmin, staffOf } from "./admin";
import { recordActivity } from "./adminStats";
import { reviewRoutes } from "./review";
import {
  ensureScheduler,
  handleReminderCallback,
  loadReminderRow,
  noteAppOpen,
  reminderCommandReply,
  reminderInfo,
  reminderRoutes,
  remindersOn,
} from "./reminders";
import {
  BOT_MAX_UPDATE_BYTES,
  BOT_WEBHOOK_PATH,
  commandOf,
  ensureBotSetupOnce,
  isTelegramWebhook,
  replyTo,
  type TelegramUpdate,
} from "./bot";

/** Фоновая задача: дожидается её Workers (waitUntil). В тестах контекста выполнения нет, тогда просто не ждём. */
function inBackground(c: { executionCtx: { waitUntil(promise: Promise<unknown>): void } }, task: Promise<unknown>): void {
  try {
    c.executionCtx.waitUntil(task);
  } catch {
    void task;
  }
}

/**
 * Доступен ли урок пользователю. Покупок пока нет (Stars, задача 8): бесплатные уроки открыты всегда (алфавит тоже),
 * платные открыты, пока включён PAID_LESSONS_OPEN (решение владельца 16.10).
 */
function canAccessLesson(lesson: AnyLesson): boolean {
  return lessonOpenWithoutPurchase(lesson, PAID_LESSONS_OPEN);
}

/**
 * Отметка этапа вместе со счётчиками: очки и неделя таблицы растут в одном пакете с отметкой, а когда слово или буква
 * пройдены, обновляются ритм, цель дня и бейджи (stats.ts). Пользователь уже должен быть в users.
 */
async function markStageWithPlay(
  env: AppEnv["Bindings"],
  userId: number,
  lesson: AnyLesson,
  itemId: string,
  stage: Stage,
  required?: readonly Stage[],
): Promise<{ result: StageResult; points: number; play?: PlayOutcome }> {
  const now = nowSeconds();
  const isLetter = isAlphabetLesson(lesson);
  const db = env.DB;
  const stats = await ensureStats(db, userId, { now, dailyGoal: (await loadConfig(env)).defaultDailyGoal });
  const result = await markStage(db, userId, lesson.id, itemId, stage, required, { isLetter, boardWeek: boardWeekNow(now), now });
  const points = totalsOf(stats).points + (result.justCompleted ? POINTS_PER_WORD : 0);
  const play = result.justCompleted ? await recordWordCompleted(db, stats, isLetter, now) : undefined;
  return { result, points, play };
}

/** Читает небольшой JSON из тела запроса. Слишком большое тело и не-JSON дают null. */
async function readJson<T>(request: Request, maxBytes = 64 * 1024): Promise<T | null> {
  const bytes = await readBodyLimited(request, maxBytes);
  return bytes ? parseJson<T>(bytes) : null;
}

/** Итог викторины для журнала: сдана, не сдана, прервана или ещё идёт. */
function quizOutcome(response: QuizAnswerResponse): "passed" | "failed" | "aborted" | null {
  if (response.aborted) return "aborted";
  if (response.result) return response.result.passed ? "passed" : "failed";
  return null;
}

/** Пишет в журнал конец викторины, если этот ответ её закончил (повторный ответ после обрыва связи не пишется). */
function logQuizEnd(userId: number, lessonId: string, response: QuizAnswerResponse): void {
  const outcome = quizOutcome(response);
  if (!outcome || response.repeat) return;
  logEvent("quiz_end", { uid: userId, lesson: lessonId, outcome, correct: response.correctCount, mistakes: response.mistakes });
}

// Отчёты приложения: не больше CLIENT_LOG_LIMITS.perMinutePerIp в минуту с одного адреса (в памяти экземпляра, без D1).
const clientLogThrottle = createThrottle(CLIENT_LOG_LIMITS.perMinutePerIp);

export const app = new Hono<AppEnv>();

// Заголовки безопасности на всех ответах API (в том числе на ошибках и 404).
app.use("/api/*", apiSecurityHeaders);

// Проверка, что сервис жив и база отвечает. 503, если база недоступна (например, исчерпан дневной лимит D1).
app.get("/api/health", async (c) => {
  try {
    await c.env.DB.prepare("SELECT 1").first();
    return c.json({ ok: true, service: "milav-api", db: "ok" });
  } catch (err) {
    logError("health_db_error", describeError(err));
    return c.json({ ok: false, service: "milav-api", db: "error" }, 503);
  }
});

// Отчёт приложения об ошибке или событии (lib/telemetry.ts в приложении). Вход необязателен: ошибка могла случиться
// до входа. Если подпись верна, в запись попадает id пользователя. Ответ всегда пустой: приложению нечего с ним делать.
app.post(CLIENT_LOG_PATH, async (c) => {
  const ip = c.req.header("CF-Connecting-IP") ?? "local";
  if (!clientLogThrottle(ip)) return c.body(null, 429);
  const report = parseClientReport(await readJson<unknown>(c.req.raw, CLIENT_LOG_LIMITS.bodyBytes));
  if (!report) return c.body(null, 400);
  const user = await userFromHeader(c.req.header("Authorization") ?? "", c.env);
  logClientReport(report, user?.id);
  return c.body(null, 204);
});

// Бот: обновления от Telegram. Ответ уходит в теле ответа на вебхук (Telegram выполнит sendMessage сам).
// Неподписанный запрос получает 401; непонятное обновление 200 без ответа, чтобы Telegram не повторял его.
app.post(BOT_WEBHOOK_PATH, async (c) => {
  if (!(await isTelegramWebhook(c.req.header("X-Telegram-Bot-Api-Secret-Token"), c.env.BOT_TOKEN))) {
    return c.json({ error: "unauthorized" }, 401);
  }
  const raw = await readBodyLimited(c.req.raw, BOT_MAX_UPDATE_BYTES);
  const update = raw ? parseJson<TelegramUpdate>(raw) : null;
  if (!update || typeof update !== "object") return c.body(null, 200);
  // Кнопки под напоминаниями: ответ всплывающей подсказкой (answerCallbackQuery).
  if (update.callback_query) {
    const answer = await handleReminderCallback(c.env, update.callback_query);
    if (answer) logEvent("bot_callback", { uid: update.callback_query.from?.id, data: update.callback_query.data?.slice(0, 16) });
    return answer ? c.json(answer) : c.body(null, 200);
  }
  const message = update.message;
  if (
    commandOf(message?.text) === "reminders" &&
    message?.chat?.type === "private" &&
    typeof message.chat.id === "number" &&
    typeof message.from?.id === "number" &&
    !message.from.is_bot
  ) {
    logEvent("bot_message", { uid: message.from.id, cmd: "reminders" });
    return c.json(await reminderCommandReply(c.env, message.chat.id, message.from.id));
  }
  const reply = replyTo(update, `${new URL(c.req.url).origin}/`);
  if (!reply) return c.body(null, 200);
  logEvent("bot_message", { uid: update.message?.from?.id, cmd: commandOf(update.message?.text) ?? "text" });
  return c.json(reply);
});

// Профиль, очки, статус и блок «Мой путь». Приложение вызывает это при запуске и присылает свой часовой пояс.
app.get("/api/me", requireUser, async (c) => {
  const user = c.get("user");
  const now = nowSeconds();
  // Профиль и отметка «открывал сегодня» (для «Обзора» панели) пишутся параллельно.
  await Promise.all([touchUser(c.env.DB, user), recordActivity(c.env.DB, user.id, now * 1000)]);
  const timezone = c.req.header("X-Timezone");
  const config = await loadConfig(c.env);
  let stats = await ensureStats(c.env.DB, user.id, { now, tz: timezone, dailyGoal: config.defaultDailyGoal });
  stats = await applyTimezone(c.env.DB, stats, timezone, now);
  // Каталог бейджей вырос с прошлого входа: недостающие бейджи выдаются один раз задним числом.
  if (stats.badgesVer !== catalog.version) await reconcileBadges(c.env.DB, stats, { now, retro: true });
  // Приложение запрашивает профиль при каждом запуске: по этому событию считаем запуски и активных учеников.
  logEvent("app_open", { uid: user.id, tz: timezone, points: totalsOf(stats).points });
  // Владелец открыл приложение: в фоне проверяем вебхук бота и при необходимости регистрируем его (bot.ts).
  if (ownerIds(c.env).has(user.id)) {
    const origin = new URL(c.req.url).origin;
    const setup = ensureBotSetupOnce(c.env, origin);
    if (setup) inBackground(c, setup);
    // И таймер напоминаний (scheduler.ts): заводится, если ещё не заведён.
    inBackground(c, ensureScheduler(c.env, origin));
  }
  // Напоминания: открыли приложение после напоминания (статистика текста) и данные для «Настроек».
  const reminderRow = await loadReminderRow(c.env.DB, user.id);
  await noteAppOpen(c.env.DB, reminderRow, now);
  const staff = await staffOf(c.env, user.id);
  const body: MeResponse = {
    user: { id: user.id, firstName: user.firstName, username: user.username },
    ...totalsOf(stats),
    play: buildPlayInfo(stats, await countUnseen(c.env.DB, user.id), now, await featuresFor(c.env, user.id)),
    ...((await remindersOn(c.env, user.id)) ? { reminders: reminderInfo(reminderRow, now) } : {}),
    ...(staff ? { staff } : {}),
  };
  return c.json(body);
});

// Главная: прогресс всех доступных уроков одним запросом (раньше приложение спрашивало каждый урок отдельно).
app.get("/api/home", requireUser, async (c) => {
  const user = c.get("user");
  const available = allLessons
    .filter(canAccessLesson)
    // Общая викторина по всем буквам: у неё нет своих слов, главной нужен только результат («сдана», лучший счёт).
    .map((lesson) => ({ id: lesson.id, itemIds: lessonItems(lesson).map((item) => item.id) }))
    .concat({ id: ALPHABET_ALL_ID, itemIds: [] });
  const body: HomeResponse = { lessons: await getHomeProgress(c.env.DB, user.id, available) };
  // Повторение: сколько слов пора повторить (граница дня по поясу ученика, который приложение прислало в /api/me).
  if (await repeatOn(c.env, user.id)) {
    const tz = (await loadStats(c.env.DB, user.id))?.tz ?? DEFAULT_TZ;
    body.repeat = await repeatSummaryFor(c.env.DB, user.id, tz, nowSeconds());
  }
  return c.json(body);
});

// Слова (в алфавите буквы) урока. В приложении их нет, там только манифест без слов (content/manifest.ts):
// урок приходит отсюда и только тем, у кого есть к нему доступ, поэтому платные слова не видны в файлах приложения.
// Обращения к базе нет: проверка доступа пока по самому уроку (бесплатный или нет).
app.get("/api/lessons/:lessonId", requireUser, (c) => {
  const lesson = getAnyLesson(c.req.param("lessonId"));
  if (!lesson) return c.json({ error: "lesson_not_found" }, 404);
  if (!canAccessLesson(lesson)) return c.json({ error: "subscription_required" }, 403);
  const body: LessonContentResponse = { lesson };
  return c.json(body);
});

// Прогресс по словам (в алфавите по буквам) урока и итог викторины. Поле `words` общее для обоих видов уроков.
app.get("/api/lessons/:lessonId/progress", requireUser, async (c) => {
  const user = c.get("user");
  const lesson = getAnyLesson(c.req.param("lessonId"));
  if (!lesson) return c.json({ error: "lesson_not_found" }, 404);
  if (!canAccessLesson(lesson)) return c.json({ error: "subscription_required" }, 403);

  const words = await getLessonProgress(c.env.DB, user.id, lesson.id, lessonItems(lesson).map((item) => item.id));
  const quiz = await getQuizSummary(c.env.DB, user.id, lesson.id);
  return c.json({ words, quiz });
});

// Этапы слушай / пиши / печатай. «Говори» отмечает только проверка речи на сервере (у букв этапа «говори» нет).
// «Печатай» и «пиши» принимаются только с доказательством: набранное слово или штрихи букв (см. stageProof.ts);
// у буквы это набранная буква и штрихи одной буквы.
app.post("/api/progress/stage", requireUser, rateLimit("stage"), async (c) => {
  const user = c.get("user");
  const raw = await readBodyLimited(c.req.raw, MAX_STAGE_BODY_BYTES);
  if (!raw) return c.json({ error: "body_too_large" }, 413);
  const body = parseJson<{ wordId?: string; stage?: string; typed?: unknown; strokes?: unknown }>(raw);
  if (!body?.wordId || !body.stage) return c.json({ error: "bad_request" }, 400);
  if (body.stage === "speak") return c.json({ error: "speak_requires_speech_check" }, 400);
  if (!STAGES.includes(body.stage as Stage)) return c.json({ error: "bad_stage" }, 400);

  // Слово или буква: у каждого своё множество этапов и свой урок.
  const found = findStudyItem(body.wordId);
  if (!found) return c.json({ error: "word_not_found" }, 404);
  if (!canAccessLesson(found.lesson)) return c.json({ error: "subscription_required" }, 403);

  const stage = body.stage as Exclude<Stage, "speak">;
  const required = stagesFor(found.lesson);
  if (!required.includes(stage)) return c.json({ error: "bad_stage" }, 400);
  let proof: ProofResult = { ok: true };
  if (stage === "type") proof = verifyTyped(found.item, body.typed);
  else if (stage === "write") proof = await verifyWritten(found.item, body.strokes);
  if (!proof.ok) {
    logWarn("stage_rejected", {
      uid: user.id,
      lesson: found.lesson.id,
      item: found.item.id,
      stage,
      error: proof.error,
      failed: proof.failedLetters?.join(","),
    });
    return c.json(
      { error: proof.error, ...(proof.failedLetters ? { failedLetters: proof.failedLetters } : {}) },
      proof.status,
    );
  }

  await ensureUser(c.env.DB, user);
  const { result, points, play } = await markStageWithPlay(c.env, user.id, found.lesson, found.item.id, stage, required);
  if (result.justCompleted) logEvent("word_done", { uid: user.id, lesson: found.lesson.id, item: found.item.id, points });
  return c.json({
    progress: result.progress,
    pointsAwarded: result.justCompleted ? POINTS_PER_WORD : 0,
    points,
    ...(play ? { play } : {}),
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
  if (heard === null) {
    logWarn("speech_failed", { uid: user.id, word: found.word.id, where: "study", bytes: recording.audio.byteLength });
    return c.json({ error: "speech_failed" }, 502);
  }

  const detail = speechMatchDetail(heard, found.word.he, rivalsOf(found.lesson.topicId, found.word.id), found.word.value);
  const match = detail.match;
  // Что услышал распознаватель: по несовпадениям видно, какие слова Whisper слышит плохо (и не слишком ли строг допуск).
  logEvent("speech", { uid: user.id, word: found.word.id, where: "study", match, heard, ...speechLogFields(found.word.he, detail) });
  if (!match) return c.json({ heard, match });

  await ensureUser(c.env.DB, user);
  const { result, points, play } = await markStageWithPlay(c.env, user.id, found.lesson, found.word.id, "speak");
  if (result.justCompleted) logEvent("word_done", { uid: user.id, lesson: found.lesson.id, item: found.word.id, points });
  return c.json({
    heard,
    match,
    progress: result.progress,
    pointsAwarded: result.justCompleted ? POINTS_PER_WORD : 0,
    points,
    ...(play ? { play } : {}),
  });
});

// ---- Викторина. Вопросы выдаёт сервер, каждый ответ проверяется здесь, итог считается здесь (quizSession.ts). ----

// Начало викторины: только по полностью пройденному уроку. Прежняя открытая викторина пользователя заменяется.
app.post("/api/quiz/start", requireUser, rateLimit("quiz"), async (c) => {
  const user = c.get("user");
  const body = await readJson<{ lessonId?: unknown }>(c.req.raw);
  if (typeof body?.lessonId !== "string") return c.json({ error: "bad_request" }, 400);

  const lesson = getQuizLesson(body.lessonId);
  if (!lesson) return c.json({ error: "lesson_not_found" }, 404);
  if (!canAccessLesson(lesson)) return c.json({ error: "subscription_required" }, 403);

  await ensureUser(c.env.DB, user);
  // Общая викторина по всем буквам открывается, когда выучены все буквы уроков алфавита (они лежат в разных уроках),
  // обычная по уроку, когда выучены все слова этого урока.
  const learned =
    lesson.id === ALPHABET_ALL_ID
      ? await getCompletedItemIds(c.env.DB, user.id)
      : new Set(
          (await getLessonProgress(c.env.DB, user.id, lesson.id, lessonItems(lesson).map((item) => item.id)))
            .filter((p) => p.completed)
            .map((p) => p.wordId),
        );
  // Администратор может начать викторину до изучения всех слов, чтобы проверить её (решение владельца 17.10).
  // Результат засчитывается как обычно.
  if (!lessonItems(lesson).every((item) => learned.has(item.id)) && (await staffOf(c.env, user.id))?.role !== "admin") {
    return c.json({ error: "lesson_not_completed" }, 409);
  }

  const questions = generateLessonQuiz(lesson);
  const sessionId = await startSession(c.env.DB, user.id, lesson.id, questions, nowSeconds());
  logEvent("quiz_start", { uid: user.id, lesson: lesson.id, questions: questions.length });
  const response: QuizStartResponse = { sessionId, lessonId: lesson.id, questions };
  return c.json(response);
});

// Ответ на вопрос с выбором, письмом или набором буквы (и отказ от вопроса «произнеси» или письма).
// Запись голоса для «произнеси» отправляется отдельно: /api/quiz/speech.
app.post("/api/quiz/answer", requireUser, async (c) => {
  const user = c.get("user");
  const raw = await readBodyLimited(c.req.raw, MAX_STAGE_BODY_BYTES);
  if (!raw) return c.json({ error: "body_too_large" }, 413);
  const body = parseJson<{
    sessionId?: unknown;
    index?: unknown;
    choice?: unknown;
    strokes?: unknown;
    typed?: unknown;
    giveUp?: unknown;
  }>(raw);
  if (typeof body !== "object" || body === null) return c.json({ error: "bad_request" }, 400);

  const check = checkSession(await loadSession(c.env.DB, user.id), body.sessionId, body.index, nowSeconds());
  if (check.kind === "error") return c.json(check.body, check.status);
  if (check.kind === "repeat") return c.json(check.response);
  const { session, question } = check;

  const found = findStudyItem(question.wordId);
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
  } else if (question.type === "name-type") {
    // «Найди букву на клавиатуре»: нажатая буква должна быть именно этой формой (ך не равна כ).
    if (typeof body.typed !== "string" || body.typed.length === 0 || body.typed.length > 8) {
      return c.json({ error: "proof_required" }, 400);
    }
    step = { correct: verifyTyped(found.item, body.typed).ok, final: true };
  } else if (isWriteType(question.type)) {
    // Письмо: штрихи каждой буквы; у не написанной буквы пустой список, вопрос тогда засчитывается неверным.
    // В алфавите буква одна, то есть один список штрихов.
    const failedLetters = await recognizeLetters(found.item, body.strokes, true);
    if (!failedLetters) return c.json({ error: "proof_required" }, 400);
    step = { correct: failedLetters.length === 0, final: true, failedLetters };
  } else {
    return c.json({ error: "bad_request" }, 400);
  }

  const committed = await commitAnswer(c.env.DB, session, step);
  if (!committed.ok) return c.json({ error: "answer_conflict" }, 409);
  logQuizEnd(user.id, session.lessonId, committed.response);
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
  if (heard === null) {
    logWarn("speech_failed", { uid: user.id, word: found.word.id, where: "quiz", bytes: recording.audio.byteLength });
    return c.json({ error: "speech_failed" }, 502);
  }

  const detail = speechMatchDetail(heard, found.word.he, rivalsOf(found.lesson.topicId, found.word.id), found.word.value);
  const match = detail.match;
  logEvent("speech", { uid: user.id, word: found.word.id, where: "quiz", match, heard, ...speechLogFields(found.word.he, detail) });
  const step = speechStep(session, match, heard);
  const committed = await commitAnswer(c.env.DB, session, step);
  if (!committed.ok) return c.json({ error: "answer_conflict" }, 409);
  logQuizEnd(user.id, session.lessonId, committed.response);
  return c.json(committed.response);
});

// ---- Запись шаблонов букв (templateRecorder.ts): раздел панели администратора, доступ только администраторам. ----

// Все записанные варианты. Приложение вызывает это при открытии экрана записи, 403 значит «вам сюда нельзя».
app.get("/api/templates", requireUser, requireAdmin, rateLimit("templates"), async (c) => {
  const body: TemplatesResponse = { variants: TEMPLATE_VARIANTS_PER_LETTER, items: await listTemplates(c.env.DB) };
  return c.json(body);
});

// Записать или перезаписать вариант. Рисунок сохраняется всегда, а ответ предупреждает, если он похож на другую букву.
app.put("/api/templates", requireUser, requireAdmin, rateLimit("templates"), async (c) => {
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
app.delete("/api/templates", requireUser, requireAdmin, rateLimit("templates"), async (c) => {
  const slot = c.req.query("slot");
  const target = parseTemplateTarget(c.req.query("letter"), slot !== undefined && /^\d{1,2}$/.test(slot) ? Number(slot) : null);
  if (!target.ok) return c.json({ error: target.error }, 400);
  const removed = await deleteTemplate(c.env.DB, target.letter, target.slot);
  return removed ? c.json({ ok: true }) : c.json({ error: "not_found" }, 404);
});

// Геймификация: достижения, настройки, таблица лидеров, сравнение (play.ts).
app.route("/", playRoutes);

// Повторение слов: подход, ответы, «Мои слова» (repeat.ts).
app.route("/", repeatRoutes);

// Напоминания от бота: настройки ученика (reminders.ts). Таймер отправки: scheduler.ts.
app.route("/", reminderRoutes);

// Панель администратора: обзор, настройки приложения, команда, журнал (admin.ts, docs/ADMIN.md).
app.route("/", adminRoutes);

// Проверка слов носителем: администраторы и проверяющие (review.ts, docs/ADMIN.md, этап 3).
app.route("/", reviewRoutes);

app.notFound((c) => c.json({ error: "not_found" }, 404));

// Необработанная ошибка: в журнал с адресом и стеком, ученику только «internal_error».
app.onError((err, c) => {
  logError("server_error", { method: c.req.method, path: c.req.path, ...describeError(err) });
  return c.json({ error: "internal_error" }, 500);
});

// Карточки в чате с ботом (виджеты Telegram, Bot API 10.4; docs/WIDGETS.md): «Мой прогресс» (/progress) и
// «Напоминания» (/reminders).
//
// Как устроено:
// - Карточку бот отправляет методом sendWidget прямо (не ответом на вебхук), чтобы узнать, принял ли её Telegram.
// - Не принял («INPUT_MEDIA_WIDGET_NOT_ALLOWED»: с 13.11.2026 Telegram закрыл виджеты для обычных ботов, или старый
//   сервер Bot API не знает метода): бот отвечает тем же обычным текстом с кнопками, пишет в журнал `widget_refused`
//   и час не пробует снова (в пределах экземпляра Worker), чтобы не тратить запросы.
// - Карточка сама просит свежие данные, когда появляется на экране и по «Обновить» (обновление `widget_query`).
//   Бот отвечает answerWidgetQuery прямым запросом. Поэтому после занятий бот ничего в чат не шлёт и не правит.
// - Выключатель в панели: «Настройки приложения» → «Карточки в чате с ботом» (по умолчанию «Команда»).
//   /progress работает и без карточек: обычным текстом.
import {
  PROGRESS_WIDGET_HTML,
  REMINDERS_WIDGET_HTML,
  RHYTHM_DAYS_PER_WEEK,
  SHABBAT_OFF,
  DEFAULT_TZ,
  dayInWeek,
  featureOn,
  localEpochDay,
  minuteText,
  parseWidgetRequest,
  progressCard,
  progressVars,
  remindersCard,
  viewPlay,
  widgetDataJson,
  type BotTexts,
  type ProgressCardData,
  type RemindersCardData,
} from "@milav/shared";
import { loadConfig, staffOf } from "./admin";
import { botText, cleanName, loadBotTexts, progressKeyboard, type InlineKeyboard } from "./botTexts";
import type { Bindings } from "./env";
import { repeatOn } from "./play";
import { disableReminders, enableFromChat, loadReminderRow, reminderSettings, remindersOn, telegramFetchFn } from "./reminders";
import { repeatSummaryFor } from "./repeat";
import { loadStats, totalsOf } from "./stats";
import { describeError, logError, logEvent, logWarn } from "./telemetry";

/** Сколько секунд не пробовать карточки после отказа Telegram. */
export const WIDGET_REFUSE_SECONDS = 3600;

let refusedUntil = 0;

/** Для тестов: забыть отказ Telegram. */
export function resetWidgetRefusalForTests(): void {
  refusedUntil = 0;
}

const nowSeconds = () => Math.floor(Date.now() / 1000);

/** Отказ «виджеты этому боту нельзя» (или сервер Bot API не знает метода): переходим на текст. */
export function isWidgetRefusal(description: string): boolean {
  return /WIDGET_NOT_ALLOWED|method not found/i.test(description);
}

/** Включены ли карточки для этого человека (настройка из панели и его роль). */
export async function widgetsOn(env: Bindings, userId: number): Promise<boolean> {
  const { botWidgets } = await loadConfig(env);
  if (botWidgets !== "team") return botWidgets === "all";
  return featureOn(botWidgets, await staffOf(env, userId));
}

// ---- Telegram ----

interface TgResult {
  ok: boolean;
  result?: unknown;
  error_code?: number;
  description?: string;
}

async function tg(env: Bindings, method: string, body: unknown): Promise<TgResult> {
  const token = env.BOT_TOKEN;
  if (!token) return { ok: false, description: "no-token" };
  try {
    const res = await telegramFetchFn()(`https://api.telegram.org/bot${token}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = (await res.json().catch(() => null)) as TgResult | null;
    return data ?? { ok: false, error_code: res.status, description: `HTTP ${res.status}` };
  } catch (err) {
    return { ok: false, description: describeError(err).message ?? "network" };
  }
}

const isBlocked = (r: TgResult) =>
  r.error_code === 403 || (r.error_code === 400 && /chat not found|user is deactivated|peer_id_invalid/i.test(r.description ?? ""));

const messageIdOf = (r: TgResult) => (r.result as { message_id?: number } | undefined)?.message_id;

type CardName = "progress" | "reminders";

/** Отправляет карточку. null: не отправилась (выключена, отказ Telegram, ошибка); "blocked": бот не может писать. */
async function sendWidget(
  env: Bindings,
  chatId: number,
  card: CardName,
  html: string,
  data: ProgressCardData | RemindersCardData,
  caption: string,
  replyMarkup?: InlineKeyboard,
): Promise<number | "blocked" | null> {
  if (nowSeconds() < refusedUntil) return null;
  const r = await tg(env, "sendWidget", {
    chat_id: chatId,
    html,
    chat_data: widgetDataJson(data),
    caption,
    allow_queries: true,
    ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
  });
  const id = messageIdOf(r);
  if (r.ok && typeof id === "number") {
    logEvent("widget_sent", { uid: chatId, card });
    return id;
  }
  if (isBlocked(r)) return "blocked";
  const description = (r.description ?? "").slice(0, 160);
  if (isWidgetRefusal(description)) {
    refusedUntil = nowSeconds() + WIDGET_REFUSE_SECONDS;
    logWarn("widget_refused", { uid: chatId, card, code: r.error_code, description });
  } else {
    logError("widget_error", { uid: chatId, card, code: r.error_code, description });
  }
  return null;
}

// ---- «Мой прогресс» ----

/** Данные карточки прогресса на сейчас. Нового ученика (ещё не открывал приложение) показываем с нуля. */
export async function progressData(env: Bindings, userId: number, now: number): Promise<ProgressCardData> {
  const stats = await loadStats(env.DB, userId);
  if (!stats) {
    const today = localEpochDay(DEFAULT_TZ, now * 1000);
    return progressCard({
      passedLessons: 0,
      points: 0,
      week: { days: [], todayIndex: dayInWeek(today), daysThisWeek: 0, target: RHYTHM_DAYS_PER_WEEK },
      goal: null,
      repeatDue: null,
    });
  }
  const view = viewPlay(stats.play, localEpochDay(stats.tz, now * 1000), stats.dailyGoal);
  const repeatDue = (await repeatOn(env, userId)) ? (await repeatSummaryFor(env.DB, userId, stats.tz, now)).due : null;
  return progressCard({
    passedLessons: stats.passedLessons,
    points: totalsOf(stats).points,
    week: { days: view.days, todayIndex: view.todayIndex, daysThisWeek: view.daysThisWeek, target: RHYTHM_DAYS_PER_WEEK },
    goal: view.goal,
    repeatDue,
  });
}

function progressText(texts: BotTexts, data: ProgressCardData, firstName: string | undefined): string {
  return botText(texts, "progress.text", { имя: cleanName(firstName) || "друг", ...progressVars(data) });
}

/**
 * /progress: карточка «Мой прогресс» (или текст, если карточки выключены или Telegram их не принял), закреплённая
 * в чате. Прежняя закреплённая карточка открепляется, так что закреплена всегда одна, свежая.
 */
export async function progressCommand(env: Bindings, chatId: number, firstName: string | undefined, appUrl: string): Promise<void> {
  const now = nowSeconds();
  const userId = chatId; // личный чат: id чата равен id ученика
  const [data, texts] = await Promise.all([progressData(env, userId, now), loadBotTexts(env.DB)]);
  const имя = cleanName(firstName) || "друг";

  let kind: "widget" | "text" = "widget";
  let messageId: number | "blocked" | null = null;
  if (await widgetsOn(env, userId)) {
    messageId = await sendWidget(env, chatId, "progress", PROGRESS_WIDGET_HTML, data, botText(texts, "progress.caption", { имя }), progressKeyboard(texts, appUrl, false));
  }
  if (messageId === null) {
    kind = "text";
    const r = await tg(env, "sendMessage", { chat_id: chatId, text: progressText(texts, data, firstName), reply_markup: progressKeyboard(texts, appUrl, true) });
    messageId = r.ok ? (messageIdOf(r) ?? null) : isBlocked(r) ? "blocked" : null;
    if (messageId === null) logError("progress_send_error", { uid: userId, code: r.error_code, description: (r.description ?? "").slice(0, 160) });
  }
  if (typeof messageId !== "number") return;

  // Закрепить новую и открепить прежнюю. Ошибки не мешают: карточка уже в чате.
  const previous = await env.DB.prepare("SELECT progress_msg_id FROM bot_cards WHERE user_id = ?").bind(userId).first<{ progress_msg_id: number | null }>();
  if (previous?.progress_msg_id && previous.progress_msg_id !== messageId) {
    await tg(env, "unpinChatMessage", { chat_id: chatId, message_id: previous.progress_msg_id });
  }
  const pinned = await tg(env, "pinChatMessage", { chat_id: chatId, message_id: messageId, disable_notification: true });
  if (!pinned.ok) logWarn("progress_pin_error", { uid: userId, description: (pinned.description ?? "").slice(0, 160) });
  await env.DB
    .prepare(
      `INSERT INTO bot_cards (user_id, progress_msg_id, progress_kind, updated_at) VALUES (?, ?, ?, ?)
       ON CONFLICT (user_id) DO UPDATE SET progress_msg_id = excluded.progress_msg_id, progress_kind = excluded.progress_kind, updated_at = excluded.updated_at`,
    )
    .bind(userId, messageId, kind, now)
    .run();
  logEvent("progress_card", { uid: userId, kind });
}

export interface CallbackWithMessage {
  id?: string;
  data?: string;
  from?: { id?: number; first_name?: string };
  message?: { message_id?: number; chat?: { id?: number } };
}

/** «Обновить» под текстовым «Моим прогрессом»: сообщение переписывается свежими данными. Ответ: всплывающая подсказка. */
export async function refreshProgressText(env: Bindings, query: CallbackWithMessage, appUrl: string) {
  const userId = query.from?.id;
  const messageId = query.message?.message_id;
  if (typeof query.id !== "string" || typeof userId !== "number") return null;
  const texts = await loadBotTexts(env.DB);
  if (typeof messageId === "number") {
    const data = await progressData(env, userId, nowSeconds());
    const r = await tg(env, "editMessageText", {
      chat_id: userId,
      message_id: messageId,
      text: progressText(texts, data, query.from?.first_name),
      reply_markup: progressKeyboard(texts, appUrl, true),
    });
    // «message is not modified»: ничего не изменилось, это не ошибка.
    if (!r.ok && !/not modified/i.test(r.description ?? "")) logWarn("progress_refresh_error", { uid: userId, description: (r.description ?? "").slice(0, 160) });
  }
  return { method: "answerCallbackQuery" as const, callback_query_id: query.id, text: botText(texts, "popup.refreshed") };
}

// ---- «Напоминания» ----

export async function remindersData(env: Bindings, userId: number): Promise<RemindersCardData> {
  const [available, row, config] = await Promise.all([remindersOn(env, userId), loadReminderRow(env.DB, userId), loadConfig(env)]);
  const settings = reminderSettings(config);
  return remindersCard({ available, enabled: !!row?.enabled, minute: row?.minute ?? settings.defaultMinute, shabbat: settings.shabbatFrom !== SHABBAT_OFF });
}

/**
 * /reminders карточкой. true: карточка в чате (или бот заблокирован, отвечать нечем). false: карточки выключены
 * или Telegram её не принял, тогда вызывающий отвечает прежним текстом с кнопкой.
 */
export async function remindersCardCommand(env: Bindings, chatId: number, firstName: string | undefined): Promise<boolean> {
  if (!(await widgetsOn(env, chatId))) return false;
  const [data, texts] = await Promise.all([remindersData(env, chatId), loadBotTexts(env.DB)]);
  const sent = await sendWidget(env, chatId, "reminders", REMINDERS_WIDGET_HTML, data, botText(texts, "reminders.caption", { имя: cleanName(firstName) || "друг" }));
  return sent !== null;
}

// ---- Запросы от карточек ----

export interface WidgetQueryUpdate {
  id?: string;
  data?: string;
  from?: { id?: number; is_bot?: boolean; first_name?: string };
  chat?: { id?: number; type?: string };
  message_id?: number;
}

/**
 * Запрос от карточки (обновление widget_query): свежие данные или изменение напоминаний. Ответ уходит прямым
 * запросом answerWidgetQuery: карточка ждёт его не дольше 15 секунд. Запросы только из личного чата с ботом.
 */
export async function handleWidgetQuery(env: Bindings, query: WidgetQueryUpdate): Promise<void> {
  const userId = query.from?.id;
  if (typeof query.id !== "string" || typeof userId !== "number" || query.from?.is_bot) return;
  // Карточки живут только в личном чате с ботом (в группах и пересылках Telegram их пока не показывает).
  if (query.chat && (query.chat.type !== "private" || query.chat.id !== userId)) return;
  const request = parseWidgetRequest(query.data);
  let result: string | null = null;
  try {
    if (request?.kind === "progress") {
      result = widgetDataJson(await progressData(env, userId, nowSeconds()));
    } else if (request) {
      result = widgetDataJson(await applyRemindersRequest(env, userId, request));
    }
  } catch (err) {
    logError("widget_query_error", { uid: userId, data: query.data?.slice(0, 16), ...describeError(err) });
  }
  const answer = await tg(env, "answerWidgetQuery", { widget_query_id: query.id, ...(result !== null ? { data: result } : {}) });
  if (!answer.ok) logWarn("widget_answer_error", { uid: userId, description: (answer.description ?? "").slice(0, 160) });
  logEvent("widget_query", { uid: userId, data: query.data?.slice(0, 16), ok: result !== null });
}

type RemindersRequest = Exclude<ReturnType<typeof parseWidgetRequest>, null | { kind: "progress" }>;

/** Включить, выключить, сменить время (выбор времени заодно включает). Возвращает новое состояние карточки. */
async function applyRemindersRequest(env: Bindings, userId: number, request: RemindersRequest): Promise<RemindersCardData> {
  if (request.kind !== "reminders" && (await remindersOn(env, userId))) {
    const now = nowSeconds();
    const row = await loadReminderRow(env.DB, userId);
    const settings = reminderSettings(await loadConfig(env));
    const stats = await env.DB.prepare("SELECT tz FROM user_stats WHERE user_id = ?").bind(userId).first<{ tz: string }>();
    const tz = stats?.tz ?? DEFAULT_TZ;
    if (request.kind === "remindersOff") {
      if (row?.enabled) await disableReminders(env.DB, userId, now, "card");
    } else if (request.kind === "remindersOn") {
      if (!row?.enabled) await enableFromChat(env.DB, userId, tz, row?.minute ?? settings.defaultMinute, now, settings, "card");
    } else if (!row?.enabled || row.minute !== request.minute) {
      await enableFromChat(env.DB, userId, tz, request.minute, now, settings, "card");
      logEvent("reminder_time", { uid: userId, time: minuteText(request.minute), where: "card" });
    }
  }
  return remindersData(env, userId);
}

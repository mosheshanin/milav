// Напоминания от бота, этап 1 (docs/REMINDERS.md): выбор ученика, отправка по расписанию, кнопки в чате,
// тексты в базе и их редактирование в панели администратора.
//
// Как устроено:
// - У каждого, кто включил напоминания, в таблице reminders лежит next_at: следующий момент проверки (по его часам,
//   в обход шаббата). Таймер Cloudflare (Durable Object, scheduler.ts) раз в 10 минут вызывает runDueReminders: она
//   берёт тех, кому пора, по индексу и шлёт не больше SEND_BATCH сообщений за запуск (лимит 50 внешних запросов
//   на запуск на бесплатном тарифе, обращения к D1 тоже считаются).
// - Сообщение уходит, только если сегодня человек ещё не занимался и не нажал «Завтра не напоминать».
// - Telegram ответил «заблокирован» или «чат не найден»: напоминания выключаются (blocked = 1), больше не шлём.
import { Hono } from "hono";
import {
  KIND_PLACEHOLDERS,
  MAX_REMINDER_TEXTS,
  REMINDER_KINDS,
  checkReminderText,
  featureOn,
  isShabbat,
  isValidReminderMinute,
  localDayMinute,
  localEpochDay,
  minuteText,
  nextReminderAt,
  pickDailyReminder,
  pickReminder,
  SHABBAT_OFF,
  wordsText,
  inReminderControl,
  reminderTextGroup,
  popcount,
  renderReminder,
  statusPath,
  weekIndex,
  DEFAULT_TZ,
  type AdminRemindersResponse,
  type ReminderInfo,
  type ReminderKind,
  type ReminderSettingsRequest,
  type ReminderTextItem,
  type AppConfig,
  type ReminderVars,
} from "@milav/shared";
import { adminRoutes, loadConfig, staffOf } from "./admin";
import { botText, loadBotTexts, disableKeyboard, enableKeyboard, reminderKeyboard } from "./botTexts";
import { requireUser } from "./auth";
import { parseJson, readBodyLimited } from "./body";
import { appOrigin } from "./appUrl";
import type { AppEnv, Bindings } from "./env";
import { statsFor } from "./play";
import { countDueForReminders } from "./repeat";
import { REPORT_DAYS, noteSendOpen, reminderReport, sendLogStatement, sendMarkStatement } from "./reminderSends";
import { rateLimit } from "./rateLimit";
import type { Stats } from "./stats";
import { describeError, logError, logEvent, logWarn } from "./telemetry";

/** Сколько напоминаний отправлять за один запуск таймера (запас под обращения к D1 в лимите 50 запросов). */
export const SEND_BATCH = 40;
/** Напоминание опоздало больше чем на столько (таймер не работал): не шлём, переносим на следующий день. */
export const STALE_SECONDS = 3 * 60 * 60;
/** Приложение открыли в течение суток после напоминания: засчитывается тексту как «открыли». */
export const OPEN_WINDOW_SECONDS = 86_400;

/**
 * Настройки сообщений бота из панели («Сообщения бота»): время по умолчанию, пауза на шаббат, порог «пора повторить»,
 * сколько раз и как часто предлагать напоминания.
 */
export interface ReminderSettings {
  defaultMinute: number;
  /** С какой минуты пятницы пауза; SHABBAT_OFF (−1): паузы нет. */
  shabbatFrom: number;
  /** С какого числа слов к повторению напоминать о повторении; 0: не напоминать. */
  repeatMin: number;
  offerTimes: number;
  offerAgainSeconds: number;
}

export function reminderSettings(config: AppConfig): ReminderSettings {
  return {
    defaultMinute: config.reminderMinute,
    shabbatFrom: config.shabbatFrom,
    repeatMin: config.repeatReminderMin,
    offerTimes: config.offerTimes,
    offerAgainSeconds: config.offerAgainDays * 86_400,
  };
}

const nowSeconds = () => Math.floor(Date.now() / 1000);

// ---- Telegram ----

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;
let telegramFetch: FetchLike = (input, init) => fetch(input, init);

/** Для тестов: подменить обращения к Telegram. */
export function setTelegramFetchForTests(fn: FetchLike | null): void {
  telegramFetch = fn ?? ((input, init) => fetch(input, init));
}

/** Текущая функция обращения к Telegram (в тестах подменённая): нужна панели, которая меняет профиль бота. */
export function telegramFetchFn(): FetchLike {
  return telegramFetch;
}

export type SendResult = "sent" | "blocked" | "retry" | "no-token";

/**
 * Отправляет сообщение ученику. «blocked»: бот не может писать (заблокирован, не нажат «Старт», аккаунт удалён).
 * «retry»: временная ошибка (сеть, 429, 5xx), попробуем в следующий запуск.
 */
export async function sendToUser(env: Bindings, chatId: number, text: string, replyMarkup: unknown): Promise<SendResult> {
  const token = env.BOT_TOKEN;
  if (!token) return "no-token";
  try {
    const res = await telegramFetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, reply_markup: replyMarkup, link_preview_options: { is_disabled: true } }),
    });
    const data = (await res.json().catch(() => null)) as { ok?: boolean; error_code?: number; description?: string } | null;
    if (data?.ok) return "sent";
    const code = data?.error_code ?? res.status;
    const description = (data?.description ?? "").toLowerCase();
    if (code === 403 || (code === 400 && /chat not found|user is deactivated|peer_id_invalid/.test(description))) return "blocked";
    logWarn("reminder_send_error", { code, description: description.slice(0, 120) });
    return "retry";
  } catch (err) {
    logWarn("reminder_send_error", describeError(err));
    return "retry";
  }
}

// ---- Строка ученика ----

interface ReminderRow {
  user_id: number;
  enabled: number;
  minute: number;
  next_at: number | null;
  skip_day: number;
  last_sent_at: number;
  last_text_id: number | null;
  opened_counted: number;
  blocked: number;
  asked_count: number;
  asked_at: number;
  /** Учёт рассылок: время последней строки журнала и отмечено ли после неё открытие. */
  send_at: number;
  send_open: number;
}

export async function loadReminderRow(db: D1Database, userId: number): Promise<ReminderRow | null> {
  return db
    .prepare(
      `SELECT user_id, enabled, minute, next_at, skip_day, last_sent_at, last_text_id, opened_counted, blocked, asked_count, asked_at,
              send_at, send_open
       FROM reminders WHERE user_id = ?`,
    )
    .bind(userId)
    .first<ReminderRow>();
}

/** Напоминания для профиля: включены ли, время, можно ли предложить. */
export function reminderInfo(row: ReminderRow | null, now: number, settings: ReminderSettings): ReminderInfo {
  const enabled = !!row?.enabled;
  const blocked = !!row?.blocked;
  const asked = row?.asked_count ?? 0;
  const offer =
    !enabled && !blocked && asked < settings.offerTimes && (asked === 0 || now - (row?.asked_at ?? 0) >= settings.offerAgainSeconds);
  return {
    enabled,
    minute: row?.minute ?? settings.defaultMinute,
    offer,
    blocked,
    shabbatFrom: settings.shabbatFrom === SHABBAT_OFF ? null : settings.shabbatFrom,
  };
}

/** Включены ли напоминания для этого человека (настройка из панели и его роль). */
export async function remindersOn(env: Bindings, userId: number): Promise<boolean> {
  const { reminders } = await loadConfig(env);
  if (reminders !== "team") return reminders === "all";
  return featureOn(reminders, await staffOf(env, userId));
}

/**
 * Человек открыл приложение. Если это в течение суток после напоминания, засчитываем тексту «открыли» (один раз)
 * и отмечаем открытие в журнале рассылок; `fromReminder`: открыл кнопкой «Продолжить» под напоминанием.
 * Вызывается из /api/me; строку уже прочитали.
 */
export async function noteAppOpen(db: D1Database, row: ReminderRow | null, now: number, fromReminder = false): Promise<void> {
  const logged = await noteSendOpen(db, row, now, fromReminder);
  if (logged && fromReminder) logEvent("reminder_click", { uid: row!.user_id, after: now - row!.send_at });
  if (!row || row.opened_counted || !row.last_sent_at || now - row.last_sent_at > OPEN_WINDOW_SECONDS) return;
  const statements = [db.prepare("UPDATE reminders SET opened_counted = 1 WHERE user_id = ?").bind(row.user_id)];
  if (row.last_text_id !== null) statements.push(db.prepare("UPDATE reminder_texts SET opened = opened + 1 WHERE id = ?").bind(row.last_text_id));
  await db.batch(statements);
  logEvent("reminder_open", { uid: row.user_id, text: row.last_text_id ?? undefined, after: now - row.last_sent_at });
}

// ---- Подстановки ----

/** Столбцы user_stats, нужные подстановкам. */
interface StatsColumns {
  tz: string | null;
  last_day: number | null;
  daily_goal: number | null;
  goal_day: number | null;
  goal_words: number | null;
  week_idx: number | null;
  week_days: number | null;
  week_words: number | null;
  passed_lessons: number | null;
}

/** Данные для подстановок на сегодня. Нет данных: подстановки нет, и текст с ней не выбирается. */
export function varsFor(firstName: string, minute: number, s: StatsColumns | null, today: number): ReminderVars {
  const name = firstName.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 32);
  const vars: ReminderVars = { время: minuteText(minute) };
  if (name) vars.имя = name;
  const goal = s?.daily_goal ?? 0;
  if (goal > 0) {
    const done = s?.goal_day === today ? (s?.goal_words ?? 0) : 0;
    if (done < goal) vars.осталось_слов = String(goal - done);
  }
  const thisWeek = s?.week_idx === weekIndex(today);
  vars.дней_на_неделе = String(thisWeek ? popcount(s?.week_days ?? 0) : 0);
  vars.слов_за_неделю = String(thisWeek ? (s?.week_words ?? 0) : 0);
  const path = statusPath(s?.passed_lessons ?? 0);
  if (path.next && path.to !== null) {
    vars.статус = path.next.name;
    vars.до_статуса = String(path.to - path.passed);
  }
  return vars;
}

function statsColumns(stats: Stats): StatsColumns {
  return {
    tz: stats.tz,
    last_day: stats.play.lastDay,
    daily_goal: stats.dailyGoal,
    goal_day: stats.play.goalDay,
    goal_words: stats.play.goalWords,
    week_idx: stats.play.weekIdx,
    week_days: stats.play.weekDays,
    week_words: stats.play.weekWords,
    passed_lessons: stats.passedLessons,
  };
}

interface TextRow {
  id: number;
  kind: ReminderKind;
  text: string;
  enabled: number;
  sent: number;
  opened: number;
  updated_by: number | null;
  updated_at: number;
}

async function enabledTexts(db: D1Database, kind: ReminderKind): Promise<{ id: number; text: string }[]> {
  const { results } = await db.prepare("SELECT id, text FROM reminder_texts WHERE kind = ? AND enabled = 1 ORDER BY id").bind(kind).all<{ id: number; text: string }>();
  return results;
}

// ---- Включить и выключить ----

function upsert(db: D1Database, userId: number, fields: Record<string, number | null>, now: number) {
  const names = Object.keys(fields);
  // Имена столбцов фиксированы в коде вызывающих, значения идут параметрами.
  return db
    .prepare(
      `INSERT INTO reminders (user_id, ${names.join(", ")}, updated_at) VALUES (?, ${names.map(() => "?").join(", ")}, ?)
       ON CONFLICT (user_id) DO UPDATE SET ${names.map((n) => `${n} = excluded.${n}`).join(", ")}, updated_at = excluded.updated_at`,
    )
    .bind(userId, ...names.map((n) => fields[n]!), now);
}

export type EnableResult = { ok: true; sent: SendResult } | { ok: false; error: "bot_blocked" };

/**
 * Включает напоминания и сразу присылает подтверждение: так человек видит, что бот может писать.
 * Если Telegram не дал написать, напоминания не включаются.
 */
export async function enableReminders(
  env: Bindings,
  user: { id: number; firstName: string },
  stats: Stats,
  minute: number,
  appUrl: string,
  now: number,
  settings: ReminderSettings,
): Promise<EnableResult> {
  const today = localEpochDay(stats.tz, now * 1000);
  const vars = varsFor(user.firstName, minute, statsColumns(stats), today);
  const texts = await enabledTexts(env.DB, "enabled");
  const bot = await loadBotTexts(env.DB);
  const chosen = pickReminder(texts, vars, null, Math.random());
  // Все тексты «Напоминания включены» выключены: запасной из «Сообщений бота».
  const text = chosen?.text ?? botText(bot, "confirm.fallback", { имя: vars.имя ?? "", время: vars.время });
  const sent = await sendToUser(env, user.id, text, reminderKeyboard(bot, appUrl, false));
  if (sent === "blocked") {
    await upsert(env.DB, user.id, { enabled: 0, blocked: 1, next_at: null, minute }, now).run();
    logEvent("reminder_blocked", { uid: user.id, where: "enable" });
    return { ok: false, error: "bot_blocked" };
  }
  const nextAt = Math.floor(nextReminderAt(stats.tz, minute, now * 1000, settings.shabbatFrom) / 1000);
  const statements = [upsert(env.DB, user.id, { enabled: 1, blocked: 0, minute, next_at: nextAt }, now)];
  if (sent === "sent" && chosen) statements.push(env.DB.prepare("UPDATE reminder_texts SET sent = sent + 1 WHERE id = ?").bind(chosen.id));
  await env.DB.batch(statements);
  logEvent("reminder_on", { uid: user.id, minute, sent });
  return { ok: true, sent };
}

export async function disableReminders(db: D1Database, userId: number, now: number, where: string): Promise<void> {
  await upsert(db, userId, { enabled: 0, next_at: null }, now).run();
  logEvent("reminder_off", { uid: userId, where });
}

// ---- Таймер ----

let schedulerEnsured = false;

/**
 * Заводит таймер отправки (Durable Object, scheduler.ts), если он ещё не заведён. Не чаще раза на экземпляр Worker.
 * В тестах и без привязки REMINDER_SCHEDULER ничего не делает.
 */
export async function ensureScheduler(env: Bindings, origin: string): Promise<void> {
  if (schedulerEnsured || !env.REMINDER_SCHEDULER) return;
  schedulerEnsured = true;
  try {
    const stub = env.REMINDER_SCHEDULER.get(env.REMINDER_SCHEDULER.idFromName("main"));
    await stub.ensure(origin);
  } catch (err) {
    schedulerEnsured = false;
    logError("reminder_scheduler_error", describeError(err));
  }
}

interface DueRow extends StatsColumns {
  user_id: number;
  minute: number;
  next_at: number;
  skip_day: number;
  last_text_id: number | null;
  first_name: string | null;
}

export interface RunSummary {
  due: number;
  sent: number;
  skipped: number;
  blocked: number;
  retry: number;
  /** Контрольная группа: напоминание нарочно не отправлено (учёт рассылок). */
  held: number;
}

/**
 * Отправляет напоминания тем, кому пора. Вызывает таймер раз в 10 минут. `appUrl` это адрес приложения для кнопки.
 * `random` выбирает текст (в тестах задаётся).
 */
export async function runDueReminders(env: Bindings, nowMs: number, appUrl: string, random: () => number = Math.random): Promise<RunSummary> {
  const now = Math.floor(nowMs / 1000);
  const summary: RunSummary = { due: 0, sent: 0, skipped: 0, blocked: 0, retry: 0, held: 0 };
  const { results: due } = await env.DB
    .prepare(
      `SELECT r.user_id, r.minute, r.next_at, r.skip_day, r.last_text_id, u.first_name,
              s.tz, s.last_day, s.daily_goal, s.goal_day, s.goal_words, s.week_idx, s.week_days, s.week_words, s.passed_lessons
       FROM reminders r LEFT JOIN users u ON u.id = r.user_id LEFT JOIN user_stats s ON s.user_id = r.user_id
       WHERE r.enabled = 1 AND r.next_at <= ? ORDER BY r.next_at LIMIT ?`,
    )
    .bind(now, SEND_BATCH)
    .all<DueRow>();
  summary.due = due.length;
  if (due.length === 0) return summary;

  const config = await loadConfig(env);
  const { reminders: mode, repeat: repeatMode } = config;
  const settings = reminderSettings(config);
  const texts = await enabledTexts(env.DB, "daily");
  const bot = await loadBotTexts(env.DB);
  // Слова к повторению у всех, кому пора, одним запросом (каждому по его местному дню).
  const repeatDue =
    repeatMode === "off" || settings.repeatMin === 0
      ? new Map<number, number>()
      : await countDueForReminders(env.DB, due.map((r) => ({ userId: r.user_id, day: localEpochDay(r.tz ?? DEFAULT_TZ, nowMs) })));
  const updates: D1PreparedStatement[] = [];
  let stop = false;

  for (const row of due) {
    const tz = row.tz ?? DEFAULT_TZ;
    const next = Math.floor(nextReminderAt(tz, row.minute, nowMs + 60_000, settings.shabbatFrom) / 1000);
    const reschedule = () => updates.push(env.DB.prepare("UPDATE reminders SET next_at = ? WHERE user_id = ?").bind(next, row.user_id));
    if (stop) break; // Telegram просит подождать: остальных возьмёт следующий запуск (next_at у них не тронут)

    const local = localDayMinute(tz, nowMs);
    const featureAllowed = mode === "all" || (mode === "team" && !!(await staffOf(env, row.user_id)));
    const reason = !featureAllowed
      ? "feature_off"
      : now - row.next_at > STALE_SECONDS
        ? "stale"
        : isShabbat(local.day, local.minute, settings.shabbatFrom)
          ? "shabbat"
          : row.last_day === local.day
            ? "studied"
            : row.skip_day === local.day
              ? "skip_day"
              : null;
    if (reason) {
      summary.skipped++;
      reschedule();
      continue;
    }

    const vars = varsFor(row.first_name ?? "", row.minute, row, local.day);
    // Слова к повторению (задача 10): только если повторение включено для этого человека.
    const dueWords = repeatDue.get(row.user_id) ?? 0;
    if (settings.repeatMin > 0 && dueWords >= settings.repeatMin && (repeatMode === "all" || (repeatMode === "team" && !!(await staffOf(env, row.user_id))))) {
      vars.к_повторению = wordsText(dueWords);
    }
    const chosen = pickDailyReminder(texts, vars, row.last_text_id, random());
    if (!chosen) {
      // Все тексты выключены или ни один не заполняется: молчим, это видно в журнале.
      logWarn("reminder_no_text", { uid: row.user_id });
      summary.skipped++;
      reschedule();
      continue;
    }

    // Контрольная группа (учёт рассылок): часть напоминаний нарочно не уходит, чтобы сравнить, занимаются ли люди
    // и без них. Решение по ученику и дню, команды не касается. В журнал идёт строка «контроль».
    if (inReminderControl(row.user_id, local.day, config.reminderControl) && !(await staffOf(env, row.user_id))) {
      summary.held++;
      reschedule();
      updates.push(sendLogStatement(env.DB, row.user_id, null, "control", now), sendMarkStatement(env.DB, row.user_id, now));
      logEvent("reminder_held", { uid: row.user_id });
      continue;
    }

    const result = await sendToUser(env, row.user_id, chosen.text, reminderKeyboard(bot, appUrl, true));
    if (result === "sent") {
      summary.sent++;
      updates.push(
        sendLogStatement(env.DB, row.user_id, chosen.id, reminderTextGroup(chosen.text), now),
        sendMarkStatement(env.DB, row.user_id, now),
        env.DB
          .prepare("UPDATE reminders SET next_at = ?, last_sent_at = ?, last_text_id = ?, opened_counted = 0 WHERE user_id = ?")
          .bind(next, now, chosen.id, row.user_id),
        env.DB.prepare("UPDATE reminder_texts SET sent = sent + 1 WHERE id = ?").bind(chosen.id),
      );
      logEvent("reminder_sent", { uid: row.user_id, kind: "daily", text: chosen.id });
    } else if (result === "blocked") {
      summary.blocked++;
      updates.push(env.DB.prepare("UPDATE reminders SET enabled = 0, blocked = 1, next_at = NULL WHERE user_id = ?").bind(row.user_id));
      logEvent("reminder_blocked", { uid: row.user_id, where: "send" });
    } else if (result === "no-token") {
      summary.skipped++;
      reschedule();
    } else {
      summary.retry++;
      stop = true;
    }
  }

  if (updates.length > 0) await env.DB.batch(updates);
  return summary;
}

// ---- Кнопки и команда в чате ----

export interface CallbackQuery {
  id?: string;
  data?: string;
  from?: { id?: number; first_name?: string };
}

/** Ответ на нажатие кнопки под напоминанием: всплывающая подсказка в Telegram (answerCallbackQuery). */
export async function handleReminderCallback(env: Bindings, query: CallbackQuery) {
  const userId = query.from?.id;
  if (typeof query.id !== "string" || typeof userId !== "number") return null;
  const answer = (text: string) => ({ method: "answerCallbackQuery" as const, callback_query_id: query.id!, text });
  const now = nowSeconds();
  const row = await loadReminderRow(env.DB, userId);
  const stats = await env.DB.prepare("SELECT tz FROM user_stats WHERE user_id = ?").bind(userId).first<{ tz: string }>();
  const tz = stats?.tz ?? DEFAULT_TZ;
  const texts = await loadBotTexts(env.DB);

  if (query.data === "rem:off") {
    if (row?.enabled) await disableReminders(env.DB, userId, now, "chat");
    return answer(botText(texts, "popup.off"));
  }
  if (query.data === "rem:skip") {
    if (!row?.enabled) return answer(botText(texts, "popup.alreadyOff"));
    const tomorrow = localEpochDay(tz, now * 1000) + 1;
    await env.DB.prepare("UPDATE reminders SET skip_day = ?, updated_at = ? WHERE user_id = ?").bind(tomorrow, now, userId).run();
    logEvent("reminder_skip", { uid: userId });
    return answer(botText(texts, "popup.skip"));
  }
  if (query.data === "rem:on") {
    if (!(await remindersOn(env, userId))) return answer(botText(texts, "popup.unavailable"));
    if (row?.enabled) return answer(botText(texts, "popup.alreadyOn", { время: minuteText(row.minute) }));
    const settings = reminderSettings(await loadConfig(env));
    const minute = row?.minute ?? settings.defaultMinute;
    // Человек нажал кнопку в чате с ботом, значит бот ему писать может. Подтверждение не шлём: ответим подсказкой.
    await enableFromChat(env.DB, userId, tz, minute, now, settings, "chat");
    return answer(botText(texts, "popup.on", { время: minuteText(minute) }));
  }
  return answer("");
}

/**
 * Включает напоминания (или меняет время) по нажатию в чате с ботом: кнопка под /reminders или карточка «Напоминания».
 * Подтверждение не шлём: человек пишет боту, значит бот ему писать может (blocked сбрасывается).
 */
export async function enableFromChat(
  db: D1Database,
  userId: number,
  tz: string,
  minute: number,
  now: number,
  settings: ReminderSettings,
  where: string,
): Promise<void> {
  const nextAt = Math.floor(nextReminderAt(tz, minute, now * 1000, settings.shabbatFrom) / 1000);
  await upsert(db, userId, { enabled: 1, blocked: 0, minute, next_at: nextAt }, now).run();
  logEvent("reminder_on", { uid: userId, minute, where });
}

/** Команда /reminders: что сейчас включено и кнопка «включить» или «отключить». Тексты из «Сообщений бота». */
export async function reminderCommandReply(env: Bindings, chatId: number, userId: number, firstName?: string) {
  const row = await loadReminderRow(env.DB, userId);
  const allowed = await remindersOn(env, userId);
  const texts = await loadBotTexts(env.DB);
  const имя = nameVarOf(firstName);
  if (!allowed) return { method: "sendMessage" as const, chat_id: chatId, text: botText(texts, "remcmd.unavailable", { имя }) };
  if (row?.enabled) {
    const vars = { имя, время: minuteText(row.minute) };
    return { method: "sendMessage" as const, chat_id: chatId, text: botText(texts, "remcmd.on", vars), reply_markup: disableKeyboard(texts) };
  }
  const minute = row?.minute ?? reminderSettings(await loadConfig(env)).defaultMinute;
  const vars = { имя, время: minuteText(minute) };
  return { method: "sendMessage" as const, chat_id: chatId, text: botText(texts, "remcmd.off", vars), reply_markup: enableKeyboard(texts, vars) };
}

/** Подстановка {имя} в ответах бота: имя из Telegram или «друг». */
function nameVarOf(firstName: string | undefined): string {
  return firstName?.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 32) || "друг";
}

// ---- Маршруты ученика ----

async function readJson<T>(request: Request, max = 16 * 1024): Promise<T | null> {
  const bytes = await readBodyLimited(request, max);
  return bytes ? parseJson<T>(bytes) : null;
}

export const reminderRoutes = new Hono<AppEnv>();

const SETTING_KEYS = new Set(["enabled", "minute", "dismissOffer"]);

// Настройки напоминаний: включить (с подтверждением в чате), выключить, время, «Не сейчас» на предложении.
reminderRoutes.put("/api/reminders", requireUser, rateLimit("settings"), async (c) => {
  const user = c.get("user");
  if (!(await remindersOn(c.env, user.id))) return c.json({ error: "feature_disabled" }, 403);
  const body = await readJson<Record<string, unknown>>(c.req.raw);
  if (typeof body !== "object" || body === null || Array.isArray(body) || Object.keys(body).some((k) => !SETTING_KEYS.has(k))) {
    return c.json({ error: "bad_request" }, 400);
  }
  const req = body as ReminderSettingsRequest;
  if (req.enabled !== undefined && typeof req.enabled !== "boolean") return c.json({ error: "bad_request" }, 400);
  if (req.dismissOffer !== undefined && req.dismissOffer !== true) return c.json({ error: "bad_request" }, 400);
  if (req.minute !== undefined && !isValidReminderMinute(req.minute)) return c.json({ error: "bad_minute" }, 400);

  const now = nowSeconds();
  const stats = await statsFor(c.env, user, now);
  const settings = reminderSettings(await loadConfig(c.env));
  let row = await loadReminderRow(c.env.DB, user.id);
  const minute = req.minute ?? row?.minute ?? settings.defaultMinute;
  const origin = appOrigin(c.env, c.req.url);

  if (req.dismissOffer) {
    await upsert(c.env.DB, user.id, { asked_count: (row?.asked_count ?? 0) + 1, asked_at: now }, now).run();
    logEvent("reminder_offer_dismissed", { uid: user.id, times: (row?.asked_count ?? 0) + 1 });
  } else if (req.enabled === true && !row?.enabled) {
    const result = await enableReminders(c.env, user, stats, minute, `${origin}/`, now, settings);
    if (!result.ok) {
      return c.json({ error: "bot_blocked", reminders: reminderInfo(await loadReminderRow(c.env.DB, user.id), now, settings) }, 409);
    }
    await ensureScheduler(c.env, origin);
  } else if (req.enabled === false) {
    if (row?.enabled) await disableReminders(c.env.DB, user.id, now, "app");
  } else if (req.minute !== undefined) {
    const nextAt = row?.enabled ? Math.floor(nextReminderAt(stats.tz, minute, now * 1000, settings.shabbatFrom) / 1000) : null;
    await upsert(c.env.DB, user.id, row?.enabled ? { minute, next_at: nextAt } : { minute }, now).run();
  }
  row = await loadReminderRow(c.env.DB, user.id);
  return c.json({ reminders: reminderInfo(row, now, settings) });
});

// ---- Раздел панели «Напоминания» (только администраторы: проверка роли в adminRoutes) ----

function toItem(r: TextRow): ReminderTextItem {
  return { id: r.id, kind: r.kind, text: r.text, enabled: !!r.enabled, sent: r.sent, opened: r.opened, updatedAt: r.updated_at, updatedBy: r.updated_by };
}

async function textById(db: D1Database, id: number): Promise<TextRow | null> {
  return db.prepare("SELECT id, kind, text, enabled, sent, opened, updated_by, updated_at FROM reminder_texts WHERE id = ?").bind(id).first<TextRow>();
}

const logStatement = (db: D1Database, actor: number, action: string, target: string, oldValue: unknown, newValue: unknown, at: number) =>
  db
    .prepare("INSERT INTO admin_log (at, actor, action, target, old_value, new_value) VALUES (?, ?, ?, ?, ?, ?)")
    .bind(at, actor, action, target, oldValue === undefined ? null : JSON.stringify(oldValue), newValue === undefined ? null : JSON.stringify(newValue));

const textError = (check: { error: string; name?: string }) => ({ error: `text_${check.error}`, ...(check.name !== undefined ? { name: check.name } : {}) });

const parseId = (value: string | undefined) => (value && /^\d{1,9}$/.test(value) ? Number(value) : null);

adminRoutes.get("/api/admin/reminders", async (c) => {
  const [texts, counts] = await c.env.DB.batch([
    c.env.DB.prepare("SELECT id, kind, text, enabled, sent, opened, updated_by, updated_at FROM reminder_texts ORDER BY kind, id"),
    c.env.DB.prepare("SELECT COALESCE(SUM(enabled), 0) AS subscribers, COALESCE(SUM(blocked), 0) AS blocked FROM reminders"),
  ]);
  const count = (counts?.results?.[0] ?? {}) as { subscribers?: number; blocked?: number };
  const body: AdminRemindersResponse = {
    texts: ((texts?.results ?? []) as TextRow[]).map(toItem),
    subscribers: Number(count.subscribers ?? 0),
    blocked: Number(count.blocked ?? 0),
  };
  return c.json(body);
});

// Учёт рассылок: отчёт за 7, 30 или 90 дней (?days=), по умолчанию 30 (reminderSends.ts).
adminRoutes.get("/api/admin/reminders/report", async (c) => {
  const days = Number(c.req.query("days") ?? 30);
  if (!(REPORT_DAYS as readonly number[]).includes(days)) return c.json({ error: "bad_days" }, 400);
  return c.json(await reminderReport(c.env.DB, nowSeconds(), days));
});

// Новый текст: { kind, text }.
adminRoutes.post("/api/admin/reminders", async (c) => {
  const body = await readJson<{ kind?: unknown; text?: unknown }>(c.req.raw, 8 * 1024);
  if (!REMINDER_KINDS.includes(body?.kind as ReminderKind)) return c.json({ error: "bad_kind" }, 400);
  const kind = body!.kind as ReminderKind;
  const check = checkReminderText(kind, body!.text);
  if (!check.ok) return c.json(textError(check), 400);
  const total = await c.env.DB.prepare("SELECT COUNT(*) AS n FROM reminder_texts").first<{ n: number }>();
  if ((total?.n ?? 0) >= MAX_REMINDER_TEXTS) return c.json({ error: "too_many" }, 409);
  const actor = c.get("user").id;
  const now = nowSeconds();
  const row = await c.env.DB
    .prepare("INSERT INTO reminder_texts (kind, text, updated_by, updated_at) VALUES (?, ?, ?, ?) RETURNING id, kind, text, enabled, sent, opened, updated_by, updated_at")
    .bind(kind, check.text, actor, now)
    .first<TextRow>();
  await logStatement(c.env.DB, actor, "reminder.add", String(row!.id), undefined, check.text, now).run();
  return c.json({ item: toItem(row!) });
});

// Изменить текст или выключить его: { text?, enabled? }.
adminRoutes.put("/api/admin/reminders/:id", async (c) => {
  const id = parseId(c.req.param("id"));
  const old = id === null ? null : await textById(c.env.DB, id);
  if (!old) return c.json({ error: "not_found" }, 404);
  const body = await readJson<{ text?: unknown; enabled?: unknown }>(c.req.raw, 8 * 1024);
  if (typeof body !== "object" || body === null || (body.text === undefined && body.enabled === undefined)) return c.json({ error: "bad_request" }, 400);
  if (body.enabled !== undefined && typeof body.enabled !== "boolean") return c.json({ error: "bad_request" }, 400);
  let text = old.text;
  if (body.text !== undefined) {
    const check = checkReminderText(old.kind, body.text);
    if (!check.ok) return c.json(textError(check), 400);
    text = check.text;
  }
  const enabled = body.enabled === undefined ? !!old.enabled : body.enabled;
  if (text === old.text && enabled === !!old.enabled) return c.json({ item: toItem(old), changed: false });

  const actor = c.get("user").id;
  const now = nowSeconds();
  const statements = [
    c.env.DB.prepare("UPDATE reminder_texts SET text = ?, enabled = ?, updated_by = ?, updated_at = ? WHERE id = ?").bind(text, enabled ? 1 : 0, actor, now, id),
  ];
  if (text !== old.text) statements.push(logStatement(c.env.DB, actor, "reminder.edit", String(id), old.text, text, now));
  if (enabled !== !!old.enabled) statements.push(logStatement(c.env.DB, actor, "reminder.toggle", String(id), !!old.enabled, enabled, now));
  await c.env.DB.batch(statements);
  return c.json({ item: toItem((await textById(c.env.DB, id!))!), changed: true });
});

// Удалить текст. Статистика по нему пропадает, поэтому в панели удаление спрашивает подтверждение.
adminRoutes.delete("/api/admin/reminders/:id", async (c) => {
  const id = parseId(c.req.param("id"));
  const old = id === null ? null : await textById(c.env.DB, id);
  if (!old) return c.json({ error: "not_found" }, 404);
  const now = nowSeconds();
  await c.env.DB.batch([
    c.env.DB.prepare("DELETE FROM reminder_texts WHERE id = ?").bind(id),
    logStatement(c.env.DB, c.get("user").id, "reminder.remove", String(id), old.text, undefined, now),
  ]);
  return c.json({ ok: true });
});

/** Примеры для подстановок, которых у администратора сейчас нет (чтобы «Прислать мне» работало всегда). */
const SAMPLE_VARS: ReminderVars = { имя: "Друг", время: "20:00", осталось_слов: "3", дней_на_неделе: "2", слов_за_неделю: "12", статус: "Конь", до_статуса: "4", к_повторению: "7 слов" };

// «Прислать мне»: текст приходит администратору в чат с ботом, подстановки из его данных (или примеры).
adminRoutes.post("/api/admin/reminders/:id/send", async (c) => {
  const id = parseId(c.req.param("id"));
  const row = id === null ? null : await textById(c.env.DB, id);
  if (!row) return c.json({ error: "not_found" }, 404);
  const user = c.get("user");
  const now = nowSeconds();
  const stats = await statsFor(c.env, user, now);
  const reminder = await loadReminderRow(c.env.DB, user.id);
  const today = localEpochDay(stats.tz, now * 1000);
  const own = varsFor(user.firstName, reminder?.minute ?? reminderSettings(await loadConfig(c.env)).defaultMinute, statsColumns(stats), today);
  const allowed = KIND_PLACEHOLDERS[row.kind] as readonly string[];
  const vars: ReminderVars = {};
  for (const name of allowed) (vars as Record<string, string | undefined>)[name] = (own as Record<string, string | undefined>)[name] ?? (SAMPLE_VARS as Record<string, string | undefined>)[name];
  const text = renderReminder(row.text, vars) ?? row.text;
  const origin = appOrigin(c.env, c.req.url);
  const sent = await sendToUser(c.env, user.id, text, reminderKeyboard(await loadBotTexts(c.env.DB), `${origin}/`, row.kind === "daily"));
  if (sent === "blocked") return c.json({ error: "bot_blocked", text }, 409);
  if (sent === "retry") return c.json({ error: "telegram_error", text }, 502);
  return c.json({ ok: true, text, sent: sent === "sent" });
});

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
  DEFAULT_REMINDER_MINUTE,
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
  pickReminder,
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
  type ReminderVars,
} from "@milav/shared";
import { adminRoutes, loadConfig, staffOf } from "./admin";
import { requireUser } from "./auth";
import { parseJson, readBodyLimited } from "./body";
import type { AppEnv, Bindings } from "./env";
import { statsFor } from "./play";
import { rateLimit } from "./rateLimit";
import type { Stats } from "./stats";
import { describeError, logError, logEvent, logWarn } from "./telemetry";

/** Сколько напоминаний отправлять за один запуск таймера (запас под обращения к D1 в лимите 50 запросов). */
export const SEND_BATCH = 40;
/** Напоминание опоздало больше чем на столько (таймер не работал): не шлём, переносим на следующий день. */
export const STALE_SECONDS = 3 * 60 * 60;
/** «Не сейчас» спрашивает снова не раньше чем через неделю и не больше двух раз. */
export const OFFER_AGAIN_SECONDS = 7 * 86_400;
export const OFFER_MAX_DISMISSALS = 2;
/** Приложение открыли в течение суток после напоминания: засчитывается тексту как «открыли». */
export const OPEN_WINDOW_SECONDS = 86_400;

/** Запасной текст подтверждения, если в базе все такие тексты выключены. */
const FALLBACK_ENABLED_TEXT = "Готово! Буду напоминать в {время}, если в этот день вы ещё не занимались. В шаббат не пишу.";

const nowSeconds = () => Math.floor(Date.now() / 1000);

// ---- Telegram ----

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;
let telegramFetch: FetchLike = (input, init) => fetch(input, init);

/** Для тестов: подменить обращения к Telegram. */
export function setTelegramFetchForTests(fn: FetchLike | null): void {
  telegramFetch = fn ?? ((input, init) => fetch(input, init));
}

export type SendResult = "sent" | "blocked" | "retry" | "no-token";

/** Кнопки под напоминанием: открыть приложение, «завтра не напоминать», «отключить». */
export function reminderKeyboard(appUrl: string, withControls: boolean) {
  const rows: object[][] = [[{ text: "📚 Продолжить", web_app: { url: `${appUrl}?from=reminder` } }]];
  if (withControls) {
    rows.push([
      { text: "Завтра не напоминать", callback_data: "rem:skip" },
      { text: "Отключить", callback_data: "rem:off" },
    ]);
  }
  return { inline_keyboard: rows };
}

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
}

export async function loadReminderRow(db: D1Database, userId: number): Promise<ReminderRow | null> {
  return db
    .prepare(
      `SELECT user_id, enabled, minute, next_at, skip_day, last_sent_at, last_text_id, opened_counted, blocked, asked_count, asked_at
       FROM reminders WHERE user_id = ?`,
    )
    .bind(userId)
    .first<ReminderRow>();
}

/** Напоминания для профиля: включены ли, время, можно ли предложить. */
export function reminderInfo(row: ReminderRow | null, now: number): ReminderInfo {
  const enabled = !!row?.enabled;
  const blocked = !!row?.blocked;
  const asked = row?.asked_count ?? 0;
  const offer = !enabled && !blocked && asked < OFFER_MAX_DISMISSALS && (asked === 0 || now - (row?.asked_at ?? 0) >= OFFER_AGAIN_SECONDS);
  return { enabled, minute: row?.minute ?? DEFAULT_REMINDER_MINUTE, offer, blocked };
}

/** Включены ли напоминания для этого человека (настройка из панели и его роль). */
export async function remindersOn(env: Bindings, userId: number): Promise<boolean> {
  const { reminders } = await loadConfig(env);
  if (reminders !== "team") return reminders === "all";
  return featureOn(reminders, await staffOf(env, userId));
}

/**
 * Человек открыл приложение. Если это в течение суток после напоминания, засчитываем тексту «открыли» (один раз).
 * Вызывается из /api/me; строку уже прочитали.
 */
export async function noteAppOpen(db: D1Database, row: ReminderRow | null, now: number): Promise<void> {
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
): Promise<EnableResult> {
  const today = localEpochDay(stats.tz, now * 1000);
  const vars = varsFor(user.firstName, minute, statsColumns(stats), today);
  const texts = await enabledTexts(env.DB, "enabled");
  const chosen = pickReminder(texts, vars, null, Math.random());
  const text = chosen?.text ?? renderReminder(FALLBACK_ENABLED_TEXT, vars)!;
  const sent = await sendToUser(env, user.id, text, reminderKeyboard(appUrl, false));
  if (sent === "blocked") {
    await upsert(env.DB, user.id, { enabled: 0, blocked: 1, next_at: null, minute }, now).run();
    logEvent("reminder_blocked", { uid: user.id, where: "enable" });
    return { ok: false, error: "bot_blocked" };
  }
  const nextAt = Math.floor(nextReminderAt(stats.tz, minute, now * 1000) / 1000);
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
}

/**
 * Отправляет напоминания тем, кому пора. Вызывает таймер раз в 10 минут. `appUrl` это адрес приложения для кнопки.
 * `random` выбирает текст (в тестах задаётся).
 */
export async function runDueReminders(env: Bindings, nowMs: number, appUrl: string, random: () => number = Math.random): Promise<RunSummary> {
  const now = Math.floor(nowMs / 1000);
  const summary: RunSummary = { due: 0, sent: 0, skipped: 0, blocked: 0, retry: 0 };
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

  const { reminders: mode } = await loadConfig(env);
  const texts = await enabledTexts(env.DB, "daily");
  const updates: D1PreparedStatement[] = [];
  let stop = false;

  for (const row of due) {
    const tz = row.tz ?? DEFAULT_TZ;
    const next = Math.floor(nextReminderAt(tz, row.minute, nowMs + 60_000) / 1000);
    const reschedule = () => updates.push(env.DB.prepare("UPDATE reminders SET next_at = ? WHERE user_id = ?").bind(next, row.user_id));
    if (stop) break; // Telegram просит подождать: остальных возьмёт следующий запуск (next_at у них не тронут)

    const local = localDayMinute(tz, nowMs);
    const featureAllowed = mode === "all" || (mode === "team" && !!(await staffOf(env, row.user_id)));
    const reason = !featureAllowed
      ? "feature_off"
      : now - row.next_at > STALE_SECONDS
        ? "stale"
        : isShabbat(local.day, local.minute)
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
    const chosen = pickReminder(texts, vars, row.last_text_id, random());
    if (!chosen) {
      // Все тексты выключены или ни один не заполняется: молчим, это видно в журнале.
      logWarn("reminder_no_text", { uid: row.user_id });
      summary.skipped++;
      reschedule();
      continue;
    }

    const result = await sendToUser(env, row.user_id, chosen.text, reminderKeyboard(appUrl, true));
    if (result === "sent") {
      summary.sent++;
      updates.push(
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

  if (query.data === "rem:off") {
    if (row?.enabled) await disableReminders(env.DB, userId, now, "chat");
    return answer("Напоминания отключены. Включить снова: /reminders или «Настройки» в приложении.");
  }
  if (query.data === "rem:skip") {
    if (!row?.enabled) return answer("Напоминания и так выключены.");
    const tomorrow = localEpochDay(tz, now * 1000) + 1;
    await env.DB.prepare("UPDATE reminders SET skip_day = ?, updated_at = ? WHERE user_id = ?").bind(tomorrow, now, userId).run();
    logEvent("reminder_skip", { uid: userId });
    return answer("Хорошо, завтра не напомню. Послезавтра снова буду рядом 🙂");
  }
  if (query.data === "rem:on") {
    if (!(await remindersOn(env, userId))) return answer("Напоминания пока недоступны.");
    if (row?.enabled) return answer(`Напоминания уже включены: каждый день в ${minuteText(row.minute)}.`);
    const minute = row?.minute ?? DEFAULT_REMINDER_MINUTE;
    // Человек нажал кнопку в чате с ботом, значит бот ему писать может. Подтверждение не шлём: ответим подсказкой.
    const nextAt = Math.floor(nextReminderAt(tz, minute, now * 1000) / 1000);
    await upsert(env.DB, userId, { enabled: 1, blocked: 0, minute, next_at: nextAt }, now).run();
    logEvent("reminder_on", { uid: userId, minute, where: "chat" });
    return answer(`Готово! Напомню в ${minuteText(minute)}, если в этот день вы ещё не занимались. В шаббат не пишу.`);
  }
  return answer("");
}

/** Команда /reminders: что сейчас включено и кнопка «включить» или «отключить». */
export async function reminderCommandReply(env: Bindings, chatId: number, userId: number) {
  const row = await loadReminderRow(env.DB, userId);
  const allowed = await remindersOn(env, userId);
  if (!allowed) return { method: "sendMessage" as const, chat_id: chatId, text: "Напоминания пока недоступны. Скоро включим!" };
  if (row?.enabled) {
    return {
      method: "sendMessage" as const,
      chat_id: chatId,
      text: `Напоминания включены: каждый день в ${minuteText(row.minute)} (по времени вашего телефона), если в этот день вы ещё не занимались. В шаббат не пишу. Время меняется в приложении: «Настройки» → «Напоминания».`,
      reply_markup: { inline_keyboard: [[{ text: "Отключить", callback_data: "rem:off" }]] },
    };
  }
  const minute = row?.minute ?? DEFAULT_REMINDER_MINUTE;
  return {
    method: "sendMessage" as const,
    chat_id: chatId,
    text: `Напоминания выключены. Включить? Буду писать в ${minuteText(minute)}, только если в этот день вы ещё не занимались, и не в шаббат.`,
    reply_markup: { inline_keyboard: [[{ text: `Включить в ${minuteText(minute)}`, callback_data: "rem:on" }]] },
  };
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
  let row = await loadReminderRow(c.env.DB, user.id);
  const minute = req.minute ?? row?.minute ?? DEFAULT_REMINDER_MINUTE;
  const origin = new URL(c.req.url).origin;

  if (req.dismissOffer) {
    await upsert(c.env.DB, user.id, { asked_count: (row?.asked_count ?? 0) + 1, asked_at: now }, now).run();
    logEvent("reminder_offer_dismissed", { uid: user.id, times: (row?.asked_count ?? 0) + 1 });
  } else if (req.enabled === true && !row?.enabled) {
    const result = await enableReminders(c.env, user, stats, minute, `${origin}/`, now);
    if (!result.ok) {
      return c.json({ error: "bot_blocked", reminders: reminderInfo(await loadReminderRow(c.env.DB, user.id), now) }, 409);
    }
    await ensureScheduler(c.env, origin);
  } else if (req.enabled === false) {
    if (row?.enabled) await disableReminders(c.env.DB, user.id, now, "app");
  } else if (req.minute !== undefined) {
    const nextAt = row?.enabled ? Math.floor(nextReminderAt(stats.tz, minute, now * 1000) / 1000) : null;
    await upsert(c.env.DB, user.id, row?.enabled ? { minute, next_at: nextAt } : { minute }, now).run();
  }
  row = await loadReminderRow(c.env.DB, user.id);
  return c.json({ reminders: reminderInfo(row, now) });
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
const SAMPLE_VARS: ReminderVars = { имя: "Друг", время: "20:00", осталось_слов: "3", дней_на_неделе: "2", слов_за_неделю: "12", статус: "Конь", до_статуса: "4" };

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
  const own = varsFor(user.firstName, reminder?.minute ?? DEFAULT_REMINDER_MINUTE, statsColumns(stats), today);
  const allowed = KIND_PLACEHOLDERS[row.kind] as readonly string[];
  const vars: ReminderVars = {};
  for (const name of allowed) (vars as Record<string, string | undefined>)[name] = (own as Record<string, string | undefined>)[name] ?? (SAMPLE_VARS as Record<string, string | undefined>)[name];
  const text = renderReminder(row.text, vars) ?? row.text;
  const origin = new URL(c.req.url).origin;
  const sent = await sendToUser(c.env, user.id, text, reminderKeyboard(`${origin}/`, row.kind === "daily"));
  if (sent === "blocked") return c.json({ error: "bot_blocked", text }, 409);
  if (sent === "retry") return c.json({ error: "telegram_error", text }, 502);
  return c.json({ ok: true, text, sent: sent === "sent" });
});

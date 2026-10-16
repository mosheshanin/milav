// Бот @milavbotbot: ответы на сообщения через вебхук и самонастройка вебхука (задача 3).
//
// Как устроено:
// - Telegram присылает обновления на POST /api/bot/webhook. Подлинность проверяется заголовком
//   X-Telegram-Bot-Api-Secret-Token: это секрет, выведенный из BOT_TOKEN (отдельный секрет заводить не нужно).
// - Ответ отправляется прямо в ответе на вебхук (`{ method: "sendMessage", ... }`): без исходящего запроса к Telegram
//   и без записи в D1.
// - Вебхук регистрирует сам Worker (ensureBotSetup): в фоне, когда приложение открывает владелец (Telegram id из
//   ADMIN_IDS или TEMPLATE_RECORDER_IDS), не чаще раза на экземпляр Worker. Расписание (cron) не используем: на бесплатном тарифе их
//   5 на весь аккаунт Cloudflare, а там есть и другие проекты.
// - Чужой вебхук (на другой адрес) не перезаписывается: это мог бы быть другой сервер владельца. В журнале будет
//   запись `bot_webhook_foreign`, и тогда вебхук надо снять вручную (docs/DEPLOY.md, «Бот»).

import { logError, logEvent, logWarn } from "./telemetry";

/** Путь вебхука (под /api/*, поэтому запрос доходит до Worker, а не до статики). */
export const BOT_WEBHOOK_PATH = "/api/bot/webhook";

/**
 * Какие обновления получает бот: сообщения и нажатия кнопок под напоминаниями (callback_query). Для платежей Stars
 * позже добавятся pre_checkout_query (и successful_payment в message). Самонастройка перерегистрирует вебхук сама.
 */
export const BOT_ALLOWED_UPDATES = ["message", "callback_query"] as const;

/** Самое большое обновление, которое принимаем (обычное сообщение занимает 1–2 КБ). */
export const BOT_MAX_UPDATE_BYTES = 64 * 1024;

/** Команды в меню «/» бота. */
export const BOT_COMMANDS = [
  { command: "start", description: "Открыть приложение" },
  { command: "help", description: "Как заниматься" },
  { command: "reminders", description: "Напоминания: включить или отключить" },
] as const;

/** Описание в пустом чате («Что умеет этот бот?») и короткое описание в профиле. Ставятся, только если пусты. */
export const BOT_DESCRIPTION =
  "Milav — иврит для русскоязычных. Слова с озвучкой, произношение, письмо от руки и викторины. Нажмите «Старт», чтобы начать.";
export const BOT_SHORT_DESCRIPTION = "Иврит для русскоязычных: слова, произношение, письмо и викторины.";

const OPEN_BUTTON = "📚 Открыть Milav";

const encoder = new TextEncoder();

async function hmacHex(key: string, data: string): Promise<string> {
  const cryptoKey = await crypto.subtle.importKey("raw", encoder.encode(key), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
  ]);
  const sig = await crypto.subtle.sign("HMAC", cryptoKey, encoder.encode(data));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Секрет вебхука (64 hex-символа, Telegram разрешает A-Z a-z 0-9 _ -). Меняется вместе с токеном бота. */
export function webhookSecret(botToken: string): Promise<string> {
  return hmacHex(botToken, "milav:bot-webhook-secret");
}

/**
 * Адрес вебхука. Метка `v` (не секрет, отдельный отпечаток токена) меняет адрес при смене токена: так самонастройка
 * замечает, что вебхук надо перерегистрировать с новым секретом (сам секрет getWebhookInfo не показывает).
 */
export async function webhookUrl(origin: string, botToken: string): Promise<string> {
  const mark = (await hmacHex(botToken, "milav:bot-webhook-version")).slice(0, 8);
  return `${origin}${BOT_WEBHOOK_PATH}?v=${mark}`;
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Пришёл ли запрос от Telegram: заголовок с секретом совпадает с ожидаемым. */
export async function isTelegramWebhook(header: string | undefined, botToken: string | undefined): Promise<boolean> {
  if (!header || !botToken) return false;
  return timingSafeEqual(header, await webhookSecret(botToken));
}

// ---- Ответы на сообщения ----

/** Минимум полей обновления Telegram, которые нужны боту. */
export interface TelegramUpdate {
  update_id?: number;
  message?: {
    text?: string;
    chat?: { id?: number; type?: string };
    from?: { id?: number; is_bot?: boolean; first_name?: string };
  };
  /** Нажатие кнопки под сообщением бота (напоминания: «Завтра не напоминать», «Отключить»). */
  callback_query?: { id?: string; data?: string; from?: { id?: number; first_name?: string } };
}

/** Ответ в теле вебхука: Telegram выполнит этот метод сам. */
export interface BotReply {
  method: "sendMessage";
  chat_id: number;
  text: string;
  reply_markup: { inline_keyboard: { text: string; web_app: { url: string } }[][] };
}

/** Команда из текста: «/start», «/start payload», «/Start@milavbotbot» → "start". Не команда → null. */
export function commandOf(text: string | undefined): string | null {
  const match = /^\/([a-zA-Z0-9_]{1,32})(?:@\w+)?(?:\s|$)/.exec(text?.trim() ?? "");
  return match ? match[1]!.toLowerCase() : null;
}

/** Имя для приветствия: из Telegram, без управляющих символов, не длиннее 32 знаков. */
function greetingName(name: string | undefined): string {
  const clean = (name ?? "").replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 32);
  return clean ? `, ${clean}` : "";
}

export function startText(firstName?: string): string {
  return [
    `Шалом${greetingName(firstName)}! 👋`,
    "",
    "Milav — иврит для русскоязычных. В каждом уроке 10 слов: слушаете, произносите, пишете от руки и печатаете, а потом сдаёте викторину.",
    "",
    "Начните с алфавита: первые уроки в каждой теме бесплатные. Нажмите кнопку ниже 👇",
  ].join("\n");
}

export const HELP_TEXT = [
  "Как заниматься в Milav:",
  "",
  "1. Откройте приложение кнопкой ниже или кнопкой меню слева от поля ввода.",
  "2. Выберите урок. Каждое слово проходит 4 этапа: «Слушай», «Говори», «Пиши», «Печатай».",
  "3. Когда все слова пройдены, откроется викторина. Сдали — урок засчитан, растёт статус.",
  "",
  "Для этапа «Говори» нужен микрофон: приложение попросит доступ.",
  "Цель дня, тема оформления и другие настройки — в приложении, шестерёнка вверху главной.",
  "Напоминания заниматься: команда /reminders.",
].join("\n");

export const FALLBACK_TEXT = "Я пока не отвечаю на сообщения, все занятия в приложении. Нажмите кнопку ниже 👇";

/**
 * Что ответить на обновление. null: не отвечаем (не личный чат, сообщение от бота, не сообщение вовсе).
 * Кнопка Mini App в сообщении работает только в личном чате, поэтому в группах бот молчит.
 */
export function replyTo(update: TelegramUpdate, appUrl: string): BotReply | null {
  const message = update.message;
  const chatId = message?.chat?.id;
  if (!message || typeof chatId !== "number" || message.chat?.type !== "private" || message.from?.is_bot) return null;
  const command = commandOf(message.text);
  const text = command === "start" ? startText(message.from?.first_name) : command === "help" ? HELP_TEXT : FALLBACK_TEXT;
  return {
    method: "sendMessage",
    chat_id: chatId,
    text,
    reply_markup: { inline_keyboard: [[{ text: OPEN_BUTTON, web_app: { url: appUrl } }]] },
  };
}

// ---- Самонастройка вебхука ----

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

interface TelegramResult<T> {
  ok: boolean;
  result?: T;
  description?: string;
}

async function callTelegram<T>(fetchFn: FetchLike, token: string, method: string, body: unknown = {}): Promise<T> {
  const res = await fetchFn(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => null)) as TelegramResult<T> | null;
  // В тексте ошибки токена нет: Telegram его не повторяет, а адрес запроса мы не печатаем.
  if (!data?.ok) throw new Error(`Telegram ${method}: ${data?.description ?? `HTTP ${res.status}`}`);
  return data.result as T;
}

export type BotSetupResult = "ok" | "set" | "foreign" | "no-token" | "error";

/**
 * Проверяет вебхук и при необходимости регистрирует его, ставит команды и описание (если описание пусто).
 * Вызывается в фоне; ошибки только пишутся в журнал. Чужой вебхук не трогает.
 */
export async function ensureBotSetup(
  env: { BOT_TOKEN?: string },
  origin: string,
  fetchFn: FetchLike = fetch,
): Promise<BotSetupResult> {
  const token = env.BOT_TOKEN;
  if (!token) return "no-token";
  try {
    const url = await webhookUrl(origin, token);
    const info = await callTelegram<{ url?: string; allowed_updates?: string[]; last_error_message?: string }>(
      fetchFn,
      token,
      "getWebhookInfo",
    );
    const current = info.url ?? "";
    const allowed = [...(info.allowed_updates ?? ["message"])].sort().join(",");
    const wanted = [...BOT_ALLOWED_UPDATES].sort().join(",");
    if (current === url && allowed === wanted) {
      if (info.last_error_message) logWarn("bot_webhook_error", { error: info.last_error_message.slice(0, 200) });
      return "ok";
    }
    if (current && !current.startsWith(`${origin}${BOT_WEBHOOK_PATH}`)) {
      // Адрес вебхука это хост и путь, секрета в нём нет; печатаем только хост.
      logWarn("bot_webhook_foreign", { host: hostOf(current) });
      return "foreign";
    }
    await callTelegram(fetchFn, token, "setWebhook", {
      url,
      secret_token: await webhookSecret(token),
      allowed_updates: BOT_ALLOWED_UPDATES,
      max_connections: 20,
    });
    await callTelegram(fetchFn, token, "setMyCommands", { commands: BOT_COMMANDS });
    const description = await callTelegram<{ description?: string }>(fetchFn, token, "getMyDescription");
    if (!description.description) await callTelegram(fetchFn, token, "setMyDescription", { description: BOT_DESCRIPTION });
    const short = await callTelegram<{ short_description?: string }>(fetchFn, token, "getMyShortDescription");
    if (!short.short_description) {
      await callTelegram(fetchFn, token, "setMyShortDescription", { short_description: BOT_SHORT_DESCRIPTION });
    }
    logEvent("bot_webhook_set", { previous: current ? "own" : "none" });
    return "set";
  } catch (err) {
    logError("bot_setup_error", { message: err instanceof Error ? err.message.slice(0, 200) : String(err).slice(0, 200) });
    return "error";
  }
}

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return "invalid";
  }
}

/** Самонастройка запускается не чаще раза на экземпляр Worker (экземпляры живут минуты или часы). */
let setupStarted = false;

/** Запускает самонастройку, если ещё не запускали в этом экземпляре. Возвращает промис или null. */
export function ensureBotSetupOnce(
  env: { BOT_TOKEN?: string },
  origin: string,
  fetchFn?: FetchLike,
): Promise<BotSetupResult> | null {
  if (setupStarted) return null;
  setupStarted = true;
  return ensureBotSetup(env, origin, fetchFn);
}

/** Для тестов: снова разрешить самонастройку. */
export function resetBotSetupForTests(): void {
  setupStarted = false;
}

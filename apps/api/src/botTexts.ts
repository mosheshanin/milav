// Тексты бота из базы (раздел панели «Сообщения бота», docs/ADMIN.md) и сборка сообщений с кнопками.
//
// Исходные тексты в коде (BOT_TEXTS в packages/shared/src/botTexts.ts), в таблице bot_texts только изменённые из панели.
// Тексты нужны на каждое сообщение боту, поэтому экземпляр Worker держит их в памяти до минуты (как настройки
// в admin.ts): чтение почти не тратит лимит D1, изменение из панели доходит до всех экземпляров не дольше чем за минуту.
import {
  checkBotText,
  defaultBotTexts,
  isBotTextKey,
  renderBotText,
  type BotTextKey,
  type BotTexts,
  type BotVars,
} from "@milav/shared";

export const BOT_TEXTS_CACHE_SECONDS = 60;

export interface BotTextRow {
  key: string;
  text: string;
  updated_by: number;
  updated_at: number;
}

const cache = new WeakMap<D1Database, { at: number; rows: Map<BotTextKey, BotTextRow> }>();

const nowSeconds = () => Math.floor(Date.now() / 1000);

/** Изменённые из панели тексты (строки базы). Испорченные и незнакомые ключи отбрасываются. */
export async function botTextRows(db: D1Database, now = nowSeconds()): Promise<Map<BotTextKey, BotTextRow>> {
  const hit = cache.get(db);
  if (hit && now - hit.at < BOT_TEXTS_CACHE_SECONDS) return hit.rows;
  const { results } = await db.prepare("SELECT key, text, updated_by, updated_at FROM bot_texts").all<BotTextRow>();
  const rows = new Map<BotTextKey, BotTextRow>();
  for (const row of results) {
    if (isBotTextKey(row.key) && checkBotText(row.key, row.text).ok) rows.set(row.key, row);
  }
  cache.set(db, { at: now, rows });
  return rows;
}

/** Сбрасывает кэш этого экземпляра после изменения из панели (и в тестах). */
export function dropBotTextsCache(db: D1Database): void {
  cache.delete(db);
}

/** Действующие тексты: изменённые из панели, остальные исходные. Если база недоступна, исходные (бот должен ответить). */
export async function loadBotTexts(db: D1Database): Promise<BotTexts> {
  const texts = defaultBotTexts();
  try {
    for (const [key, row] of await botTextRows(db)) texts[key] = row.text;
  } catch {
    // Например, исчерпан суточный лимит D1: отвечаем исходными текстами.
  }
  return texts;
}

/** Текст с подстановками. */
export function botText(texts: BotTexts, key: BotTextKey, vars: BotVars = {}): string {
  return renderBotText(texts[key], vars);
}

/** Имя для подстановки {имя}: из Telegram, без управляющих символов, не длиннее 32 знаков. */
export function cleanName(name: string | undefined): string {
  return (name ?? "").replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 32);
}

// ---- Кнопки ----

type InlineButton = { text: string; web_app: { url: string } } | { text: string; callback_data: string };
export interface InlineKeyboard {
  inline_keyboard: InlineButton[][];
}

/** Кнопка под ответами на /start, /help и другие сообщения: открывает приложение. */
export function openKeyboard(texts: BotTexts, appUrl: string): InlineKeyboard {
  return { inline_keyboard: [[{ text: botText(texts, "button.open"), web_app: { url: appUrl } }]] };
}

/** Кнопки под напоминанием: открыть приложение, «завтра не напоминать», «отключить». */
export function reminderKeyboard(texts: BotTexts, appUrl: string, withControls: boolean): InlineKeyboard {
  const rows: InlineButton[][] = [[{ text: botText(texts, "button.continue"), web_app: { url: `${appUrl}?from=reminder` } }]];
  if (withControls) {
    rows.push([
      { text: botText(texts, "button.skip"), callback_data: "rem:skip" },
      { text: botText(texts, "button.disable"), callback_data: "rem:off" },
    ]);
  }
  return { inline_keyboard: rows };
}

/** Кнопка «Отключить» под ответом «Напоминания включены» на /reminders. */
export function disableKeyboard(texts: BotTexts): InlineKeyboard {
  return { inline_keyboard: [[{ text: botText(texts, "button.disable"), callback_data: "rem:off" }]] };
}

/** Кнопка «Включить в …» под ответом «Напоминания выключены» на /reminders. */
export function enableKeyboard(texts: BotTexts, vars: BotVars): InlineKeyboard {
  return { inline_keyboard: [[{ text: botText(texts, "button.enable", vars), callback_data: "rem:on" }]] };
}

/**
 * Кнопки «Моего прогресса» (/progress): под текстовым вариантом «Обновить» и «Продолжить», под карточкой только
 * «Продолжить» (карточка обновляется сама).
 */
export function progressKeyboard(texts: BotTexts, appUrl: string, withRefresh: boolean): InlineKeyboard {
  const open: InlineButton = { text: botText(texts, "button.continue"), web_app: { url: appUrl } };
  return { inline_keyboard: withRefresh ? [[{ text: botText(texts, "button.refresh"), callback_data: "prog:upd" }, open]] : [[open]] };
}

/** Сообщение бота целиком, как его видит ученик: текст и кнопки. Для «Прислать мне» в панели. */
export function botMessage(texts: BotTexts, key: BotTextKey, vars: BotVars, appUrl: string): { text: string; reply_markup?: InlineKeyboard } | null {
  const text = botText(texts, key, vars);
  switch (key) {
    case "start":
    case "help":
    case "fallback":
      return { text, reply_markup: openKeyboard(texts, appUrl) };
    case "remcmd.on":
      return { text, reply_markup: disableKeyboard(texts) };
    case "remcmd.off":
      return { text, reply_markup: enableKeyboard(texts, vars) };
    case "remcmd.unavailable":
      return { text };
    case "confirm.fallback":
      return { text, reply_markup: reminderKeyboard(texts, appUrl, false) };
    case "progress.text":
      return { text, reply_markup: progressKeyboard(texts, appUrl, true) };
    default:
      return null;
  }
}

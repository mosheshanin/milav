// Пост в канал из панели (раздел «Пост в канал», docs/ADMIN.md): текст, картинка и кнопка-ссылка под постом.
// Публикует бот @milavbotbot, он должен быть администратором канала. Здесь общие для сервера и панели правила:
// простая разметка текста, пределы Telegram и проверка полей.
import { SHARE_URL } from "./gamification/constants";

/** Канал по умолчанию: новости Milav. */
export const CHANNEL_DEFAULT = "@milavnews";

/** Кнопка по умолчанию: ссылка открывает приложение сразу (главное мини-приложение бота). */
export const CHANNEL_BUTTON_DEFAULT = { text: "Открыть Milav", url: `${SHARE_URL}?startapp` } as const;

/** Пределы Telegram: текст сообщения 4096 знаков, подпись к картинке 1024, надпись на кнопке до 64 (наш предел). */
export const CHANNEL_TEXT_MAX = 4096;
export const CHANNEL_CAPTION_MAX = 1024;
export const CHANNEL_BUTTON_TEXT_MAX = 64;

/** Картинка: JPEG или PNG до 5 МБ (Telegram принимает фото до 10 МБ). */
export const CHANNEL_PHOTO_MAX_BYTES = 5 * 1024 * 1024;
export const CHANNEL_PHOTO_TYPES = ["image/jpeg", "image/png"] as const;

/** До 10 картинок (альбом Telegram: 2–10 фото), все вместе до 20 МБ: Worker держит запрос в памяти (128 МБ). */
export const CHANNEL_PHOTOS_MAX = 10;
export const CHANNEL_PHOTOS_TOTAL_MAX_BYTES = 20 * 1024 * 1024;

/**
 * Как пост уходит в Telegram:
 * - text: одно сообщение с текстом (до 4096) и кнопкой;
 * - photo: одна картинка с подписью (до 1024) и кнопкой;
 * - album: альбом из 2–10 картинок, текст подписью под альбомом (до 1024), без кнопки;
 * - album+text: альбом без подписи, следом сообщение с текстом (до 4096) и кнопкой. К альбому Telegram кнопку
 *   прикрепить не даёт (у sendMediaGroup нет reply_markup), поэтому кнопка уходит отдельным сообщением.
 */
export type PostLayout = "text" | "photo" | "album" | "album+text";

export function postLayout(photos: number, hasButton: boolean): PostLayout {
  if (photos === 0) return "text";
  if (photos === 1) return "photo";
  return hasButton ? "album+text" : "album";
}

/** Предел длины текста при таком виде поста. */
export function postTextMax(layout: PostLayout): number {
  return layout === "photo" || layout === "album" ? CHANNEL_CAPTION_MAX : CHANNEL_TEXT_MAX;
}

/** Кусок текста поста после разбора разметки. */
export interface PostSegment {
  text: string;
  bold?: boolean;
  italic?: boolean;
  href?: string;
}

// **жирный**, __курсив__, [текст](https://ссылка). Одиночные _ и * не трогаем: они бывают в именах (@y_o_g_g_y).
const MARKUP_RE = /\*\*([\s\S]+?)\*\*|__([\s\S]+?)__|\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g;

/** Разбирает простую разметку поста на куски. Ссылки и упоминания без разметки Telegram подсветит сам. */
export function parsePost(text: string): PostSegment[] {
  const out: PostSegment[] = [];
  let last = 0;
  for (const m of text.matchAll(MARKUP_RE)) {
    const at = m.index ?? 0;
    if (at > last) out.push({ text: text.slice(last, at) });
    if (m[1] !== undefined) out.push({ text: m[1], bold: true });
    else if (m[2] !== undefined) out.push({ text: m[2], italic: true });
    else out.push({ text: m[3]!, href: m[4]! });
    last = at + m[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last) });
  return out;
}

const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const escapeAttr = (s: string) => escapeHtml(s).replace(/"/g, "&quot;");

/** Текст поста в HTML для Telegram (parse_mode: HTML). Всё, кроме разметки, экранируется. */
export function postHtml(text: string): string {
  return parsePost(text)
    .map((s) => {
      const body = escapeHtml(s.text);
      if (s.bold) return `<b>${body}</b>`;
      if (s.italic) return `<i>${body}</i>`;
      if (s.href) return `<a href="${escapeAttr(s.href)}">${body}</a>`;
      return body;
    })
    .join("");
}

/** Длина текста так, как её считает Telegram: без разметки, в единицах UTF-16 (эмодзи обычно 2). */
export function postLength(text: string): number {
  return parsePost(text).reduce((sum, s) => sum + s.text.length, 0);
}

export type ChannelPostError =
  | "empty"
  | "too_long"
  | "too_many_photos"
  | "button_needs_text"
  | "bad_channel"
  | "button_text_missing"
  | "button_url_missing"
  | "button_too_long"
  | "bad_button_url";

export interface ChannelPostInput {
  text?: unknown;
  channel?: unknown;
  buttonText?: unknown;
  buttonUrl?: unknown;
  /** Сколько картинок (0–10). */
  photos: number;
}

export interface ChannelPost {
  text: string;
  channel: string;
  button: { text: string; url: string } | null;
  layout: PostLayout;
}

/** Канал: @имя (5–32 знака, как у Telegram) или числовой id вида -100… */
export function isChannelId(value: string): boolean {
  return /^@[A-Za-z][A-Za-z0-9_]{3,31}$/.test(value) || /^-100\d{5,15}$/.test(value);
}

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

/**
 * Проверяет поля поста. Без картинок нужен текст. Предел длины зависит от вида поста (`postLayout`): подпись к картинке
 * или альбому до 1024 знаков, отдельное сообщение до 4096. У альбома с кнопкой нужен текст: кнопка живёт под ним.
 */
export function checkChannelPost(input: ChannelPostInput): { ok: true; post: ChannelPost } | { ok: false; error: ChannelPostError; max?: number } {
  const text = str(input.text);
  const channel = str(input.channel) || CHANNEL_DEFAULT;
  const photos = input.photos;
  if (photos > CHANNEL_PHOTOS_MAX) return { ok: false, error: "too_many_photos", max: CHANNEL_PHOTOS_MAX };
  if (!text && photos === 0) return { ok: false, error: "empty" };
  const buttonText = str(input.buttonText);
  const buttonUrl = str(input.buttonUrl);
  let button: ChannelPost["button"] = null;
  if (buttonText || buttonUrl) {
    if (!buttonText) return { ok: false, error: "button_text_missing" };
    if (!buttonUrl) return { ok: false, error: "button_url_missing" };
    if ([...buttonText].length > CHANNEL_BUTTON_TEXT_MAX) return { ok: false, error: "button_too_long", max: CHANNEL_BUTTON_TEXT_MAX };
    if (!isButtonUrl(buttonUrl)) return { ok: false, error: "bad_button_url" };
    button = { text: buttonText, url: buttonUrl };
  }
  const layout = postLayout(photos, button !== null);
  if (layout === "album+text" && !text) return { ok: false, error: "button_needs_text" };
  const max = postTextMax(layout);
  if (postLength(text) > max) return { ok: false, error: "too_long", max };
  if (!isChannelId(channel)) return { ok: false, error: "bad_channel" };
  return { ok: true, post: { text, channel, button, layout } };
}

/** Ссылка для кнопки: только https:// с адресом сайта (Telegram отклоняет кривые ссылки целиком). */
export function isButtonUrl(value: string): boolean {
  // В общем коде нет URL из браузера: проверяем вид ссылки выражением (хост с точкой, без пробелов).
  return /^https:\/\/[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}(?::\d{1,5})?(?:[/?#]\S*)?$/.test(value);
}

/** Ссылка на опубликованный пост: только у канала с @именем. */
export function channelPostLink(channel: string, messageId: number): string | null {
  return channel.startsWith("@") ? `https://t.me/${channel.slice(1)}/${messageId}` : null;
}

/** Куда отправить: себе в чат с ботом (проверка) или в канал. */
export type ChannelPostTarget = "me" | "channel";

export interface AdminChannelPostResponse {
  ok: true;
  target: ChannelPostTarget;
  messageId: number | null;
  /** Ссылка на пост в канале (у публичного канала). */
  link: string | null;
  /** Альбом ушёл, а сообщение с текстом и кнопкой следом — нет (код ошибки Telegram). */
  followUpError?: string;
}

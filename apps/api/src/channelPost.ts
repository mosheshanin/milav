// Раздел панели «Пост в канал» (docs/ADMIN.md): бот публикует в канал пост с картинками (до 10, альбомом) и кнопкой-ссылкой.
// Сначала можно «Прислать мне» (тот же пост приходит администратору в чат с ботом), потом «Опубликовать».
// Бот должен быть администратором канала с правом публиковать сообщения.
import {
  CHANNEL_PHOTO_MAX_BYTES,
  CHANNEL_PHOTO_TYPES,
  CHANNEL_PHOTOS_MAX,
  CHANNEL_PHOTOS_TOTAL_MAX_BYTES,
  channelPostLink,
  checkChannelPost,
  postHtml,
  postLength,
  type AdminChannelPostResponse,
  type ChannelPost,
  type ChannelPostTarget,
} from "@milav/shared";
import { adminRoutes, logStatement } from "./admin";
import type { Bindings } from "./env";
import { telegramFetchFn } from "./reminders";
import { logEvent, logWarn } from "./telemetry";

/** Самый большой запрос: картинки вместе до 20 МБ и текст с запасом на обёртку формы. */
const MAX_REQUEST_BYTES = CHANNEL_PHOTOS_TOTAL_MAX_BYTES + 64 * 1024;

const nowSeconds = () => Math.floor(Date.now() / 1000);

/** Картинка поста: файл из формы панели уходит в Telegram как есть, без копирования в память. */
export type PostPhoto = File;

type PostError = "no_token" | "channel_not_found" | "bot_not_admin" | "bot_blocked" | "bad_format" | "bad_button_url" | "photo_bad" | "telegram_error";

export type TelegramPostResult =
  | { ok: true; messageId: number; followUpError?: PostError }
  | { ok: false; error: "no_token" | "channel_not_found" | "bot_not_admin" | "bot_blocked" | "bad_format" | "bad_button_url" | "photo_bad" | "telegram_error" };

/** Ошибка Telegram понятным кодом для панели. Для «прислать мне» недоступный чат значит, что бот заблокирован. */
export function telegramPostError(code: number, description: string, target: ChannelPostTarget): PostError {
  const d = description.toLowerCase();
  if (/can't parse entities|unsupported start tag|can't find end/.test(d)) return "bad_format";
  if (/button_url_invalid|wrong http url|url host is empty|button_type_invalid/.test(d)) return "bad_button_url";
  if (/image_process_failed|photo_invalid|wrong file|failed to get http url content|photo_ext_invalid/.test(d)) return "photo_bad";
  const unreachable = /chat not found|peer_id_invalid/.test(d);
  const forbidden = code === 403 || /not enough rights|need administrator rights|have no rights|not a member|chat_write_forbidden|chat_admin_required/.test(d);
  if (target === "me" && (unreachable || forbidden || /user is deactivated/.test(d))) return "bot_blocked";
  if (unreachable) return "channel_not_found";
  if (forbidden) return "bot_not_admin";
  return "telegram_error";
}

type TelegramCall = { ok: true; messageId: number } | { ok: false; error: PostError };

async function callTelegram(token: string, method: string, init: RequestInit, target: ChannelPostTarget): Promise<TelegramCall> {
  try {
    const res = await telegramFetchFn()(`https://api.telegram.org/bot${token}/${method}`, init);
    const data = (await res.json().catch(() => null)) as {
      ok?: boolean;
      result?: { message_id?: number } | { message_id?: number }[];
      error_code?: number;
      description?: string;
    } | null;
    // sendMediaGroup отвечает списком сообщений альбома: ссылка ведёт на первое.
    const first = Array.isArray(data?.result) ? data.result[0] : data?.result;
    if (data?.ok && typeof first?.message_id === "number") return { ok: true, messageId: first.message_id };
    const code = data?.error_code ?? res.status;
    const description = data?.description ?? "";
    const error = telegramPostError(code, description, target);
    logWarn("channel_post_error", { method, code, target, error, description: description.slice(0, 160) });
    return { ok: false, error };
  } catch (err) {
    logWarn("channel_post_error", { method, target, error: "network", message: err instanceof Error ? err.message.slice(0, 160) : "" });
    return { ok: false, error: "telegram_error" };
  }
}

/**
 * Отправляет пост в чат (канал или личный чат администратора) так, как задаёт `post.layout`: текстом, картинкой с
 * подписью, альбомом с подписью или альбомом и следом сообщением с текстом и кнопкой. Текст уходит в HTML.
 */
export async function sendPost(
  env: Pick<Bindings, "BOT_TOKEN">,
  chatId: string | number,
  post: ChannelPost,
  photos: PostPhoto[],
  silent: boolean,
  target: ChannelPostTarget,
): Promise<TelegramPostResult> {
  const token = env.BOT_TOKEN;
  if (!token) return { ok: false, error: "no_token" };
  const replyMarkup = post.button ? { inline_keyboard: [[{ text: post.button.text, url: post.button.url }]] } : undefined;
  const html = postHtml(post.text);
  const fileName = (i: number) => `post-${i + 1}.${photos[i]!.type === "image/png" ? "png" : "jpg"}`;

  const textMessage = (): RequestInit => ({
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text: html,
      parse_mode: "HTML",
      link_preview_options: { is_disabled: true },
      ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
      ...(silent ? { disable_notification: true } : {}),
    }),
  });

  if (post.layout === "text") return callTelegram(token, "sendMessage", textMessage(), target);

  if (post.layout === "photo") {
    const form = new FormData();
    form.set("chat_id", String(chatId));
    form.set("photo", photos[0]!, fileName(0));
    if (html) {
      form.set("caption", html);
      form.set("parse_mode", "HTML");
    }
    if (replyMarkup) form.set("reply_markup", JSON.stringify(replyMarkup));
    if (silent) form.set("disable_notification", "true");
    return callTelegram(token, "sendPhoto", { method: "POST", body: form }, target);
  }

  // Альбом: подпись у первой картинки (её Telegram показывает под всем альбомом), у «album+text» подписи нет.
  const withCaption = post.layout === "album" && html !== "";
  const form = new FormData();
  form.set("chat_id", String(chatId));
  form.set(
    "media",
    JSON.stringify(
      photos.map((_, i) => ({
        type: "photo",
        media: `attach://p${i}`,
        ...(i === 0 && withCaption ? { caption: html, parse_mode: "HTML" } : {}),
      })),
    ),
  );
  photos.forEach((photo, i) => form.set(`p${i}`, photo, fileName(i)));
  if (silent) form.set("disable_notification", "true");
  const album = await callTelegram(token, "sendMediaGroup", { method: "POST", body: form }, target);
  if (!album.ok || post.layout === "album") return album;
  // Альбом уже в канале: если сообщение с кнопкой не ушло, пост не откатываем, а сообщаем панели.
  const follow = await callTelegram(token, "sendMessage", textMessage(), target);
  return follow.ok ? album : { ...album, followUpError: follow.error };
}

/** Картинки из формы: до 10 штук, JPEG или PNG, каждая до 5 МБ, вместе до 20 МБ. Пустые поля пропускаются. */
function photosOf(values: (File | string)[]): PostPhoto[] | "too_many" | "bad_type" | "too_big" {
  const files = values.filter((v): v is File => typeof v !== "string" && v.size > 0);
  if (files.length > CHANNEL_PHOTOS_MAX) return "too_many";
  let total = 0;
  for (const file of files) {
    if (!(CHANNEL_PHOTO_TYPES as readonly string[]).includes(file.type)) return "bad_type";
    if (file.size > CHANNEL_PHOTO_MAX_BYTES) return "too_big";
    total += file.size;
  }
  if (total > CHANNEL_PHOTOS_TOTAL_MAX_BYTES) return "too_big";
  return files;
}

// Форма (multipart): target = me | channel, text, channel, buttonText, buttonUrl, silent = 1, photo (до 10 файлов, по порядку).
adminRoutes.post("/api/admin/channel/post", async (c) => {
  const length = Number(c.req.header("Content-Length") ?? "0");
  if (length > MAX_REQUEST_BYTES) return c.json({ error: "photo_too_big" }, 413);
  let form: FormData;
  try {
    form = await c.req.raw.formData();
  } catch {
    return c.json({ error: "bad_request" }, 400);
  }
  const target = form.get("target");
  if (target !== "me" && target !== "channel") return c.json({ error: "bad_request" }, 400);
  const photos = photosOf(form.getAll("photo"));
  if (photos === "too_many") return c.json({ error: "post_too_many_photos", max: CHANNEL_PHOTOS_MAX }, 400);
  if (photos === "bad_type") return c.json({ error: "photo_type" }, 400);
  if (photos === "too_big") return c.json({ error: "photo_too_big" }, 413);
  const check = checkChannelPost({
    text: form.get("text"),
    channel: form.get("channel"),
    buttonText: form.get("buttonText"),
    buttonUrl: form.get("buttonUrl"),
    photos: photos.length,
  });
  if (!check.ok) return c.json({ error: `post_${check.error}`, ...(check.max ? { max: check.max } : {}) }, 400);

  const user = c.get("user");
  const post = check.post;
  const chatId = target === "me" ? user.id : post.channel;
  const silent = form.get("silent") === "1";
  const sent = await sendPost(c.env, chatId, post, photos, silent, target);
  logEvent("admin_channel_post", { uid: user.id, target, layout: post.layout, photos: photos.length, button: post.button !== null, ok: sent.ok });
  if (!sent.ok) return c.json({ error: sent.error }, sent.error === "no_token" ? 503 : 502);

  if (target === "channel") {
    const now = nowSeconds();
    await logStatement(c.env.DB, user.id, "channel.post", post.channel, undefined, {
      text: post.text.slice(0, 200),
      length: postLength(post.text),
      photos: photos.length,
      button: post.button,
      messageId: sent.messageId,
    }, now).run();
  }
  const body: AdminChannelPostResponse = {
    ok: true,
    target,
    messageId: sent.messageId,
    link: target === "channel" ? channelPostLink(post.channel, sent.messageId) : null,
    ...(sent.followUpError ? { followUpError: sent.followUpError } : {}),
  };
  return c.json(body);
});

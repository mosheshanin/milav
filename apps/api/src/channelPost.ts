// Раздел панели «Пост в канал» (docs/ADMIN.md): бот публикует в канал пост с картинкой и кнопкой-ссылкой под ним.
// Сначала можно «Прислать мне» (тот же пост приходит администратору в чат с ботом), потом «Опубликовать».
// Бот должен быть администратором канала с правом публиковать сообщения.
import {
  CHANNEL_PHOTO_MAX_BYTES,
  CHANNEL_PHOTO_TYPES,
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

/** Самый большой запрос: картинка до 5 МБ и текст с запасом на обёртку формы. */
const MAX_REQUEST_BYTES = CHANNEL_PHOTO_MAX_BYTES + 64 * 1024;

const nowSeconds = () => Math.floor(Date.now() / 1000);

export interface PostPhoto {
  bytes: ArrayBuffer;
  type: string;
  name: string;
}

export type TelegramPostResult =
  | { ok: true; messageId: number }
  | { ok: false; error: "no_token" | "channel_not_found" | "bot_not_admin" | "bot_blocked" | "bad_format" | "bad_button_url" | "photo_bad" | "telegram_error" };

/** Ошибка Telegram понятным кодом для панели. Для «прислать мне» недоступный чат значит, что бот заблокирован. */
export function telegramPostError(code: number, description: string, target: ChannelPostTarget): Exclude<TelegramPostResult, { ok: true }>["error"] {
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

/** Отправляет пост в чат (канал или личный чат администратора). Текст уходит в HTML, кнопка ссылкой под постом. */
export async function sendPost(
  env: Pick<Bindings, "BOT_TOKEN">,
  chatId: string | number,
  post: ChannelPost,
  photo: PostPhoto | null,
  silent: boolean,
  target: ChannelPostTarget,
): Promise<TelegramPostResult> {
  const token = env.BOT_TOKEN;
  if (!token) return { ok: false, error: "no_token" };
  const replyMarkup = post.button ? { inline_keyboard: [[{ text: post.button.text, url: post.button.url }]] } : undefined;
  const html = postHtml(post.text);
  let init: RequestInit;
  let method: string;
  if (photo) {
    method = "sendPhoto";
    const form = new FormData();
    form.set("chat_id", String(chatId));
    form.set("photo", new File([photo.bytes], photo.name, { type: photo.type }));
    if (html) {
      form.set("caption", html);
      form.set("parse_mode", "HTML");
    }
    if (replyMarkup) form.set("reply_markup", JSON.stringify(replyMarkup));
    if (silent) form.set("disable_notification", "true");
    init = { method: "POST", body: form };
  } else {
    method = "sendMessage";
    init = {
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
    };
  }
  try {
    const res = await telegramFetchFn()(`https://api.telegram.org/bot${token}/${method}`, init);
    const data = (await res.json().catch(() => null)) as { ok?: boolean; result?: { message_id?: number }; error_code?: number; description?: string } | null;
    if (data?.ok && typeof data.result?.message_id === "number") return { ok: true, messageId: data.result.message_id };
    const code = data?.error_code ?? res.status;
    const description = data?.description ?? "";
    const error = telegramPostError(code, description, target);
    logWarn("channel_post_error", { code, target, error, description: description.slice(0, 160) });
    return { ok: false, error };
  } catch (err) {
    logWarn("channel_post_error", { target, error: "network", message: err instanceof Error ? err.message.slice(0, 160) : "" });
    return { ok: false, error: "telegram_error" };
  }
}

/** Читает картинку из формы: только JPEG и PNG до 5 МБ. */
async function photoOf(value: File | string | null): Promise<PostPhoto | null | "bad_type" | "too_big"> {
  if (!value || typeof value === "string" || value.size === 0) return null;
  if (!(CHANNEL_PHOTO_TYPES as readonly string[]).includes(value.type)) return "bad_type";
  if (value.size > CHANNEL_PHOTO_MAX_BYTES) return "too_big";
  const ext = value.type === "image/png" ? "png" : "jpg";
  return { bytes: await value.arrayBuffer(), type: value.type, name: `post.${ext}` };
}

// Форма (multipart): target = me | channel, text, channel, buttonText, buttonUrl, silent = 1, photo (файл).
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
  const photo = await photoOf(form.get("photo"));
  if (photo === "bad_type") return c.json({ error: "photo_type" }, 400);
  if (photo === "too_big") return c.json({ error: "photo_too_big" }, 413);
  const check = checkChannelPost({
    text: form.get("text"),
    channel: form.get("channel"),
    buttonText: form.get("buttonText"),
    buttonUrl: form.get("buttonUrl"),
    hasPhoto: photo !== null,
  });
  if (!check.ok) return c.json({ error: `post_${check.error}`, ...(check.max ? { max: check.max } : {}) }, 400);

  const user = c.get("user");
  const post = check.post;
  const chatId = target === "me" ? user.id : post.channel;
  const silent = form.get("silent") === "1";
  const sent = await sendPost(c.env, chatId, post, photo, silent, target);
  logEvent("admin_channel_post", { uid: user.id, target, photo: photo !== null, button: post.button !== null, ok: sent.ok });
  if (!sent.ok) return c.json({ error: sent.error }, sent.error === "no_token" ? 503 : 502);

  if (target === "channel") {
    const now = nowSeconds();
    await logStatement(c.env.DB, user.id, "channel.post", post.channel, undefined, {
      text: post.text.slice(0, 200),
      length: postLength(post.text),
      photo: photo !== null,
      button: post.button,
      messageId: sent.messageId,
    }, now).run();
  }
  const body: AdminChannelPostResponse = {
    ok: true,
    target,
    messageId: sent.messageId,
    link: target === "channel" ? channelPostLink(post.channel, sent.messageId) : null,
  };
  return c.json(body);
});

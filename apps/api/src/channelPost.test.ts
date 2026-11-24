// Раздел панели «Пост в канал»: доступ, проверка полей, отправка в Telegram (текст и картинка), ошибки, журнал.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { AdminChannelPostResponse } from "@milav/shared";
import { sendPost, telegramPostError } from "./channelPost";
import type { Bindings } from "./env";
import { setTelegramFetchForTests } from "./reminders";
import { api, ctx, resetHarness } from "./test-utils/harness";

const OWNER = 8201;
const STUDENT = 8202;

interface Sent {
  method: string;
  fields: Record<string, unknown>;
  photo?: { type: string; size: number };
  files?: Record<string, { type: string; size: number; name: string }>;
}
let outbox: Sent[] = [];
let reply: { status: number; body: unknown } = { status: 200, body: { ok: true, result: { message_id: 42 } } };
/** Ответ на sendMediaGroup: список сообщений альбома. */
let albumReply: { status: number; body: unknown } = { status: 200, body: { ok: true, result: [{ message_id: 50 }, { message_id: 51 }] } };

beforeEach(() => {
  resetHarness();
  outbox = [];
  reply = { status: 200, body: { ok: true, result: { message_id: 42 } } };
  albumReply = { status: 200, body: { ok: true, result: [{ message_id: 50 }, { message_id: 51 }] } };
  setTelegramFetchForTests(async (url, init) => {
    const method = url.split("/").pop()!;
    if (init?.body instanceof FormData) {
      const fields: Record<string, unknown> = {};
      const files: NonNullable<Sent["files"]> = {};
      for (const [k, v] of init.body.entries()) {
        if (typeof v === "string") fields[k] = v;
        else files[k] = { type: v.type, size: v.size, name: (v as File).name };
      }
      const photo = files.photo ? { type: files.photo.type, size: files.photo.size } : undefined;
      outbox.push({ method, fields, ...(photo ? { photo } : { files }) });
    } else {
      outbox.push({ method, fields: JSON.parse(String(init?.body)) });
    }
    const r = method === "sendMediaGroup" ? albumReply : reply;
    return new Response(JSON.stringify(r.body), { status: r.status });
  });
});
afterEach(() => setTelegramFetchForTests(null));

const env = (): Bindings => ({ ...ctx.env, ADMIN_IDS: `${OWNER}` });

function form(fields: Record<string, string>, photos: File[] = []): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  for (const p of photos) f.append("photo", p);
  return f;
}
const postForm = (fields: Record<string, string>, as = OWNER, photo?: File | File[]) =>
  api("/api/admin/channel/post", { method: "POST", as, body: form(fields, photo === undefined ? [] : Array.isArray(photo) ? photo : [photo]) }, env());
const png = (bytes = 100) => new File([new Uint8Array(bytes)], "shot.png", { type: "image/png" });
const jpg = (bytes = 100) => new File([new Uint8Array(bytes)], "shot.jpg", { type: "image/jpeg" });
const logRows = () => ctx.env.DB.prepare("SELECT action, target, new_value FROM admin_log ORDER BY id").all<{ action: string; target: string; new_value: string }>();

describe("пост в канал", () => {
  it("только администраторам", async () => {
    expect((await postForm({ target: "channel", text: "Привет" }, STUDENT)).status).toBe(403);
    expect(outbox).toHaveLength(0);
  });

  it("текст с разметкой и кнопкой уходит в @milavnews, ссылка на пост и запись в журнале", async () => {
    const res = await postForm({
      target: "channel",
      text: "**Иврит** в Telegram, пишите @y_o_g_g_y",
      buttonText: "Открыть Milav",
      buttonUrl: "https://t.me/milavbotbot?startapp",
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as AdminChannelPostResponse;
    expect(body).toEqual({ ok: true, target: "channel", messageId: 42, link: "https://t.me/milavnews/42" });
    expect(outbox).toEqual([
      {
        method: "sendMessage",
        fields: {
          chat_id: "@milavnews",
          text: "<b>Иврит</b> в Telegram, пишите @y_o_g_g_y",
          parse_mode: "HTML",
          link_preview_options: { is_disabled: true },
          reply_markup: { inline_keyboard: [[{ text: "Открыть Milav", url: "https://t.me/milavbotbot?startapp" }]] },
        },
      },
    ]);
    const { results } = await logRows();
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ action: "channel.post", target: "@milavnews" });
    expect(JSON.parse(results[0]!.new_value)).toMatchObject({ messageId: 42, photos: 0, button: { text: "Открыть Milav" } });
  });

  it("«прислать мне»: тот же пост в личный чат администратора, без записи в журнале", async () => {
    const res = await postForm({ target: "me", text: "Проверка", channel: "@milavnews", silent: "1" });
    expect(((await res.json()) as AdminChannelPostResponse)).toEqual({ ok: true, target: "me", messageId: 42, link: null });
    expect(outbox[0]!.fields).toMatchObject({ chat_id: OWNER, text: "Проверка", disable_notification: true });
    expect(outbox[0]!.fields.reply_markup).toBeUndefined();
    expect((await logRows()).results).toHaveLength(0);
  });

  it("с картинкой: sendPhoto с подписью и кнопкой, без звука", async () => {
    const res = await postForm(
      { target: "channel", text: "__Новый урок__", buttonText: "Открыть", buttonUrl: "https://milav.app", silent: "1" },
      OWNER,
      png(2048),
    );
    expect(res.status).toBe(200);
    expect(outbox[0]).toEqual({
      method: "sendPhoto",
      fields: {
        chat_id: "@milavnews",
        caption: "<i>Новый урок</i>",
        parse_mode: "HTML",
        reply_markup: JSON.stringify({ inline_keyboard: [[{ text: "Открыть", url: "https://milav.app" }]] }),
        disable_notification: "true",
      },
      photo: { type: "image/png", size: 2048 },
    });
  });

  it("альбом без кнопки: sendMediaGroup, подпись у первой картинки, ссылка на первое сообщение", async () => {
    const res = await postForm({ target: "channel", text: "**Скриншоты**", silent: "1" }, OWNER, [png(300), jpg(200), png(100)]);
    expect(((await res.json()) as AdminChannelPostResponse)).toEqual({ ok: true, target: "channel", messageId: 50, link: "https://t.me/milavnews/50" });
    expect(outbox).toHaveLength(1);
    expect(outbox[0]!.method).toBe("sendMediaGroup");
    expect(outbox[0]!.fields.chat_id).toBe("@milavnews");
    expect(outbox[0]!.fields.disable_notification).toBe("true");
    expect(JSON.parse(String(outbox[0]!.fields.media))).toEqual([
      { type: "photo", media: "attach://p0", caption: "<b>Скриншоты</b>", parse_mode: "HTML" },
      { type: "photo", media: "attach://p1" },
      { type: "photo", media: "attach://p2" },
    ]);
    // Порядок картинок как в панели, имена файлов по порядку.
    expect(outbox[0]!.files).toEqual({
      p0: { type: "image/png", size: 300, name: "post-1.png" },
      p1: { type: "image/jpeg", size: 200, name: "post-2.jpg" },
      p2: { type: "image/png", size: 100, name: "post-3.png" },
    });
    const { results } = await logRows();
    expect(JSON.parse(results[0]!.new_value)).toMatchObject({ photos: 3, messageId: 50 });
  });

  it("альбом с кнопкой: альбом без подписи, следом текст с кнопкой; текст может быть длиннее 1024", async () => {
    const text = "а".repeat(2000);
    const res = await postForm({ target: "channel", text, buttonText: "Открыть Milav", buttonUrl: "https://t.me/milavbotbot?startapp" }, OWNER, [png(), png()]);
    expect(res.status).toBe(200);
    expect(((await res.json()) as AdminChannelPostResponse).link).toBe("https://t.me/milavnews/50");
    expect(outbox.map((m) => m.method)).toEqual(["sendMediaGroup", "sendMessage"]);
    expect(JSON.parse(String(outbox[0]!.fields.media))).toEqual([
      { type: "photo", media: "attach://p0" },
      { type: "photo", media: "attach://p1" },
    ]);
    expect(outbox[1]!.fields).toMatchObject({
      chat_id: "@milavnews",
      text,
      reply_markup: { inline_keyboard: [[{ text: "Открыть Milav", url: "https://t.me/milavbotbot?startapp" }]] },
    });
  });

  it("альбом ушёл, а сообщение с кнопкой нет: пост не откатывается, панель узнаёт об этом", async () => {
    reply = { status: 400, body: { ok: false, error_code: 400, description: "Bad Request: BUTTON_URL_INVALID" } };
    const res = await postForm({ target: "channel", text: "x", buttonText: "Открыть", buttonUrl: "https://milav.app" }, OWNER, [png(), png()]);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, messageId: 50, followUpError: "bad_button_url" });
  });

  it("альбом с кнопкой без текста нельзя: кнопке не к чему прикрепиться", async () => {
    const res = await postForm({ target: "channel", text: "", buttonText: "Открыть", buttonUrl: "https://milav.app" }, OWNER, [png(), png()]);
    expect(await res.json()).toEqual({ error: "post_button_needs_text" });
    expect(outbox).toHaveLength(0);
  });

  it("не больше 10 картинок и не больше 20 МБ вместе", async () => {
    const many = Array.from({ length: 11 }, () => png());
    expect(await (await postForm({ target: "channel", text: "x" }, OWNER, many)).json()).toEqual({ error: "post_too_many_photos", max: 10 });
    const ten = Array.from({ length: 10 }, () => png());
    expect((await postForm({ target: "channel", text: "x" }, OWNER, ten)).status).toBe(200);
    const heavy = Array.from({ length: 5 }, () => png(4.5 * 1024 * 1024));
    expect((await postForm({ target: "channel", text: "x" }, OWNER, heavy)).status).toBe(413);
  });

  it("картинка без текста можно, пустой пост нельзя", async () => {
    expect((await postForm({ target: "channel", text: "" }, OWNER, png())).status).toBe(200);
    const empty = await postForm({ target: "channel", text: "  " });
    expect(empty.status).toBe(400);
    expect(await empty.json()).toEqual({ error: "post_empty" });
  });

  it("проверки полей: длина подписи, канал, кнопка, тип и размер картинки", async () => {
    const long = await postForm({ target: "channel", text: "а".repeat(1025) }, OWNER, png());
    expect(await long.json()).toEqual({ error: "post_too_long", max: 1024 });
    expect(await (await postForm({ target: "channel", text: "x", channel: "milavnews" })).json()).toEqual({ error: "post_bad_channel" });
    expect(await (await postForm({ target: "channel", text: "x", buttonText: "Открыть", buttonUrl: "milav.app" })).json()).toEqual({
      error: "post_bad_button_url",
    });
    const gif = new File([new Uint8Array(10)], "a.gif", { type: "image/gif" });
    expect(await (await postForm({ target: "channel", text: "x" }, OWNER, gif)).json()).toEqual({ error: "photo_type" });
    const big = await postForm({ target: "channel", text: "x" }, OWNER, png(5 * 1024 * 1024 + 1));
    expect(big.status).toBe(413);
    expect(await (await postForm({ target: "nowhere", text: "x" })).json()).toEqual({ error: "bad_request" });
    expect(outbox).toHaveLength(0);
  });

  it("бот не администратор канала: понятная ошибка, в журнале ничего", async () => {
    reply = { status: 403, body: { ok: false, error_code: 403, description: "Forbidden: bot is not a member of the channel chat" } };
    const res = await postForm({ target: "channel", text: "x" });
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: "bot_not_admin" });
    expect((await logRows()).results).toHaveLength(0);
  });

  it("без токена бота пост не отправляется", async () => {
    const post = { text: "x", channel: "@milavnews", button: null };
    expect(await sendPost({ BOT_TOKEN: undefined }, "@milavnews", { ...post, layout: "text" }, [], false, "channel")).toEqual({ ok: false, error: "no_token" });
    expect(outbox).toHaveLength(0);
  });
});

describe("ошибки Telegram", () => {
  it("коды для панели", () => {
    expect(telegramPostError(400, "Bad Request: chat not found", "channel")).toBe("channel_not_found");
    expect(telegramPostError(400, "Bad Request: chat not found", "me")).toBe("bot_blocked");
    expect(telegramPostError(403, "Forbidden: bot was blocked by the user", "me")).toBe("bot_blocked");
    expect(telegramPostError(400, "Bad Request: need administrator rights in the channel chat", "channel")).toBe("bot_not_admin");
    expect(telegramPostError(400, "Bad Request: can't parse entities: Unsupported start tag", "channel")).toBe("bad_format");
    expect(telegramPostError(400, "Bad Request: BUTTON_URL_INVALID", "channel")).toBe("bad_button_url");
    expect(telegramPostError(400, "Bad Request: IMAGE_PROCESS_FAILED", "channel")).toBe("photo_bad");
    expect(telegramPostError(429, "Too Many Requests: retry after 5", "channel")).toBe("telegram_error");
  });
});

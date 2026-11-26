import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PROGRESS_WIDGET_HTML, REMINDERS_WIDGET_HTML } from "@milav/shared";
import { webhookSecret } from "./bot";
import { WIDGET_REFUSE_SECONDS, resetWidgetRefusalForTests } from "./botWidgets";
import type { Bindings } from "./env";
import { setTelegramFetchForTests } from "./reminders";
import { TOKEN, api, completeWord, ctx, lesson, resetHarness } from "./test-utils/harness";

const OWNER = 9001;
const STUDENT = 9002;

/** Что бот отправил в Telegram. Ответ Telegram задаёт `reply` по методу. */
let outbox: { method: string; [key: string]: any }[] = [];
let nextId = 100;
let reply: (method: string, body: any) => { status: number; json: object } | null = () => null;

beforeEach(() => {
  resetHarness();
  resetWidgetRefusalForTests();
  outbox = [];
  nextId = 100;
  reply = () => null;
  setTelegramFetchForTests(async (url, init) => {
    const method = url.split("/").pop()!;
    const body = JSON.parse(String(init?.body));
    outbox.push({ method, ...body });
    const custom = reply(method, body);
    if (custom) return new Response(JSON.stringify(custom.json), { status: custom.status });
    const result = method === "sendMessage" || method === "sendWidget" ? { message_id: nextId++ } : true;
    return new Response(JSON.stringify({ ok: true, result }));
  });
  vi.useFakeTimers({ toFake: ["Date"] });
  // Среда 14.10.2026, 12:00 по Иерусалиму.
  vi.setSystemTime(new Date("2026-10-14T09:00:00Z"));
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});
afterEach(() => {
  setTelegramFetchForTests(null);
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const env = (): Bindings => ({ ...ctx.env, ADMIN_IDS: `${OWNER}` });
const me = (as: number) => api("/api/me", { as }, env());
const putJson = (path: string, as: number, body: unknown) =>
  api(path, { method: "PUT", as, body: JSON.stringify(body), headers: { "Content-Type": "application/json" } }, env());
const setConfig = (key: string, value: string) => putJson("/api/admin/config", OWNER, { key, value });

async function webhook(update: object) {
  const res = await api(
    "/api/bot/webhook",
    { method: "POST", body: JSON.stringify(update), headers: { "Content-Type": "application/json", "X-Telegram-Bot-Api-Secret-Token": await webhookSecret(TOKEN) } },
    env(),
  );
  expect(res.status).toBe(200);
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}
const command = (text: string, from: number) =>
  webhook({ update_id: 1, message: { message_id: 1, text, chat: { id: from, type: "private" }, from: { id: from, first_name: "Анна" } } });
const widgetQuery = (data: string, from: number, chat: object = { id: from, type: "private" }) =>
  webhook({ update_id: 2, widget_query: { id: "wq1", data, from: { id: from, first_name: "Анна" }, chat, message_id: 55, chat_instance: "x", type: { type: "data" } } });
const sent = (method: string) => outbox.filter((m) => m.method === method);
const cardRow = (userId: number) => ctx.env.DB.prepare("SELECT * FROM bot_cards WHERE user_id = ?").bind(userId).first<any>();
const reminderRow = (userId: number) => ctx.env.DB.prepare("SELECT * FROM reminders WHERE user_id = ?").bind(userId).first<any>();
const refused = () => ({ status: 400, json: { ok: false, error_code: 400, description: "Bad Request: INPUT_MEDIA_WIDGET_NOT_ALLOWED" } });

describe("/progress", () => {
  it("команде: карточка с данными прогресса, кнопкой «Продолжить» и закреплением", async () => {
    await me(OWNER);
    await completeWord(OWNER, lesson.words[0]!.id);
    outbox = [];
    expect(await command("/progress", OWNER)).toBeNull();
    const [widget] = sent("sendWidget");
    expect(widget).toMatchObject({ chat_id: OWNER, html: PROGRESS_WIDGET_HTML, allow_queries: true });
    expect(widget!.caption).toContain("Мой прогресс");
    expect(widget!.reply_markup.inline_keyboard).toEqual([[{ text: "📚 Продолжить", web_app: { url: expect.stringMatching(/^https?:\/\//) } }]]);
    expect(JSON.parse(widget!.chat_data)).toMatchObject({ v: 1, s: "♟", sn: "Пешка", l: 0, p: 1, g: [1, 5], r: 0 });
    expect(sent("pinChatMessage")).toEqual([{ method: "pinChatMessage", chat_id: OWNER, message_id: 100, disable_notification: true }]);
    expect(await cardRow(OWNER)).toMatchObject({ progress_msg_id: 100, progress_kind: "widget" });
  });

  it("повторный /progress открепляет прежнюю карточку и закрепляет новую", async () => {
    await command("/progress", OWNER);
    await command("/progress", OWNER);
    expect(sent("unpinChatMessage")).toEqual([{ method: "unpinChatMessage", chat_id: OWNER, message_id: 100 }]);
    expect(sent("pinChatMessage").map((m) => m.message_id)).toEqual([100, 101]);
    expect((await cardRow(OWNER)).progress_msg_id).toBe(101);
  });

  it("ученику при «Команде»: тот же прогресс текстом с кнопками «Обновить» и «Продолжить»", async () => {
    await me(STUDENT);
    await command("/progress", STUDENT);
    expect(sent("sendWidget")).toEqual([]);
    const [message] = sent("sendMessage");
    expect(message!.text).toContain("♟ Пешка: сдано 0 уроков");
    expect(message!.text).toContain("Следующая фигура: ♞ Конь, через 6 уроков");
    expect(message!.reply_markup.inline_keyboard[0][0]).toEqual({ text: "↻ Обновить", callback_data: "prog:upd" });
    expect(await cardRow(STUDENT)).toMatchObject({ progress_kind: "text" });
  });

  it("«Все»: карточка и ученику", async () => {
    await setConfig("botWidgets", "all");
    await command("/progress", STUDENT);
    expect(sent("sendWidget")).toHaveLength(1);
  });

  it("Telegram не принял карточку: текст, и час не пробует снова", async () => {
    reply = (method) => (method === "sendWidget" ? refused() : null);
    await command("/progress", OWNER);
    expect(sent("sendWidget")).toHaveLength(1);
    expect(sent("sendMessage")[0]!.text).toContain("Мой прогресс");
    expect(await cardRow(OWNER)).toMatchObject({ progress_kind: "text" });
    // Второй раз сразу текстом, без попытки карточки.
    await command("/progress", OWNER);
    expect(sent("sendWidget")).toHaveLength(1);
    expect(sent("sendMessage")).toHaveLength(2);
    // Через час пробует снова.
    vi.setSystemTime(Date.now() + (WIDGET_REFUSE_SECONDS + 1) * 1000);
    await command("/progress", OWNER);
    expect(sent("sendWidget")).toHaveLength(2);
  });

  it("другая ошибка карточки (не отказ): текст, но в следующий раз снова пробует карточку", async () => {
    reply = (method) => (method === "sendWidget" ? { status: 400, json: { ok: false, error_code: 400, description: "Bad Request: INPUT_MEDIA_WIDGET_HTML_INVALID" } } : null);
    await command("/progress", OWNER);
    await command("/progress", OWNER);
    expect(sent("sendWidget")).toHaveLength(2);
    expect(sent("sendMessage")).toHaveLength(2);
  });

  it("бот заблокирован: ничего не закрепляет", async () => {
    reply = () => ({ status: 403, json: { ok: false, error_code: 403, description: "Forbidden: bot was blocked by the user" } });
    await command("/progress", OWNER);
    expect(sent("pinChatMessage")).toEqual([]);
    expect(await cardRow(OWNER)).toBeNull();
  });

  it("«Обновить» под текстом переписывает сообщение свежими данными", async () => {
    await me(STUDENT);
    await command("/progress", STUDENT);
    await completeWord(STUDENT, lesson.words[0]!.id);
    outbox = [];
    const answer = await webhook({
      update_id: 3,
      callback_query: { id: "cb1", data: "prog:upd", from: { id: STUDENT, first_name: "Анна" }, message: { message_id: 100, chat: { id: STUDENT } } },
    });
    expect(answer).toEqual({ method: "answerCallbackQuery", callback_query_id: "cb1", text: "Обновлено" });
    const [edit] = sent("editMessageText");
    expect(edit).toMatchObject({ chat_id: STUDENT, message_id: 100 });
    expect(edit!.text).toContain("⭐ Очки: 1");
    expect(edit!.text).toContain("🎯 Цель дня: 1 из 5 слов");
  });

  it("в группе бот молчит", async () => {
    await webhook({ update_id: 4, message: { message_id: 1, text: "/progress", chat: { id: -100, type: "group" }, from: { id: OWNER, first_name: "A" } } });
    expect(outbox).toEqual([]);
  });

  it("карточка просит свежие данные: ответ answerWidgetQuery с прогрессом", async () => {
    await me(STUDENT);
    await completeWord(STUDENT, lesson.words[0]!.id);
    outbox = [];
    expect(await widgetQuery("p", STUDENT)).toBeNull();
    const [answer] = sent("answerWidgetQuery");
    expect(answer!.widget_query_id).toBe("wq1");
    expect(JSON.parse(answer!.data)).toMatchObject({ v: 1, sn: "Пешка", p: 1, g: [1, 5], w: "0001000", t: 3 });
  });
});

describe("/reminders карточкой", () => {
  it("команде: карточка «Напоминания» с текущим состоянием", async () => {
    await me(OWNER);
    expect(await command("/reminders", OWNER)).toBeNull();
    const [widget] = sent("sendWidget");
    expect(widget).toMatchObject({ chat_id: OWNER, html: REMINDERS_WIDGET_HTML, allow_queries: true });
    expect(JSON.parse(widget!.chat_data)).toEqual({ v: 1, a: true, on: false, m: 1200, o: [480, 720, 1080, 1200, 1260], sh: true });
  });

  it("ученику при «Команде» прежний текст с кнопкой", async () => {
    await setConfig("reminders", "all");
    await me(STUDENT);
    const answer = await command("/reminders", STUDENT);
    expect(sent("sendWidget")).toEqual([]);
    expect(answer.text).toContain("выключены");
    expect(answer.reply_markup.inline_keyboard[0][0].callback_data).toBe("rem:on");
  });

  it("Telegram не принял карточку: прежний текст ответом на вебхук", async () => {
    reply = (method) => (method === "sendWidget" ? refused() : null);
    await me(OWNER);
    const answer = await command("/reminders", OWNER);
    expect(answer.method).toBe("sendMessage");
    expect(answer.text).toContain("выключены");
  });

  it("время включает, «выкл» выключает, «вкл» включает с прежним временем", async () => {
    await me(OWNER);
    await widgetQuery("r:t:480", OWNER);
    expect(JSON.parse(sent("answerWidgetQuery")[0]!.data)).toMatchObject({ a: true, on: true, m: 480 });
    // 14.10 12:00 по Иерусалиму: 8:00 уже прошло, значит завтра в 8:00 (05:00 UTC).
    expect(await reminderRow(OWNER)).toMatchObject({ enabled: 1, minute: 480, blocked: 0, next_at: Date.parse("2026-10-15T05:00:00Z") / 1000 });

    await widgetQuery("r:off", OWNER);
    expect(JSON.parse(sent("answerWidgetQuery")[1]!.data)).toMatchObject({ on: false, m: 480 });
    expect(await reminderRow(OWNER)).toMatchObject({ enabled: 0, next_at: null });

    await widgetQuery("r:on", OWNER);
    expect(JSON.parse(sent("answerWidgetQuery")[2]!.data)).toMatchObject({ on: true, m: 480 });

    await widgetQuery("r", OWNER);
    expect(JSON.parse(sent("answerWidgetQuery")[3]!.data)).toMatchObject({ on: true, m: 480 });
  });

  it("напоминания выключены в панели: карточка показывает «недоступны» и ничего не меняет", async () => {
    await setConfig("reminders", "off");
    await widgetQuery("r:on", OWNER);
    expect(JSON.parse(sent("answerWidgetQuery")[0]!.data)).toMatchObject({ a: false, on: false });
    expect(await reminderRow(OWNER)).toBeNull();
  });

  it("непонятный запрос: пустой ответ, чтобы карточка не ждала; из группы и от ботов не отвечает", async () => {
    await widgetQuery("zzz", OWNER);
    expect(sent("answerWidgetQuery")).toEqual([{ method: "answerWidgetQuery", widget_query_id: "wq1" }]);
    outbox = [];
    await widgetQuery("r:on", OWNER, { id: -100, type: "group" });
    await webhook({ update_id: 5, widget_query: { id: "wq2", data: "p", from: { id: OWNER, is_bot: true }, chat: { id: OWNER, type: "private" } } });
    expect(outbox).toEqual([]);
    expect(await reminderRow(OWNER)).toBeNull();
  });
});

describe("удаление данных", () => {
  it("«Удалить мои данные» убирает и запись о карточке", async () => {
    await me(STUDENT);
    await command("/progress", STUDENT);
    expect(await cardRow(STUDENT)).not.toBeNull();
    const res = await api("/api/me", { method: "DELETE", as: STUDENT }, env());
    expect(res.status).toBe(200);
    expect(await cardRow(STUDENT)).toBeNull();
  });
});

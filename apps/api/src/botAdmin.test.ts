// Раздел панели «Сообщения бота»: тексты из панели доходят до учеников, настройки отправки действуют.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BOT_TEXTS, BOT_TEXT_KEYS, type AdminBotResponse, type AdminBotSaveResponse } from "@milav/shared";
import { webhookSecret } from "./bot";
import type { Bindings } from "./env";
import { runDueReminders, setTelegramFetchForTests } from "./reminders";
import { TOKEN, api, ctx, resetHarness } from "./test-utils/harness";

const OWNER = 8101;
const STUDENT = 8102;
const APP = "https://app.example/";

let outbox: { method: string; chat_id?: number; text?: string; reply_markup?: any; [k: string]: unknown }[] = [];
let telegramOk = true;

beforeEach(() => {
  resetHarness();
  outbox = [];
  telegramOk = true;
  setTelegramFetchForTests(async (url, init) => {
    outbox.push({ method: url.split("/").pop()!, ...JSON.parse(String(init?.body)) });
    return telegramOk
      ? new Response(JSON.stringify({ ok: true, result: true }), { status: 200 })
      : new Response(JSON.stringify({ ok: false, error_code: 400, description: "Bad Request" }), { status: 400 });
  });
  vi.useFakeTimers({ toFake: ["Date"] });
  // Среда 14.10.2026, 12:00 по Иерусалиму.
  vi.setSystemTime(new Date("2026-10-14T09:00:00Z"));
});
afterEach(() => {
  setTelegramFetchForTests(null);
  vi.useRealTimers();
});

const env = (): Bindings => ({ ...ctx.env, ADMIN_IDS: `${OWNER}` });
const send = (path: string, as: number, body?: unknown, method = "PUT") =>
  api(path, { method, as, ...(body === undefined ? {} : { body: JSON.stringify(body), headers: { "Content-Type": "application/json" } }) }, env());
const list = async () => (await (await api("/api/admin/bot", { as: OWNER }, env())).json()) as AdminBotResponse;
const setText = (key: string, text: string, as = OWNER) => send(`/api/admin/bot/${encodeURIComponent(key)}`, as, { text });
const setConfig = (key: string, value: unknown) => send("/api/admin/config", OWNER, { key, value });
const webhook = async (update: object) => {
  const res = await api(
    "/api/bot/webhook",
    { method: "POST", body: JSON.stringify(update), headers: { "Content-Type": "application/json", "X-Telegram-Bot-Api-Secret-Token": await webhookSecret(TOKEN) } },
    env(),
  );
  expect(res.status).toBe(200);
  return (await res.json()) as any;
};
const msg = (text: string, from = STUDENT) =>
  webhook({ update_id: 2, message: { text, chat: { id: from, type: "private" }, from: { id: from, first_name: "Аня" } } });
const press = (data: string, from = STUDENT) => webhook({ update_id: 1, callback_query: { id: "cb1", data, from: { id: from, first_name: "Аня" } } });
const me = (as: number) => api("/api/me", { as }, env()).then((r) => r.json() as Promise<any>);
const row = (userId: number) => ctx.env.DB.prepare("SELECT * FROM reminders WHERE user_id = ?").bind(userId).first<any>();

describe("раздел «Сообщения бота»: доступ и список", () => {
  it("только администраторам", async () => {
    expect((await api("/api/admin/bot", { as: STUDENT }, env())).status).toBe(403);
    expect((await setText("start", "Привет", STUDENT)).status).toBe(403);
    expect((await send("/api/admin/bot/start", STUDENT, undefined, "DELETE")).status).toBe(403);
  });

  it("все тексты бота, по умолчанию исходные", async () => {
    const data = await list();
    expect(data.items.map((i) => i.key)).toEqual(BOT_TEXT_KEYS);
    expect(data.items.every((i) => i.isDefault && i.text === BOT_TEXTS[i.key].default)).toBe(true);
  });
});

describe("изменить, проверить, вернуть исходный", () => {
  it("сохраняет, пишет в журнал, «вернуть исходный» удаляет изменение", async () => {
    const res = await setText("start", "  Привет, {имя}! Учим иврит 👋  ");
    expect(res.status).toBe(200);
    const body = (await res.json()) as AdminBotSaveResponse;
    expect(body).toMatchObject({ changed: true, item: { key: "start", text: "Привет, {имя}! Учим иврит 👋", isDefault: false, updatedBy: OWNER } });
    expect(body.telegram).toBeUndefined();
    expect(((await (await setText("start", "Привет, {имя}! Учим иврит 👋")).json()) as AdminBotSaveResponse).changed).toBe(false);

    const reset = (await (await send("/api/admin/bot/start", OWNER, undefined, "DELETE")).json()) as AdminBotSaveResponse;
    expect(reset).toMatchObject({ changed: true, item: { isDefault: true, text: BOT_TEXTS.start.default } });
    const log = await ctx.env.DB.prepare("SELECT action, target FROM admin_log ORDER BY id").all<{ action: string; target: string }>();
    expect(log.results).toEqual([
      { action: "bot.text", target: "start" },
      { action: "bot.reset", target: "start" },
    ]);
  });

  it("текст, равный исходному, хранится как исходный", async () => {
    await setText("fallback", "Другое");
    await setText("fallback", BOT_TEXTS.fallback.default);
    expect((await list()).items.find((i) => i.key === "fallback")!.isDefault).toBe(true);
    expect(await ctx.env.DB.prepare("SELECT COUNT(*) AS n FROM bot_texts").first<{ n: number }>()).toEqual({ n: 0 });
  });

  it("неверные тексты отклоняются", async () => {
    const error = async (key: string, text: unknown) => {
      const res = await send(`/api/admin/bot/${encodeURIComponent(key)}`, OWNER, { text });
      expect(res.status).toBe(400);
      return ((await res.json()) as { error: string; name?: string });
    };
    expect(await error("start", "   ")).toMatchObject({ error: "text_empty" });
    expect(await error("start", 5)).toMatchObject({ error: "text_empty" });
    expect(await error("start", "Привет, {фамилия}")).toEqual({ error: "text_unknown_placeholder", name: "фамилия" });
    expect(await error("popup.skip", "Ок, {время}")).toMatchObject({ error: "text_unknown_placeholder" });
    expect(await error("help", "Скобка { без пары")).toMatchObject({ error: "text_bad_braces" });
    expect(await error("popup.off", "я".repeat(201))).toMatchObject({ error: "text_too_long" });
    expect(await error("button.open", "Две\nстроки")).toMatchObject({ error: "text_multiline" });
    expect((await send("/api/admin/bot/nope", OWNER, { text: "x" })).status).toBe(404);
  });
});

describe("тексты из панели доходят до учеников", () => {
  beforeEach(async () => {
    await setConfig("reminders", "all");
  });

  it("/start, /help, любое сообщение и кнопка под ними", async () => {
    await setText("start", "Привет, {имя}!");
    await setText("help", "Помощь для {имя}");
    await setText("fallback", "Пишите в приложении");
    await setText("button.open", "Учить");
    expect((await msg("/start")).text).toBe("Привет, Аня!");
    expect((await msg("/help")).text).toBe("Помощь для Аня");
    const other = await msg("шалом");
    expect(other.text).toBe("Пишите в приложении");
    expect(other.reply_markup.inline_keyboard[0][0].text).toBe("Учить");
  });

  it("/reminders, кнопки и всплывающие ответы", async () => {
    await me(STUDENT);
    await setText("remcmd.off", "Выкл. Включить на {время}?");
    await setText("button.enable", "Да, в {время}");
    await setText("popup.on", "Ура, жду в {время}");
    await setText("remcmd.on", "Вкл. в {время}");
    await setText("button.disable", "Стоп");
    await setText("popup.off", "Всё, молчу");

    const off = await msg("/reminders");
    expect(off.text).toBe("Выкл. Включить на 20:00?");
    expect(off.reply_markup.inline_keyboard[0][0]).toEqual({ text: "Да, в 20:00", callback_data: "rem:on" });
    expect((await press("rem:on")).text).toBe("Ура, жду в 20:00");
    const on = await msg("/reminders");
    expect(on.text).toBe("Вкл. в 20:00");
    expect(on.reply_markup.inline_keyboard[0][0]).toEqual({ text: "Стоп", callback_data: "rem:off" });
    expect((await press("rem:off")).text).toBe("Всё, молчу");
  });

  it("кнопки под ежедневным напоминанием", async () => {
    await me(STUDENT);
    expect((await send("/api/reminders", STUDENT, { enabled: true })).status).toBe(200);
    await setText("button.continue", "Вперёд");
    await setText("button.skip", "Не завтра");
    await setText("button.disable", "Хватит");
    outbox = [];
    await runDueReminders(env(), Date.parse("2026-10-14T17:00:00Z"), APP, () => 0);
    const keyboard = outbox[0]!.reply_markup.inline_keyboard;
    expect(keyboard[0][0].text).toBe("Вперёд");
    expect(keyboard[1].map((b: any) => b.text)).toEqual(["Не завтра", "Хватит"]);
  });

  it("все тексты «Напоминания включены» выключены: уходит запасной из панели", async () => {
    await ctx.env.DB.prepare("UPDATE reminder_texts SET enabled = 0 WHERE kind = 'enabled'").run();
    await setText("confirm.fallback", "Запасной: {имя}, в {время}");
    await me(STUDENT);
    outbox = [];
    expect((await send("/api/reminders", STUDENT, { enabled: true })).status).toBe(200);
    expect(outbox[0]!.text).toBe("Запасной: Тест, в 20:00");
  });
});

describe("профиль бота и меню команд уходят в Telegram сразу", () => {
  it("описание, короткое описание, команды; вернуть исходный тоже отправляет", async () => {
    let body = (await (await setText("profile.description", "Учим иврит")).json()) as AdminBotSaveResponse;
    expect(body.telegram).toBe("ok");
    expect(outbox.at(-1)).toMatchObject({ method: "setMyDescription", description: "Учим иврит" });
    body = (await (await setText("profile.short", "Иврит")).json()) as AdminBotSaveResponse;
    expect(outbox.at(-1)).toMatchObject({ method: "setMyShortDescription", short_description: "Иврит" });
    await setText("command.help", "Помощь");
    expect(outbox.at(-1)!.method).toBe("setMyCommands");
    expect(outbox.at(-1)!.commands).toEqual([
      { command: "start", description: BOT_TEXTS["command.start"].default },
      { command: "help", description: "Помощь" },
      { command: "reminders", description: BOT_TEXTS["command.reminders"].default },
    ]);
    body = (await (await send("/api/admin/bot/profile.description", OWNER, undefined, "DELETE")).json()) as AdminBotSaveResponse;
    expect(body.telegram).toBe("ok");
    expect(outbox.at(-1)).toMatchObject({ method: "setMyDescription", description: BOT_TEXTS["profile.description"].default });
  });

  it("Telegram не принял: текст сохранён, панель узнаёт об ошибке", async () => {
    telegramOk = false;
    const body = (await (await setText("profile.short", "Иврит")).json()) as AdminBotSaveResponse;
    expect(body).toMatchObject({ changed: true, telegram: "error", item: { text: "Иврит" } });
    expect((await list()).items.find((i) => i.key === "profile.short")!.text).toBe("Иврит");
  });
});

describe("«Прислать мне»", () => {
  it("сообщение приходит администратору с кнопками; кнопки и подсказки так не отправить", async () => {
    await me(OWNER);
    await setText("start", "Привет, {имя}!");
    const res = await send("/api/admin/bot/start/send", OWNER, {}, "POST");
    expect(((await res.json()) as any)).toMatchObject({ ok: true, sent: true, text: "Привет, Тест!" });
    const last = outbox.at(-1)!;
    expect(last).toMatchObject({ method: "sendMessage", chat_id: OWNER, text: "Привет, Тест!" });
    expect(last.reply_markup.inline_keyboard[0][0].web_app.url).toMatch(/\/$/);

    await send("/api/admin/bot/remcmd.off/send", OWNER, {}, "POST");
    expect(outbox.at(-1)!.text).toContain("20:00");
    expect(outbox.at(-1)!.reply_markup.inline_keyboard[0][0].callback_data).toBe("rem:on");
    expect((await send("/api/admin/bot/popup.off/send", OWNER, {}, "POST")).status).toBe(400);
    expect((await send("/api/admin/bot/button.open/send", OWNER, {}, "POST")).status).toBe(400);
  });
});

describe("настройки отправки", () => {
  beforeEach(async () => {
    await setConfig("reminders", "all");
  });

  it("время по умолчанию: в предложении приложения и в /reminders", async () => {
    expect((await setConfig("reminderMinute", 9 * 60)).status).toBe(200);
    expect((await me(STUDENT)).reminders.minute).toBe(540);
    expect((await msg("/reminders")).text).toContain("9:00");
    expect((await setConfig("reminderMinute", 9 * 60 + 5)).status).toBe(400);
  });

  it("пауза на шаббат: «Не останавливать» пишет и в субботу, другой час переносит начало", async () => {
    vi.setSystemTime(new Date("2026-10-15T18:00:00Z")); // четверг 21:00
    await me(STUDENT);
    expect((await setConfig("shabbatFrom", -1)).status).toBe(200);
    expect((await me(STUDENT)).reminders.shabbatFrom).toBeNull();
    expect((await send("/api/reminders", STUDENT, { enabled: true })).status).toBe(200);
    // Следующее напоминание в пятницу 20:00, хотя раньше было бы в воскресенье.
    expect(new Date((await row(STUDENT)).next_at * 1000).toISOString()).toBe("2026-10-16T17:00:00.000Z");
    outbox = [];
    await ctx.env.DB.prepare("UPDATE reminders SET next_at = ? WHERE user_id = ?").bind(Date.parse("2026-10-17T17:00:00Z") / 1000, STUDENT).run();
    expect(await runDueReminders(env(), Date.parse("2026-10-17T17:00:00Z"), APP, () => 0)).toMatchObject({ sent: 1 });

    // Пауза с 17:00 пятницы: напоминание в 20:00 пятницы уже не уходит.
    expect((await setConfig("shabbatFrom", 17 * 60)).status).toBe(200);
    expect((await me(STUDENT)).reminders.shabbatFrom).toBe(1020);
    await ctx.env.DB.prepare("UPDATE reminders SET next_at = ? WHERE user_id = ?").bind(Date.parse("2026-10-16T17:00:00Z") / 1000, STUDENT).run();
    expect(await runDueReminders(env(), Date.parse("2026-10-16T17:00:00Z"), APP, () => 0)).toMatchObject({ skipped: 1 });
    expect((await setConfig("shabbatFrom", 21 * 60)).status).toBe(400);
  });

  it("сколько раз и через сколько дней предлагать", async () => {
    expect((await setConfig("offerTimes", 0)).status).toBe(200);
    expect((await me(STUDENT)).reminders.offer).toBe(false);
    expect((await setConfig("offerTimes", 3)).status).toBe(200);
    expect((await setConfig("offerAgainDays", 1)).status).toBe(200);
    expect((await me(STUDENT)).reminders.offer).toBe(true);
    await send("/api/reminders", STUDENT, { dismissOffer: true });
    expect((await me(STUDENT)).reminders.offer).toBe(false);
    vi.setSystemTime(Date.now() + 86_400_000);
    expect((await me(STUDENT)).reminders.offer).toBe(true);
  });
});

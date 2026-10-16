import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { localEpochDay, type AdminRemindersResponse } from "@milav/shared";
import { webhookSecret } from "./bot";
import type { Bindings } from "./env";
import { OFFER_AGAIN_SECONDS, SEND_BATCH, runDueReminders, setTelegramFetchForTests } from "./reminders";
import { TOKEN, api, completeLesson, completeWord, ctx, lesson, resetHarness } from "./test-utils/harness";

const OWNER = 8001;
const STUDENT = 8002;
const APP = "https://app.example/";
const TZ = "Asia/Jerusalem";

/** Что бот отправил в Telegram, и что Telegram ответит на следующее сообщение. */
let outbox: { method: string; chat_id: number; text: string; reply_markup?: any }[] = [];
let reply: (body: any) => { status: number; json: object } = () => ({ status: 200, json: { ok: true, result: {} } });

beforeEach(() => {
  resetHarness();
  outbox = [];
  reply = () => ({ status: 200, json: { ok: true, result: {} } });
  setTelegramFetchForTests(async (url, init) => {
    const body = JSON.parse(String(init?.body));
    outbox.push({ method: url.split("/").pop()!, ...body });
    const r = reply(body);
    return new Response(JSON.stringify(r.json), { status: r.status });
  });
  vi.useFakeTimers({ toFake: ["Date"] });
  // Среда 14.10.2026, 12:00 по Иерусалиму.
  vi.setSystemTime(new Date("2026-10-14T09:00:00Z"));
});
afterEach(() => {
  setTelegramFetchForTests(null);
  vi.useRealTimers();
});

const env = (extra: Partial<Bindings> = {}): Bindings => ({ ...ctx.env, ADMIN_IDS: `${OWNER}`, ...extra });
const me = (as: number) => api("/api/me", { as }, env()).then((r) => r.json() as Promise<any>);
const putJson = (path: string, as: number, body: unknown, method = "PUT") =>
  api(path, { method, as, body: JSON.stringify(body), headers: { "Content-Type": "application/json" } }, env());
const setReminders = (as: number, body: unknown) => putJson("/api/reminders", as, body);
const setMode = (value: string) => putJson("/api/admin/config", OWNER, { key: "reminders", value });
const row = (userId: number) => ctx.env.DB.prepare("SELECT * FROM reminders WHERE user_id = ?").bind(userId).first<any>();
const run = (iso: string, random = () => 0) => runDueReminders(env(), Date.parse(iso), APP, random);
const blocked403 = () => ({ status: 403, json: { ok: false, error_code: 403, description: "Forbidden: bot was blocked by the user" } });

/** Ученик с включёнными напоминаниями в 20:00 (режим «Все»). */
async function subscribed(userId: number, minute = 1200) {
  await me(userId);
  expect((await setReminders(userId, { enabled: true, minute })).status).toBe(200);
  outbox = [];
}

describe("настройки ученика", () => {
  it("по умолчанию напоминания только для команды", async () => {
    expect((await me(STUDENT)).reminders).toBeUndefined();
    expect((await setReminders(STUDENT, { enabled: true })).status).toBe(403);
    expect((await me(OWNER)).reminders).toEqual({ enabled: false, minute: 1200, offer: true, blocked: false });
    await setMode("all");
    expect((await me(STUDENT)).reminders).toMatchObject({ enabled: false, offer: true });
  });

  it("включение присылает подтверждение с именем и временем и ставит следующее напоминание на сегодня 20:00", async () => {
    await me(OWNER);
    const res = await setReminders(OWNER, { enabled: true });
    expect(res.status).toBe(200);
    expect(((await res.json()) as any).reminders).toEqual({ enabled: true, minute: 1200, offer: false, blocked: false });
    expect(outbox).toHaveLength(1);
    expect(outbox[0]).toMatchObject({ method: "sendMessage", chat_id: OWNER });
    expect(outbox[0]!.text).toContain("Тест");
    expect(outbox[0]!.text).toContain("20:00");
    expect(outbox[0]!.reply_markup.inline_keyboard[0][0].web_app.url).toMatch(/\/\?from=reminder$/);
    const r = await row(OWNER);
    expect(new Date(r.next_at * 1000).toISOString()).toBe("2026-10-14T17:00:00.000Z");
    // Повторное включение второго подтверждения не шлёт.
    await setReminders(OWNER, { enabled: true });
    expect(outbox).toHaveLength(1);
  });

  it("бот заблокирован: напоминания не включаются, приложение узнаёт об этом", async () => {
    await me(OWNER);
    reply = blocked403;
    const res = await setReminders(OWNER, { enabled: true });
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ error: "bot_blocked", reminders: { enabled: false, blocked: true, offer: false } });
    // После «Старт» в боте можно включить снова.
    reply = () => ({ status: 200, json: { ok: true } });
    expect((await setReminders(OWNER, { enabled: true })).status).toBe(200);
    expect((await row(OWNER)).blocked).toBe(0);
  });

  it("«Не сейчас»: спросить снова через неделю, не больше двух раз", async () => {
    await me(OWNER);
    await setReminders(OWNER, { dismissOffer: true });
    expect((await me(OWNER)).reminders.offer).toBe(false);
    vi.setSystemTime(Date.now() + OFFER_AGAIN_SECONDS * 1000);
    expect((await me(OWNER)).reminders.offer).toBe(true);
    await setReminders(OWNER, { dismissOffer: true });
    vi.setSystemTime(Date.now() + OFFER_AGAIN_SECONDS * 3000);
    expect((await me(OWNER)).reminders.offer).toBe(false);
    // В «Настройках» включить можно всегда.
    expect((await setReminders(OWNER, { enabled: true })).status).toBe(200);
  });

  it("время и выключение; неверные запросы отклоняются", async () => {
    await subscribed(OWNER);
    expect((await setReminders(OWNER, { minute: 480 })).status).toBe(200);
    // 8:00 сегодня уже прошло (сейчас 12:00): следующее завтра в 8:00.
    expect(new Date((await row(OWNER)).next_at * 1000).toISOString()).toBe("2026-10-15T05:00:00.000Z");
    expect((await setReminders(OWNER, { enabled: false })).status).toBe(200);
    expect(await row(OWNER)).toMatchObject({ enabled: 0, next_at: null, minute: 480 });
    for (const bad of [{ minute: 1440 }, { minute: 7 }, { minute: "20:00" }, { enabled: "yes" }, { dismissOffer: false }, { other: 1 }, []]) {
      expect((await setReminders(OWNER, bad)).status).toBe(400);
    }
  });
});

describe("отправка по расписанию", () => {
  beforeEach(async () => {
    await setMode("all");
  });

  it("в 20:00 шлёт напоминание с кнопками, переносит на завтра и не повторяет текст", async () => {
    await subscribed(STUDENT);
    expect(await run("2026-10-14T16:50:00Z")).toMatchObject({ due: 0 });
    const summary = await run("2026-10-14T17:00:00Z", () => 0);
    expect(summary).toMatchObject({ due: 1, sent: 1 });
    expect(outbox).toHaveLength(1);
    const keyboard = outbox[0]!.reply_markup.inline_keyboard;
    expect(keyboard[0][0].web_app.url).toBe(`${APP}?from=reminder`);
    expect(keyboard[1].map((b: any) => b.callback_data)).toEqual(["rem:skip", "rem:off"]);
    const r = await row(STUDENT);
    expect(new Date(r.next_at * 1000).toISOString()).toBe("2026-10-15T17:00:00.000Z");
    const firstText = r.last_text_id;
    const counted = await ctx.env.DB.prepare("SELECT sent FROM reminder_texts WHERE id = ?").bind(firstText).first<{ sent: number }>();
    expect(counted?.sent).toBe(1);

    await run("2026-10-15T17:00:00Z", () => 0);
    expect((await row(STUDENT)).last_text_id).not.toBe(firstText);
  });

  it("сегодня уже занимался: молчит", async () => {
    await subscribed(STUDENT);
    await completeWord(STUDENT, lesson.words[0]!.id);
    expect(await run("2026-10-14T17:00:00Z")).toMatchObject({ due: 1, sent: 0, skipped: 1 });
    expect(outbox).toHaveLength(0);
    expect(new Date((await row(STUDENT)).next_at * 1000).toISOString()).toBe("2026-10-15T17:00:00.000Z");
  });

  it("шаббат: в пятницу вечером и в субботу не пишет", async () => {
    vi.setSystemTime(new Date("2026-10-15T18:00:00Z")); // четверг 21:00
    await subscribed(STUDENT);
    expect(new Date((await row(STUDENT)).next_at * 1000).toISOString()).toBe("2026-10-18T17:00:00.000Z");
    // Даже если время попало в шаббат (например, поменяли пояс), отправщик промолчит.
    await ctx.env.DB.prepare("UPDATE reminders SET next_at = ? WHERE user_id = ?").bind(Date.parse("2026-10-17T17:00:00Z") / 1000, STUDENT).run();
    expect(await run("2026-10-17T17:00:00Z")).toMatchObject({ sent: 0, skipped: 1 });
  });

  it("«Завтра не напоминать» и опоздавшее напоминание", async () => {
    await subscribed(STUDENT);
    const today = localEpochDay(TZ, Date.now());
    await ctx.env.DB.prepare("UPDATE reminders SET skip_day = ? WHERE user_id = ?").bind(today, STUDENT).run();
    expect(await run("2026-10-14T17:00:00Z")).toMatchObject({ sent: 0, skipped: 1 });
    // Таймер не работал 4 часа: вчерашнее напоминание не догоняем.
    await ctx.env.DB.prepare("UPDATE reminders SET skip_day = 0, next_at = ? WHERE user_id = ?").bind(Date.parse("2026-10-15T17:00:00Z") / 1000, STUDENT).run();
    expect(await run("2026-10-15T21:10:00Z")).toMatchObject({ sent: 0, skipped: 1 });
    expect(outbox).toHaveLength(0);
  });

  it("режим «Команда»: ученику не пишет, администратору пишет", async () => {
    await subscribed(STUDENT);
    await subscribed(OWNER);
    await setMode("team");
    expect(await run("2026-10-14T17:00:00Z")).toMatchObject({ due: 2, sent: 1, skipped: 1 });
    expect(outbox.map((m) => m.chat_id)).toEqual([OWNER]);
  });

  it("заблокировал бота: выключаем навсегда; Telegram просит подождать: остальных берём в следующий раз", async () => {
    await subscribed(STUDENT);
    await subscribed(STUDENT + 1);
    reply = blocked403;
    expect(await run("2026-10-14T17:00:00Z")).toMatchObject({ blocked: 2 });
    expect(await row(STUDENT)).toMatchObject({ enabled: 0, blocked: 1, next_at: null });
    expect((await me(STUDENT)).reminders).toMatchObject({ enabled: false, blocked: true, offer: false });

    reply = () => ({ status: 200, json: { ok: true } });
    await setReminders(STUDENT, { enabled: true });
    await setReminders(STUDENT + 1, { enabled: true });
    reply = () => ({ status: 429, json: { ok: false, error_code: 429, description: "Too Many Requests: retry after 5" } });
    outbox = [];
    expect(await run("2026-10-14T17:00:00Z")).toMatchObject({ due: 2, retry: 1, sent: 0 });
    expect(outbox).toHaveLength(1);
    // next_at не тронут: следующий запуск попробует снова.
    expect(new Date((await row(STUDENT + 1)).next_at * 1000).toISOString()).toBe("2026-10-14T17:00:00.000Z");
  });

  it(`за запуск не больше ${SEND_BATCH} сообщений`, async () => {
    for (let i = 0; i < SEND_BATCH + 2; i++) await subscribed(9000 + i);
    expect(await run("2026-10-14T17:00:00Z")).toMatchObject({ due: SEND_BATCH, sent: SEND_BATCH });
    expect(await run("2026-10-14T17:10:00Z")).toMatchObject({ due: 2, sent: 2 });
  });

  it("подстановки из прогресса: цель дня и путь к статусу", async () => {
    await subscribed(STUDENT);
    await ctx.env.DB.prepare("UPDATE reminder_texts SET enabled = 0 WHERE kind = 'daily' AND text NOT LIKE '%{осталось_слов} сл. до цели%'").run();
    await run("2026-10-14T17:00:00Z");
    expect(outbox[0]!.text).toMatch(/^Осталось 5 сл\. до цели дня/);
  });

  it("есть 5 слов к повторению: текст о повторении через раз; при выключенном повторении обычный", async () => {
    await subscribed(STUDENT);
    await completeLesson(STUDENT);
    // Слова выучены 10.10, сегодня ученик ещё не занимался.
    await ctx.env.DB.prepare("UPDATE word_progress SET completed_at = '2026-10-10 08:00:00' WHERE user_id = ?").bind(STUDENT).run();
    await ctx.env.DB.prepare("UPDATE user_stats SET last_day = last_day - 3 WHERE user_id = ?").bind(STUDENT).run();
    await run("2026-10-14T17:00:00Z", () => 0);
    expect(outbox[0]!.text).toContain("10 слов");
    await run("2026-10-15T17:00:00Z", () => 0);
    expect(outbox[1]!.text).not.toContain("слов ждут");
    expect(outbox[1]!.text).not.toMatch(/К повторению|в очереди/);
    await putJson("/api/admin/config", OWNER, { key: "repeat", value: "off" });
    await run("2026-10-18T17:00:00Z", () => 0);
    expect(outbox[2]!.text).not.toMatch(/10 слов|11 слов/);
  });

  it("открыл приложение в течение суток после напоминания: засчитывается тексту один раз", async () => {
    await subscribed(STUDENT);
    await run("2026-10-14T17:00:00Z");
    const textId = (await row(STUDENT)).last_text_id;
    vi.setSystemTime(new Date("2026-10-14T18:00:00Z"));
    await me(STUDENT);
    await me(STUDENT);
    const t = await ctx.env.DB.prepare("SELECT sent, opened FROM reminder_texts WHERE id = ?").bind(textId).first<any>();
    expect(t).toEqual({ sent: 1, opened: 1 });
  });
});

describe("кнопки и команда в чате", () => {
  const webhook = async (update: object) => {
    const res = await api(
      "/api/bot/webhook",
      { method: "POST", body: JSON.stringify(update), headers: { "Content-Type": "application/json", "X-Telegram-Bot-Api-Secret-Token": await webhookSecret(TOKEN) } },
      env(),
    );
    expect(res.status).toBe(200);
    return (await res.json()) as any;
  };
  const press = (data: string, from = STUDENT) => webhook({ update_id: 1, callback_query: { id: "cb1", data, from: { id: from, first_name: "A" } } });

  beforeEach(async () => {
    await setMode("all");
  });

  it("«Завтра не напоминать» и «Отключить»", async () => {
    await subscribed(STUDENT);
    const skip = await press("rem:skip");
    expect(skip).toMatchObject({ method: "answerCallbackQuery", callback_query_id: "cb1" });
    expect(skip.text).toContain("завтра не напомню");
    expect((await row(STUDENT)).skip_day).toBe(localEpochDay(TZ, Date.now()) + 1);
    const off = await press("rem:off");
    expect(off.text).toContain("отключены");
    expect(await row(STUDENT)).toMatchObject({ enabled: 0, next_at: null });
  });

  it("/reminders: включить из чата", async () => {
    await me(STUDENT);
    const msg = (text: string) => webhook({ update_id: 2, message: { text, chat: { id: STUDENT, type: "private" }, from: { id: STUDENT, first_name: "A" } } });
    const status = await msg("/reminders");
    expect(status.text).toContain("выключены");
    expect(status.reply_markup.inline_keyboard[0][0].callback_data).toBe("rem:on");
    const on = await press("rem:on");
    expect(on.text).toContain("20:00");
    expect((await row(STUDENT)).enabled).toBe(1);
    expect((await msg("/reminders")).reply_markup.inline_keyboard[0][0].callback_data).toBe("rem:off");
  });

  it("когда напоминания выключены в панели, кнопка «включить» не работает", async () => {
    await setMode("off");
    expect((await press("rem:on")).text).toContain("недоступны");
    expect(await row(STUDENT)).toBeNull();
  });
});

describe("раздел панели «Напоминания»", () => {
  const list = async (as = OWNER) => {
    const res = await api("/api/admin/reminders", { as }, env());
    expect(res.status).toBe(200);
    return (await res.json()) as AdminRemindersResponse;
  };
  const post = (path: string, body: unknown, as = OWNER) => putJson(path, as, body, "POST");

  it("только администраторам", async () => {
    expect((await api("/api/admin/reminders", { as: STUDENT }, env())).status).toBe(403);
    expect((await post("/api/admin/reminders", { kind: "daily", text: "x" }, STUDENT)).status).toBe(403);
  });

  it("первые тексты из миграции, подписчики", async () => {
    await setMode("all");
    await subscribed(STUDENT);
    const data = await list();
    // 8 текстов этапа 1 и 3 о повторении слов (миграция 0009).
    expect(data.texts.filter((t) => t.kind === "daily")).toHaveLength(11);
    expect(data.texts.filter((t) => t.text.includes("{к_повторению}"))).toHaveLength(3);
    expect(data.texts.filter((t) => t.kind === "enabled")).toHaveLength(1);
    expect(data.subscribers).toBe(1);
  });

  it("добавить, изменить, выключить, удалить; всё в журнале", async () => {
    const bad = await post("/api/admin/reminders", { kind: "daily", text: "Привет, {name}" });
    expect(bad.status).toBe(400);
    expect(await bad.json()).toEqual({ error: "text_unknown_placeholder", name: "name" });
    expect((await post("/api/admin/reminders", { kind: "weekly", text: "x" })).status).toBe(400);

    const created = (await (await post("/api/admin/reminders", { kind: "daily", text: "  Шалом, {имя}! " })).json()) as any;
    expect(created.item).toMatchObject({ kind: "daily", text: "Шалом, {имя}!", enabled: true, sent: 0, updatedBy: OWNER });
    const id = created.item.id;
    expect((await putJson(`/api/admin/reminders/${id}`, OWNER, { text: "Шалом!" })).status).toBe(200);
    expect((await putJson(`/api/admin/reminders/${id}`, OWNER, { enabled: false })).status).toBe(200);
    expect((await list()).texts.find((t) => t.id === id)).toMatchObject({ text: "Шалом!", enabled: false });
    expect((await putJson(`/api/admin/reminders/${id}`, OWNER, { text: "" })).status).toBe(400);
    expect((await putJson(`/api/admin/reminders/99999`, OWNER, { text: "a" })).status).toBe(404);
    expect((await api(`/api/admin/reminders/${id}`, { method: "DELETE", as: OWNER }, env())).status).toBe(200);
    expect((await list()).texts.some((t) => t.id === id)).toBe(false);

    const log = (await (await api("/api/admin/log", { as: OWNER }, env())).json()) as any;
    expect(log.entries.map((e: any) => e.action)).toEqual(["reminder.remove", "reminder.toggle", "reminder.edit", "reminder.add"]);
  });

  it("«Прислать мне»: текст приходит администратору с его данными, недостающее заполнено примером", async () => {
    const texts = (await list()).texts;
    const goal = texts.find((t) => t.text.includes("{осталось_слов} сл. до цели"))!;
    const res = await post(`/api/admin/reminders/${goal.id}/send`, {});
    expect(res.status).toBe(200);
    expect(outbox[0]).toMatchObject({ chat_id: OWNER });
    expect(outbox[0]!.text).toMatch(/^Осталось 5 сл\./);
    const status = texts.find((t) => t.text.includes("{до_статуса}"))!;
    await post(`/api/admin/reminders/${status.id}/send`, {});
    expect(outbox[1]!.text).toContain("Конь");
    // Статистика отправок от проверки не растёт.
    expect((await list()).texts.find((t) => t.id === goal.id)!.sent).toBe(0);
    reply = blocked403;
    expect((await post(`/api/admin/reminders/${goal.id}/send`, {})).status).toBe(409);
  });
});

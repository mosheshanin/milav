// Учёт рассылок (26.11.2026, docs/REMINDERS.md, «Учёт рассылок»): журнал напоминаний, контрольная группа, отчёт, метки запуска.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { inReminderControl, localEpochDay, type ReminderReport } from "@milav/shared";
import type { Bindings } from "./env";
import { runDueReminders, setTelegramFetchForTests } from "./reminders";
import { TOKEN, api, completeWord, ctx, lesson, resetHarness } from "./test-utils/harness";
import { signInitData } from "./test-utils/telegram";

const OWNER = 8001;
const APP = "https://app.example/";
const TZ = "Asia/Jerusalem";

let outbox: { chat_id: number; text: string }[] = [];

beforeEach(() => {
  resetHarness();
  outbox = [];
  setTelegramFetchForTests(async (_url, init) => {
    outbox.push(JSON.parse(String(init?.body)));
    return new Response(JSON.stringify({ ok: true, result: {} }), { status: 200 });
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
const me = (as: number, headers: Record<string, string> = {}) => api("/api/me", { as, headers }, env()).then((r) => r.json() as Promise<any>);
const putJson = (path: string, as: number, body: unknown) =>
  api(path, { method: "PUT", as, body: JSON.stringify(body), headers: { "Content-Type": "application/json" } }, env());
const setConfig = (key: string, value: unknown) => putJson("/api/admin/config", OWNER, { key, value });
const run = (iso: string) => runDueReminders(env(), Date.parse(iso), APP, () => 0);
const sends = (userId: number) =>
  ctx.env.DB.prepare("SELECT * FROM reminder_sends WHERE user_id = ? ORDER BY sent_at").bind(userId).all<any>().then((r) => r.results);
const report = (days = 30) => api(`/api/admin/reminders/report?days=${days}`, { as: OWNER }, env());

/** Ученики, у которых напоминание в этот день попадает (или нет) в контроль при 20%. */
function idsFor(day: number, control: boolean, count: number, from = 20_000): number[] {
  const ids: number[] = [];
  for (let id = from; ids.length < count; id++) if (inReminderControl(id, day, 20) === control) ids.push(id);
  return ids;
}
const WED = localEpochDay(TZ, Date.parse("2026-10-14T17:00:00Z"));

async function subscribed(userId: number) {
  await me(userId);
  expect((await putJson("/api/reminders", userId, { enabled: true })).status).toBe(200);
  outbox = [];
}

beforeEach(async () => {
  await setConfig("reminders", "all");
});

describe("журнал напоминаний", () => {
  it("отправленное напоминание: строка с группой текста; открытие и нажатие «Продолжить» отмечаются один раз", async () => {
    await setConfig("reminderControl", 0);
    const [id] = idsFor(WED, false, 1);
    await subscribed(id!);
    expect(await run("2026-10-14T17:00:00Z")).toMatchObject({ sent: 1, held: 0 });
    let [s] = await sends(id!);
    expect(s).toMatchObject({ text_id: expect.any(Number), clicked_at: null, opened_at: null, studied_at: null });
    expect(["joke", "progress", "repeat"]).toContain(s.grp);

    vi.setSystemTime(new Date("2026-10-14T17:30:00Z"));
    await me(id!);
    [s] = await sends(id!);
    expect(s.opened_at).toBe(Date.parse("2026-10-14T17:30:00Z") / 1000);
    expect(s.clicked_at).toBeNull();

    vi.setSystemTime(new Date("2026-10-14T17:40:00Z"));
    await me(id!, { "X-Launch-From": "reminder" });
    [s] = await sends(id!);
    expect(s.clicked_at).toBe(Date.parse("2026-10-14T17:40:00Z") / 1000);
    expect(s.opened_at).toBe(Date.parse("2026-10-14T17:30:00Z") / 1000);
  });

  it("занятие в течение суток отмечается, позже нет", async () => {
    await setConfig("reminderControl", 0);
    const [a, b] = idsFor(WED, false, 2);
    await subscribed(a!);
    await subscribed(b!);
    await run("2026-10-14T17:00:00Z");
    // a учится утром следующего дня (в пределах суток), b через двое суток.
    vi.setSystemTime(new Date("2026-10-15T06:00:00Z"));
    await completeWord(a!, lesson.words[0]!.id);
    await completeWord(a!, lesson.words[1]!.id);
    expect((await sends(a!))[0].studied_at).toBe(Date.parse("2026-10-15T06:00:00Z") / 1000);
    vi.setSystemTime(new Date("2026-10-16T06:00:00Z"));
    await completeWord(b!, lesson.words[0]!.id);
    expect((await sends(b!))[0].studied_at).toBeNull();
  });

  it("контрольная группа: сообщение не уходит, в журнале «контроль», следующее напоминание завтра; команду не касается", async () => {
    await setConfig("reminderControl", 20);
    const [held] = idsFor(WED, true, 1);
    await subscribed(held!);
    expect(await run("2026-10-14T17:00:00Z")).toMatchObject({ due: 1, sent: 0, held: 1 });
    expect(outbox).toHaveLength(0);
    expect(await sends(held!)).toMatchObject([{ grp: "control", text_id: null }]);
    const r = await ctx.env.DB.prepare("SELECT next_at, last_sent_at FROM reminders WHERE user_id = ?").bind(held).first<any>();
    expect(new Date(r.next_at * 1000).toISOString()).toBe("2026-10-15T17:00:00.000Z");
    expect(r.last_sent_at).toBe(0);
    // Открыл сам в течение суток: у контроля это тоже отмечается (с ним и сравниваем).
    vi.setSystemTime(new Date("2026-10-14T19:00:00Z"));
    await me(held!);
    expect((await sends(held!))[0].opened_at).not.toBeNull();

  });

  it("владельца контроль не касается, даже если его день выпал", async () => {
    await setConfig("reminderControl", 20);
    const ownerDay = Array.from({ length: 400 }, (_, i) => WED + i).find((d) => inReminderControl(OWNER, d, 20))!;
    vi.setSystemTime(new Date(ownerDay * 86_400_000 + 9 * 3_600_000));
    await subscribed(OWNER);
    const { next_at } = (await ctx.env.DB.prepare("SELECT next_at FROM reminders WHERE user_id = ?").bind(OWNER).first<{ next_at: number }>())!;
    expect(localEpochDay(TZ, next_at * 1000)).toBe(ownerDay);
    expect(await runDueReminders(env(), next_at * 1000, APP, () => 0)).toMatchObject({ sent: 1, held: 0 });
  });

  it("контроль 0: напоминания уходят всем", async () => {
    await setConfig("reminderControl", 0);
    const [id] = idsFor(WED, true, 1);
    await subscribed(id!);
    expect(await run("2026-10-14T17:00:00Z")).toMatchObject({ sent: 1, held: 0 });
  });

  it("«Удалить мои данные» удаляет журнал ученика", async () => {
    await setConfig("reminderControl", 0);
    const [id] = idsFor(WED, false, 1);
    await subscribed(id!);
    await run("2026-10-14T17:00:00Z");
    expect(await sends(id!)).toHaveLength(1);
    expect((await api("/api/me", { method: "DELETE", as: id }, env())).status).toBe(200);
    expect(await sends(id!)).toHaveLength(0);
  });
});

describe("отчёт в панели", () => {
  it("только администраторам; период 7, 30 или 90 дней", async () => {
    await me(OWNER);
    expect((await api("/api/admin/reminders/report", { as: 9999 }, env())).status).toBe(403);
    expect((await report(5)).status).toBe(400);
    expect((await report(7)).status).toBe(200);
  });

  it("сутки ещё идут: в «ожидании»; через сутки по группам, текстам и с контролем", async () => {
    await me(OWNER);
    await setConfig("reminderControl", 20);
    const sentIds = idsFor(WED, false, 3);
    const heldIds = idsFor(WED, true, 2);
    for (const id of [...sentIds, ...heldIds]) await subscribed(id);
    await run("2026-10-14T17:00:00Z");
    vi.setSystemTime(new Date("2026-10-14T18:00:00Z"));
    await me(sentIds[0]!, { "X-Launch-From": "reminder" });
    await completeWord(sentIds[0]!, lesson.words[0]!.id);
    await me(heldIds[0]!);

    let body = (await (await report()).json()) as ReminderReport;
    expect(body.pending).toBe(5);
    expect(body.sent.sends).toBe(0);

    vi.setSystemTime(new Date("2026-10-15T18:00:00Z"));
    body = (await (await report()).json()) as ReminderReport;
    expect(body.pending).toBe(0);
    expect(body.sent).toEqual({ sends: 3, clicked: 1, opened: 1, studied: 1 });
    expect(body.control).toEqual({ sends: 2, clicked: 0, opened: 1, studied: 0 });
    expect(body.lift).toBeNull(); // в контроле меньше 30
    expect(body.groups.find((g) => g.group === "control")).toMatchObject({ sends: 2 });
    expect(body.texts.reduce((n, t) => n + t.sends, 0)).toBe(3);
  });
});

describe("откуда пришёл ученик", () => {
  const tma = (id: number, startParam?: string) => ({
    Authorization: `tma ${signInitData(TOKEN, { id, first_name: "Тест" }, undefined, startParam === undefined ? {} : { start_param: startParam })}`,
  });
  const source = (id: number) => ctx.env.DB.prepare("SELECT source FROM users WHERE id = ?").bind(id).first<{ source: string | null }>().then((r) => r?.source);

  it("метка ссылки запуска пишется при первом входе и потом не меняется; без метки пусто", async () => {
    await api("/api/me", { headers: tma(30_001, "post-20261126") }, env());
    expect(await source(30_001)).toBe("post-20261126");
    await api("/api/me", { headers: tma(30_001, "other") }, env());
    expect(await source(30_001)).toBe("post-20261126");
    await api("/api/me", { headers: tma(30_002) }, env());
    expect(await source(30_002)).toBe("");
    await api("/api/me", { headers: tma(30_003, "bad label!") }, env());
    expect(await source(30_003)).toBe("");
  });

  it("в отчёте новые ученики по меткам", async () => {
    await me(OWNER);
    await api("/api/me", { headers: tma(30_011, "post-1") }, env());
    await api("/api/me", { headers: tma(30_012, "post-1") }, env());
    await api("/api/me", { headers: tma(30_013) }, env());
    const body = (await (await report()).json()) as ReminderReport;
    expect(body.sources).toContainEqual({ source: "post-1", users: 2, learned: 0, returned: 0 });
    expect(body.sources.find((s) => s.source === "")?.users).toBeGreaterThanOrEqual(2);
  });
});

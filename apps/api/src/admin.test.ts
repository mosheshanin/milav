import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ADMIN_LOG_PAGE, MAX_STAFF, epochDayToIso, type AdminConfigResponse, type AdminLogResponse, type AdminOverviewResponse, type AdminTeamResponse } from "@milav/shared";
import { CACHE_SECONDS, dropAdminCache, ownerIds, parseIds } from "./admin";
import { OVERVIEW_DAYS, dayStartMs, todayDay } from "./adminStats";
import type { Bindings } from "./env";
import { api, completeWord, ctx, lesson, meOf, resetHarness } from "./test-utils/harness";

const OWNER = 9001;
const ADMIN = 9002;
const REVIEWER = 9003;
const STUDENT = 9004;

beforeEach(resetHarness);
afterEach(() => vi.useRealTimers());

/** Окружение, где OWNER владелец (новое имя секрета). */
const env = (extra: Partial<Bindings> = {}): Bindings => ({ ...ctx.env, ADMIN_IDS: `${OWNER}`, ...extra });

const call = (path: string, as: number, init: RequestInit = {}, e = env()) => api(path, { ...init, as }, e);
const put = (path: string, as: number, body: unknown, e = env()) =>
  call(path, as, { method: "PUT", body: JSON.stringify(body), headers: { "Content-Type": "application/json" } }, e);
const getJson = async <T>(path: string, as = OWNER, e = env()) => {
  const res = await call(path, as, {}, e);
  expect(res.status).toBe(200);
  return (await res.json()) as T;
};
const me = (as: number, e = env()) => api("/api/me", { as }, e).then((r) => r.json() as Promise<any>);

async function addStaff(userId: number, role: "admin" | "reviewer", as = OWNER) {
  const res = await put("/api/admin/team", as, { userId, role });
  expect(res.status).toBe(200);
  return res.json() as Promise<{ changed: boolean }>;
}

const config = async () => (await getJson<AdminConfigResponse>("/api/admin/config")).items;
const setConfig = (key: string, value: unknown, as = OWNER) => put("/api/admin/config", as, { key, value });
const log = async (query = "") => getJson<AdminLogResponse>(`/api/admin/log${query}`);

describe("роли", () => {
  it("владелец задаётся любым из двух секретов", () => {
    expect([...ownerIds({ ...ctx.env, ADMIN_IDS: "1, 2", TEMPLATE_RECORDER_IDS: "2;3" })].sort()).toEqual([1, 2, 3]);
    expect(ownerIds(ctx.env).size).toBe(0);
    expect([...parseIds("1, 2;3\n4,,x,5.5,-6")].sort()).toEqual([1, 2, 3, 4]);
  });

  it("/api/me сообщает роль только команде", async () => {
    expect((await me(OWNER)).staff).toEqual({ role: "admin", owner: true });
    expect((await me(OWNER, { ...ctx.env, TEMPLATE_RECORDER_IDS: `${OWNER}` })).staff).toEqual({ role: "admin", owner: true });
    expect((await me(STUDENT)).staff).toBeUndefined();
    await addStaff(REVIEWER, "reviewer");
    expect((await me(REVIEWER)).staff).toEqual({ role: "reviewer", owner: false });
  });

  it("панель: без входа 401, ученику и проверяющему 403, администраторам 200", async () => {
    expect((await api("/api/admin/overview", {}, env())).status).toBe(401);
    expect((await call("/api/admin/overview", STUDENT)).status).toBe(403);
    await addStaff(REVIEWER, "reviewer");
    expect((await call("/api/admin/config", REVIEWER)).status).toBe(403);
    expect((await call("/api/admin/overview", OWNER)).status).toBe(200);
    await addStaff(ADMIN, "admin");
    expect((await call("/api/admin/team", ADMIN)).status).toBe(200);
    // Без секрета владельца панели нет ни у кого из «владельцев».
    expect((await call("/api/admin/overview", OWNER, {}, ctx.env)).status).toBe(403);
  });

  it("запись шаблонов открыта администраторам, а не проверяющим", async () => {
    await addStaff(ADMIN, "admin");
    await addStaff(REVIEWER, "reviewer");
    expect((await call("/api/templates", ADMIN)).status).toBe(200);
    expect((await call("/api/templates", REVIEWER)).status).toBe(403);
    expect((await call("/api/templates", STUDENT)).status).toBe(403);
  });
});

describe("команда", () => {
  it("добавить, поменять роль, убрать; каждое действие в журнале", async () => {
    await meOf(ADMIN); // человек уже открывал приложение: его имя видно в списке
    expect(await addStaff(ADMIN, "reviewer")).toMatchObject({ changed: true });
    expect(await addStaff(ADMIN, "reviewer")).toMatchObject({ changed: false });
    expect(await addStaff(ADMIN, "admin")).toMatchObject({ changed: true });

    const team = await getJson<AdminTeamResponse>("/api/admin/team");
    expect(team.members.map((m) => [m.userId, m.role, m.owner])).toEqual([
      [OWNER, "admin", true],
      [ADMIN, "admin", false],
    ]);
    expect(team.members[1]!.name).toBe("Тест");
    expect(team.members[1]!.addedBy).toBe(OWNER);

    expect((await call(`/api/admin/team?userId=${ADMIN}`, OWNER, { method: "DELETE" })).status).toBe(200);
    expect((await call(`/api/admin/team?userId=${ADMIN}`, OWNER, { method: "DELETE" })).status).toBe(404);
    expect((await me(ADMIN)).staff).toBeUndefined();

    const entries = (await log()).entries;
    expect(entries.map((e) => [e.action, e.target, e.oldValue, e.newValue])).toEqual([
      ["staff.remove", `${ADMIN}`, "admin", null],
      ["staff.change", `${ADMIN}`, "reviewer", "admin"],
      ["staff.add", `${ADMIN}`, null, "reviewer"],
    ]);
    expect(entries[0]!.actor).toBe(OWNER);
  });

  it("владельца и себя изменить нельзя", async () => {
    await addStaff(ADMIN, "admin");
    expect((await put("/api/admin/team", ADMIN, { userId: OWNER, role: "reviewer" })).status).toBe(409);
    expect((await call(`/api/admin/team?userId=${OWNER}`, ADMIN, { method: "DELETE" })).status).toBe(409);
    expect((await put("/api/admin/team", ADMIN, { userId: ADMIN, role: "reviewer" })).status).toBe(409);
    expect((await call(`/api/admin/team?userId=${ADMIN}`, ADMIN, { method: "DELETE" })).status).toBe(409);
    // Владелец остаётся администратором, даже если кто-то вписал его в базу проверяющим.
    await ctx.env.DB.prepare("INSERT INTO staff (user_id, role, added_by, added_at) VALUES (?, 'reviewer', 1, 1)").bind(OWNER).run();
    dropAdminCache(ctx.env.DB);
    expect((await me(OWNER)).staff).toEqual({ role: "admin", owner: true });
  });

  it("неверные id и роли отклоняются", async () => {
    for (const body of [{ userId: "abc", role: "admin" }, { userId: -5, role: "admin" }, { userId: 1.5, role: "admin" }, {}]) {
      expect((await put("/api/admin/team", OWNER, body)).status).toBe(400);
    }
    expect((await put("/api/admin/team", OWNER, { userId: 5, role: "owner" })).status).toBe(400);
    expect((await call("/api/admin/team?userId=x", OWNER, { method: "DELETE" })).status).toBe(400);
    expect((await put("/api/admin/team", OWNER, { userId: "123", role: "reviewer" })).status).toBe(200);
  });

  it("добавленный администратор видит панель сразу, а другой экземпляр Worker не дольше минуты", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-15T12:00:00Z"));
    expect((await call("/api/admin/overview", ADMIN)).status).toBe(403);
    // Как будто роль добавил другой экземпляр: запись в базу мимо кэша этого экземпляра.
    await ctx.env.DB.prepare("INSERT INTO staff (user_id, role, added_by, added_at) VALUES (?, 'admin', ?, 1)").bind(ADMIN, OWNER).run();
    expect((await call("/api/admin/overview", ADMIN)).status).toBe(403);
    vi.setSystemTime(new Date(Date.now() + CACHE_SECONDS * 1000));
    expect((await call("/api/admin/overview", ADMIN)).status).toBe(200);
  });
});

describe("настройки приложения", () => {
  it("по умолчанию таблица лидеров берётся из LEADERBOARD_ENABLED, цель дня 5", async () => {
    expect(await config()).toEqual([
      { key: "leaderboard", value: "off", isDefault: true, updatedAt: null, updatedBy: null },
      { key: "reminders", value: "team", isDefault: true, updatedAt: null, updatedBy: null },
      { key: "defaultDailyGoal", value: 5, isDefault: true, updatedAt: null, updatedBy: null },
    ]);
    const on = env({ LEADERBOARD_ENABLED: "1" });
    expect((await getJson<AdminConfigResponse>("/api/admin/config", OWNER, on)).items[0]!.value).toBe("all");
  });

  it("таблица лидеров: выкл, только команда, все", async () => {
    await addStaff(REVIEWER, "reviewer");
    const board = (as: number) => call("/api/leaderboard?board=week", as);
    const join = (as: number) => put("/api/settings", as, { leaderboard: true });

    expect((await board(STUDENT)).status).toBe(404);
    expect((await setConfig("leaderboard", "team")).status).toBe(200);
    expect((await me(STUDENT)).play.features.leaderboard).toBe(false);
    expect((await board(STUDENT)).status).toBe(404);
    expect((await join(STUDENT)).status).toBe(403);
    expect((await me(REVIEWER)).play.features.leaderboard).toBe(true);
    expect((await board(REVIEWER)).status).toBe(200);
    expect((await join(OWNER)).status).toBe(200);

    expect((await setConfig("leaderboard", "all")).status).toBe(200);
    expect((await me(STUDENT)).play.features.leaderboard).toBe(true);
    expect((await board(STUDENT)).status).toBe(200);

    // Значение из панели главнее переменной.
    expect((await setConfig("leaderboard", "off")).status).toBe(200);
    expect((await me(STUDENT, env({ LEADERBOARD_ENABLED: "1" }))).play.features.leaderboard).toBe(false);

    const items = await config();
    expect(items[0]).toMatchObject({ value: "off", isDefault: false, updatedBy: OWNER });
    expect((await log()).entries.filter((e) => e.action === "config.set").map((e) => [e.oldValue, e.newValue])).toEqual([
      ["all", "off"],
      ["team", "all"],
      ["off", "team"],
    ]);
  });

  it("то же значение не пишется в журнал, неверное отклоняется", async () => {
    const res = await setConfig("leaderboard", "off");
    expect(await res.json()).toMatchObject({ changed: false });
    expect((await log()).entries).toEqual([]);
    expect((await setConfig("leaderboard", "maybe")).status).toBe(400);
    expect((await setConfig("defaultDailyGoal", 7)).status).toBe(400);
    expect((await setConfig("defaultDailyGoal", "5")).status).toBe(400);
    expect((await setConfig("unknown", 1)).status).toBe(400);
    expect((await setConfig("__proto__", 1)).status).toBe(400);
    expect((await setConfig("leaderboard", "all", STUDENT)).status).toBe(403);
  });

  it("испорченное значение в базе заменяется значением по умолчанию", async () => {
    await ctx.env.DB.prepare("INSERT INTO app_config (key, value, updated_by, updated_at) VALUES ('leaderboard', '{oops', 1, 1)").run();
    expect((await config())[0]).toMatchObject({ value: "off" });
  });

  it("цель дня по умолчанию действует только для новых учеников", async () => {
    await me(STUDENT);
    expect((await setConfig("defaultDailyGoal", 10)).status).toBe(200);
    expect((await me(STUDENT)).play.settings.dailyGoal).toBe(5);
    expect((await me(STUDENT + 100)).play.settings.dailyGoal).toBe(10);
    // Новичок, который сразу пришёл в урок (без /api/me), получает ту же цель.
    await completeWord(STUDENT + 200, lesson.words[0]!.id);
    expect((await me(STUDENT + 200)).play.settings.dailyGoal).toBe(10);
  });

  it("команда не больше MAX_STAFF, журнал листается страницами", async () => {
    for (let i = 0; i < MAX_STAFF; i++) await addStaff(100 + i, "reviewer");
    expect((await put("/api/admin/team", OWNER, { userId: 99, role: "reviewer" })).status).toBe(409);
    for (let i = 0; i < 3; i++) await addStaff(100 + i, "admin"); // смена роли не упирается в предел
    const first = await log();
    expect(first.entries).toHaveLength(ADMIN_LOG_PAGE);
    expect(first.entries[0]!.action).toBe("staff.change");
    const second = await log(`?before=${first.nextBefore}`);
    expect(second.entries).toHaveLength(MAX_STAFF + 3 - ADMIN_LOG_PAGE);
    expect(second.entries.at(-1)).toMatchObject({ action: "staff.add", target: "100" });
    expect(second.nextBefore).toBeNull();
  });
});

describe("обзор", () => {
  it("день по Иерусалиму начинается в местную полночь (лето и зима)", () => {
    const day = (iso: string) => Date.parse(`${iso}T12:00:00Z`) / 86_400_000;
    expect(new Date(dayStartMs(Math.floor(day("2026-10-15")))).toISOString()).toBe("2026-10-14T21:00:00.000Z");
    expect(new Date(dayStartMs(Math.floor(day("2026-12-01")))).toISOString()).toBe("2026-11-30T22:00:00.000Z");
  });

  it("сегодня, неделя и сохранённые прошедшие дни", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-15T09:00:00Z"));
    const today = todayDay(Date.now());

    // Вчера: один ученик пришёл, открывал приложение и выучил слово.
    const db = ctx.env.DB;
    await db.prepare("INSERT INTO users (id, first_name, created_at) VALUES (1, 'A', '2026-10-14 10:00:00')").run();
    await db.prepare("INSERT INTO activity_days (day, user_id) VALUES (?, 1)").bind(today - 1).run();
    await db
      .prepare("INSERT INTO word_progress (user_id, word_id, lesson_id, completed_at) VALUES (1, 'w', 'l', '2026-10-14 10:30:00')")
      .run();
    // Сегодня по Иерусалиму (21:30 UTC вчера это уже 15.10 в Израиле): новый ученик открывал приложение
    // и сдал викторину. Он же открывал приложение вчера: за неделю это один человек, а не два.
    await db.prepare("INSERT INTO users (id, first_name, created_at) VALUES (2, 'B', '2026-10-14 21:30:00')").run();
    await db.prepare("INSERT INTO activity_days (day, user_id) VALUES (?, 2), (?, 2)").bind(today, today - 1).run();
    await db
      .prepare("INSERT INTO quiz_attempts (user_id, lesson_id, correct, total, passed, created_at) VALUES (2, 'l', 25, 25, 1, '2026-10-15 08:00:00'), (2, 'l', 1, 25, 0, '2026-10-15 08:10:00')")
      .run();
    // Ученик 3 пришёл 8 дней назад: прошлая неделя.
    await db.prepare("INSERT INTO users (id, first_name, created_at) VALUES (3, 'C', '2026-10-07 10:00:00')").run();
    await db.prepare("INSERT INTO activity_days (day, user_id) VALUES (?, 3)").bind(today - 8).run();

    const o = await getJson<AdminOverviewResponse>("/api/admin/overview", OWNER, env());
    expect(o.today).toEqual({ date: "2026-10-15", newUsers: 1, active: 1, learned: 0, quizzesPassed: 1 });
    expect(o.days).toHaveLength(OVERVIEW_DAYS);
    expect(o.days[0]).toEqual({ date: "2026-10-14", newUsers: 1, active: 2, learned: 1, quizzesPassed: 0 });
    expect(o.days[7]).toEqual({ date: "2026-10-07", newUsers: 1, active: 1, learned: 0, quizzesPassed: 0 });
    expect(o.week).toEqual({ newUsers: 2, active: 2, learned: 1, quizzesPassed: 1 });
    expect(o.prevWeek).toEqual({ newUsers: 1, active: 1, learned: 0, quizzesPassed: 0 });
    expect(o.totalUsers).toBe(3); // владельца в users нет: запись создаёт только /api/me
    expect(o.activeSince).toBe(epochDayToIso(today - 8));

    // Прошедшие дни посчитаны один раз и сохранены: следующее открытие их не пересчитывает.
    const stored = await db.prepare("SELECT COUNT(*) AS n FROM daily_stats").first<{ n: number }>();
    expect(stored?.n).toBe(OVERVIEW_DAYS);
    await db.prepare("DELETE FROM word_progress").run();
    expect((await getJson<AdminOverviewResponse>("/api/admin/overview")).days[0]!.learned).toBe(1);

    // Повторное открытие приложения в тот же день не добавляет строку посещений.
    await me(OWNER);
    await me(OWNER);
    const visits = await db.prepare("SELECT COUNT(*) AS n FROM activity_days WHERE day = ? AND user_id = ?").bind(today, OWNER).first<{ n: number }>();
    expect(visits?.n).toBe(1);
  });
});

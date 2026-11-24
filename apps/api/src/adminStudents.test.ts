// Разделы панели «Аналитика» и «Ученики» (24.11.2026, docs/ADMIN.md).
import { beforeEach, describe, expect, it } from "vitest";
import { epochDayToIso, weekStartDay, type AdminAnalyticsResponse, type AdminStudentResponse, type AdminStudentsResponse } from "@milav/shared";
import { HARD_MIN_ASKED, hardestOf, retentionOf } from "./adminAnalytics";
import { STUDENTS_PAGE, studentFilter } from "./adminStudents";
import type { Bindings } from "./env";
import { api, completeLesson, ctx, lesson, playQuiz, resetHarness, startQuiz } from "./test-utils/harness";

const OWNER = 9001;
beforeEach(resetHarness);

const env = (): Bindings => ({ ...ctx.env, ADMIN_IDS: `${OWNER}` });
const getJson = async <T>(path: string, as = OWNER) => {
  const res = await api(path, { as }, env());
  expect(res.status, path).toBe(200);
  return (await res.json()) as T;
};
const put = (path: string, as: number, body: unknown) =>
  api(path, { as, method: "PUT", body: JSON.stringify(body), headers: { "Content-Type": "application/json" } }, env());

describe("доступ", () => {
  it("ученику разделы недоступны", async () => {
    await api("/api/me", { as: 5 }, env());
    for (const path of ["/api/admin/analytics", "/api/admin/students", "/api/admin/students/5"]) {
      expect((await api(path, { as: 5 }, env())).status, path).toBe(403);
    }
  });
});

describe("удержание", () => {
  // Неделя начинается с воскресенья: берём неделю, где «сегодня» среда.
  const sunday = weekStartDay(2900);
  const today = sunday + 3;

  it("доля вернувшихся через N дней и позже; кому рано, тех не считаем", () => {
    const users = [
      { createdDay: sunday - 7, lastDay: sunday - 7 }, // прошлая неделя, не вернулся
      { createdDay: sunday - 7, lastDay: sunday }, // вернулся через 7 дней
      { createdDay: sunday - 6, lastDay: sunday - 5 }, // вернулся через 1 день
      { createdDay: sunday, lastDay: sunday + 1 }, // эта неделя
      { createdDay: sunday + 3, lastDay: null }, // пришёл сегодня
    ];
    const [thisWeek, lastWeek] = retentionOf(users, today, sunday - 30);
    expect(thisWeek).toEqual({ week: epochDayToIso(sunday), size: 2, d1: 1, d7: null, d30: null });
    expect(lastWeek!.size).toBe(3);
    expect(lastWeek!.d1).toBeCloseTo(2 / 3);
    // Через 7 дней: всем троим 7 дней уже прошло (сегодня среда), вернулся только второй.
    expect(lastWeek!.d7).toBeCloseTo(1 / 3);
    expect(lastWeek!.d30).toBeNull();
  });

  it("недели до появления посещений не показываются, без посещений удержания нет", () => {
    expect(retentionOf([], today, null)).toEqual([]);
    expect(retentionOf([], today, sunday - 1).map((c) => c.week)).toEqual([epochDayToIso(sunday), epochDayToIso(sunday - 7)]);
  });
});

describe("трудные слова", () => {
  it("по доле ошибок, мало спрошенные не попадают, безошибочные тоже", () => {
    const word = lesson.words[0]!.id;
    const other = lesson.words[1]!.id;
    const list = hardestOf(
      [
        { itemId: word, type: "hear-ru", asked: 10, correct: 5 },
        { itemId: other, type: "speak", asked: 10, correct: 2 },
        { itemId: word, type: "write", asked: HARD_MIN_ASKED - 1, correct: 0 },
        { itemId: other, type: "he-ru", asked: 20, correct: 20 },
      ],
      10,
    );
    expect(list.map((h) => [h.itemId, h.questionType])).toEqual([
      [other, "speak"],
      [word, "hear-ru"],
    ]);
    expect(list[0]!.he).toBe(lesson.words[1]!.he);
    expect(list[0]!.questionTitle).toBe("Произнеси слово на иврите");
  });
});

describe("GET /api/admin/analytics", () => {
  it("воронка и уроки по настоящим данным", async () => {
    await api("/api/me", { as: 1 }, env());
    await completeLesson(2);
    await playQuiz(2, await startQuiz(2));
    const data = await getJson<AdminAnalyticsResponse>("/api/admin/analytics");
    const steps = Object.fromEntries(data.funnel.map((s) => [s.key, s.users]));
    expect(steps.joined).toBeGreaterThanOrEqual(2);
    expect(steps.firstItem).toBe(1);
    expect(steps.firstQuiz).toBe(1);
    expect(steps.firstPassed).toBe(1);
    expect(steps.fivePassed).toBe(0);
    const row = data.lessons.find((l) => l.lessonId === lesson.id)!;
    expect(row).toMatchObject({ started: 1, learnedAll: 1, attempts: 1, passedAttempts: 1, passedUsers: 1, avgPercent: 100 });
    expect(row.title).toContain(lesson.title);
    expect(data.speech.asked).toBeGreaterThan(0);
    expect(data.hardMinAsked).toBe(HARD_MIN_ASKED);
  });
});

describe("ученики", () => {
  it("поиск: число как id, текст как часть имени; спецсимволы экранируются", () => {
    expect(studentFilter("")).toEqual({ where: "", params: [] });
    expect(studentFilter(" 12345 ").params).toEqual([12345]);
    expect(studentFilter("@anna").params).toEqual(["%anna%"]);
    expect(studentFilter("50%_off").params).toEqual(["%50\\%\\_off%"]);
  });

  it("список, поиск и карточка", async () => {
    await api("/api/me", { as: 11 }, env());
    await completeLesson(12);
    await playQuiz(12, await startQuiz(12));
    const all = await getJson<AdminStudentsResponse>("/api/admin/students");
    expect(all.total).toBeGreaterThanOrEqual(2);
    expect(all.nextOffset).toBeNull();
    const byId = await getJson<AdminStudentsResponse>("/api/admin/students?q=12");
    expect(byId.items.map((s) => s.id)).toEqual([12]);
    expect(byId.items[0]).toMatchObject({ passedLessons: 1, statusName: "Пешка", banned: false });

    const card = await getJson<AdminStudentResponse>("/api/admin/students/12");
    expect(card.lessons.map((l) => l.lessonId)).toEqual([lesson.id]);
    expect(card.attempts[0]).toMatchObject({ lessonId: lesson.id, passed: true });
    expect(card.progress.words).toBe(lesson.words.length);
    expect(card.badges.length).toBeGreaterThan(0);
    expect(card.staffRole).toBeNull();
    expect((await api("/api/admin/students/777", { as: OWNER }, env())).status).toBe(404);
  });

  it("страницы по 30", async () => {
    for (let i = 0; i < STUDENTS_PAGE + 2; i++) {
      await ctx.env.DB.prepare("INSERT INTO users (id, first_name) VALUES (?, ?)").bind(100 + i, `Ученик ${i}`).run();
    }
    const first = await getJson<AdminStudentsResponse>("/api/admin/students");
    expect(first.items).toHaveLength(STUDENTS_PAGE);
    expect(first.nextOffset).toBe(STUDENTS_PAGE);
    const second = await getJson<AdminStudentsResponse>(`/api/admin/students?offset=${first.nextOffset}`);
    expect(second.items.length).toBeGreaterThan(0);
    expect(new Set([...first.items, ...second.items].map((s) => s.id)).size).toBe(first.items.length + second.items.length);
  });

  it("убрать из таблицы лидеров и вернуть, с записью в журнал", async () => {
    await completeLesson(21);
    const res = await put("/api/admin/students/21/leaderboard", OWNER, { banned: true });
    expect(await res.json()).toEqual({ ok: true, changed: true });
    expect((await ctx.env.DB.prepare("SELECT lb_banned AS b FROM user_stats WHERE user_id = 21").first<{ b: number }>())!.b).toBe(1);
    expect(await (await put("/api/admin/students/21/leaderboard", OWNER, { banned: true })).json()).toEqual({ ok: true, changed: false });
    await put("/api/admin/students/21/leaderboard", OWNER, { banned: false });
    const log = await ctx.env.DB.prepare("SELECT COUNT(*) AS n FROM admin_log WHERE action = 'student.leaderboard' AND target = '21'").first<{ n: number }>();
    expect(log!.n).toBe(2);
    expect((await put("/api/admin/students/21/leaderboard", OWNER, { banned: "да" })).status).toBe(400);
    expect((await put("/api/admin/students/999/leaderboard", OWNER, { banned: true })).status).toBe(404);
  });
});

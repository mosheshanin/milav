import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { lessons } from "@milav/content";
import {
  REPEAT_INTERVALS,
  REPEAT_LAST_BOX,
  REPEAT_SESSION_SIZE,
  localEpochDay,
  wordLetters,
  type HomeResponse,
  type MyWordsResponse,
  type RepeatAnswerResponse,
  type RepeatSessionResponse,
} from "@milav/shared";
import type { Bindings } from "./env";
import { buildRepeatSession, countDueForReminders, loadLearned } from "./repeat";
import { ensureStats, loadStats, metricsOf } from "./stats";
import { api, completeAlphabetLesson, completeLesson, ctx, lesson, resetHarness, statsRow } from "./test-utils/harness";

const OWNER = 9001;
const STUDENT = 9002;
const TZ = "Asia/Jerusalem";
// Среда 14.10.2026, 12:00 по Иерусалиму.
const NOW = "2026-10-14T09:00:00Z";
const TODAY = localEpochDay(TZ, Date.parse(NOW));

beforeEach(() => {
  resetHarness();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(NOW));
});
afterEach(() => vi.useRealTimers());

const env = (): Bindings => ({ ...ctx.env, ADMIN_IDS: `${OWNER}` });
const get = async <T>(path: string, as: number) => {
  const res = await api(path, { as }, env());
  return { status: res.status, body: (await res.json()) as T };
};
const answer = async (as: number, body: Record<string, unknown>) => {
  const res = await api(
    "/api/repeat/answer",
    { method: "POST", as, body: JSON.stringify(body), headers: { "Content-Type": "application/json" } },
    env(),
  );
  return { status: res.status, body: (await res.json()) as RepeatAnswerResponse & { error?: string; dueIn?: number } };
};
const setMode = (value: string) =>
  api("/api/admin/config", { method: "PUT", as: OWNER, body: JSON.stringify({ key: "repeat", value }), headers: { "Content-Type": "application/json" } }, env());

/** Все слова урока выучены в этот день (UTC, как пишет база). */
async function learnedOn(as: number, date: string) {
  await completeLesson(as);
  await ctx.env.DB.prepare("UPDATE word_progress SET completed_at = ? WHERE user_id = ?").bind(`${date} 08:00:00`, as).run();
}

const repeatRow = (as: number, wordId: string) =>
  ctx.env.DB.prepare("SELECT * FROM repeat_state WHERE user_id = ? AND word_id = ?").bind(as, wordId).first<any>();
const typedOf = (he: string) => wordLetters(he).join("");
const w0 = lesson.words[0]!;
const w1 = lesson.words[1]!;

describe("повторение: доступ и сводка", () => {
  it("без входа 401, выключенная функция 403 и без сводки на главной", async () => {
    expect((await api("/api/repeat/session", {}, env())).status).toBe(401);
    expect((await setMode("off")).status).toBe(200);
    expect((await get("/api/repeat/session", STUDENT)).status).toBe(403);
    expect((await answer(STUDENT, { wordId: w0.id, type: "he-ru", choice: w0.id })).status).toBe(403);
    expect((await get<HomeResponse>("/api/home", STUDENT)).body.repeat).toBeUndefined();
    expect((await get<any>("/api/me", STUDENT)).body.play.features.repeat).toBe(false);
    // «Команда»: только администраторам и проверяющим.
    await setMode("team");
    expect((await get("/api/repeat/session", STUDENT)).status).toBe(403);
    expect((await get("/api/repeat/session", OWNER)).status).toBe(200);
  });

  it("по умолчанию включено для всех; слово, выученное сегодня, повторять завтра", async () => {
    expect((await get<any>("/api/me", STUDENT)).body.play.features.repeat).toBe(true);
    expect((await get<HomeResponse>("/api/home", STUDENT)).body.repeat).toEqual({ due: 0, total: 0, nextDueIn: null });
    await learnedOn(STUDENT, "2026-10-14");
    expect((await get<HomeResponse>("/api/home", STUDENT)).body.repeat).toEqual({ due: 0, total: 10, nextDueIn: 1 });
    const session = await get<RepeatSessionResponse>("/api/repeat/session", STUDENT);
    expect(session.body.questions).toEqual([]);
    expect((await answer(STUDENT, { wordId: w0.id, type: "he-ru", choice: w0.id })).body).toMatchObject({ error: "not_due", dueIn: 1 });
  });

  it("буквы алфавита в повторение не попадают", async () => {
    await completeAlphabetLesson(STUDENT);
    await ctx.env.DB.prepare("UPDATE word_progress SET completed_at = '2026-10-01 08:00:00'").run();
    expect((await get<HomeResponse>("/api/home", STUDENT)).body.repeat).toEqual({ due: 0, total: 0, nextDueIn: null });
  });
});

describe("повторение: подход", () => {
  it("слова, выученные раньше, пора повторить: 10 вопросов, у выбора 4 варианта из того же урока", async () => {
    await learnedOn(STUDENT, "2026-10-10");
    expect((await get<HomeResponse>("/api/home", STUDENT)).body.repeat).toEqual({ due: 10, total: 10, nextDueIn: null });
    const { body } = await get<RepeatSessionResponse>("/api/repeat/session", STUDENT);
    expect(body.questions).toHaveLength(REPEAT_SESSION_SIZE);
    expect(new Set(body.questions.map((q) => q.wordId)).size).toBe(REPEAT_SESSION_SIZE);
    for (const q of body.questions) {
      expect(body.words[q.wordId]).toMatchObject({ id: q.wordId, lessonId: lesson.id });
      if (q.type === "type") expect(q.options).toEqual([]);
      else {
        expect(q.options).toHaveLength(4);
        expect(q.options).toContain(q.wordId);
        for (const id of q.options) expect(body.words[id]?.lessonId).toBe(lesson.id);
      }
    }
    // Все четыре вида упражнений в подходе из 10 слов.
    expect(new Set(body.questions.map((q) => q.type)).size).toBe(4);
    expect(body.summary).toEqual({ due: 10, total: 10, nextDueIn: null });
  });

  it("сначала самые просроченные слова", () => {
    const items = lessons.slice(0, 2).flatMap((l, li) =>
      l.words.map((w, i) => ({ wordId: w.id, lesson: l, word: w, stored: true, box: 0, dueDay: TODAY - li * 10 - i, bestBox: 0, reps: 0, lapses: 0 })),
    );
    const { questions } = buildRepeatSession(items, TODAY, () => 0.5);
    expect(questions.map((q) => q.wordId)).toEqual(lessons[1]!.words.map((w) => w.id).reverse());
  });
});

describe("повторение: ответы и коробки", () => {
  beforeEach(() => learnedOn(STUDENT, "2026-10-10"));

  it("вспомнил: следующая коробка, пауза 3 дня; второй ответ в тот же день не принимается", async () => {
    const res = await answer(STUDENT, { wordId: w0.id, type: "he-ru", choice: w0.id });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ correct: true, box: 1, dueIn: REPEAT_INTERVALS[1] });
    expect(await repeatRow(STUDENT, w0.id)).toMatchObject({ box: 1, due_day: TODAY + 3, best_box: 1, reps: 1, lapses: 0, last_day: TODAY, lesson_id: lesson.id });
    expect((await answer(STUDENT, { wordId: w0.id, type: "he-ru", choice: w0.id })).body).toMatchObject({ error: "not_due", dueIn: 3 });
    expect((await get<HomeResponse>("/api/home", STUDENT)).body.repeat).toMatchObject({ due: 9, total: 10 });
  });

  it("забыл или «Не помню»: первая коробка, повторить завтра", async () => {
    const wrong = await answer(STUDENT, { wordId: w0.id, type: "ru-he", choice: w1.id });
    expect(wrong.body).toMatchObject({ correct: false, box: 0, dueIn: 1 });
    expect(await repeatRow(STUDENT, w0.id)).toMatchObject({ box: 0, lapses: 1, reps: 0 });
    const gaveUp = await answer(STUDENT, { wordId: w1.id, type: "type", giveUp: true });
    expect(gaveUp.body).toMatchObject({ correct: false, box: 0, dueIn: 1 });
  });

  it("«Напиши на иврите»: сервер сверяет набранное слово", async () => {
    expect((await answer(STUDENT, { wordId: w0.id, type: "type" })).status).toBe(400);
    expect((await answer(STUDENT, { wordId: w0.id, type: "type", typed: typedOf(w0.he) })).body).toMatchObject({ correct: true, box: 1 });
    expect((await answer(STUDENT, { wordId: w1.id, type: "type", typed: typedOf(w0.he) })).body).toMatchObject({ correct: false, box: 0 });
  });

  it("неверные запросы", async () => {
    expect((await answer(STUDENT, { wordId: w0.id, type: "speak", choice: w0.id })).status).toBe(400);
    expect((await answer(STUDENT, { wordId: "nope", type: "he-ru", choice: "nope" })).status).toBe(404);
    expect((await answer(STUDENT, { wordId: w0.id, type: "he-ru" })).status).toBe(400);
    // Чужое (не выученное) слово.
    const other = lessons[1]!.words[0]!;
    expect((await answer(STUDENT, { wordId: other.id, type: "he-ru", choice: other.id })).body).toMatchObject({ error: "not_learned" });
  });

  it("повторённое слово идёт в цель дня, а очки не растут", async () => {
    const before = await statsRow(STUDENT);
    const res = await answer(STUDENT, { wordId: w0.id, type: "hear-ru", choice: w0.id });
    // Уроки выучены сегодня же (часы теста), поэтому в цели уже 10 слов; повторение добавляет по одному.
    expect(res.body.play.goal).toMatchObject({ done: before.goal_words + 1 });
    await answer(STUDENT, { wordId: w1.id, type: "hear-ru", choice: lesson.words[2]!.id });
    const after = await statsRow(STUDENT);
    expect(after.words_done).toBe(before.words_done);
    expect(after.lb_week_points).toBe(before.lb_week_points);
    expect(after.goal_words).toBe(before.goal_words + 2);
    expect(after.last_day).toBe(TODAY);
    expect(after.repeats_done).toBe(1);
  });

  it("10 вспомненных слов дают бейдж «Освежили память»", async () => {
    let last!: RepeatAnswerResponse;
    for (const w of lesson.words) last = (await answer(STUDENT, { wordId: w.id, type: "he-ru", choice: w.id })).body;
    expect(last.play.newBadges).toContain("repeat-10");
    expect((await statsRow(STUDENT)).repeats_done).toBe(10);
  });

  it("последняя коробка: «прочно выучено» засчитывается один раз", async () => {
    await answer(STUDENT, { wordId: w0.id, type: "he-ru", choice: w0.id });
    await ctx.env.DB.prepare("UPDATE repeat_state SET box = ?, best_box = ?, due_day = ? WHERE user_id = ? AND word_id = ?")
      .bind(REPEAT_LAST_BOX - 1, REPEAT_LAST_BOX - 1, TODAY, STUDENT, w0.id)
      .run();
    expect((await answer(STUDENT, { wordId: w0.id, type: "he-ru", choice: w0.id })).body).toMatchObject({ box: REPEAT_LAST_BOX, dueIn: 60 });
    expect((await statsRow(STUDENT)).words_mastered).toBe(1);
    // Забыл и снова дошёл до конца: второй раз не считается.
    await ctx.env.DB.prepare("UPDATE repeat_state SET box = ?, due_day = ? WHERE user_id = ? AND word_id = ?").bind(REPEAT_LAST_BOX - 1, TODAY, STUDENT, w0.id).run();
    await answer(STUDENT, { wordId: w0.id, type: "he-ru", choice: w0.id });
    expect((await statsRow(STUDENT)).words_mastered).toBe(1);
  });

  it("счётчики повторения совпадают с пересчётом из repeat_state", async () => {
    for (const w of lesson.words.slice(0, 4)) await answer(STUDENT, { wordId: w.id, type: "he-ru", choice: w.id });
    await answer(STUDENT, { wordId: lesson.words[4]!.id, type: "he-ru", choice: w0.id });
    const live = metricsOf((await loadStats(ctx.env.DB, STUDENT))!);
    await ctx.env.DB.prepare("DELETE FROM user_stats WHERE user_id = ?").bind(STUDENT).run();
    const recounted = metricsOf(await ensureStats(ctx.env.DB, STUDENT, { now: Math.floor(Date.now() / 1000) }));
    expect(recounted.repeats).toBe(live.repeats);
    expect(recounted.mastered).toBe(live.mastered);
    expect(live.repeats).toBe(4);
  });

  it("«Мои слова»: сначала те, что пора повторить, с коробкой и сроком", async () => {
    await answer(STUDENT, { wordId: w0.id, type: "he-ru", choice: w0.id });
    const { body } = await get<MyWordsResponse>("/api/repeat/words", STUDENT);
    expect(body.items).toHaveLength(10);
    expect(body.items.at(-1)).toMatchObject({ word: { id: w0.id, he: w0.he, ru: w0.ru }, box: 1, dueIn: 3, reps: 1 });
    expect(body.items.slice(0, 9).every((i) => i.dueIn === 0 && i.box === 0)).toBe(true);
    expect(body.summary).toEqual({ due: 9, total: 10, nextDueIn: null });
  });
});

describe("повторение: подсчёт для напоминаний", () => {
  it("совпадает со сводкой приложения, у каждого свой день", async () => {
    await learnedOn(STUDENT, "2026-10-10");
    await learnedOn(OWNER, "2026-10-14");
    await answer(STUDENT, { wordId: w0.id, type: "he-ru", choice: w0.id });
    const counts = await countDueForReminders(ctx.env.DB, [
      { userId: STUDENT, day: TODAY },
      { userId: OWNER, day: TODAY },
      { userId: 1, day: TODAY },
    ]);
    expect(counts.get(STUDENT)).toBe(9);
    expect(counts.get(OWNER) ?? 0).toBe(0);
    expect((await countDueForReminders(ctx.env.DB, [{ userId: OWNER, day: TODAY + 1 }])).get(OWNER)).toBe(10);
    const learned = await loadLearned(ctx.env.DB, OWNER);
    expect(learned.every((i) => i.dueDay === TODAY + 1)).toBe(true);
    expect(await countDueForReminders(ctx.env.DB, [])).toEqual(new Map());
  });
});

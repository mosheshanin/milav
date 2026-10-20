// Нагрузка одного ученика на базу D1 за типичный день (docs/DEPLOY.md, «Нагрузка и бесплатный тариф»).
// Тест гоняет настоящие маршруты на SQLite и считает операторы: сколько запросов к базе, сколько строк записано и прочитано.
// Он же стережёт бюджет: если правка резко увеличила расход записей D1, тест упадёт и подскажет пересчитать
// «сколько учеников выдержит бесплатный тариф».
import { beforeEach, describe, expect, it, vi } from "vitest";
import { wordLetters, type RepeatSessionResponse } from "@milav/shared";
import { api, answerQuestion, completeLesson, ctx, lesson, post, resetHarness, startQuiz } from "./test-utils/harness";

interface Meter {
  statements: number;
  writeStatements: number;
  rowsChanged: number;
  rowsRead: number;
}
const meter: Meter = { statements: 0, writeStatements: 0, rowsChanged: 0, rowsRead: 0 };
const zero = () => Object.assign(meter, { statements: 0, writeStatements: 0, rowsChanged: 0, rowsRead: 0 });

/** Оборачивает D1: считает каждый оператор, число изменённых строк и число прочитанных (минимум одна на SELECT). */
function metered(db: D1Database): D1Database {
  const count = (sql: string, result: any) => {
    meter.statements++;
    if (/^\s*select/i.test(sql)) meter.rowsRead += Math.max(1, result?.results?.length ?? 1);
    else {
      meter.writeStatements++;
      // INSERT ... RETURNING через first()/all() отдаёт строки вместо meta: считаем их как изменённые.
      meter.rowsChanged += Math.max(0, result?.meta?.changes ?? result?.results?.length ?? 0);
    }
  };
  const wrap = (st: any): any => ({
    sql: st.sql,
    bind: (...a: unknown[]) => wrap(st.bind(...a)),
    first: async () => {
      const row = await st.first();
      count(st.sql, { results: row ? [row] : [] });
      return row;
    },
    all: async () => {
      const r = await st.all();
      count(st.sql, r);
      return r;
    },
    run: async () => {
      const r = await st.run();
      count(st.sql, r);
      return r;
    },
    execute: () => st.execute(),
  });
  return {
    prepare: (sql: string) => wrap(db.prepare(sql)),
    batch: async (list: any[]) => {
      const rs = await (db as any).batch(list.map((s) => (s.execute ? s : s)));
      list.forEach((s, i) => count(s.sql, rs[i]));
      return rs;
    },
  } as unknown as D1Database;
}

beforeEach(() => {
  resetHarness();
  ctx.env.DB = metered(ctx.env.DB);
  zero();
});

const U = 7001;
const snap = () => ({ ...meter });
const diff = (a: Meter, b: Meter): Meter => ({
  statements: b.statements - a.statements,
  writeStatements: b.writeStatements - a.writeStatements,
  rowsChanged: b.rowsChanged - a.rowsChanged,
  rowsRead: b.rowsRead - a.rowsRead,
});

async function openApp() {
  for (const path of ["/api/me", "/api/home", "/api/achievements", "/api/leaderboard?board=week", "/api/cohort"]) {
    await api(path, { as: U, headers: { "X-Timezone": "Asia/Jerusalem" } });
  }
}

async function studyLesson() {
  await api(`/api/lessons/${lesson.id}/progress`, { as: U });
  await completeLesson(U);
}

async function passQuiz() {
  const session = await startQuiz(U);
  for (let i = 0; i < session.questions.length; i++) await answerQuestion(U, session, i, true);
}

async function repeatTen() {
  const res = await api("/api/repeat/session", { as: U });
  const body = (await res.json()) as RepeatSessionResponse;
  for (const q of body.questions) {
    const payload: Record<string, unknown> = { wordId: q.wordId, type: q.type };
    if (q.form) payload.form = `${q.form.tense}:${q.form.key}`, payload.giveUp = true;
    else if (q.options.length) payload.choice = q.wordId;
    else payload.typed = wordLetters(lesson.words.find((w) => w.id === q.wordId)!.he).join("");
    await post("/api/repeat/answer", U, payload);
  }
  return body.questions.length;
}

describe("Нагрузка на D1 за день ученика", () => {
  it("день с новым уроком: открыл, прошёл 10 слов, сдал викторину", async () => {
    const t0 = snap();
    await openApp();
    const t1 = snap();
    await studyLesson();
    const t2 = snap();
    await passQuiz();
    const t3 = snap();
    const report = { открытие: diff(t0, t1), урок: diff(t1, t2), викторина: diff(t2, t3), итого: diff(t0, t3) };
    console.log("DAY_NEW_LESSON " + JSON.stringify(report));
    // Замер 20.10.2026: 180 строк. Бюджет с запасом: если превысили, пересчитайте нагрузку в docs/DEPLOY.md.
    expect(report.итого.rowsChanged).toBeLessThan(300);
  });

  it("день повторения: открыл и повторил слова", async () => {
    await studyLesson();
    await db(`UPDATE word_progress SET completed_at = '2026-10-10 08:00:00' WHERE user_id = ${U}`);
    zero();
    const t0 = snap();
    await openApp();
    const t1 = snap();
    const n = await repeatTen();
    const t2 = snap();
    console.log("DAY_REPEAT " + JSON.stringify({ слов: n, открытие: diff(t0, t1), повторение: diff(t1, t2), итого: diff(t0, t2) }));
    expect(n).toBeGreaterThan(0);
    // Замер 20.10.2026: 44 строки.
    expect(t2.rowsChanged - t0.rowsChanged).toBeLessThan(80);
  });

  it("только заглянул (главная и всё)", async () => {
    await openApp();
    const t0 = snap();
    await openApp();
    console.log("DAY_PEEK " + JSON.stringify(diff(t0, snap())));
  });
});

async function db(sql: string) {
  await (ctx.env.DB as any).prepare(sql).run();
}

describe("Время обработки одного запроса в Node (ориентир для лимита 10 мс процессора)", () => {
  it("печатает среднее время по маршрутам", async () => {
    await studyLesson();
    const timeIt = async (name: string, fn: () => Promise<unknown>) => {
      await fn();
      const t = performance.now();
      for (let i = 0; i < 20; i++) await fn();
      return `${name}: ${((performance.now() - t) / 20).toFixed(2)} мс`;
    };
    const lines = [
      await timeIt("/api/me", () => api("/api/me", { as: U })),
      await timeIt("/api/home", () => api("/api/home", { as: U })),
      await timeIt("/api/lessons/:id", () => api(`/api/lessons/${lesson.id}`, { as: U })),
      await timeIt("/api/quiz/start", () => post("/api/quiz/start", U, { lessonId: lesson.id })),
      await timeIt("/api/leaderboard", () => api("/api/leaderboard?board=week", { as: U })),
      await timeIt("/api/repeat/session", () => api("/api/repeat/session", { as: U })),
    ];
    console.log("TIMES " + lines.join(" | "));
    // Очень грубая страховка от случайно медленного маршрута (на Workers нужно уложиться в 10 мс процессора).
    for (const l of lines) expect(Number(l.split(": ")[1]!.split(" ")[0])).toBeLessThan(25);
  });
});

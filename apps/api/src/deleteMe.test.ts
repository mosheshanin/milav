// Удаление своих данных и страница политики конфиденциальности (решение владельца 24.11).
import { beforeEach, describe, expect, it } from "vitest";
import { PRIVACY_UPDATED, privacySections } from "@milav/shared";
import { USER_TABLES } from "./deleteMe";
import { api, completeLesson, ctx, playQuiz, resetHarness, startQuiz } from "./test-utils/harness";

beforeEach(resetHarness);

const count = async (sql: string, ...params: unknown[]) =>
  (await ctx.env.DB.prepare(sql).bind(...params).first<{ n: number }>())!.n;

/** Таблицы с колонкой user_id (или id у users), которые удаление сознательно не трогает: почему, см. deleteMe.ts. */
const KEPT = new Set(["rate_limits", "staff"]);

async function rowsOf(userId: number): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  for (const table of USER_TABLES) out[table] = await count(`SELECT COUNT(*) AS n FROM ${table} WHERE user_id = ?`, userId);
  out.users = await count("SELECT COUNT(*) AS n FROM users WHERE id = ?", userId);
  return out;
}

describe("DELETE /api/me", () => {
  it("удаляет всё про ученика и не трогает другого", async () => {
    for (const as of [1, 2]) {
      await completeLesson(as);
      await playQuiz(as, await startQuiz(as));
    }
    await ctx.env.DB.prepare("INSERT INTO reminders (user_id, enabled, minute, updated_at) VALUES (1, 1, 1200, 0)").run();
    const before = await rowsOf(1);
    expect(before.reminders).toBe(1);
    expect(before.users).toBe(1);
    expect(before.word_progress).toBeGreaterThan(0);
    expect(before.lesson_passed).toBe(1);
    expect(before.user_stats).toBe(1);

    const res = await api("/api/me", { method: "DELETE", as: 1 });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });

    const after = await rowsOf(1);
    for (const [table, n] of Object.entries(after)) expect(n, table).toBe(0);
    const other = await rowsOf(2);
    expect(other.users).toBe(1);
    expect(other.lesson_passed).toBe(1);
  });

  it("после удаления приложение открывается с нуля", async () => {
    await completeLesson(1);
    await api("/api/me", { method: "DELETE", as: 1 });
    const me = (await (await api("/api/me", { as: 1 })).json()) as { points: number; passedLessons: number };
    expect(me.points).toBe(0);
    expect(me.passedLessons).toBe(0);
  });

  it("без входа нельзя", async () => {
    expect((await api("/api/me", { method: "DELETE" })).status).toBe(401);
  });

  it("каждая таблица с данными ученика либо удаляется, либо сознательно оставлена", async () => {
    const { results } = await ctx.env.DB
      .prepare("SELECT m.name AS name FROM sqlite_master m, pragma_table_info(m.name) p WHERE m.type = 'table' AND p.name = 'user_id'")
      .all<{ name: string }>();
    const withUser = results.map((r) => r.name).sort();
    const covered = new Set<string>([...USER_TABLES, ...KEPT]);
    expect(withUser.filter((t) => !covered.has(t)), "новая таблица с user_id: добавьте её в USER_TABLES или в KEPT с причиной").toEqual([]);
  });
});

describe("страница /privacy", () => {
  it("отдаёт политику без скриптов, с датой и всеми разделами", async () => {
    const res = await api("/privacy");
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/html");
    expect(res.headers.get("Content-Security-Policy")).toContain("default-src 'none'");
    const html = await res.text();
    expect(html).toContain(PRIVACY_UPDATED);
    expect(html).not.toContain("<script");
    for (const s of privacySections()) expect(html).toContain(s.title);
  });

  it("раздел «Связь» появляется, только если контакт указан", () => {
    expect(privacySections("").some((s) => s.title === "Связь")).toBe(false);
    const withContact = privacySections("@owner");
    expect(withContact.at(-1)).toEqual({ title: "Связь", paragraphs: ["Вопросы о данных: @owner."] });
  });
});

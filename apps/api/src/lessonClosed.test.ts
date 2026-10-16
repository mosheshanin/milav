import { beforeEach, describe, expect, it, vi } from "vitest";
import { allLessons } from "@milav/content";
import { api, lesson, resetHarness, word } from "./test-utils/harness";

// Как будет после Stars: платные уроки закрыты без покупки. Пока PAID_LESSONS_OPEN = true, проверяем закрытие подменой.
vi.mock("@milav/shared", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@milav/shared")>()),
  PAID_LESSONS_OPEN: false,
}));

beforeEach(resetHarness);

const get = (id: string) => api(`/api/lessons/${id}`, { as: 1 });

/** Делает урок платным на время теста. */
async function asPaid<T>(run: () => Promise<T>): Promise<T> {
  const target = allLessons.find((l) => l.id === lesson.id)!;
  const was = target.free;
  target.free = false;
  try {
    return await run();
  } finally {
    target.free = was;
  }
}

describe("платные уроки закрыты (PAID_LESSONS_OPEN = false)", () => {
  it("платный урок: 403 и ни одного слова в ответе, прогресс тоже закрыт", async () => {
    await asPaid(async () => {
      const res = await get(lesson.id);
      expect(res.status).toBe(403);
      const text = await res.text();
      expect(JSON.parse(text)).toEqual({ error: "subscription_required" });
      expect(text.includes(word.he)).toBe(false);
      expect((await api(`/api/lessons/${lesson.id}/progress`, { as: 1 })).status).toBe(403);
    });
  });

  it("на главной только бесплатные уроки", async () => {
    await asPaid(async () => {
      const body = (await (await api("/api/home", { as: 1 })).json()) as { lessons: Record<string, unknown> };
      expect(Object.keys(body.lessons).sort()).toEqual(allLessons.filter((l) => l.free).map((l) => l.id).sort());
      expect(body.lessons[lesson.id]).toBeUndefined();
    });
  });

  it("бесплатный урок открыт", async () => {
    const res = await get(lesson.id);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain(word.he);
  });
});

import { beforeEach, describe, expect, it } from "vitest";
import { allLessons } from "@milav/content";
import { manifest } from "@milav/content/manifest";
import { PAID_LESSONS_OPEN } from "@milav/shared";
import { alphabetLesson, api, lesson, resetHarness, word } from "./test-utils/harness";

beforeEach(resetHarness);

const get = (id: string, as?: number) => api(`/api/lessons/${id}`, as ? { as } : {});

/** Делает урок платным на время теста. */
async function asPaid<T>(id: string, run: () => Promise<T>): Promise<T> {
  const target = allLessons.find((l) => l.id === id)!;
  target.free = false;
  try {
    return await run();
  } finally {
    target.free = true;
  }
}

describe("GET /api/lessons/:id (слова урока)", () => {
  it("без входа 401", async () => {
    expect((await get(lesson.id)).status).toBe(401);
  });

  it("бесплатный урок отдаётся целиком, как в файле урока", async () => {
    const res = await get(lesson.id, 1);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { lesson: typeof lesson };
    expect(body.lesson).toEqual(lesson);
    expect(body.lesson.words[0]!.he).toBe(word.he);
  });

  it("урок алфавита тоже отдаётся", async () => {
    const body = (await (await get(alphabetLesson.id, 1)).json()) as { lesson: typeof alphabetLesson };
    expect(body.lesson.letters.map((l) => l.id)).toEqual(alphabetLesson.letters.map((l) => l.id));
  });

  it("каждый урок из манифеста приложения находится на сервере", async () => {
    for (const meta of manifest.lessons) {
      expect((await get(meta.id, 1)).status, meta.id).toBe(200);
    }
  });

  it("неизвестный урок 404", async () => {
    const res = await get("nope-1", 1);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "lesson_not_found" });
  });

  it("платный урок, пока платные открыты всем до Stars (PAID_LESSONS_OPEN), отдаётся вместе с прогрессом", async () => {
    expect(PAID_LESSONS_OPEN).toBe(true);
    await asPaid(lesson.id, async () => {
      expect((await get(lesson.id, 1)).status).toBe(200);
      expect((await api(`/api/lessons/${lesson.id}/progress`, { as: 1 })).status).toBe(200);
    });
  });

  it("ответ не кэшируется посредниками (слова платных уроков не должны осесть в общем кэше)", async () => {
    const res = await get(lesson.id, 1);
    expect(res.headers.get("Cache-Control") ?? "").toContain("no-store");
  });
});

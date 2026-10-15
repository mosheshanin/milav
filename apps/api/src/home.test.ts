import { beforeEach, describe, expect, it } from "vitest";
import { allLessons } from "@milav/content";
import {
  alphabetLesson,
  api,
  completeLesson,
  completeLetter,
  letter,
  playQuiz,
  post,
  resetHarness,
  stageBody,
  startQuiz,
  word,
  lesson,
} from "./test-utils/harness";

beforeEach(resetHarness);

const home = async (as: number) => (await (await api("/api/home", { as })).json()) as any;
const lessonProgress = async (as: number, id: string) =>
  (await (await api(`/api/lessons/${id}/progress`, { as })).json()) as any;

describe("/api/home", () => {
  it("без входа 401", async () => {
    expect((await api("/api/home")).status).toBe(401);
  });

  it("новичку отдаёт все доступные уроки с пустым прогрессом", async () => {
    const body = await home(1);
    const free = allLessons.filter((l) => l.free).map((l) => l.id);
    expect(Object.keys(body.lessons).sort()).toEqual([...free].sort());
    for (const id of free) {
      expect(body.lessons[id].quiz).toEqual({ passed: false, bestCorrect: null });
      expect(body.lessons[id].words.every((w: any) => !w.listen && !w.completed)).toBe(true);
    }
  });

  it("совпадает с прежним запросом прогресса по каждому уроку (слова, буквы, сданная викторина)", async () => {
    await post("/api/progress/stage", 1, await stageBody(word, "listen"));
    await completeLetter(1, letter.id);
    await completeLesson(1);
    await playQuiz(1, await startQuiz(1));

    const body = await home(1);
    expect(body.lessons[lesson.id].quiz.passed).toBe(true);
    expect(body.lessons[lesson.id].quiz.bestCorrect).toBeGreaterThan(0);
    expect(body.lessons[alphabetLesson.id].words.find((w: any) => w.wordId === letter.id).completed).toBe(true);
    for (const id of [lesson.id, alphabetLesson.id, allLessons.filter((l) => l.free).at(-1)!.id]) {
      expect(body.lessons[id]).toEqual(await lessonProgress(1, id));
    }
  });

  it("прогресс одного пользователя не виден другому", async () => {
    await completeLesson(1);
    const other = await home(2);
    expect(other.lessons[lesson.id].words.every((w: any) => !w.completed)).toBe(true);
  });
});

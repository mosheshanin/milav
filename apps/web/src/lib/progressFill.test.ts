import { describe, expect, it } from "vitest";
import { LETTER_STAGES, STAGES, type LessonProgressResponse, type WordProgress } from "@milav/shared";
import { fillLook, groupFill, lessonFill } from "./progressFill";

function word(id: string, done: Partial<WordProgress> = {}): WordProgress {
  const stages = { listen: false, speak: false, write: false, type: false, ...done };
  return { wordId: id, ...stages, completed: stages.listen && stages.speak && stages.write && stages.type };
}

const ALL = { listen: true, speak: true, write: true, type: true };

function progress(words: WordProgress[], passed = false): LessonProgressResponse {
  return { words, quiz: { passed, bestCorrect: passed ? 24 : null } };
}

const lesson = { count: 10, stages: [...STAGES] };

describe("lessonFill", () => {
  it("урок без прогресса пустой", () => {
    expect(lessonFill(lesson, undefined)).toEqual({ passed: false, ratio: 0 });
    expect(lessonFill(lesson, progress([]))).toEqual({ passed: false, ratio: 0 });
  });

  it("доля считается по этапам, а не только по целым словам", () => {
    // 2 слова целиком (8 этапов) и у третьего «слушай» и «говори» (2): 10 из 40.
    const p = progress([word("a", ALL), word("b", ALL), word("c", { listen: true, speak: true })]);
    expect(lessonFill(lesson, p)).toEqual({ passed: false, ratio: 0.25 });
  });

  it("все слова пройдены, викторина не сдана: полоса полная, но не «сдан»", () => {
    const p = progress(Array.from({ length: 10 }, (_, i) => word(`w${i}`, ALL)));
    expect(lessonFill(lesson, p)).toEqual({ passed: false, ratio: 1 });
  });

  it("сданная викторина делает урок сданным", () => {
    expect(lessonFill(lesson, progress([], true))).toEqual({ passed: true, ratio: 1 });
  });

  it("у букв считаются только их этапы (без «говори»)", () => {
    const letters = { count: 5, stages: [...LETTER_STAGES] };
    const p = progress([word("a", { listen: true, speak: true, write: true, type: true })]);
    expect(lessonFill(letters, p).ratio).toBeCloseTo(LETTER_STAGES.length / (5 * LETTER_STAGES.length));
  });
});

describe("groupFill", () => {
  const items = [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }];

  it("доля сданных уроков темы", () => {
    expect(groupFill(items, { a: progress([], true), b: progress([word("x", ALL)]) })).toEqual({ passed: false, ratio: 0.25 });
  });

  it("все уроки сданы: тема сдана", () => {
    const all = Object.fromEntries(items.map((l) => [l.id, progress([], true)]));
    expect(groupFill(items, all)).toEqual({ passed: true, ratio: 1 });
  });

  it("пустая тема не считается сданной", () => {
    expect(groupFill([], {})).toEqual({ passed: false, ratio: 0 });
  });
});

describe("fillLook", () => {
  it("сдано: цвет успеха без полосы", () => {
    expect(fillLook({ passed: true, ratio: 1 }, "bg-page")).toEqual({ className: "bg-success-soft", state: "passed" });
  });

  it("частично: базовый фон и полоса нужной ширины", () => {
    const look = fillLook({ passed: false, ratio: 1 / 3 }, "bg-page");
    expect(look.state).toBe("partial");
    expect(look.className).toBe("bg-page bg-progress");
    expect(look.style).toEqual({ "--fill": "33.3%" });
  });

  it("ничего не начато: только базовый фон", () => {
    expect(fillLook({ passed: false, ratio: 0 }, "bg-page")).toEqual({ className: "bg-page", state: "none" });
  });
});

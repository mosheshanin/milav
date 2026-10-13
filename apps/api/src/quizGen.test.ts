import { describe, expect, it } from "vitest";
import { lessons } from "@milav/content";
import { QUESTIONS_PER_TYPE, QUESTION_TYPES, QUIZ_SIZE } from "@milav/shared";
import { generateQuiz, isChoiceType, secureRandom } from "./quizGen";

const words = lessons[0]!.words;

function seeded(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}

describe("генерация викторины", () => {
  const quiz = generateQuiz(words, seeded(7));

  it("25 вопросов: по 5 каждого из 5 типов, в заданном порядке", () => {
    expect(quiz.length).toBe(QUIZ_SIZE);
    QUESTION_TYPES.forEach((type, i) => {
      const block = quiz.slice(i * QUESTIONS_PER_TYPE, (i + 1) * QUESTIONS_PER_TYPE);
      expect(block.every((q) => q.type === type), type).toBe(true);
    });
  });

  it("внутри типа слова не повторяются", () => {
    for (const type of QUESTION_TYPES) {
      const ids = quiz.filter((q) => q.type === type).map((q) => q.wordId);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it("у вопросов с выбором 4 разных слова урока и среди них ровно одно верное", () => {
    const lessonIds = new Set(words.map((w) => w.id));
    for (const q of quiz.filter((x) => isChoiceType(x.type))) {
      expect(q.options.length).toBe(4);
      expect(new Set(q.options).size).toBe(4);
      expect(q.options.every((id) => lessonIds.has(id))).toBe(true);
      expect(q.options.filter((id) => id === q.wordId).length).toBe(1);
    }
  });

  it("у вопросов на произношение и письмо вариантов нет", () => {
    for (const q of quiz.filter((x) => x.type === "speak" || x.type === "write")) expect(q.options).toEqual([]);
  });

  it("при разных зёрнах набор слов различается", () => {
    const a = generateQuiz(words, seeded(1)).map((q) => q.wordId).join();
    const b = generateQuiz(words, seeded(2)).map((q) => q.wordId).join();
    expect(a).not.toBe(b);
  });

  it("случайные числа сервера лежат в [0, 1) и не одинаковые", () => {
    const values = Array.from({ length: 50 }, () => secureRandom());
    expect(values.every((v) => v >= 0 && v < 1)).toBe(true);
    expect(new Set(values).size).toBeGreaterThan(40);
  });
});

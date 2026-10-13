import { describe, expect, it } from "vitest";
import { alphabetLessons, lessons } from "@milav/content";
import { ALPHABET_QUESTION_TYPES, ALPHABET_QUIZ_RULES, LETTER_KEYS, QUESTION_TYPES, isFormPair, type Letter } from "@milav/shared";
import { generateAlphabetQuiz, generateLessonQuiz, isChoiceType, isWriteType } from "./quizGen";

function seeded(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}

/** Урок со всеми пятью буквами, где есть пара обычной и конечной формы, строится из групп алфавита. */
const lesson = alphabetLessons[0]!;
const letters = lesson.letters;
const byId = new Map(letters.map((l) => [l.id, l]));

describe("генерация викторины алфавита", () => {
  const quiz = generateAlphabetQuiz(letters, seeded(11));

  it("20 вопросов: по 5 каждого из 4 типов, в заданном порядке", () => {
    expect(quiz.length).toBe(ALPHABET_QUIZ_RULES.size);
    ALPHABET_QUESTION_TYPES.forEach((type, i) => {
      const block = quiz.slice(i * ALPHABET_QUIZ_RULES.perType, (i + 1) * ALPHABET_QUIZ_RULES.perType);
      expect(block.every((q) => q.type === type), type).toBe(true);
    });
  });

  it("вопросы только по буквам урока, внутри типа буквы не повторяются", () => {
    expect(quiz.every((q) => byId.has(q.wordId))).toBe(true);
    for (const type of ALPHABET_QUESTION_TYPES) {
      const ids = quiz.filter((q) => q.type === type).map((q) => q.wordId);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it("выбор из 4 разных букв урока, верная ровно одна; у письма и набора вариантов нет", () => {
    for (const q of quiz) {
      if (isChoiceType(q.type)) {
        expect(q.options.length).toBe(4);
        expect(new Set(q.options).size).toBe(4);
        expect(q.options.every((id) => byId.has(id))).toBe(true);
        expect(q.options.filter((id) => id === q.wordId).length).toBe(1);
      } else {
        expect(q.options).toEqual([]);
      }
    }
  });

  it("типы алфавита не пересекаются с типами обычных уроков", () => {
    for (const type of ALPHABET_QUESTION_TYPES) expect(QUESTION_TYPES as readonly string[]).not.toContain(type);
    expect(isWriteType("name-write")).toBe(true);
    expect(isWriteType("write")).toBe(true);
    expect(isWriteType("name-type")).toBe(false);
    expect(isChoiceType("name-type")).toBe(false);
  });

  it("при любом зерне хватает вариантов и нет пары «обычная и конечная» рядом с верным ответом", () => {
    for (const group of alphabetLessons) {
      for (let seed = 1; seed <= 60; seed++) {
        const q = generateAlphabetQuiz(group.letters, seeded(seed));
        const own = new Map(group.letters.map((l) => [l.id, l]));
        for (const question of q.filter((x) => isChoiceType(x.type))) {
          expect(question.options.length).toBe(4);
          const target = own.get(question.wordId)!;
          for (const id of question.options) {
            if (id !== target.id) expect(isFormPair(own.get(id)!.he, target.he), `${target.he} и ${own.get(id)!.he}`).toBe(false);
          }
        }
      }
    }
  });

  it("генератор урока выбирает вид викторины по уроку", () => {
    expect(generateLessonQuiz(lesson, seeded(3)).length).toBe(ALPHABET_QUIZ_RULES.size);
    expect(generateLessonQuiz(lessons[0]!, seeded(3)).length).toBe(25);
  });
});

describe("викторина урока с конечными формами", () => {
  // Образец урока 3: כ ך ל מ ם. Реального файла пока нет, поэтому буквы собраны здесь.
  const lesson3: Letter[] = [..."כךלמם"].map((he) => ({
    id: `alphabet-3-${LETTER_KEYS[he]}`,
    he,
    name: { he, niqqud: he, ru: he },
    sound: "",
    example: { he, niqqud: he, translit: "", ru: "" },
    reviewed: false,
  }));

  it("обычная и конечная форма не бывают вариантами одного вопроса с выбором, если одна из них верная", () => {
    for (let seed = 1; seed <= 200; seed++) {
      for (const q of generateAlphabetQuiz(lesson3, seeded(seed)).filter((x) => isChoiceType(x.type))) {
        expect(q.options.length).toBe(4);
        const target = lesson3.find((l) => l.id === q.wordId)!;
        const partner = lesson3.find((l) => isFormPair(l.he, target.he));
        if (partner) expect(q.options).not.toContain(partner.id);
      }
    }
  });

  it("в вопросах «напиши» и «найди» конечные формы встречаются", () => {
    const finals = new Set<string>();
    for (let seed = 1; seed <= 50; seed++) {
      for (const q of generateAlphabetQuiz(lesson3, seeded(seed))) {
        if (q.type === "name-write" || q.type === "name-type") finals.add(q.wordId);
      }
    }
    expect(finals.has("alphabet-3-kaf-final")).toBe(true);
    expect(finals.has("alphabet-3-mem-final")).toBe(true);
  });
});

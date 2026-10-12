import { describe, expect, it } from "vitest";
import { WORDS_PER_LESSON, normalizeHebrew } from "@milav/shared";
import { lessons } from "./index";

const ONLY_HEBREW_LETTERS = /^[א-ת]+$/;
const CYRILLIC_TRANSLIT = /^[а-яё\- ]+$/i;
const FINAL_LETTERS = "ךםןףץ";
const REGULAR_FORMS_OF_FINALS = "כמנפצ";

describe("уроки", () => {
  it("есть хотя бы один урок", () => {
    expect(lessons.length).toBeGreaterThan(0);
  });

  it("id уроков и слов уникальны", () => {
    const lessonIds = lessons.map((l) => l.id);
    expect(new Set(lessonIds).size).toBe(lessonIds.length);
    const wordIds = lessons.flatMap((l) => l.words.map((w) => w.id));
    expect(new Set(wordIds).size).toBe(wordIds.length);
  });

  it("слова иврита уникальны внутри урока (иначе вопросы викторины неоднозначны)", () => {
    for (const lesson of lessons) {
      const he = lesson.words.map((w) => w.he);
      expect(new Set(he).size, lesson.id).toBe(he.length);
      const ru = lesson.words.map((w) => w.ru);
      expect(new Set(ru).size, lesson.id).toBe(ru.length);
    }
  });

  for (const lesson of lessons) {
    describe(lesson.id, () => {
      it(`ровно ${WORDS_PER_LESSON} слов`, () => {
        expect(lesson.words.length).toBe(WORDS_PER_LESSON);
      });

      it("бесплатны только первые 3 урока темы", () => {
        expect(lesson.free).toBe(lesson.number <= 3);
      });

      it("id слов начинаются с id урока", () => {
        for (const w of lesson.words) expect(w.id.startsWith(`${lesson.id}-`), w.id).toBe(true);
      });

      for (const word of lesson.words) {
        it(`слово ${word.id} заполнено корректно`, () => {
          expect(word.he, "иврит только буквами, без огласовок").toMatch(ONLY_HEBREW_LETTERS);
          expect(word.translit, "транскрипция кириллицей").toMatch(CYRILLIC_TRANSLIT);
          expect(word.ru.trim().length).toBeGreaterThan(0);

          // Конечные буквы только в конце слова, и в конце слова нет обычных форм ך ם ן ף ץ.
          const letters = [...word.he];
          letters.forEach((ch, i) => {
            const isLast = i === letters.length - 1;
            if (FINAL_LETTERS.includes(ch)) expect(isLast, `${word.he}: конечная буква не в конце`).toBe(true);
            if (isLast) expect(REGULAR_FORMS_OF_FINALS.includes(ch), `${word.he}: в конце нужна конечная форма`).toBe(false);
          });

          if (lesson.section === "nouns") {
            expect(["m", "f"], "у существительного указан род").toContain(word.gender);
          }
          if (word.gender) {
            expect(word.example, "для слова с родом нужна фраза-пример").toBeDefined();
          }
          if (word.example) {
            expect(normalizeHebrew(word.example.he), "во фразе есть само слово").toContain(normalizeHebrew(word.he));
            expect(word.example.translit).toMatch(CYRILLIC_TRANSLIT);
            expect(word.example.ru.length).toBeGreaterThan(0);
          }
        });
      }
    });
  }
});

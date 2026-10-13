import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { FREE_LESSONS_PER_TOPIC, WORDS_PER_LESSON, normalizeHebrew } from "@milav/shared";
import { lessons } from "./index";
import { skeletonProblems, stressProblems, stripStress } from "./rules";

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
        expect(lesson.free).toBe(lesson.number <= FREE_LESSONS_PER_TOPIC);
      });

      it("id слов начинаются с id урока", () => {
        for (const w of lesson.words) expect(w.id.startsWith(`${lesson.id}-`), w.id).toBe(true);
      });

      for (const word of lesson.words) {
        it(`слово ${word.id} заполнено корректно`, () => {
          expect(word.he, "иврит только буквами, без огласовок").toMatch(ONLY_HEBREW_LETTERS);
          expect(stressProblems(word.translit), "ударение в транскрипции (docs/CONTENT.md)").toEqual([]);
          expect(skeletonProblems(word.he, word.translit), "согласные иврита есть в транскрипции").toEqual([]);
          expect(word.ru.trim().length).toBeGreaterThan(0);

          // Конечные буквы только в конце слова, и в конце слова нет обычных форм ך ם ן ף ץ.
          const letters = [...word.he];
          letters.forEach((ch, i) => {
            const isLast = i === letters.length - 1;
            if (FINAL_LETTERS.includes(ch)) expect(isLast, `${word.he}: конечная буква не в конце`).toBe(true);
            if (isLast) expect(REGULAR_FORMS_OF_FINALS.includes(ch), `${word.he}: в конце нужна конечная форма`).toBe(false);
          });

          expect(word.niqqud, "у каждого слова есть вариант с огласовками для озвучки").toBeDefined();
          if (word.niqqud) {
            expect(word.niqqud, "огласовки действительно есть").toMatch(/[\u05B0-\u05BC\u05C1\u05C2]/);
            expect(normalizeHebrew(word.niqqud), "с огласовками то же слово").toBe(normalizeHebrew(word.he));
          }
          if (word.audio) {
            const file = new URL(`../apps/web/public${word.audio}`, import.meta.url);
            expect(existsSync(file), `нет файла озвучки ${word.audio}`).toBe(true);
          }

          // Картинка необязательна: без неё карточка показывает запасной вариант (первую букву).
          if (word.image) {
            const file = new URL(`../apps/web/public${word.image}`, import.meta.url);
            expect(existsSync(file), `нет файла картинки ${word.image}`).toBe(true);
          }

          if (lesson.section === "nouns") {
            expect(["m", "f"], "у существительного указан род").toContain(word.gender);
          }
          if (word.gender) {
            expect(word.example, "для слова с родом нужна фраза-пример").toBeDefined();
          }
          // Формы слова, которые может использовать фраза: основная и (у прилагательных) остальные.
          const forms = [{ he: word.he, translit: word.translit }, ...Object.values(word.forms ?? {})];
          if (word.example) {
            expect(
              forms.some((f) => normalizeHebrew(word.example!.he).includes(normalizeHebrew(f.he))),
              "во фразе есть само слово или его форма",
            ).toBe(true);
            expect(
              forms.some((f) => word.example!.translit.includes(stripStress(f.translit))),
              "транскрипция фразы содержит транскрипцию слова (одинаково записанную)",
            ).toBe(true);
            expect(word.example.translit).toMatch(CYRILLIC_TRANSLIT);
            expect(word.example.translit, "фраза без артикля (ха-)").not.toMatch(/(^|[\s-])ха-/);
            expect(word.example.ru.length).toBeGreaterThan(0);
          }

          if (word.forms) {
            for (const [name, form] of Object.entries(word.forms)) {
              expect(normalizeHebrew(form.niqqud), `форма ${name}: с огласовками то же слово`).toBe(normalizeHebrew(form.he));
              expect(stressProblems(form.translit), `форма ${name}: ударение`).toEqual([]);
              expect(skeletonProblems(form.he, form.translit), `форма ${name}: согласные`).toEqual([]);
            }
          }
        });
      }
    });
  }
});

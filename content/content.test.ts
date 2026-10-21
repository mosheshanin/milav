import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { FREE_LESSONS_PER_TOPIC, MAX_WORD_PARTS, WORDS_PER_LESSON, normalizeHebrew, verbForms, wordParts } from "@milav/shared";
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

      it("бесплатен только первый урок темы", () => {
        expect(lesson.free).toBe(lesson.number <= FREE_LESSONS_PER_TOPIC);
      });

      it("id слов начинаются с id урока", () => {
        for (const w of lesson.words) expect(w.id.startsWith(`${lesson.id}-`), w.id).toBe(true);
      });

      for (const word of lesson.words) {
        it(`слово ${word.id} заполнено корректно`, () => {
          // Слово урока может быть фразой из нескольких слов через один пробел («אחר כך», 21.10): каждая часть проверяется как слово.
          const parts = wordParts(word.he);
          expect(parts.join(" "), "слова фразы через один пробел, без пробелов по краям").toBe(word.he);
          expect(parts.length, `не больше ${MAX_WORD_PARTS} слов иврита`).toBeLessThanOrEqual(MAX_WORD_PARTS);
          for (const part of parts) expect(part, "иврит только буквами, без огласовок").toMatch(ONLY_HEBREW_LETTERS);
          expect(stressProblems(word.translit), "ударение в транскрипции (docs/CONTENT.md)").toEqual([]);
          expect(skeletonProblems(word.he, word.translit), "согласные иврита есть в транскрипции").toEqual([]);
          expect(word.ru.trim().length).toBeGreaterThan(0);

          // Конечные буквы только в конце слова, и в конце слова нет обычных форм ך ם ן ף ץ (у фразы в каждом её слове).
          for (const part of parts) {
            const letters = [...part];
            letters.forEach((ch, i) => {
              const isLast = i === letters.length - 1;
              if (FINAL_LETTERS.includes(ch)) expect(isLast, `${word.he}: конечная буква не в конце слова`).toBe(true);
              if (isLast) expect(REGULAR_FORMS_OF_FINALS.includes(ch), `${word.he}: в конце слова нужна конечная форма`).toBe(false);
            });
          }

          expect(word.niqqud, "у каждого слова есть вариант с огласовками для озвучки").toBeDefined();
          if (word.niqqud) {
            expect(word.niqqud, "огласовки действительно есть").toMatch(/[\u05B0-\u05BC\u05C1\u05C2]/);
            expect(normalizeHebrew(word.niqqud), "с огласовками то же слово").toBe(normalizeHebrew(word.he));
            // У фразы те же слова по отдельности, и у каждого есть огласовки: синтезатор не должен гадать ни в одном слове.
            const niqqudParts = wordParts(word.niqqud);
            expect(niqqudParts.map(normalizeHebrew), "с огласовками те же слова фразы").toEqual(parts.map(normalizeHebrew));
            for (const part of niqqudParts) expect(part, `огласовки в каждом слове: ${part}`).toMatch(/[\u05B0-\u05BC\u05C1\u05C2]/);
            // Транскрипция фразы тоже из стольких же частей: ударение ставится в каждом слове отдельно (docs/CONTENT.md).
            if (parts.length > 1) expect(word.translit.split(" ").length, "в транскрипции столько же слов, сколько в иврите").toBe(parts.length);
          }
          // Формы глагола: все времена по порядку (у прилагательных формы лежат в forms).
          const verbEntries = word.verb ? verbForms(word.verb) : [];
          // Озвучка основной формы, форм прилагательного и глагола и фразы-примера: если путь указан, файл существует.
          for (const path of [
            word.audio,
            word.example?.audio,
            ...Object.values(word.forms ?? {}).map((f) => f.audio),
            ...verbEntries.map((e) => e.form.audio),
          ]) {
            if (path) expect(existsSync(new URL(`../apps/web/public${path}`, import.meta.url)), `нет файла озвучки ${path}`).toBe(true);
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
          // Формы слова, которые может использовать фраза: основная, остальные формы прилагательного и все формы глагола.
          const forms = [
            { he: word.he, translit: word.translit },
            ...Object.values(word.forms ?? {}),
            ...verbEntries.map((e) => e.form),
          ];
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

          if (lesson.section === "verbs") {
            expect(word.verb, "у глагола есть бинъян, корень и формы").toBeDefined();
            expect(word.gender, "у глагола рода нет: он в формах").toBeUndefined();
            // Решение владельца: фраза-пример с глаголом в настоящем времени (docs/CONTENT.md).
            const phrase = normalizeHebrew(word.example?.he ?? "");
            const present = verbEntries.filter((e) => e.tense === "present").map((e) => normalizeHebrew(e.form.he));
            expect(present.some((he) => phrase.includes(he)), "во фразе есть глагол в настоящем времени").toBe(true);
            // Озвучка формы названа по правилу <id слова>-form-<время>-<ключ>.mp3.
            for (const { tense, key, form } of verbEntries) {
              if (form.audio) expect(form.audio, `${tense}.${key}`).toBe(`/audio/${word.id}-form-${tense}-${key}.mp3`);
            }
          }
        });
      }
    });
  }
});

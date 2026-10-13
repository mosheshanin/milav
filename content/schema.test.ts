import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { FREE_LESSONS_PER_TOPIC, WORDS_PER_LESSON } from "@milav/shared";
import { schema, schemaProblems } from "./validate";

const lessonsDir = new URL("./lessons/", import.meta.url);
const lessonFiles = readdirSync(lessonsDir).filter((f) => f.endsWith(".json"));

function readLesson(file: string): any {
  return JSON.parse(readFileSync(new URL(file, lessonsDir), "utf8"));
}

/** Слово-образец: существительное. */
function noun(i: number): any {
  return {
    id: `animals-1-w${i}`,
    he: "חתול",
    niqqud: "חָתוּל",
    translit: "хату́ль",
    ru: "кот",
    gender: "m",
    example: { he: "זה חתול שחור", translit: "зэ хатуль шахор", ru: "Это чёрный кот" },
    reviewed: false,
  };
}

function lessonOf(section: string, word: (i: number) => any, over: Record<string, unknown> = {}): any {
  return {
    id: "sample-1",
    topicId: "sample",
    section,
    topic: "Образец",
    number: 1,
    free: true,
    title: "Образец",
    words: Array.from({ length: WORDS_PER_LESSON }, (_, i) => ({ ...word(i), id: `sample-1-w${i}` })),
    ...over,
  };
}

const adjective = (): any => ({
  he: "אדום",
  niqqud: "אָדֹם",
  translit: "адо́м",
  ru: "красный",
  example: { he: "זה שולחן אדום", translit: "зэ шулхан адом", ru: "Это красный стол" },
  forms: {
    f: { he: "אדומה", niqqud: "אֲדֻמָּה", translit: "адума́" },
    mp: { he: "אדומים", niqqud: "אֲדֻמִּים", translit: "адуми́м" },
    fp: { he: "אדומות", niqqud: "אֲדֻמּוֹת", translit: "адумо́т" },
  },
  reviewed: false,
});

const verb = (): any => ({
  he: "לאכול",
  niqqud: "לֶאֱכֹל",
  translit: "леэхо́ль",
  ru: "есть",
  example: { he: "אני אוכל לחם", translit: "ани охэль лэхэм", ru: "Я ем хлеб" },
  reviewed: { by: "Проверяющий", at: "2026-10-13" },
});

describe("schema.json: настоящие уроки", () => {
  it("есть хотя бы один файл урока", () => {
    expect(lessonFiles.length).toBeGreaterThan(0);
  });

  for (const file of lessonFiles) {
    it(`${file} соответствует схеме`, () => {
      expect(schemaProblems(readLesson(file))).toEqual([]);
    });

    it(`${file}: имя файла совпадает с id урока`, () => {
      expect(file).toBe(`${readLesson(file).id}.json`);
    });
  }
});

describe("schema.json: согласованность с правилами продукта", () => {
  it("число слов в схеме равно WORDS_PER_LESSON", () => {
    const words = (schema as any).properties.words;
    expect(words.minItems).toBe(WORDS_PER_LESSON);
    expect(words.maxItems).toBe(WORDS_PER_LESSON);
  });

  it("граница бесплатных уроков в схеме равна FREE_LESSONS_PER_TOPIC", () => {
    const rule = (schema as any).allOf[0];
    expect(rule.if.properties.number.maximum).toBe(FREE_LESSONS_PER_TOPIC);
  });
});

describe("schema.json: образцы допустимых уроков", () => {
  it("существительные", () => {
    expect(schemaProblems(lessonOf("nouns", noun))).toEqual([]);
  });

  it("прилагательные с четырьмя формами", () => {
    expect(schemaProblems(lessonOf("adjectives", adjective))).toEqual([]);
  });

  it("глаголы с проверкой носителем", () => {
    expect(schemaProblems(lessonOf("verbs", verb))).toEqual([]);
  });

  it("платный урок: номер 4 и free: false", () => {
    expect(schemaProblems(lessonOf("nouns", noun, { id: "sample-4", number: 4, free: false }))).toEqual([]);
  });

  it("слово без картинки допустимо (картинка необязательна)", () => {
    expect(schemaProblems(lessonOf("nouns", noun))).toEqual([]);
  });
});

describe("schema.json: ошибки формата ловятся", () => {
  const cases: [string, any][] = [
    ["9 слов", lessonOf("nouns", noun, { words: lessonOf("nouns", noun).words.slice(0, 9) })],
    ["11 слов", lessonOf("nouns", noun, { words: [...lessonOf("nouns", noun).words, { ...noun(10), id: "sample-1-w10" }] })],
    ["урок 1 платный", lessonOf("nouns", noun, { free: false })],
    ["урок 4 бесплатный", lessonOf("nouns", noun, { id: "sample-4", number: 4, free: true })],
    ["неизвестный раздел", lessonOf("animals", noun)],
    ["лишнее поле урока", lessonOf("nouns", noun, { author: "я" })],
    ["номер урока не целое", lessonOf("nouns", noun, { number: 1.5 })],
    ["id урока с заглавными", lessonOf("nouns", noun, { id: "Sample-1" })],
    ["нет topicId", lessonOf("nouns", noun, { topicId: undefined })],
    ["у слова нет reviewed", lessonOf("nouns", (i) => ({ ...noun(i), reviewed: undefined }))],
    ["reviewed: true вместо false или объекта", lessonOf("nouns", (i) => ({ ...noun(i), reviewed: true }))],
    ["reviewed без даты", lessonOf("nouns", (i) => ({ ...noun(i), reviewed: { by: "Я" } }))],
    ["reviewed с неверной датой", lessonOf("nouns", (i) => ({ ...noun(i), reviewed: { by: "Я", at: "13.10.2026" } }))],
    ["he с огласовками", lessonOf("nouns", (i) => ({ ...noun(i), he: "חָתוּל" }))],
    ["he латиницей", lessonOf("nouns", (i) => ({ ...noun(i), he: "cat" }))],
    ["niqqud без огласовок", lessonOf("nouns", (i) => ({ ...noun(i), niqqud: "חתול" }))],
    ["translit латиницей", lessonOf("nouns", (i) => ({ ...noun(i), translit: "hatul" }))],
    ["translit с заглавной", lessonOf("nouns", (i) => ({ ...noun(i), translit: "Хату́ль" }))],
    ["translit с буквой ё", lessonOf("nouns", (i) => ({ ...noun(i), translit: "хатёль" }))],
    ["ударение в фразе", lessonOf("nouns", (i) => ({ ...noun(i), example: { ...noun(i).example, translit: "зэ хату́ль шахо́р" } }))],
    ["пустой перевод", lessonOf("nouns", (i) => ({ ...noun(i), ru: "" }))],
    ["перевод с пробелом по краям", lessonOf("nouns", (i) => ({ ...noun(i), ru: " кот" }))],
    ["существительное без рода", lessonOf("nouns", (i) => ({ ...noun(i), gender: undefined }))],
    ["существительное без фразы", lessonOf("nouns", (i) => ({ ...noun(i), example: undefined }))],
    ["неверный род", lessonOf("nouns", (i) => ({ ...noun(i), gender: "n" }))],
    ["формы у существительного", lessonOf("nouns", (i) => ({ ...noun(i), forms: adjective().forms }))],
    ["прилагательное без forms", lessonOf("adjectives", (i) => ({ ...adjective(), forms: undefined, id: `x-${i}` }))],
    ["прилагательное с родом", lessonOf("adjectives", () => ({ ...adjective(), gender: "m" }))],
    ["в forms нет формы fp", lessonOf("adjectives", () => ({ ...adjective(), forms: { f: adjective().forms.f, mp: adjective().forms.mp } }))],
    ["глагол без фразы", lessonOf("verbs", () => ({ ...verb(), example: undefined }))],
    ["глагол с родом", lessonOf("verbs", () => ({ ...verb(), gender: "m" }))],
    ["картинка вне /words", lessonOf("nouns", (i) => ({ ...noun(i), image: "/img/cat.svg" }))],
    ["озвучка не mp3", lessonOf("nouns", (i) => ({ ...noun(i), audio: "/audio/cat.wav" }))],
    ["лишнее поле слова", lessonOf("nouns", (i) => ({ ...noun(i), plural: "חתולים" }))],
    [
      "id слова без ключа",
      lessonOf("nouns", noun, { words: lessonOf("nouns", noun).words.map((w: any) => ({ ...w, id: "sample-1" })) }),
    ],
  ];

  for (const [name, lesson] of cases) {
    it(name, () => {
      // undefined в JSON не бывает: так же, как при чтении файла, такие поля отсутствуют.
      const asFile = JSON.parse(JSON.stringify(lesson));
      expect(schemaProblems(asFile).length, name).toBeGreaterThan(0);
    });
  }
});

import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { BINYAN_KEYS, FREE_LESSONS_PER_TOPIC, GIZRA_KEYS, VERB_FORM_KEYS, WORDS_PER_LESSON } from "@milav/shared";
import { schema, schemaProblems } from "./validate";
import { katavWord } from "./verbFixture";

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

/** Глагол: инфинитив и блок verb с полной таблицей из 27 форм (образец «писать», `verbFixture.ts`). */
const verb = (): any => ({ ...katavWord(), reviewed: { by: "Проверяющий", at: "2026-10-13" } });

/** Глагол с одним изменением внутри блока verb. */
const verbWith = (change: (v: any) => void): any => {
  const w = verb();
  change(w.verb);
  return w;
};

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

  it("ключи форм глагола и бинъяны в схеме равны константам shared", () => {
    const defs = (schema as any).definitions;
    const byTense = { present: "presentForms", past: "pastForms", future: "futureForms", imperative: "imperativeForms" } as const;
    for (const [tense, name] of Object.entries(byTense)) {
      const keys = [...VERB_FORM_KEYS[tense as keyof typeof byTense]];
      expect(defs[name].required, `${tense}: required`).toEqual(keys);
      expect(Object.keys(defs[name].properties), `${tense}: properties`).toEqual(keys);
    }
    expect(defs.verb.properties.binyan.enum).toEqual([...BINYAN_KEYS]);
    expect(defs.verb.required).toEqual(["binyan", "root", "present", "past", "future"]);
    expect(defs.verb.properties.gizra.items.enum).toEqual([...GIZRA_KEYS]);
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

  it("глагол без повелительного наклонения (у части глаголов его нет)", () => {
    expect(schemaProblems(lessonOf("verbs", () => verbWith((v) => delete v.imperative)))).toEqual([]);
  });

  it("глагол с озвучкой форм: /audio/<id>-form-<время>-<ключ>.mp3", () => {
    const word = () => verbWith((v) => (v.past["3ms"].audio = "/audio/sample-1-w0-form-past-3ms.mp3"));
    expect(schemaProblems(lessonOf("verbs", word))).toEqual([]);
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
    ["глагол без блока verb", lessonOf("verbs", () => ({ ...verb(), verb: undefined }))],
    ["глагол с forms вместо verb", lessonOf("verbs", () => ({ ...verb(), forms: adjective().forms }))],
    ["блок verb у существительного", lessonOf("nouns", (i) => ({ ...noun(i), verb: verb().verb }))],
    ["блок verb у прилагательного", lessonOf("adjectives", () => ({ ...adjective(), verb: verb().verb }))],
    ["неизвестный бинъян", lessonOf("verbs", () => verbWith((v) => (v.binyan = "kal")))],
    ["нет бинъяна", lessonOf("verbs", () => verbWith((v) => delete v.binyan))],
    ["нет корня", lessonOf("verbs", () => verbWith((v) => delete v.root))],
    ["корень из двух букв", lessonOf("verbs", () => verbWith((v) => (v.root = "כת")))],
    ["корень с конечной буквой", lessonOf("verbs", () => verbWith((v) => (v.root = "כתך")))],
    ["корень с огласовками", lessonOf("verbs", () => verbWith((v) => (v.root = "כָּתַב")))],
    ["нет блока настоящего времени", lessonOf("verbs", () => verbWith((v) => delete v.present))],
    ["нет блока будущего времени", lessonOf("verbs", () => verbWith((v) => delete v.future))],
    ["в настоящем нет формы fp", lessonOf("verbs", () => verbWith((v) => delete v.present.fp))],
    ["в прошедшем нет формы 3p", lessonOf("verbs", () => verbWith((v) => delete v.past["3p"]))],
    ["в будущем нет формы 3fp", lessonOf("verbs", () => verbWith((v) => delete v.future["3fp"]))],
    ["в прошедшем лишняя форма 3mp", lessonOf("verbs", () => verbWith((v) => (v.past["3mp"] = v.past["3p"])))],
    ["повелительное неполное (нет fp)", lessonOf("verbs", () => verbWith((v) => delete v.imperative.fp))],
    ["форма глагола без транскрипции", lessonOf("verbs", () => verbWith((v) => delete v.past["1s"].translit))],
    ["форма глагола без огласовок", lessonOf("verbs", () => verbWith((v) => (v.future["1s"].niqqud = "אכתוב")))],
    ["форма глагола с огласовками в he", lessonOf("verbs", () => verbWith((v) => (v.present.ms.he = "כּוֹתֵב")))],
    ["озвучка формы не mp3", lessonOf("verbs", () => verbWith((v) => (v.present.ms.audio = "/audio/x.wav")))],
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

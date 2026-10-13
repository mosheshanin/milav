import { describe, expect, it } from "vitest";
import {
  ALPHABET_GROUPS,
  ALPHABET_QUESTION_TYPES,
  ALPHABET_QUIZ_RULES,
  FINAL_LETTERS,
  HEBREW_LETTERS,
  LETTER_KEYS,
  LETTER_NAMES,
  LETTER_STAGES,
  QUESTION_TITLES,
  QUESTION_TYPES,
  STAGES,
  WORD_QUIZ_RULES,
  baseLetter,
  isAlphabetLesson,
  isFinalForm,
  isFormPair,
  isLetter,
  isWord,
  lessonItems,
  quizRulesFor,
  stagesFor,
  type AlphabetLesson,
  type Lesson,
  type Letter,
  type Word,
} from "./index";

const letter = (he: string): Letter => ({
  id: `alphabet-1-${LETTER_KEYS[he]}`,
  he,
  name: { he: "אלף", niqqud: "אָלֶף", ru: LETTER_NAMES[he]! },
  sound: "а",
  example: { he: "אבא", niqqud: "אַבָּא", translit: "а́ба", ru: "папа" },
  reviewed: false,
});

const word: Word = { id: "animals-1-cat", he: "חתול", translit: "хату́ль", ru: "кот", reviewed: false };

const alphabetLesson: AlphabetLesson = {
  id: "alphabet-1",
  topicId: "alphabet",
  section: "alphabet",
  topic: "Алфавит",
  number: 1,
  free: true,
  title: "Первые буквы",
  letters: ["א", "ב"].map(letter),
};

const wordLesson: Lesson = {
  id: "animals-1",
  topicId: "animals",
  section: "nouns",
  topic: "Животные",
  number: 1,
  free: true,
  title: "Животные",
  words: [word],
};

describe("группы алфавита", () => {
  it("вместе дают все 27 форм по одному разу и в алфавитном порядке", () => {
    expect(ALPHABET_GROUPS.flat()).toEqual([...HEBREW_LETTERS]);
  });

  it("5 уроков: 5+5+5+6+6", () => {
    expect(ALPHABET_GROUPS.map((g) => g.length)).toEqual([5, 5, 5, 6, 6]);
  });

  it("конечная форма стоит сразу после обычной и в том же уроке", () => {
    for (const group of ALPHABET_GROUPS) {
      group.forEach((he, i) => {
        if (!isFinalForm(he)) return;
        expect(i, `${he}: конечная форма первая в уроке`).toBeGreaterThan(0);
        expect(group[i - 1]!.normalize("NFC")).toBe(regularOf(he));
      });
    }
  });

  it("одинаково звучащие ט/ת, כ/ק, א/ע не попадают в один урок (кроме обычной и конечной формы одной буквы)", () => {
    for (const [a, b] of [["ט", "ת"], ["כ", "ק"], ["א", "ע"]] as const) {
      const lessonOfA = ALPHABET_GROUPS.findIndex((g) => g.includes(a));
      const lessonOfB = ALPHABET_GROUPS.findIndex((g) => g.includes(b));
      expect(lessonOfA, `${a} и ${b}`).not.toBe(lessonOfB);
    }
  });
});

function regularOf(final: string): string {
  return { ך: "כ", ם: "מ", ן: "נ", ף: "פ", ץ: "צ" }[final]!;
}

describe("ключи и названия букв", () => {
  it("ключи есть у всех 27 форм, уникальны и подходят для id", () => {
    expect(Object.keys(LETTER_KEYS).sort()).toEqual([...HEBREW_LETTERS].sort());
    const keys = Object.values(LETTER_KEYS);
    expect(new Set(keys).size).toBe(27);
    for (const key of keys) expect(key).toMatch(/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/);
  });

  it("конечные формы это ровно FINAL_LETTERS", () => {
    expect([...HEBREW_LETTERS].filter(isFinalForm).join("")).toBe(FINAL_LETTERS);
    expect(isFinalForm("כ")).toBe(false);
    expect(isFinalForm("ךם")).toBe(false);
  });
});

describe("правила по виду урока", () => {
  it("обычный урок: 25 вопросов, по 5 из 5 типов, сдан при 20, допустимо 5 ошибок", () => {
    expect(WORD_QUIZ_RULES).toEqual({ size: 25, perType: 5, pass: 20, maxMistakes: 5 });
    expect(WORD_QUIZ_RULES.size).toBe(QUESTION_TYPES.length * WORD_QUIZ_RULES.perType);
  });

  it("алфавит: 20 вопросов, по 5 из 4 типов, сдан при 16 (те же 80%), допустимо 4 ошибки", () => {
    expect(ALPHABET_QUIZ_RULES).toEqual({ size: 20, perType: 5, pass: 16, maxMistakes: 4 });
    expect(ALPHABET_QUIZ_RULES.size).toBe(ALPHABET_QUESTION_TYPES.length * ALPHABET_QUIZ_RULES.perType);
    expect(ALPHABET_QUIZ_RULES.pass / ALPHABET_QUIZ_RULES.size).toBe(WORD_QUIZ_RULES.pass / WORD_QUIZ_RULES.size);
    expect(ALPHABET_QUIZ_RULES.maxMistakes).toBe(ALPHABET_QUIZ_RULES.size - ALPHABET_QUIZ_RULES.pass);
  });

  it("правила выбираются по виду урока; неизвестный урок получает обычные", () => {
    expect(quizRulesFor(alphabetLesson)).toBe(ALPHABET_QUIZ_RULES);
    expect(quizRulesFor(wordLesson)).toBe(WORD_QUIZ_RULES);
    expect(quizRulesFor(undefined)).toBe(WORD_QUIZ_RULES);
  });

  it("в каждом уроке алфавита букв не меньше, чем вопросов одного типа (внутри типа буквы не повторяются)", () => {
    for (const group of ALPHABET_GROUPS) expect(group.length).toBeGreaterThanOrEqual(ALPHABET_QUIZ_RULES.perType);
  });

  it("у каждого типа вопроса есть заголовок", () => {
    for (const type of [...QUESTION_TYPES, ...ALPHABET_QUESTION_TYPES]) expect(QUESTION_TITLES[type].length).toBeGreaterThan(0);
  });
});

describe("вид урока", () => {
  it("урок алфавита и обычный урок различаются", () => {
    expect(isAlphabetLesson(alphabetLesson)).toBe(true);
    expect(isAlphabetLesson(wordLesson)).toBe(false);
  });

  it("элементы урока: буквы или слова", () => {
    expect(lessonItems(alphabetLesson)).toBe(alphabetLesson.letters);
    expect(lessonItems(wordLesson)).toBe(wordLesson.words);
  });

  it("этапы: у букв без «говори», у слов все четыре", () => {
    expect(stagesFor(alphabetLesson)).toEqual(["listen", "write", "type"]);
    expect(stagesFor(wordLesson)).toEqual(["listen", "speak", "write", "type"]);
    expect(LETTER_STAGES).not.toContain("speak");
    expect(LETTER_STAGES.every((s) => STAGES.includes(s))).toBe(true);
  });

  it("буква и слово отличаются", () => {
    expect(isLetter(alphabetLesson.letters[0]!)).toBe(true);
    expect(isWord(alphabetLesson.letters[0]!)).toBe(false);
    expect(isWord(word)).toBe(true);
    expect(isLetter(word)).toBe(false);
  });
});

describe("обычная и конечная форма", () => {
  it("baseLetter приводит конечную форму к обычной", () => {
    expect([..."ךםןףץ"].map(baseLetter).join("")).toBe("כמנפצ");
    expect(baseLetter("א")).toBe("א");
  });

  it("isFormPair: пара только у обычной и конечной формы одной буквы", () => {
    expect(isFormPair("כ", "ך")).toBe(true);
    expect(isFormPair("ך", "כ")).toBe(true);
    expect(isFormPair("כ", "כ")).toBe(false);
    expect(isFormPair("כ", "ם")).toBe(false);
    expect(isFormPair("מ", "ם")).toBe(true);
  });

  it("в каждом уроке пара форм стоит рядом", () => {
    for (const group of ALPHABET_GROUPS) {
      const pairs = group.flatMap((a, i) => group.slice(i + 1).filter((b) => isFormPair(a, b)).map((b) => a + b));
      expect(pairs.length).toBe(group.filter(isFinalForm).length);
    }
  });
});

import { describe, expect, it } from "vitest";
import {
  BINYANIM,
  BINYAN_KEYS,
  FUTURE_KEYS,
  IMPERATIVE_KEYS,
  PAST_KEYS,
  PRESENT_KEYS,
  VERB_FORMS_TOTAL,
  VERB_FORM_KEYS,
  VERB_FORM_LABELS,
  VERB_PRONOUNS_HE,
  VERB_TENSES,
  isBinyan,
  verbFormAudioPath,
  verbForms,
  type VerbData,
  type WordForm,
} from "./index";

const form = (he: string): WordForm => ({ he, niqqud: he, translit: he });
const set = (keys: readonly string[]) => Object.fromEntries(keys.map((k) => [k, form(k)]));

function verb(withImperative = true): VerbData {
  return {
    binyan: "paal",
    root: "כתב",
    present: set(PRESENT_KEYS),
    past: set(PAST_KEYS),
    future: set(FUTURE_KEYS),
    ...(withImperative ? { imperative: set(IMPERATIVE_KEYS) } : {}),
  } as VerbData;
}

describe("глаголы: константы", () => {
  it("в полной таблице 27 форм: 4 + 9 + 10 + 4", () => {
    expect([PRESENT_KEYS.length, PAST_KEYS.length, FUTURE_KEYS.length, IMPERATIVE_KEYS.length]).toEqual([4, 9, 10, 4]);
    expect(VERB_FORMS_TOTAL).toBe(27);
  });

  it("ключи форм внутри времени не повторяются", () => {
    for (const tense of VERB_TENSES) {
      const keys = VERB_FORM_KEYS[tense];
      expect(new Set(keys).size, tense).toBe(keys.length);
    }
  });

  it("у каждой формы есть подпись на русском, а у прошедшего и будущего ещё и местоимение иврита", () => {
    for (const tense of VERB_TENSES) {
      for (const key of VERB_FORM_KEYS[tense]) {
        expect(VERB_FORM_LABELS[tense][key], `${tense}.${key}`).toBeTruthy();
        if (tense === "past" || tense === "future") expect(VERB_PRONOUNS_HE[key], `${tense}.${key}`).toBeTruthy();
      }
    }
  });

  it("бинъяны: у каждого название, приставки и ключ из списка", () => {
    for (const key of BINYAN_KEYS) {
      expect(BINYANIM[key].ru).toBeTruthy();
      expect(BINYANIM[key].he).toMatch(/^[א-תְ-ּ]+$/);
      expect(BINYANIM[key].infinitivePrefix.startsWith("ל")).toBe(true);
      expect(isBinyan(key)).toBe(true);
    }
    expect(isBinyan("kal")).toBe(false);
  });
});

describe("глаголы: verbForms и путь к озвучке", () => {
  it("возвращает формы по порядку времён: настоящее, прошедшее, будущее, повелительное", () => {
    const entries = verbForms(verb());
    expect(entries).toHaveLength(27);
    expect(entries.slice(0, 4).map((e) => `${e.tense}.${e.key}`)).toEqual([
      "present.ms",
      "present.fs",
      "present.mp",
      "present.fp",
    ]);
    expect(entries[4]).toMatchObject({ tense: "past", key: "1s" });
    expect(entries[13]).toMatchObject({ tense: "future", key: "1s" });
    expect(entries[26]).toMatchObject({ tense: "imperative", key: "fp" });
  });

  it("без повелительного наклонения форм 23", () => {
    expect(verbForms(verb(false))).toHaveLength(23);
  });

  it("озвучка формы: /audio/<id слова>-form-<время>-<ключ>.mp3", () => {
    expect(verbFormAudioPath("paal-1-write", "past", "3ms")).toBe("/audio/paal-1-write-form-past-3ms.mp3");
    expect(verbFormAudioPath("paal-1-write", "imperative", "fp")).toMatch(/^\/audio\/[a-z0-9-]+\.mp3$/);
  });
});

describe("книжные формы (вопрос 31)", () => {
  it("книжные: будущее 2fp и 3fp, повелительное fp; остальные нет", async () => {
    const { isBookForm, BOOK_FORMS } = await import("./verbs");
    expect(isBookForm("future", "2fp")).toBe(true);
    expect(isBookForm("future", "3fp")).toBe(true);
    expect(isBookForm("imperative", "fp")).toBe(true);
    expect(isBookForm("future", "3mp")).toBe(false);
    expect(isBookForm("past", "2fp")).toBe(false);
    expect(isBookForm("present", "fp")).toBe(false);
    for (const [tense, keys] of Object.entries(BOOK_FORMS)) {
      for (const key of keys!) expect(VERB_FORM_KEYS[tense as keyof typeof VERB_FORM_KEYS]).toContain(key);
    }
  });
});

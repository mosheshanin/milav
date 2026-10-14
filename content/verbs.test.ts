import { describe, expect, it } from "vitest";
import type { Lesson, VerbData } from "@milav/shared";
import { setProblems, verbProblems } from "./rules";
import { KATAV, KATAV_INFINITIVE, katavWord } from "./verbFixture";

/** Образец «писать» с одним изменением. Возвращает нарушения текстом. */
function problemsAfter(change: (v: any) => void, he: string = KATAV_INFINITIVE.he): string {
  const verb = structuredClone(KATAV) as any;
  change(verb);
  return verbProblems(he, verb as VerbData).join("\n");
}

describe("глаголы: образец проходит все правила", () => {
  it("«писать» (пааль, корень כתב): без замечаний", () => {
    expect(verbProblems(KATAV_INFINITIVE.he, KATAV)).toEqual([]);
  });

  it("повелительное наклонение необязательно", () => {
    expect(problemsAfter((v) => delete v.imperative)).toBe("");
  });

  it("в образце 27 форм, и у слов с одинаковым написанием разные огласовки (ты м. и ты ж. в прошедшем)", () => {
    expect(KATAV.past["2ms"].he).toBe(KATAV.past["2fs"].he);
    expect(KATAV.past["2ms"].niqqud).not.toBe(KATAV.past["2fs"].niqqud);
    expect(KATAV.past["2ms"].translit).not.toBe(KATAV.past["2fs"].translit);
  });
});

describe("глаголы: правила ловят ошибки", () => {
  it("неизвестный бинъян", () => {
    expect(problemsAfter((v) => (v.binyan = "kal"))).toContain("неизвестен");
  });

  it("корень не из 3–4 букв или с конечной формой", () => {
    expect(problemsAfter((v) => (v.root = "כת"))).toContain("нужны 3–4 буквы");
    expect(problemsAfter((v) => (v.root = "כתך"))).toContain("нужны 3–4 буквы");
  });

  it("буквы корня не найдены в инфинитиве и в формах", () => {
    const text = problemsAfter((v) => (v.root = "כתר"));
    expect(text).toContain("инфинитив לכתוב: нет букв корня כתר");
    expect(text).toContain("present.ms: в כותב нет букв корня כתר");
  });

  it("форма написана без одной из букв корня", () => {
    expect(problemsAfter((v) => (v.past["1s"] = { ...v.past["1s"], he: "כתתי", niqqud: "כָּתַתִּי" }))).toContain("past.1s: в כתתי нет букв корня");
  });

  it("не хватает формы, лишний ключ, нет обязательного времени", () => {
    expect(problemsAfter((v) => delete v.past["3p"])).toContain("past.3p: нет формы");
    expect(problemsAfter((v) => delete v.future["3fp"])).toContain("future.3fp: нет формы");
    expect(problemsAfter((v) => (v.past["3mp"] = v.past["3p"]))).toContain("past.3mp: лишний ключ формы");
    expect(problemsAfter((v) => delete v.future)).toContain("нет блока future");
  });

  it("неполное повелительное наклонение (есть блок, нет формы)", () => {
    expect(problemsAfter((v) => delete v.imperative.fp)).toContain("imperative.fp: нет формы");
  });

  it("огласовки другого слова", () => {
    expect(problemsAfter((v) => (v.past["3ms"].niqqud = "כָּתַם"))).toContain("past.3ms: огласовки");
  });

  it("транскрипция: нет знака ударения, два знака, опечатка в согласной", () => {
    expect(problemsAfter((v) => (v.past["1s"].translit = "катавти"))).toContain("past.1s");
    expect(problemsAfter((v) => (v.past["1s"].translit = "ка́тавти́"))).toContain("past.1s");
    const typo = problemsAfter((v) => (v.future["1s"].translit = "эсто́в"));
    expect(typo).toContain("future.1s");
    expect(typo).toContain("нет подходящей");
  });

  it("слово из одного слога без знака ударения: «ктов» верно, «кто́в» нет", () => {
    expect(problemsAfter((v) => (v.imperative.ms.translit = "ктов"))).toBe("");
    expect(problemsAfter((v) => (v.imperative.ms.translit = "кто́в"))).toContain("imperative.ms");
  });

  it("бинъян не соответствует написанию: инфинитив пааль, а указан хифъиль или нифъаль", () => {
    const hifil = problemsAfter((v) => (v.binyan = "hifil"));
    expect(hifil).toContain("в бинъяне Хифъиль он начинается с לה");
    expect(hifil).toContain("present.ms: כותב в бинъяне Хифъиль начинается с מ");
    expect(problemsAfter((v) => (v.binyan = "nifal"))).toContain("начинается с נ");
  });

  it("инфинитив без ל в начале", () => {
    expect(problemsAfter(() => undefined, "כתוב")).toContain("инфинитив כתוב: в бинъяне Пааль он начинается с ל");
  });
});

describe("глаголы: правила набора уроков", () => {
  function verbLesson(over: Partial<Lesson> = {}): Lesson {
    return {
      id: "paal-1",
      topicId: "paal",
      section: "verbs",
      topic: "Пааль",
      number: 1,
      free: true,
      title: "Первые глаголы",
      words: [{ ...(katavWord() as any), id: "paal-1-write" }],
      ...over,
    };
  }

  it("корректный урок-бинъян без замечаний", () => {
    expect(setProblems([verbLesson()])).toEqual([]);
  });

  it("у глагола нет блока verb", () => {
    const word = { ...(katavWord() as any), id: "paal-1-write", verb: undefined };
    expect(setProblems([verbLesson({ words: [word] })]).join("\n")).toContain("paal-1-write: у глагола нет блока verb");
  });

  it("блок verb у существительного", () => {
    const text = setProblems([verbLesson({ section: "nouns", topicId: "animals", id: "animals-1", topic: "Животные" })]).join("\n");
    expect(text).toContain("блок verb есть у слова раздела nouns");
  });

  it("ошибки формы глагола попадают в набор с id слова", () => {
    const word = { ...(katavWord() as any), id: "paal-1-write" };
    delete word.verb.past["3p"];
    expect(setProblems([verbLesson({ words: [word] })]).join("\n")).toContain("paal-1-write: past.3p: нет формы");
  });

  it("в теме-бинъяне глагол другого бинъяна", () => {
    const text = setProblems([verbLesson({ topicId: "piel", id: "piel-1", topic: "Пиэль", words: [{ ...(katavWord() as any), id: "piel-1-write" }] })]).join("\n");
    expect(text).toContain("piel-1-write: бинъян paal в теме piel");
  });

  it("тема-бинъян должна быть в разделе глаголов", () => {
    const text = setProblems([verbLesson({ section: "nouns" })]).join("\n");
    expect(text).toContain("тема paal это бинъян, раздел должен быть verbs");
  });

  it("тематическая тема (не бинъян) может смешивать бинъяны", () => {
    const text = setProblems([verbLesson({ topicId: "motion", id: "motion-1", topic: "Движение", words: [{ ...(katavWord() as any), id: "motion-1-write" }] })]).join("\n");
    expect(text).not.toContain("в теме");
  });
});

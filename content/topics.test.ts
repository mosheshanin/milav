import { describe, expect, it } from "vitest";
import type { Lesson } from "@milav/shared";
import { lessons } from "./index";
import { SET_RULES, setProblems } from "./rules";

describe("темы и уроки (правила набора)", () => {
  for (const rule of SET_RULES) {
    it(rule.name, () => {
      expect(rule.check(lessons)).toEqual([]);
    });
  }
});

/** Минимальный урок для проверки самих правил: слова не заполняются полностью, правилам набора это не нужно. */
function lesson(over: Partial<Lesson> & { he?: string[] } = {}): Lesson {
  const { he = ["אאא"], ...rest } = over;
  const id = rest.id ?? "animals-1";
  return {
    id,
    topicId: "animals",
    section: "nouns",
    topic: "Животные",
    number: 1,
    free: true,
    title: "Урок",
    words: he.map((h, i) => ({ id: `${id}-w${i}`, he: h, translit: "", ru: "", reviewed: false as const })),
    ...rest,
  };
}

describe("правила набора ловят нарушения", () => {
  const ok = [lesson({ id: "animals-1", number: 1 }), lesson({ id: "animals-2", number: 2, free: false, he: ["בבב"] })];

  it("корректный набор без замечаний", () => {
    expect(setProblems(ok)).toEqual([]);
  });

  it("id не равен topicId-номер", () => {
    expect(setProblems([lesson({ id: "animals-7", number: 1 })]).join("\n")).toContain("ожидался id animals-1");
  });

  it("повтор id урока и слова", () => {
    const text = setProblems([lesson({ id: "animals-1" }), lesson({ id: "animals-1" })]).join("\n");
    expect(text).toContain("повтор id урока animals-1");
    expect(text).toContain("повтор id слова animals-1-w0");
  });

  it("разные названия и разделы в одной теме", () => {
    const text = setProblems([
      lesson({ id: "animals-1", number: 1 }),
      lesson({ id: "animals-2", number: 2, topic: "Звери", section: "verbs", he: ["בבב"] }),
    ]).join("\n");
    expect(text).toContain("разные названия темы");
    expect(text).toContain("разные разделы");
  });

  it("одно название у двух тем", () => {
    const text = setProblems([lesson({ id: "animals-1" }), lesson({ id: "zoo-1", topicId: "zoo", he: ["בבב"] })]).join("\n");
    expect(text).toContain("название «Животные» у тем animals и zoo");
  });

  it("пропуск в номерах", () => {
    const text = setProblems([lesson({ id: "animals-1", number: 1 }), lesson({ id: "animals-3", number: 3, he: ["בבב"] })]).join("\n");
    expect(text).toContain("ожидались подряд с 1");
  });

  it("неверные free: платный первый урок и бесплатный второй", () => {
    expect(setProblems([lesson({ free: false })]).join("\n")).toContain("animals-1: free=false, а должно быть true");
    const four = [1, 2].map((n) => lesson({ id: `animals-${n}`, number: n, free: true, he: [`א${"ב".repeat(n)}`] }));
    expect(setProblems(four).join("\n")).toContain("animals-2: free=true, а должно быть false");
  });

  it("то же слово иврита в двух уроках темы", () => {
    const text = setProblems([lesson({ id: "animals-1", number: 1 }), lesson({ id: "animals-2", number: 2 })]).join("\n");
    expect(text).toContain("אאא: есть в animals-1-w0 и в animals-2-w0");
  });
});

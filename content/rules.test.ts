import { describe, expect, it } from "vitest";
import { ACUTE, skeletonProblems, stressProblems, stripStress, syllables } from "./rules";

const a = ACUTE;

describe("транскрипция: слоги и ударение", () => {
  it("слоги считаются по гласным", () => {
    expect(syllables("сус")).toBe(1);
    expect(syllables("хатуль")).toBe(2);
    expect(syllables(`хату${a}ль`)).toBe(2);
    expect(syllables("арье")).toBe(2);
    expect(syllables("пиль")).toBe(1);
  });

  it("слово из 2+ слогов: ровно один знак после гласной", () => {
    expect(stressProblems(`хату${a}ль`)).toEqual([]);
    expect(stressProblems(`ке${a}лев`)).toEqual([]);
    expect(stressProblems(`арье${a}`)).toEqual([]);
  });

  it("слово из одного слога без знака", () => {
    expect(stressProblems("сус")).toEqual([]);
    expect(stressProblems("пиль")).toEqual([]);
    expect(stressProblems(`су${a}с`)).not.toEqual([]);
  });

  it("нет знака, два знака, знак не после гласной", () => {
    expect(stressProblems("хатуль")).not.toEqual([]);
    expect(stressProblems(`ха${a}ту${a}ль`)).not.toEqual([]);
    expect(stressProblems(`хатуль${a}`)).not.toEqual([]);
    expect(stressProblems(`${a}хатуль`)).not.toEqual([]);
  });

  it("слова через дефис и пробел проверяются по частям", () => {
    // В «тель» один слог (знака нет), в «авив» два слога (знак один): верно.
    expect(stressProblems(`тель-ави${a}в`)).toEqual([]);
    // Знак в односложной части и его нет в двусложной: два нарушения, по одному на часть.
    const wrong = stressProblems(`те${a}ль-авив`);
    expect(wrong).toHaveLength(2);
    expect(wrong[0]).toContain("одного слога");
    expect(wrong[1]).toContain("авив");
  });

  it("слово без гласных не принимается", () => {
    expect(stressProblems("ль")).not.toEqual([]);
  });

  it("stripStress убирает только знак ударения", () => {
    expect(stripStress(`хату${a}ль`)).toBe("хатуль");
  });
});

describe("транскрипция: согласные иврита по порядку", () => {
  const ok: [string, string][] = [
    ["חתול", `хату${a}ль`],
    ["כלב", `ке${a}лев`],
    ["סוס", "сус"],
    ["ציפור", `ципо${a}р`],
    ["דג", "даг"],
    ["פרה", `пара${a}`],
    ["ארנב", `арна${a}в`],
    ["עכבר", `ахба${a}р`],
    ["פיל", "пиль"],
    ["אריה", `арье${a}`],
    ["שולחן", `шульха${a}н`],
    ["ספר", `се${a}фер`],
  ];

  for (const [he, translit] of ok) {
    it(`${he} → ${translit}`, () => {
      expect(skeletonProblems(he, translit)).toEqual([]);
    });
  }

  it("лишняя буква вместо нужной ловится", () => {
    expect(skeletonProblems("ציפור", "сипор")).not.toEqual([]);
    expect(skeletonProblems("חתול", "катуль")).not.toEqual([]);
  });

  it("пропущенная согласная ловится", () => {
    expect(skeletonProblems("חתול", "хатуь")).not.toEqual([]);
  });

  it("порядок согласных важен", () => {
    expect(skeletonProblems("חתול", "лутах")).not.toEqual([]);
  });

  it("редкие звуки передаются двумя буквами: ג как «дж»", () => {
    expect(skeletonProblems("גרפה", "джираф")).toEqual([]);
  });
});

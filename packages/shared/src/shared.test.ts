import { describe, expect, it } from "vitest";
import {
  HEBREW_LETTERS,
  consonantSkeleton,
  isSpeechMatch,
  normalizeHebrew,
  statusForPassedLessons,
} from "./index";

describe("статусы по сданным урокам", () => {
  const cases: [number, string][] = [
    [0, "Пешка"], [5, "Пешка"], [6, "Конь"], [20, "Конь"], [21, "Слон"],
    [50, "Слон"], [51, "Ладья"], [100, "Ладья"], [101, "Ферзь"], [300, "Ферзь"],
    [301, "Король"], [500, "Король"], [900, "Король"],
  ];
  it.each(cases)("%i сданных уроков -> %s", (n, name) => {
    expect(statusForPassedLessons(n).name).toBe(name);
  });

  it("показывает, сколько уроков до следующего статуса", () => {
    expect(statusForPassedLessons(3).nextAt).toBe(6);
    expect(statusForPassedLessons(400).nextAt).toBeNull();
  });

  it("отрицательные и дробные значения не ломают расчёт", () => {
    expect(statusForPassedLessons(-4).name).toBe("Пешка");
    expect(statusForPassedLessons(5.9).name).toBe("Пешка");
  });
});

describe("нормализация иврита", () => {
  it("убирает огласовки и знаки, конечные формы приводит к обычным", () => {
    expect(normalizeHebrew("צִפּוֹר.")).toBe("צפור");
    expect(normalizeHebrew("שלום!")).toBe("שלומ");
  });

  it("согласный скелет не зависит от ו и י", () => {
    expect(consonantSkeleton("ציפור")).toBe(consonantSkeleton("צפור"));
  });

  it("в алфавите ровно 27 форм без повторов", () => {
    expect(HEBREW_LETTERS.length).toBe(27);
    expect(new Set(HEBREW_LETTERS).size).toBe(27);
  });
});

describe("сравнение произнесённого слова", () => {
  it("принимает точное совпадение и неполное написание", () => {
    expect(isSpeechMatch("ציפור", "ציפור")).toBe(true);
    expect(isSpeechMatch("צפור", "ציפור")).toBe(true);
    expect(isSpeechMatch("צִפּוֹר.", "ציפור")).toBe(true);
  });

  it("находит слово среди лишних слов", () => {
    expect(isSpeechMatch("זה ציפור", "ציפור")).toBe(true);
  });

  it("прощает одну ошибку только в длинных словах", () => {
    expect(isSpeechMatch("ארנה", "ארנב")).toBe(true);
    expect(isSpeechMatch("דה", "דג")).toBe(false);
    expect(isSpeechMatch("כלב", "סוס")).toBe(false);
  });

  it("не принимает пустой и нерелевантный результат", () => {
    expect(isSpeechMatch("", "ציפור")).toBe(false);
    expect(isSpeechMatch("hello", "ציפור")).toBe(false);
    expect(isSpeechMatch("חתול", "ציפור")).toBe(false);
  });
});

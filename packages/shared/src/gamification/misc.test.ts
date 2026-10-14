import { describe, expect, it } from "vitest";
import { cleanDisplayName } from "./names";
import { quantile, quartiles, ranksOf, sortBoard } from "./ranking";
import { statusPath } from "../status";

describe("имя в таблице", () => {
  it("обычное имя остаётся как есть", () => {
    expect(cleanDisplayName("Моше")).toBe("Моше");
    expect(cleanDisplayName("  Анна   Мария ")).toBe("Анна Мария");
  });

  it("убирает ссылки, @, управляющие и двунаправленные знаки", () => {
    expect(cleanDisplayName("Вася https://evil.example/x")).toBe("Вася");
    expect(cleanDisplayName("@spam_bot")).toBe("spam_bot");
    expect(cleanDisplayName("t.me/channel Ира")).toBe("Ира");
    expect(cleanDisplayName("A‮b​c\u0007")).toBe("Abc");
  });

  it("обрезает по знакам, не ломая составные символы, и заменяет пустое имя", () => {
    expect(Array.from(cleanDisplayName("я".repeat(50))).length).toBe(20);
    expect(cleanDisplayName("😀".repeat(30))).toBe("😀".repeat(20));
    expect(cleanDisplayName("")).toBe("Игрок");
    expect(cleanDisplayName("​​")).toBe("Игрок");
    expect(cleanDisplayName(null)).toBe("Игрок");
  });
});

describe("места в таблице", () => {
  it("порядок: очки, затем раньше набравший, затем id", () => {
    const sorted = sortBoard([
      { id: 3, points: 5, at: 100 },
      { id: 1, points: 9, at: 300 },
      { id: 2, points: 5, at: 50 },
      { id: 4, points: 5, at: 50 },
    ]);
    expect(sorted.map((e) => e.id)).toEqual([1, 2, 4, 3]);
  });

  it("равные очки делят место: 1, 2, 2, 4", () => {
    expect(ranksOf([10, 7, 7, 3])).toEqual([1, 2, 2, 4]);
    expect(ranksOf([])).toEqual([]);
    expect(ranksOf([4, 4, 4])).toEqual([1, 1, 1]);
  });

  it("квантили по ближайшему рангу", () => {
    expect(quantile([], 0.5)).toBe(0);
    expect(quartiles([40, 10, 20, 30])).toEqual({ p25: 10, p50: 20, p75: 30 });
    expect(quartiles([7])).toEqual({ p25: 7, p50: 7, p75: 7 });
    expect(quartiles(Array.from({ length: 100 }, (_, i) => i + 1))).toEqual({ p25: 25, p50: 50, p75: 75 });
  });
});

describe("путь к следующему статусу", () => {
  it("новичок: Пешка, до Коня 6 уроков", () => {
    expect(statusPath(0)).toMatchObject({ key: "pawn", from: 0, to: 6, passed: 0, fraction: 0, next: { key: "knight" } });
  });

  it("границы включительно: 5 уроков ещё Пешка, 6 уже Конь", () => {
    expect(statusPath(5)).toMatchObject({ key: "pawn", to: 6 });
    expect(statusPath(5).fraction).toBeCloseTo(5 / 6);
    expect(statusPath(6)).toMatchObject({ key: "knight", from: 6, to: 21, fraction: 0 });
    expect(statusPath(20)).toMatchObject({ key: "knight", to: 21 });
    expect(statusPath(21)).toMatchObject({ key: "bishop", from: 21, to: 51 });
  });

  it("Король: следующего нет, полоса заполнена", () => {
    expect(statusPath(301)).toMatchObject({ key: "king", from: 301, to: null, next: null, fraction: 1 });
    expect(statusPath(9999).key).toBe("king");
  });

  it("мусор не ломает: отрицательное и дробное", () => {
    expect(statusPath(-3).passed).toBe(0);
    expect(statusPath(6.9).passed).toBe(6);
  });
});

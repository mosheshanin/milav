import { describe, expect, it } from "vitest";
import { HEBREW_LETTERS, type TemplateItem } from "@milav/shared";
import {
  doneTotal,
  firstFreeSlot,
  letterCounts,
  letterStatus,
  nextIncompleteLetter,
  totalNeeded,
  withItem,
  withoutItem,
} from "./recordProgress";

const V = 5;
const item = (letter: string, slot: number): TemplateItem => ({ letter, slot, strokes: [], recordedAt: "2026-10-13 12:00:00" });
const fill = (letter: string, count = V) => Array.from({ length: count }, (_, slot) => item(letter, slot));

describe("прогресс записи шаблонов", () => {
  it("считает варианты по формам и игнорирует лишнее", () => {
    const items = [...fill("א", 3), item("ב", 0), item("ב", 0), item("ג", 7), item("x", 0), item("ד", -1)];
    expect(Object.fromEntries(letterCounts(items, V))).toEqual({ א: 3, ב: 1 });
    expect(doneTotal(items, V)).toBe(4);
  });

  it("всего нужно 27 форм по 5 вариантов", () => {
    expect(totalNeeded(V)).toBe(135);
    expect(doneTotal(HEBREW_LETTERS.flatMap((l) => fill(l)), V)).toBe(135);
  });

  it("состояние формы: пусто, не всё, готово", () => {
    expect(letterStatus(0, V)).toBe("empty");
    expect(letterStatus(1, V)).toBe("partial");
    expect(letterStatus(4, V)).toBe("partial");
    expect(letterStatus(5, V)).toBe("done");
  });

  it("первый свободный номер варианта", () => {
    expect(firstFreeSlot([], "א", V)).toBe(0);
    expect(firstFreeSlot([item("א", 0), item("א", 1), item("ב", 2)], "א", V)).toBe(2);
    // Дырка после удаления заполняется первой.
    expect(firstFreeSlot([item("א", 0), item("א", 2)], "א", V)).toBe(1);
    expect(firstFreeSlot(fill("א"), "א", V)).toBeNull();
  });

  it("следующая незаписанная форма идёт по алфавиту и по кругу", () => {
    expect(nextIncompleteLetter([], V)).toBe("א");
    expect(nextIncompleteLetter(fill("א"), V)).toBe("ב");
    expect(nextIncompleteLetter([], V, "א")).toBe("ב");
    // Пропускает готовые.
    expect(nextIncompleteLetter([...fill("ב"), ...fill("ג")], V, "א")).toBe("ד");
    // После последней формы возвращается к началу.
    expect(nextIncompleteLetter([], V, "ת")).toBe("א");
    // Недописанная форма тоже подходит; сама текущая проверяется в последнюю очередь.
    const onlyAleph = HEBREW_LETTERS.filter((l) => l !== "א").flatMap((l) => fill(l));
    expect(nextIncompleteLetter(onlyAleph, V, "ת")).toBe("א");
    expect(nextIncompleteLetter(onlyAleph, V, "א")).toBe("א");
  });

  it("когда записано всё, следующей нет", () => {
    expect(nextIncompleteLetter(HEBREW_LETTERS.flatMap((l) => fill(l)), V, "ת")).toBeNull();
  });

  it("сохранение заменяет вариант с тем же номером, удаление убирает", () => {
    const a = item("א", 1);
    const replaced = { ...a, recordedAt: "2026-10-14 08:00:00" };
    expect(withItem([a, item("א", 2)], replaced)).toContainEqual(replaced);
    expect(withItem([a, item("א", 2)], replaced)).toHaveLength(2);
    expect(withoutItem([a, item("א", 2)], "א", 1)).toEqual([item("א", 2)]);
    expect(withoutItem([a], "ב", 1)).toEqual([a]);
  });
});

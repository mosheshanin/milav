import { describe, expect, it } from "vitest";
import type { MyWordItem } from "@milav/shared";
import { filterWords, repeatCardText, repeatVerdict, returnsText, strengthFilled, wordsCount } from "./repeat";

const item = (id: string, box: number, dueIn: number): MyWordItem => ({
  word: { id, lessonId: "l", he: "א", translit: "а", ru: id },
  box,
  dueIn,
  reps: box,
  lapses: 0,
});

describe("повторение в приложении", () => {
  it("карточка на главной", () => {
    expect(repeatCardText({ due: 7, total: 20, nextDueIn: null })).toEqual({ line: "Пора повторить: 7 слов", canRepeat: true });
    expect(repeatCardText({ due: 1, total: 20, nextDueIn: null }).line).toBe("Пора повторить: 1 слово");
    expect(repeatCardText({ due: 0, total: 20, nextDueIn: 1 })).toEqual({ line: "Всё повторено. Следующие слова завтра.", canRepeat: false });
    expect(repeatCardText({ due: 0, total: 20, nextDueIn: 4 }).line).toBe("Всё повторено. Следующие слова через 4 дн.");
  });

  it("подписи", () => {
    expect([1, 2, 5, 21].map(wordsCount)).toEqual(["1 слово", "2 слова", "5 слов", "21 слово"]);
    expect(returnsText(1)).toBe("Вернётся завтра");
    expect(returnsText(14)).toBe("Вернётся через 14 дн.");
    expect(repeatVerdict(10, 10)).toMatch(/^Всё вспомнили/);
    expect(repeatVerdict(6, 10)).toMatch(/^Хороший/);
    expect(repeatVerdict(2, 10)).toMatch(/^Ничего страшного/);
  });

  it("фильтры «Моих слов» и полоска силы", () => {
    const items = [item("a", 0, 0), item("b", 5, 40), item("c", 2, 0), item("d", 3, 5)];
    expect(filterWords(items, "all")).toHaveLength(4);
    expect(filterWords(items, "due").map((i) => i.word.id)).toEqual(["a", "c"]);
    expect(filterWords(items, "strong").map((i) => i.word.id)).toEqual(["b"]);
    expect([0, 3, 5, 9, -1].map(strengthFilled)).toEqual([1, 4, 6, 6, 1]);
  });
});

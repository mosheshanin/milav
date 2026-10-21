import { describe, expect, it } from "vitest";
import type { MyWordItem, RepeatQuestion, RepeatWord } from "@milav/shared";
import { drillQueue, filterWords, lettersHint, localCorrect, repeatCardText, repeatVerdict, returnsText, strengthFilled, wordsCount } from "./repeat";

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

describe("проверка на телефоне и «Ещё раз»", () => {
  const words: Record<string, RepeatWord> = {
    a: { id: "a", lessonId: "l", he: "כלב", translit: "кэлев", ru: "собака" },
    b: { id: "b", lessonId: "l", he: "חתול", translit: "хатуль", ru: "кот" },
  };
  const choice: RepeatQuestion = { wordId: "a", type: "he-ru", options: ["a", "b"] };
  const type: RepeatQuestion = { wordId: "a", type: "type", options: [] };
  const form = (t: "form-pick" | "form-name"): RepeatQuestion => ({
    wordId: "v",
    type: t,
    options: [],
    form: {
      id: "future:2ms",
      slot: "Будущее · ты (м.)",
      niqqud: "תִּכְתֹּב",
      translit: "тихтов",
      options: [
        { id: "future:2ms", text: t === "form-pick" ? "תִּכְתֹּב" : "Будущее · ты (м.)" },
        { id: "future:3fs", text: t === "form-pick" ? "תִּכְתֹּב" : "Будущее · она" },
        { id: "past:3ms", text: t === "form-pick" ? "כָּתַב" : "Прошедшее · он" },
      ],
    },
  });

  it("выбор, набор, «Не помню»", () => {
    expect(localCorrect(choice, { choice: "a" }, words)).toBe(true);
    expect(localCorrect(choice, { choice: "b" }, words)).toBe(false);
    expect(localCorrect(type, { typed: "כלב" }, words)).toBe(true);
    expect(localCorrect(type, { typed: "כלך" }, words)).toBe(false);
    expect(localCorrect(choice, { giveUp: true }, words)).toBe(false);
  });

  it("форма глагола: в «выбери форму» верна любая форма с тем же написанием", () => {
    expect(localCorrect(form("form-pick"), { choice: "future:3fs" }, words)).toBe(true);
    expect(localCorrect(form("form-pick"), { choice: "past:3ms" }, words)).toBe(false);
    expect(localCorrect(form("form-name"), { choice: "future:2ms" }, words)).toBe(true);
    expect(localCorrect(form("form-name"), { choice: "future:3fs" }, words)).toBe(false);
  });

  it("«Ещё раз» берёт каждое забытое слово один раз", () => {
    expect(drillQueue([choice, type, form("form-pick")]).map((q) => q.wordId)).toEqual(["a", "v"]);
  });
});


describe("подсказка набора в повторении", () => {
  it("у слова число букв, у фразы по словам", () => {
    expect(lettersHint("ציפור")).toBe("Букв в слове: 5");
    expect(lettersHint("אחר כך")).toBe("Букв: 3 + 2, пробел встанет сам");
    expect(lettersHint("כמה זה עולה")).toBe("Букв: 3 + 2 + 4, пробел встанет сам");
  });
});

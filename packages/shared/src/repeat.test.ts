import { describe, expect, it } from "vitest";
import {
  REPEAT_INTERVALS,
  REPEAT_LAST_BOX,
  REPEAT_TYPES,
  applyRepeatAnswer,
  chooseRepeatWords,
  dueInText,
  initialRepeatState,
  isRepeatDue,
  repeatSummary,
  repeatTypesFor,
  type RepeatState,
} from "./repeat";
import { pickDailyReminder, wordsText } from "./reminders";

const DAY = 20_740;

describe("коробки", () => {
  it("паузы по решению владельца: 1-3-7-14-30-60 дней", () => {
    expect(REPEAT_INTERVALS).toEqual([1, 3, 7, 14, 30, 60]);
    expect(REPEAT_LAST_BOX).toBe(5);
  });

  it("новое слово повторяют на следующий день после изучения", () => {
    const s = initialRepeatState(DAY);
    expect(s).toEqual({ box: 0, dueDay: DAY + 1, bestBox: 0, reps: 0, lapses: 0 });
    expect(isRepeatDue(s, DAY)).toBe(false);
    expect(isRepeatDue(s, DAY + 1)).toBe(true);
  });

  it("вспоминал каждый раз: 3, 7, 14, 30, 60, 60 дней", () => {
    let s: RepeatState = initialRepeatState(DAY);
    let day = DAY + 1;
    const pauses: number[] = [];
    const mastered: boolean[] = [];
    for (let i = 0; i < 6; i++) {
      const r = applyRepeatAnswer(s, true, day);
      pauses.push(r.state.dueDay - day);
      mastered.push(r.mastered);
      s = r.state;
      day = s.dueDay;
    }
    expect(pauses).toEqual([3, 7, 14, 30, 60, 60]);
    expect(mastered).toEqual([false, false, false, false, true, false]);
    expect(s).toMatchObject({ box: 5, bestBox: 5, reps: 6, lapses: 0 });
  });

  it("забыл: первая коробка и повторить завтра, лучшая коробка помнится", () => {
    const s: RepeatState = { box: 5, dueDay: DAY, bestBox: 5, reps: 5, lapses: 0 };
    const r = applyRepeatAnswer(s, false, DAY);
    expect(r.state).toEqual({ box: 0, dueDay: DAY + 1, bestBox: 5, reps: 5, lapses: 1 });
    // Снова дошёл до конца: «прочно выучено» второй раз не засчитывается.
    expect(applyRepeatAnswer({ ...r.state, box: 4 }, true, DAY + 1).mastered).toBe(false);
  });
});

describe("подход", () => {
  const item = (wordId: string, dueDay: number, box = 0) => ({ wordId, dueDay, box });

  it("только те, что пора, сначала просроченные, потом младшие коробки", () => {
    const items = [item("c", DAY, 2), item("a", DAY - 3), item("future", DAY + 1), item("b", DAY, 0), item("d", DAY, 0)];
    expect(chooseRepeatWords(items, DAY).map((i) => i.wordId)).toEqual(["a", "b", "d", "c"]);
    expect(chooseRepeatWords(items, DAY, 2).map((i) => i.wordId)).toEqual(["a", "b"]);
  });

  it("виды упражнений идут по кругу: в 10 словах каждого 2 или 3", () => {
    for (const r of [0, 0.3, 0.99]) {
      const types = repeatTypesFor(10, () => r);
      expect(types).toHaveLength(10);
      for (const t of REPEAT_TYPES) {
        const n = types.filter((x) => x === t).length;
        expect(n).toBeGreaterThanOrEqual(2);
        expect(n).toBeLessThanOrEqual(3);
      }
    }
    expect(repeatTypesFor(0, Math.random)).toEqual([]);
  });

  it("сводка: сколько пора и когда следующее", () => {
    expect(repeatSummary([], DAY)).toEqual({ due: 0, total: 0, nextDueIn: null });
    expect(repeatSummary([item("a", DAY + 3), item("b", DAY + 1)], DAY)).toEqual({ due: 0, total: 2, nextDueIn: 1 });
    expect(repeatSummary([item("a", DAY), item("b", DAY + 1)], DAY)).toEqual({ due: 1, total: 2, nextDueIn: null });
  });

  it("подписи сроков", () => {
    expect([0, 1, 7].map(dueInText)).toEqual(["сегодня", "завтра", "через 7 дн."]);
  });
});

describe("напоминания о повторении", () => {
  const texts = [
    { id: 1, text: "Обычный" },
    { id: 2, text: "Ещё обычный" },
    { id: 3, text: "Пора повторить {к_повторению}" },
  ];

  it("склонение: 1 слово, 3 слова, 7 слов, 11 слов, 22 слова", () => {
    expect([1, 3, 7, 11, 22, 25].map(wordsText)).toEqual(["1 слово", "3 слова", "7 слов", "11 слов", "22 слова", "25 слов"]);
  });

  it("есть что повторить: текст о повторении через раз", () => {
    const vars = { к_повторению: "7 слов" };
    expect(pickDailyReminder(texts, vars, 1, 0)).toEqual({ id: 3, text: "Пора повторить 7 слов" });
    expect(pickDailyReminder(texts, vars, null, 0.9)?.id).toBe(3);
    // Прошлый был о повторении: теперь обычный.
    expect([1, 2]).toContain(pickDailyReminder(texts, vars, 3, 0.9)!.id);
  });

  it("повторять нечего: текст о повторении не выбирается", () => {
    for (const r of [0, 0.5, 0.99]) expect(pickDailyReminder(texts, {}, null, r)!.id).not.toBe(3);
  });
});

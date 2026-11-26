import { describe, expect, it } from "vitest";
import {
  WIDGET_DATA_MAX_BYTES,
  parseWidgetRequest,
  plural,
  progressCard,
  progressVars,
  remindersCard,
  utf8Bytes,
  widgetDataJson,
} from "./botWidgets";
import { REMINDER_TIME_OPTIONS } from "./reminders";

describe("данные карточки прогресса", () => {
  const week = { days: [true, false, true, false, false, false, false], todayIndex: 2, daysThisWeek: 2, target: 3 };

  it("Конь на пути к Слону, цель дня, неделя, повторение", () => {
    const card = progressCard({ passedLessons: 12, points: 340, week, goal: { target: 5, done: 3 }, repeatDue: 7 });
    expect(card).toEqual({
      v: 1,
      s: "♞",
      sn: "Конь",
      l: 12,
      nx: { s: "♝", n: "Слон", left: 9 },
      f: 40,
      p: 340,
      g: [3, 5],
      w: "1010000",
      t: 2,
      wd: 2,
      wt: 3,
      r: 7,
    });
    expect(progressVars(card)).toEqual({
      статус: "♞ Конь",
      уроков: "12 уроков",
      путь: "♝ Слон, через 9 уроков",
      очков: "340",
      цель: "3 из 5 слов",
      неделя: "2 из 3 дней",
      повторить: "7 слов",
    });
  });

  it("Король, цель выполнена, неделя ритмична, повторение выключено", () => {
    const card = progressCard({
      passedLessons: 301,
      points: 99_990,
      week: { ...week, daysThisWeek: 3 },
      goal: { target: 5, done: 8 },
      repeatDue: null,
    });
    expect(card.nx).toBeNull();
    expect(card.f).toBe(100);
    const vars = progressVars(card);
    expect(vars.путь).toContain("высшая");
    expect(vars.цель).toBe("выполнена ✅ (8 слов)");
    expect(vars.неделя).toBe("3 дня, неделя ритмичная ✅");
    // Больше нормы: не «4 из 3 дней» (скриншот владельца 26.11).
    expect(progressVars({ ...card, wd: 4 }).неделя).toBe("4 дня, неделя ритмичная ✅");
    expect(progressVars({ ...card, wd: 5 }).неделя).toBe("5 дней, неделя ритмичная ✅");
    expect(vars.повторить).toBe("выключено");
  });

  it("новичок: ничего не сдано, цель выключена, повторять нечего", () => {
    const card = progressCard({ passedLessons: 0, points: 0, week: { days: [], todayIndex: 0, daysThisWeek: 0, target: 3 }, goal: null, repeatDue: 0 });
    expect(card.w).toBe("0000000");
    const vars = progressVars(card);
    expect(vars).toMatchObject({ статус: "♟ Пешка", уроков: "0 уроков", путь: "♞ Конь, через 6 уроков", цель: "выключена", повторить: "пока нечего" });
  });

  it("самые большие данные помещаются в 1024 байта", () => {
    const card = progressCard({ passedLessons: 99_999, points: 9_999_999, week, goal: { target: 50, done: 99_999 }, repeatDue: 99_999 });
    expect(utf8Bytes(widgetDataJson(card))).toBeLessThan(WIDGET_DATA_MAX_BYTES / 2);
    const reminders = remindersCard({ available: true, enabled: true, minute: 1435, shabbat: true });
    expect(utf8Bytes(widgetDataJson(reminders))).toBeLessThan(WIDGET_DATA_MAX_BYTES / 4);
  });

  it("utf8Bytes считает как Telegram (байты UTF-8)", () => {
    expect(utf8Bytes("p")).toBe(1);
    expect(utf8Bytes("Конь")).toBe(8);
    expect(utf8Bytes("♞")).toBe(3);
    expect(utf8Bytes("👑")).toBe(4);
  });
});

describe("карточка напоминаний", () => {
  it("недоступны: выключены, даже если ученик их включал", () => {
    expect(remindersCard({ available: false, enabled: true, minute: 1200, shabbat: true })).toMatchObject({ a: false, on: false });
  });

  it("варианты времени те же, что в «Настройках»", () => {
    expect(remindersCard({ available: true, enabled: false, minute: 1200, shabbat: false }).o).toEqual(REMINDER_TIME_OPTIONS);
  });
});

describe("запросы от карточек", () => {
  it("знакомые коды", () => {
    expect(parseWidgetRequest("p")).toEqual({ kind: "progress" });
    expect(parseWidgetRequest("r")).toEqual({ kind: "reminders" });
    expect(parseWidgetRequest("r:on")).toEqual({ kind: "remindersOn" });
    expect(parseWidgetRequest("r:off")).toEqual({ kind: "remindersOff" });
    expect(parseWidgetRequest("r:t:480")).toEqual({ kind: "remindersTime", minute: 480 });
    expect(parseWidgetRequest("r:t:0")).toEqual({ kind: "remindersTime", minute: 0 });
  });

  it("неверное время и чужие коды отклоняются", () => {
    for (const bad of ["", "x", "P", "r:t:", "r:t:1440", "r:t:483", "r:t:-5", "r:t:12000", "r:on ", "p".repeat(65), 5, null, undefined]) {
      expect(parseWidgetRequest(bad)).toBeNull();
    }
  });
});

describe("склонение", () => {
  it("урок, урока, уроков", () => {
    const f = (n: number) => plural(n, "урок", "урока", "уроков");
    expect([0, 1, 2, 5, 11, 12, 14, 21, 22, 25, 101, 111].map(f)).toEqual([
      "уроков",
      "урок",
      "урока",
      "уроков",
      "уроков",
      "уроков",
      "уроков",
      "урок",
      "урока",
      "уроков",
      "урок",
      "уроков",
    ]);
  });
});

// Учёт рассылок (26.11.2026): группы текстов, контрольная группа, разница с контролем.
import { describe, expect, it } from "vitest";
import { REPORT_MIN_CONTROL, inReminderControl, percentOf, reminderLift, reminderTextGroup } from "./reminders";

describe("группа текста напоминания", () => {
  it("повторение, прогресс или шутка по подстановкам", () => {
    expect(reminderTextGroup("{имя}, {к_повторению} ждут повторения")).toBe("repeat");
    expect(reminderTextGroup("Осталось {осталось_слов} сл. до цели дня")).toBe("progress");
    expect(reminderTextGroup("До фигуры {до_статуса}. {статус} собирает чемодан")).toBe("progress");
    expect(reminderTextGroup("{имя}, ваш иврит заскучал")).toBe("joke");
    expect(reminderTextGroup("Кофе ✔️ Новости ✔️ Иврит 🤔")).toBe("joke");
  });
});

describe("контрольная группа", () => {
  it("0%: никого; доля близка к заданной; решение одно и то же для ученика и дня", () => {
    expect(inReminderControl(123, 20_000, 0)).toBe(false);
    for (const percent of [5, 10, 20]) {
      let held = 0;
      const total = 20_000;
      for (let i = 0; i < total; i++) if (inReminderControl(100_000 + (i % 400) * 7919, 20_700 + Math.floor(i / 400), percent)) held++;
      expect(Math.abs((held * 100) / total - percent)).toBeLessThan(1.5);
    }
    expect(inReminderControl(352078684, 20_783, 10)).toBe(inReminderControl(352078684, 20_783, 10));
  });

  it("один и тот же человек не сидит в контроле постоянно", () => {
    const days = Array.from({ length: 100 }, (_, i) => 20_783 + i);
    const held = days.filter((d) => inReminderControl(352078684, d, 10)).length;
    expect(held).toBeGreaterThan(0);
    expect(held).toBeLessThan(30);
  });
});

describe("разница с контролем", () => {
  const row = (sends: number, studied: number) => ({ sends, clicked: 0, opened: 0, studied });
  it("мало контроля: нет; иначе процентные пункты", () => {
    expect(reminderLift(row(100, 40), row(REPORT_MIN_CONTROL - 1, 5))).toBeNull();
    expect(reminderLift(row(200, 70), row(40, 8))).toBe(15);
    expect(reminderLift(row(0, 0), row(40, 8))).toBeNull();
    expect(percentOf(1, 3)).toBe(33);
    expect(percentOf(1, 0)).toBe(0);
  });
});

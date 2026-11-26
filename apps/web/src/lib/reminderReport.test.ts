import { describe, expect, it } from "vitest";
import type { ReminderReport } from "@milav/shared";
import { cellText, liftText, percentText, postLabel, shareText, sourceTitle } from "./reminderReport";

const row = (sends: number, studied: number) => ({ sends, clicked: 0, opened: 0, studied });
const report = (sent: number, control: number, lift: number | null): ReminderReport => ({
  days: 30,
  pending: 0,
  sent: row(sent, 0),
  control: row(control, 0),
  lift,
  groups: [],
  texts: [],
  sources: [],
});

describe("отчёт «Учёт рассылок»", () => {
  it("доли", () => {
    expect(shareText(3, 10)).toBe("3 из 10 (30%)");
    expect(shareText(0, 0)).toBe("—");
    expect(cellText(1, row(4, 1))).toBe("25%");
    expect(cellText(0, row(0, 0))).toBe("—");
  });

  it("вывод простыми словами", () => {
    expect(liftText(report(0, 0, null))).toContain("Итогов пока нет");
    expect(liftText(report(50, 5, null))).toContain("5 из нужных 30");
    expect(liftText(report(300, 40, 12))).toContain("примерно 12 человек");
    expect(liftText(report(300, 40, 0))).toContain("Разницы с контролем нет");
    expect(liftText(report(300, 40, -4))).toContain("на 4 из 100");
  });

  it("метки источников и поста", () => {
    expect(sourceTitle("")).toBe("без метки");
    expect(percentText(1, 4)).toBe("25%");
    expect(percentText(0, 0)).toBe("—");
    expect(sourceTitle("post-20261126")).toBe("post-20261126");
    expect(postLabel(new Date(2026, 10, 6))).toBe("post-20261106");
  });
});

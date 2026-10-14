import { describe, expect, it } from "vitest";
import { dayInWeek, epochDayToIso, isValidTimeZone, localEpochDay, parseDbTime, popcount, utcEpochDay, weekIndex, weekStartDay } from "./time";

const day = (iso: string) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / 86_400_000;

describe("недели (начало в воскресенье)", () => {
  it("воскресенье 4.01.1970 начинает неделю 1, суббота 3.01.1970 заканчивает неделю 0", () => {
    expect(dayInWeek(3)).toBe(0);
    expect(weekIndex(3)).toBe(1);
    expect(dayInWeek(2)).toBe(6);
    expect(weekIndex(2)).toBe(0);
  });

  it("14.10.2026 это среда: третий день недели (с нуля), воскресенье той недели 11.10", () => {
    expect(dayInWeek(day("2026-10-14"))).toBe(3);
    expect(dayInWeek(day("2026-10-11"))).toBe(0);
    expect(dayInWeek(day("2026-10-17"))).toBe(6);
    expect(weekIndex(day("2026-10-17"))).toBe(weekIndex(day("2026-10-11")));
    expect(weekIndex(day("2026-10-18"))).toBe(weekIndex(day("2026-10-11")) + 1);
  });

  it("первый день недели по её номеру и обратно", () => {
    const w = weekIndex(day("2026-10-14"));
    expect(epochDayToIso(weekStartDay(w))).toBe("2026-10-11");
    expect(weekIndex(weekStartDay(w))).toBe(w);
    expect(weekIndex(weekStartDay(w) - 1)).toBe(w - 1);
  });
});

describe("местный день и граница полуночи", () => {
  const tz = "Asia/Jerusalem";

  it("полночь по Иерусалиму летом (UTC+3)", () => {
    expect(epochDayToIso(localEpochDay(tz, Date.UTC(2026, 6, 1, 20, 59, 59)))).toBe("2026-07-01");
    expect(epochDayToIso(localEpochDay(tz, Date.UTC(2026, 6, 1, 21, 0, 0)))).toBe("2026-07-02");
  });

  it("переход на зимнее время 25.10.2026: сутки на час длиннее, границы считаются верно", () => {
    expect(epochDayToIso(localEpochDay(tz, Date.UTC(2026, 9, 24, 20, 59, 59)))).toBe("2026-10-24");
    expect(epochDayToIso(localEpochDay(tz, Date.UTC(2026, 9, 24, 21, 0, 0)))).toBe("2026-10-25");
    // После перехода пояс UTC+2: 23:59:59 местного времени это 21:59:59 UTC.
    expect(epochDayToIso(localEpochDay(tz, Date.UTC(2026, 9, 25, 21, 59, 59)))).toBe("2026-10-25");
    expect(epochDayToIso(localEpochDay(tz, Date.UTC(2026, 9, 25, 22, 0, 0)))).toBe("2026-10-26");
  });

  it("другие пояса: тот же момент даёт разные дни", () => {
    const moment = Date.UTC(2026, 9, 14, 23, 30, 0);
    expect(epochDayToIso(localEpochDay("UTC", moment))).toBe("2026-10-14");
    expect(epochDayToIso(localEpochDay("Asia/Jerusalem", moment))).toBe("2026-10-15");
    expect(epochDayToIso(localEpochDay("America/New_York", moment))).toBe("2026-10-14");
    expect(epochDayToIso(localEpochDay("Pacific/Auckland", moment))).toBe("2026-10-15");
  });
});

describe("вспомогательное", () => {
  it("проверка часового пояса", () => {
    expect(isValidTimeZone("Asia/Jerusalem")).toBe(true);
    expect(isValidTimeZone("UTC")).toBe(true);
    expect(isValidTimeZone("Mars/Base")).toBe(false);
    expect(isValidTimeZone("")).toBe(false);
    expect(isValidTimeZone(5)).toBe(false);
    expect(isValidTimeZone("x".repeat(100))).toBe(false);
  });

  it("время базы читается как UTC", () => {
    expect(parseDbTime("2026-10-14 12:30:00")).toBe(Date.UTC(2026, 9, 14, 12, 30, 0));
    expect(Number.isNaN(parseDbTime("мусор"))).toBe(true);
  });

  it("popcount и сутки UTC", () => {
    expect(popcount(0)).toBe(0);
    expect(popcount(0b1011)).toBe(3);
    expect(popcount(127)).toBe(7);
    expect(utcEpochDay(86_400_000 * 5 + 1)).toBe(5);
  });
});

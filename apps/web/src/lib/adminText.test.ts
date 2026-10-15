import { describe, expect, it } from "vitest";
import type { AdminLogEntry } from "@milav/shared";
import { ApiError } from "../api";
import { adminErrorText, dayText, deltaText, deltaTone, logEntryText, parseTelegramId } from "./adminText";

const entry = (action: string, target: string | null, oldValue: unknown, newValue: unknown): AdminLogEntry => ({
  id: 1,
  at: 0,
  actor: 1,
  actorName: null,
  action,
  target,
  oldValue,
  newValue,
});

describe("тексты панели", () => {
  it("строки журнала", () => {
    expect(logEntryText(entry("config.set", "leaderboard", "all", "team"))).toBe("Таблица лидеров: Все → Команда");
    expect(logEntryText(entry("config.set", "defaultDailyGoal", 5, 0))).toBe("Цель дня для новых учеников: 5 сл. → Выкл.");
    expect(logEntryText(entry("config.set", "gone", 1, 2))).toBe("Настройка gone: 1 → 2");
    expect(logEntryText(entry("staff.add", "42", null, "reviewer"))).toBe("Добавлен в команду: id 42, проверяющий");
    expect(logEntryText(entry("staff.change", "42", "reviewer", "admin"))).toBe("Роль id 42: проверяющий → администратор");
    expect(logEntryText(entry("staff.remove", "42", "admin", null))).toBe("Убран из команды: id 42 (был администратор)");
    expect(logEntryText(entry("other", null, null, null))).toBe("other");
  });

  it("сравнение недель", () => {
    expect([deltaText(5, 3), deltaText(3, 5), deltaText(2, 2)]).toEqual(["+2", "−2", "0"]);
    expect([deltaTone(5, 3), deltaTone(3, 5), deltaTone(2, 2)]).toEqual(["up", "down", "same"]);
  });

  it("день коротко", () => {
    expect(dayText("2026-10-15")).toMatch(/^15\.10, чт/);
  });

  it("Telegram id из поля", () => {
    expect(parseTelegramId(" 12345 ")).toBe(12345);
    for (const bad of ["", "abc", "12 34", "-5", "0", "1.5", "1234567890123456"]) expect(parseTelegramId(bad)).toBeNull();
  });

  it("ошибки по-русски", () => {
    expect(adminErrorText(new ApiError(409, "owner_locked"))).toContain("Владельца");
    expect(adminErrorText(new ApiError(409, "self"))).toContain("Свою роль");
    expect(adminErrorText(new ApiError(500, "internal_error"))).toContain("Сервер не принял");
    expect(adminErrorText(new ApiError(0, "network"))).toContain("Нет связи");
  });
});

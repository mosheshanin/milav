import { afterEach, describe, expect, it, vi } from "vitest";
import { CLIENT_LOG_LIMITS } from "@milav/shared";
import { createThrottle, describeError, logClientReport, logEvent, parseClientReport } from "./telemetry";

afterEach(() => vi.restoreAllMocks());

describe("logEvent", () => {
  it("пишет одну строку JSON с полем evt и без пустых полей", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    logEvent("word_done", { uid: 5, lesson: "animals-1", skipped: undefined, ok: true });
    expect(log).toHaveBeenCalledTimes(1);
    expect(JSON.parse(log.mock.calls[0]![0] as string)).toEqual({ evt: "word_done", uid: 5, lesson: "animals-1", ok: true });
  });
});

describe("describeError", () => {
  it("берёт текст и стек у Error и обрезает их", () => {
    const err = new Error("x".repeat(1000));
    const out = describeError(err);
    expect(out.message).toHaveLength(CLIENT_LOG_LIMITS.message);
    expect(out.stack!.length).toBeLessThanOrEqual(CLIENT_LOG_LIMITS.stack);
  });

  it("не-Error превращает в строку", () => {
    expect(describeError("сломалось")).toEqual({ message: "сломалось" });
  });
});

describe("parseClientReport", () => {
  it("принимает ошибку и обрезает поля", () => {
    const report = parseClientReport({
      kind: "error",
      source: "render",
      message: "m".repeat(500),
      stack: "s".repeat(5000),
      screen: "study:animals-1",
      platform: "ios",
      tgVersion: "8.0",
      app: "abc1234",
      extra: "лишнее поле не попадает",
    });
    expect(report).not.toBeNull();
    if (report?.kind !== "error") throw new Error("ожидалась ошибка");
    expect(report.message).toHaveLength(CLIENT_LOG_LIMITS.message);
    expect(report.stack).toHaveLength(CLIENT_LOG_LIMITS.stack);
    expect(report.context).toEqual({ screen: "study:animals-1", platform: "ios", tgVersion: "8.0", app: "abc1234" });
    expect(JSON.stringify(report)).not.toContain("лишнее");
  });

  it("принимает известное событие с detail", () => {
    expect(parseClientReport({ kind: "event", name: "mic_problem", detail: "denied", platform: "android" })).toEqual({
      kind: "event",
      name: "mic_problem",
      detail: "denied",
      context: { screen: undefined, platform: "android", tgVersion: undefined, app: undefined },
    });
  });

  it("убирает переводы строк из коротких полей (нельзя подделать соседние строки журнала)", () => {
    const report = parseClientReport({ kind: "event", name: "mic_problem", detail: "denied\nevt: fake", screen: "a\r\nb" });
    expect(report?.kind === "event" && report.detail).toBe("denied evt: fake".slice(0, CLIENT_LOG_LIMITS.field));
    expect(report?.context.screen).toBe("a  b");
  });

  it("отклоняет неизвестное, пустое и не-объекты", () => {
    expect(parseClientReport(null)).toBeNull();
    expect(parseClientReport("ошибка")).toBeNull();
    expect(parseClientReport({ kind: "event", name: "anything_else" })).toBeNull();
    expect(parseClientReport({ kind: "error", source: "error", message: "   " })).toBeNull();
    expect(parseClientReport({ kind: "error", source: "elsewhere", message: "x" })).toBeNull();
    expect(parseClientReport({ kind: "other" })).toBeNull();
  });
});

describe("logClientReport", () => {
  it("ошибки пишет уровнем error с id ученика, события уровнем info с префиксом client_", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    logClientReport(parseClientReport({ kind: "error", source: "error", message: "boom", platform: "ios" })!, 42);
    logClientReport(parseClientReport({ kind: "event", name: "app_crash" })!);
    expect(JSON.parse(error.mock.calls[0]![0] as string)).toEqual({
      evt: "client_error",
      source: "error",
      message: "boom",
      uid: 42,
      platform: "ios",
    });
    expect(JSON.parse(log.mock.calls[0]![0] as string)).toEqual({ evt: "client_app_crash" });
  });
});

describe("createThrottle", () => {
  it("пропускает limit запросов в окне, потом отказывает, в новом окне снова пускает", () => {
    const allow = createThrottle(3, 60);
    expect([allow("ip", 0), allow("ip", 1), allow("ip", 2), allow("ip", 3)]).toEqual([true, true, true, false]);
    expect(allow("other", 3)).toBe(true);
    expect(allow("ip", 60)).toBe(true);
  });

  it("при переполнении таблицы адресов очищает её, а не растёт без конца", () => {
    const allow = createThrottle(1, 60, 2);
    allow("a", 0);
    allow("b", 0);
    expect(allow("a", 0)).toBe(false);
    allow("c", 0); // таблица полна: очищается, «c» записан заново
    expect(allow("a", 0)).toBe(true);
  });
});

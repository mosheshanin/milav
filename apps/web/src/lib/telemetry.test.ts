import { describe, expect, it } from "vitest";
import { CLIENT_LOG_LIMITS } from "@milav/shared";
import { createReporter, errorFields, isIgnoredError } from "./telemetry";

function setup(limit?: number) {
  const sent: Record<string, unknown>[] = [];
  const reporter = createReporter({
    send: (body) => sent.push(JSON.parse(body) as Record<string, unknown>),
    context: () => ({ screen: "study:animals-1", platform: "android", app: "abc1234" }),
    limit,
  });
  return { sent, reporter };
}

describe("отчёты приложения", () => {
  it("ошибка уходит с текстом, стеком и контекстом", () => {
    const { sent, reporter } = setup();
    reporter.error("error", new TypeError("x is undefined"));
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({
      kind: "error",
      source: "error",
      message: "TypeError: x is undefined",
      screen: "study:animals-1",
      platform: "android",
      app: "abc1234",
    });
    expect(typeof sent[0]!.stack).toBe("string");
  });

  it("одинаковая ошибка отправляется один раз", () => {
    const { sent, reporter } = setup();
    reporter.error("error", new Error("одно и то же"));
    reporter.error("rejection", new Error("одно и то же"));
    reporter.event("mic_problem", "denied");
    reporter.event("mic_problem", "denied");
    reporter.event("mic_problem", "unsupported");
    expect(sent.map((r) => r.message ?? r.detail)).toEqual(["одно и то же", "denied", "unsupported"]);
  });

  it("за запуск не больше заданного числа отчётов", () => {
    const { sent, reporter } = setup(3);
    for (let i = 0; i < 10; i++) reporter.error("error", new Error(`ошибка ${i}`));
    expect(sent).toHaveLength(3);
  });

  it("по умолчанию предел из общих констант", () => {
    const { sent, reporter } = setup();
    for (let i = 0; i < 50; i++) reporter.error("error", new Error(`ошибка ${i}`));
    expect(sent).toHaveLength(CLIENT_LOG_LIMITS.perLaunch);
  });

  it("бесполезные ошибки браузера не отправляются", () => {
    const { sent, reporter } = setup();
    reporter.error("error", "Script error.");
    reporter.error("error", new Error("ResizeObserver loop completed with undelivered notifications."));
    expect(sent).toHaveLength(0);
    expect(isIgnoredError("Script error")).toBe(true);
    expect(isIgnoredError("TypeError: boom")).toBe(false);
  });

  it("сбой отправки или контекста не мешает приложению", () => {
    const reporter = createReporter({
      send: () => {
        throw new Error("нет сети");
      },
      context: () => {
        throw new Error("нет sessionStorage");
      },
    });
    expect(() => reporter.error("render", new Error("x"))).not.toThrow();
    expect(() => reporter.event("app_crash")).not.toThrow();
  });
});

describe("errorFields", () => {
  it("обрезает длинные сообщения и понимает не-Error", () => {
    expect(errorFields(new Error("a".repeat(1000))).message).toHaveLength(CLIENT_LOG_LIMITS.message);
    expect(errorFields("строка")).toEqual({ message: "строка" });
    expect(errorFields({ code: 1 })).toEqual({ message: '{"code":1}' });
    expect(errorFields(undefined)).toEqual({ message: "undefined" });
  });
});

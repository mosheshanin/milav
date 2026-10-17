import { describe, expect, it } from "vitest";
import { AUTO_NEXT_MAX_STEP_MS, AUTO_NEXT_MS, autoNextElapsed, autoNextShare } from "./autoNext";

describe("автопереход к следующему этапу", () => {
  it("ждёт 2 секунды", () => {
    expect(AUTO_NEXT_MS).toBe(2000);
  });

  it("копит время по кадрам и не превышает срок", () => {
    let elapsed = 0;
    for (let i = 0; i < 200; i++) elapsed = autoNextElapsed(elapsed, 16);
    expect(elapsed).toBe(AUTO_NEXT_MS);
  });

  it("стоит на паузе, пока приложение свёрнуто: длинный шаг засчитывается не целиком", () => {
    expect(autoNextElapsed(500, 60_000)).toBe(500 + AUTO_NEXT_MAX_STEP_MS);
  });

  it("не идёт назад при странном шаге", () => {
    expect(autoNextElapsed(300, -50)).toBe(300);
  });

  it("доля заливки от 0 до 1", () => {
    expect(autoNextShare(0)).toBe(0);
    expect(autoNextShare(1000)).toBe(0.5);
    expect(autoNextShare(5000)).toBe(1);
    expect(autoNextShare(10, 0)).toBe(1);
  });
});

import { describe, expect, it } from "vitest";
import { ApiError } from "../api";
import { saveErrorText, waitText } from "./apiErrors";

describe("время ожидания", () => {
  it("секунды, минуты и часы", () => {
    expect(waitText(1)).toBe("1 с");
    expect(waitText(45)).toBe("45 с");
    expect(waitText(89)).toBe("89 с");
    expect(waitText(120)).toBe("2 мин");
    expect(waitText(61 * 60)).toBe("61 мин");
    expect(waitText(5 * 3600)).toBe("5 ч");
  });

  it("округляет вверх и не показывает ноль", () => {
    expect(waitText(0)).toBe("1 с");
    expect(waitText(0.2)).toBe("1 с");
    expect(waitText(100.4)).toBe("2 мин");
  });
});

describe("тексты ошибок сохранения", () => {
  it("лимит запросов называет время ожидания", () => {
    expect(saveErrorText(new ApiError(429, "rate_limited", 42))).toContain("42 с");
    expect(saveErrorText(new ApiError(429, "rate_limited"))).toContain("Подождите немного");
  });

  it("известные коды получают свои тексты, остальное считается проблемой связи", () => {
    expect(saveErrorText(new ApiError(409, "lesson_not_completed"))).toContain("все четыре этапа");
    expect(saveErrorText(new ApiError(422, "write_rejected"))).toContain("не принял");
    expect(saveErrorText(new ApiError(422, "type_mismatch"))).toContain("не принял");
    expect(saveErrorText(new ApiError(0, "network"))).toContain("Проверьте интернет");
    expect(saveErrorText(new Error("что-то"))).toContain("Проверьте интернет");
  });
});

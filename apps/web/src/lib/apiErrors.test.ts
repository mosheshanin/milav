import { describe, expect, it } from "vitest";
import { ApiError } from "../api";
import { isQuizSessionLost, quizErrorText, saveErrorText, waitText } from "./apiErrors";

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

describe("ошибки викторины", () => {
  it("потерянной считается сессия, которую заменили, просрочили или закончили", () => {
    for (const code of ["no_session", "session_expired", "quiz_finished", "bad_index"]) {
      expect(isQuizSessionLost(new ApiError(409, code)), code).toBe(true);
    }
    expect(isQuizSessionLost(new ApiError(0, "network"))).toBe(false);
    expect(isQuizSessionLost(new ApiError(409, "answer_conflict"))).toBe(false);
    expect(isQuizSessionLost(new Error("no_session"))).toBe(false);
  });

  it("тексты: лимит с временем, отказ сервера, обрыв связи", () => {
    expect(quizErrorText(new ApiError(429, "rate_limited", 30))).toContain("30 с");
    expect(quizErrorText(new ApiError(409, "answer_conflict"))).toContain("Сервер не принял");
    expect(quizErrorText(new ApiError(0, "network"))).toContain("Проверьте интернет");
    expect(quizErrorText(new Error("что-то"))).toContain("Проверьте интернет");
  });
});

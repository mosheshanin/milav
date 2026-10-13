import { describe, expect, it } from "vitest";
import { RATE_LIMITS } from "@milav/shared";
import { consumeRateLimit } from "./rateLimit";
import { createTestDb } from "./test-utils/d1";

/** Начало суток (UTC) для предсказуемых окон. */
const DAY_START = 1_700_000_000 - (1_700_000_000 % 86_400);

describe("лимиты запросов", () => {
  it("в пределах минутного лимита пускает, сверх него отклоняет и называет, сколько ждать", async () => {
    const db = createTestDb();
    const now = DAY_START + 3600 + 15; // 15-я секунда минуты
    for (let i = 0; i < RATE_LIMITS.speech.perMinute; i++) {
      expect(await consumeRateLimit(db, 1, "speech", now)).toEqual({ ok: true });
    }
    expect(await consumeRateLimit(db, 1, "speech", now)).toEqual({ ok: false, retryAfter: 45 });
    // Отклонённые запросы тоже считаются: в этой же минуте дальше не пустит.
    expect(await consumeRateLimit(db, 1, "speech", now + 20)).toEqual({ ok: false, retryAfter: 25 });
  });

  it("со следующей минуты счётчик начинается заново", async () => {
    const db = createTestDb();
    const now = DAY_START + 3600 + 15;
    for (let i = 0; i <= RATE_LIMITS.speech.perMinute; i++) await consumeRateLimit(db, 1, "speech", now);
    expect(await consumeRateLimit(db, 1, "speech", now + 45)).toEqual({ ok: true });
  });

  it("суточный лимит срабатывает, даже если по минутам укладываемся, и ждать нужно до конца суток", async () => {
    const db = createTestDb();
    const { perMinute, perDay } = RATE_LIMITS.quiz;
    expect(perDay % perMinute).toBe(0);
    for (let minute = 0; minute < perDay / perMinute; minute++) {
      for (let i = 0; i < perMinute; i++) {
        expect(await consumeRateLimit(db, 1, "quiz", DAY_START + minute * 60 + 1)).toEqual({ ok: true });
      }
    }
    const now = DAY_START + 12 * 60 * 60;
    expect(await consumeRateLimit(db, 1, "quiz", now)).toEqual({ ok: false, retryAfter: 12 * 60 * 60 });
    // Следующие сутки: счётчик сброшен.
    expect(await consumeRateLimit(db, 1, "quiz", DAY_START + 86_400 + 5)).toEqual({ ok: true });
  });

  it("пользователи и действия считаются отдельно", async () => {
    const db = createTestDb();
    const now = DAY_START + 100;
    for (let i = 0; i <= RATE_LIMITS.speech.perMinute; i++) await consumeRateLimit(db, 1, "speech", now);
    expect((await consumeRateLimit(db, 1, "speech", now)).ok).toBe(false);
    expect((await consumeRateLimit(db, 2, "speech", now)).ok).toBe(true);
    expect((await consumeRateLimit(db, 1, "stage", now)).ok).toBe(true);
  });

  it("в базе остаётся одна строка на пользователя и действие, как бы часто ни обращались", async () => {
    const db = createTestDb();
    for (let i = 0; i < 200; i++) await consumeRateLimit(db, 1, "stage", DAY_START + i * 7);
    await consumeRateLimit(db, 1, "speech", DAY_START);
    const row = await db.prepare("SELECT COUNT(*) AS n FROM rate_limits").first<{ n: number }>();
    expect(row?.n).toBe(2);
  });
});

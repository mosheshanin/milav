import { createMiddleware } from "hono/factory";
import { RATE_LIMITS, type RateAction } from "@milav/shared";
import type { AppEnv } from "./env";

const MINUTE = 60;
const DAY = 86_400;

export type LimitResult = { ok: true } | { ok: false; retryAfter: number };

// Одна запись на пользователя и действие, оба окна обновляются одним оператором (одна запись в базу на запрос).
// В SQLite все выражения в SET считаются по старой строке, поэтому сравнение с *_start работает как задумано.
const COUNT_SQL = `
INSERT INTO rate_limits (user_id, action, minute_start, minute_count, day_start, day_count)
VALUES (?1, ?2, ?3, 1, ?4, 1)
ON CONFLICT (user_id, action) DO UPDATE SET
  minute_count = CASE WHEN minute_start = excluded.minute_start THEN minute_count + 1 ELSE 1 END,
  minute_start = excluded.minute_start,
  day_count = CASE WHEN day_start = excluded.day_start THEN day_count + 1 ELSE 1 END,
  day_start = excluded.day_start
RETURNING minute_count, day_count`;

/**
 * Засчитывает запрос и говорит, укладывается ли пользователь в лимиты.
 * Считаются и отклонённые запросы (счётчик растёт), ждать нужно до конца окна: суточного, если превышен он, иначе минутного.
 */
export async function consumeRateLimit(
  db: D1Database,
  userId: number,
  action: RateAction,
  now: number = Math.floor(Date.now() / 1000),
): Promise<LimitResult> {
  const minuteStart = now - (now % MINUTE);
  const dayStart = now - (now % DAY);
  const row = await db
    .prepare(COUNT_SQL)
    .bind(userId, action, minuteStart, dayStart)
    .first<{ minute_count: number; day_count: number }>();
  if (!row) return { ok: true };

  const limit = RATE_LIMITS[action];
  if (row.day_count > limit.perDay) return { ok: false, retryAfter: dayStart + DAY - now };
  if (row.minute_count > limit.perMinute) return { ok: false, retryAfter: minuteStart + MINUTE - now };
  return { ok: true };
}

/** Ограничивает частоту запросов пользователя к маршруту. Ставить после requireUser. */
export const rateLimit = (action: RateAction) =>
  createMiddleware<AppEnv>(async (c, next) => {
    const result = await consumeRateLimit(c.env.DB, c.get("user").id, action);
    if (!result.ok) {
      c.header("Retry-After", String(result.retryAfter));
      return c.json({ error: "rate_limited", retryAfter: result.retryAfter }, 429);
    }
    await next();
  });

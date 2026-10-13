-- Лимиты запросов на пользователя (см. RATE_LIMITS в packages/shared/src/constants.ts).
-- Одна строка на пользователя и действие, в ней два счётчика с фиксированными окнами: минута и сутки (UTC).
-- Строки не накапливаются: на каждого пользователя не больше трёх, и они обновляются на месте.
-- Без внешнего ключа: строка создаётся до записи пользователя в users (новичок мог ещё не появиться в базе).
CREATE TABLE rate_limits (
  user_id INTEGER NOT NULL,
  action TEXT NOT NULL,
  minute_start INTEGER NOT NULL,
  minute_count INTEGER NOT NULL,
  day_start INTEGER NOT NULL,
  day_count INTEGER NOT NULL,
  PRIMARY KEY (user_id, action)
) WITHOUT ROWID;

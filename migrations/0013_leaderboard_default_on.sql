-- Таблица лидеров по умолчанию (25.11.2026, решение владельца): все нынешние ученики участвуют.
-- Выйти можно на экране таблицы или в «Настройках» → «Приватность». Новых учеников включает код
-- (LEADERBOARD_DEFAULT_OPTIN в packages/shared/src/gamification/constants.ts). Убранные командой (lb_banned = 1)
-- остаются вне таблицы. Снимки сбрасываются, чтобы таблица пересобралась при следующем просмотре.
UPDATE user_stats SET lb_optin = 1 WHERE lb_optin = 0;
UPDATE board_snapshots SET built_at = 0, lease_until = 0;

-- Учёт рассылок (26.11.2026, docs/REMINDERS.md, «Учёт рассылок»): журнал каждого напоминания и контрольная группа.
--
-- Одна строка на каждое ежедневное напоминание, которое ушло, и на каждое, которое нарочно не отправлено
-- (контрольная группа, grp = 'control'): так видно, занимаются ли люди после напоминания чаще, чем без него.
-- Отметки ставятся один раз и только в течение суток после sent_at.
CREATE TABLE reminder_sends (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  text_id INTEGER,               -- текст напоминания (NULL у контроля)
  grp TEXT NOT NULL CHECK (grp IN ('joke', 'progress', 'repeat', 'control')),
  sent_at INTEGER NOT NULL,      -- секунды Unix: когда отправлено (у контроля: когда отправилось бы)
  clicked_at INTEGER,            -- открыл приложение кнопкой «Продолжить» под напоминанием (?from=reminder)
  opened_at INTEGER,             -- открыл приложение любым путём
  studied_at INTEGER             -- выучил слово или букву или повторил слово
);
CREATE INDEX idx_reminder_sends_user ON reminder_sends (user_id, sent_at);
CREATE INDEX idx_reminder_sends_sent ON reminder_sends (sent_at);

-- Последняя строка журнала у ученика: когда и отмечено ли уже открытие. Нужны, чтобы /api/me не читал журнал
-- при каждом запуске (запись только при первом открытии в течение суток после напоминания).
ALTER TABLE reminders ADD COLUMN send_at INTEGER NOT NULL DEFAULT 0;
ALTER TABLE reminders ADD COLUMN send_open INTEGER NOT NULL DEFAULT 1;

-- Откуда пришёл ученик: параметр запуска первого входа (ссылка ...?startapp=<метка>). '' — без метки,
-- NULL — ученик пришёл до 26.11.2026, когда метки ещё не записывались.
ALTER TABLE users ADD COLUMN source TEXT;

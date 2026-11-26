-- Карточки в чате с ботом (26.11.2026, docs/WIDGETS.md): какое сообщение «Мой прогресс» закреплено у ученика.
-- Нужна, чтобы при новом /progress открепить прежнюю карточку и закрепить новую (в чате остаётся одна закреплённая).
-- Строка появляется после первого /progress; удаляется вместе с данными ученика («Удалить мои данные»).
CREATE TABLE bot_cards (
  user_id INTEGER PRIMARY KEY,
  progress_msg_id INTEGER,                   -- id сообщения с карточкой прогресса в личном чате с ботом
  progress_kind TEXT NOT NULL DEFAULT 'widget' CHECK (progress_kind IN ('widget', 'text')),
  updated_at INTEGER NOT NULL
) WITHOUT ROWID;

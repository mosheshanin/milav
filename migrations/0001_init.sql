-- Пользователи Telegram. id совпадает с Telegram user id.
CREATE TABLE users (
  id INTEGER PRIMARY KEY,
  first_name TEXT NOT NULL,
  last_name TEXT,
  username TEXT,
  language_code TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_seen_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Прогресс по четырём этапам каждого слова. Слово пройдено, когда заполнен completed_at.
-- Очки = число пройденных слов * POINTS_PER_WORD (считаются, а не хранятся).
CREATE TABLE word_progress (
  user_id INTEGER NOT NULL REFERENCES users(id),
  word_id TEXT NOT NULL,
  lesson_id TEXT NOT NULL,
  stage_listen INTEGER NOT NULL DEFAULT 0,
  stage_speak INTEGER NOT NULL DEFAULT 0,
  stage_write INTEGER NOT NULL DEFAULT 0,
  stage_type INTEGER NOT NULL DEFAULT 0,
  completed_at TEXT,
  PRIMARY KEY (user_id, word_id)
);
CREATE INDEX idx_word_progress_lesson ON word_progress (user_id, lesson_id);

-- Все попытки викторины.
CREATE TABLE quiz_attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  lesson_id TEXT NOT NULL,
  correct INTEGER NOT NULL,
  total INTEGER NOT NULL,
  passed INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_quiz_attempts_user ON quiz_attempts (user_id, lesson_id);

-- Сданные уроки (уникальные). По их числу считается статус.
CREATE TABLE lesson_passed (
  user_id INTEGER NOT NULL REFERENCES users(id),
  lesson_id TEXT NOT NULL,
  first_passed_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, lesson_id)
);

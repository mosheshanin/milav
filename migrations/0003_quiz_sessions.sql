-- Серверная викторина (ROADMAP п. 2): вопросы выдаёт сервер, ответы проверяет сервер, итог считает сервер.

-- Открытая викторина пользователя. Одна строка на пользователя (user_id это ключ): новый старт заменяет прежнюю
-- сессию, поэтому таблица не растёт. Готовая или прерванная сессия остаётся до следующего старта, чтобы повторный
-- запрос после обрыва связи получил тот же ответ (last_answer), а не ошибку.
-- rev это случайная метка состояния: каждое изменение меняет её, а запись идёт только если метка прежняя.
-- Так два одновременных запроса на один вопрос (перебор вариантов параллельно) не могут оба засчитаться.
CREATE TABLE quiz_sessions (
  user_id INTEGER PRIMARY KEY REFERENCES users(id),
  id TEXT NOT NULL,
  lesson_id TEXT NOT NULL,
  -- JSON: вопросы в том порядке, в каком их задают (тип, слово, варианты).
  questions TEXT NOT NULL,
  next_index INTEGER NOT NULL DEFAULT 0,
  correct INTEGER NOT NULL DEFAULT 0,
  mistakes INTEGER NOT NULL DEFAULT 0,
  -- Использованные попытки на текущий вопрос «произнеси».
  speak_attempts INTEGER NOT NULL DEFAULT 0,
  -- active: идёт; done: все вопросы отвечены, итог записан; aborted: ошибок больше допустимого, ничего не записано.
  status TEXT NOT NULL DEFAULT 'active',
  rev TEXT NOT NULL,
  -- JSON: ответ сервера на последний принятый вопрос.
  last_answer TEXT,
  -- Секунды Unix.
  created_at INTEGER NOT NULL
);

-- Статистика по вопросам: сколько раз слово спрашивали данным типом вопроса и сколько раз ответили верно.
-- Без привязки к людям. Показывает слова, которые путают, и слова с плохой озвучкой или распознаванием.
CREATE TABLE question_stats (
  word_id TEXT NOT NULL,
  question_type TEXT NOT NULL,
  asked INTEGER NOT NULL DEFAULT 0,
  correct INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (word_id, question_type)
) WITHOUT ROWID;

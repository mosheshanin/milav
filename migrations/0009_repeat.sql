-- Повторение слов (задача 10, docs/SPEC.md «Повторение»): коробки Лейтнера 1-3-7-14-30-60 дней.
--
-- Строка появляется при первом ответе на повторение. Пока её нет, слово в первой коробке и его пора повторить
-- на следующий день после изучения (день по UTC из word_progress.completed_at): так уже выученные слова попадают
-- в повторение сразу, без переноса данных. Буквы алфавита не повторяются.
CREATE TABLE repeat_state (
  user_id INTEGER NOT NULL REFERENCES users(id),
  word_id TEXT NOT NULL,
  lesson_id TEXT NOT NULL,
  box INTEGER NOT NULL,          -- 0..5: номер коробки (пауза REPEAT_INTERVALS[box] дней)
  due_day INTEGER NOT NULL,      -- местный день ученика, с которого слово пора повторять
  best_box INTEGER NOT NULL,     -- лучшая коробка: «прочно выучено» засчитывается один раз
  reps INTEGER NOT NULL DEFAULT 0,   -- сколько раз вспомнил
  lapses INTEGER NOT NULL DEFAULT 0, -- сколько раз забыл
  last_day INTEGER NOT NULL,     -- день последнего ответа
  PRIMARY KEY (user_id, word_id)
) WITHOUT ROWID;

-- Счётчики для бейджей «Память»: вспомнено при повторении и прочно выучено (дошло до последней коробки).
ALTER TABLE user_stats ADD COLUMN repeats_done INTEGER NOT NULL DEFAULT 0;
ALTER TABLE user_stats ADD COLUMN words_mastered INTEGER NOT NULL DEFAULT 0;

-- Тексты напоминаний с числом слов к повторению (подстановка {к_повторению}). Бот берёт их через раз, когда
-- к повторению накопилось 5 слов и больше (docs/REMINDERS.md, «Повторение»). Иврит проверяет носитель (вопрос 43).
INSERT INTO reminder_texts (kind, text, updated_at) VALUES
  ('daily', '{имя}, {к_повторению} ждут повторения. Память как мышца: две минуты, и она снова в тонусе 💪', 0),
  ('daily', 'Слова, которые вы выучили, начинают собирать чемоданы 🧳 К повторению: {к_повторению}. Верните их за пару минут!', 0),
  ('daily', 'Повторение — мать учения, а по-ивритски חזרה (хазара́) 🔁 Сегодня в очереди {к_повторению}.', 0);

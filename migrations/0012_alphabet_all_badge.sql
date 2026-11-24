-- Бейдж за общую викторину по всем буквам алфавита (решение владельца 24.11, вопрос 75).
--
-- Общая викторина (`alphabet-all`) не урок: в сданные уроки, статус и очки она не идёт. Чтобы за неё можно было
-- выдать бейдж, в счётчиках пользователя появляется отметка «общая викторина сдана» (0 или 1).
ALTER TABLE user_stats ADD COLUMN alphabet_all INTEGER NOT NULL DEFAULT 0;

-- Кто уже сдал её раньше, получает отметку сразу; сам бейдж выдаст сверка каталога при следующем входе.
UPDATE user_stats SET alphabet_all = 1
WHERE user_id IN (SELECT user_id FROM quiz_attempts WHERE lesson_id = 'alphabet-all' AND passed = 1);

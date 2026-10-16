-- Панель администратора, этап 3 (docs/ADMIN.md): проверка слов и букв носителем языка прямо в приложении.
--
-- Отзывы уроки сами не меняют: контент живёт в репозитории, правки переносит Claude (npm run content:reviews).
-- У каждого проверяющего один отзыв на слово, повторный отзыв его заменяет (история изменений в admin_log).
-- version это отпечаток слова, которое видел проверяющий (reviewFingerprint в packages/shared/src/review.ts):
-- когда правки перенесены в урок, отпечаток слова меняется, и отзыв перестаёт «ждать переноса».
CREATE TABLE content_reviews (
  item_id TEXT NOT NULL,              -- id слова или буквы
  reviewer INTEGER NOT NULL,          -- Telegram id проверяющего
  lesson_id TEXT NOT NULL,
  version TEXT NOT NULL,
  verdict TEXT NOT NULL CHECK (verdict IN ('ok', 'fix')),
  fixes TEXT NOT NULL DEFAULT '{}',   -- JSON: путь поля → исправленное значение
  comment TEXT NOT NULL DEFAULT '',
  updated_at INTEGER NOT NULL,        -- секунды Unix
  PRIMARY KEY (item_id, reviewer)
) WITHOUT ROWID;

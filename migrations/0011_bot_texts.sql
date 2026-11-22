-- Тексты бота, изменённые из панели («Сообщения бота», docs/ADMIN.md): ответы на команды, кнопки, всплывающие ответы,
-- описание бота и меню команд. Исходные тексты живут в коде (BOT_TEXTS в packages/shared/src/botTexts.ts); здесь только
-- изменённые. «Вернуть исходный» удаляет строку.
CREATE TABLE bot_texts (
  key TEXT PRIMARY KEY,
  text TEXT NOT NULL,
  updated_by INTEGER NOT NULL,
  updated_at INTEGER NOT NULL          -- секунды Unix
) WITHOUT ROWID;

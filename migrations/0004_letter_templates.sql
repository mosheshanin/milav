-- Шаблоны букв, которые владелец записывает в приложении (инструмент записи, доступен только id из секрета
-- TEMPLATE_RECORDER_IDS).
--
-- Это приёмник: рисунки сохраняются здесь прямо с телефона. В распознавание они попадают после выгрузки в
-- репозиторий (packages/shared/src/handwriting/ownTemplates.json, tools/own-templates.ts), чтобы приложение
-- и сервер получали один и тот же набор одной выкладкой, а не каждый по-своему из базы.
--
-- Одна строка = один вариант начертания: форма (letter, одна из 27) и номер варианта (slot, с нуля).
-- Перезапись варианта заменяет строку, поэтому таблица не растёт: не больше 27 форм на TEMPLATE_VARIANTS_PER_LETTER.
CREATE TABLE letter_templates (
  letter TEXT NOT NULL,
  slot INTEGER NOT NULL,
  -- JSON: штрихи как нарисованы на холсте (пиксели, один знак после запятой). Список штрихов, каждый штрих
  -- плоский список x1, y1, x2, y2, ... (так вдвое короче, чем список объектов {x, y}).
  strokes TEXT NOT NULL,
  recorded_by INTEGER NOT NULL,
  recorded_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (letter, slot)
) WITHOUT ROWID;

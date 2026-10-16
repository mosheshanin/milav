-- Напоминания от бота, этап 1 (docs/REMINDERS.md): выбор ученика, расписание, тексты (редактируются в панели).

-- Выбор ученика и расписание. Строка появляется, когда человек включил напоминания или ответил «Не сейчас».
CREATE TABLE reminders (
  user_id INTEGER PRIMARY KEY,
  enabled INTEGER NOT NULL DEFAULT 0,
  minute INTEGER NOT NULL DEFAULT 1200,      -- время по часам ученика, минуты от полуночи (20:00)
  next_at INTEGER,                           -- когда проверить в следующий раз, секунды Unix (NULL, если выключено)
  skip_day INTEGER NOT NULL DEFAULT 0,       -- местный день, в который не напоминать («Завтра не напоминать»)
  last_sent_at INTEGER NOT NULL DEFAULT 0,
  last_text_id INTEGER,
  opened_counted INTEGER NOT NULL DEFAULT 1, -- 0: после последнего напоминания приложение ещё не открывали
  blocked INTEGER NOT NULL DEFAULT 0,        -- 1: бот не может писать (заблокирован или не нажат «Старт»)
  asked_count INTEGER NOT NULL DEFAULT 0,    -- сколько раз ответили «Не сейчас»
  asked_at INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL
) WITHOUT ROWID;

-- Отправщик берёт тех, кому пора: по индексу, не перебирая всех.
CREATE INDEX idx_reminders_next ON reminders (next_at) WHERE enabled = 1;

-- Тексты напоминаний. Меняются в панели администратора («Напоминания»), счётчики для статистики по тексту.
CREATE TABLE reminder_texts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL CHECK (kind IN ('daily', 'enabled')),
  text TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  sent INTEGER NOT NULL DEFAULT 0,
  opened INTEGER NOT NULL DEFAULT 0,
  updated_by INTEGER,
  updated_at INTEGER NOT NULL
);

-- Первые тексты (черновики docs/REMINDERS.md). Иврит в них проверяет носитель (вопрос 43).
INSERT INTO reminder_texts (kind, text, updated_at) VALUES
  ('enabled', 'Готово, {имя}! Буду напоминать в {время}, если в этот день вы ещё не занимались. В шаббат не пишу 🕯️ Отключить можно кнопкой под любым напоминанием или в «Настройках» приложения.', 0),
  ('daily', 'Ваш иврит заскучал и смотрит в окно 🪟 Пять минут, и он снова в форме.', 0),
  ('daily', 'Кофе ✔️ Новости ✔️ Иврит 🤔 Давайте закроем список.', 0),
  ('daily', 'Сегодня в плане {осталось_слов} сл. Это быстрее, чем найти парковку у дома 🚗', 0),
  ('daily', 'Сова (ינשוף, яншу́ф) не спит и вам не даст 🦉 Одно слово, и можно спать.', 0),
  ('daily', 'Буква ש пересчитала свои три зубца и заметила, что вас сегодня не было 🦷', 0),
  ('daily', 'Ялла! 🚀 Да-да, יאללה, это слово вы уже знаете. Осталось ещё пара тысяч.', 0),
  ('daily', 'Осталось {осталось_слов} сл. до цели дня. По-израильски это עוד קצת (од кцат): ещё чуть-чуть 🤏', 0),
  ('daily', 'До следующей фигуры осталось уроков: {до_статуса}. {статус} уже собирает чемодан 🧳', 0);

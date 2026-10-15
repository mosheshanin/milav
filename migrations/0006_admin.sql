-- Панель администратора, этап 1 (docs/ADMIN.md): роли, настройки приложения, журнал, дневные сводки, посещения.

-- Команда: администраторы и проверяющие. Владелец задаётся секретом Cloudflare и здесь не хранится.
CREATE TABLE staff (
  user_id INTEGER PRIMARY KEY,
  role TEXT NOT NULL CHECK (role IN ('admin', 'reviewer')),
  added_by INTEGER NOT NULL,
  added_at INTEGER NOT NULL          -- секунды Unix
) WITHOUT ROWID;

-- Настройки приложения, которые меняются из панели без выкладки. Значение это JSON.
CREATE TABLE app_config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_by INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
) WITHOUT ROWID;

-- Журнал действий в панели: кто, когда, что поменял (старое и новое значение, JSON).
CREATE TABLE admin_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at INTEGER NOT NULL,
  actor INTEGER NOT NULL,
  action TEXT NOT NULL,
  target TEXT,
  old_value TEXT,
  new_value TEXT
);

-- Сводка за прошедший день (день по Иерусалиму, номер дня с 1.01.1970). Считается один раз при открытии панели.
CREATE TABLE daily_stats (
  day INTEGER PRIMARY KEY,
  data TEXT NOT NULL,                -- JSON DayNumbers
  built_at INTEGER NOT NULL
) WITHOUT ROWID;

-- В какие дни человек открывал приложение (день по Иерусалиму). Одна строка на человека и день:
-- «активные за день» и, позже, удержание (вернулся ли новичок на 1, 7 и 30 день).
CREATE TABLE activity_days (
  day INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  PRIMARY KEY (day, user_id)
) WITHOUT ROWID;

-- Сегодняшние цифры «Обзора» считаются на лету: по индексам, а не перебором всех строк.
CREATE INDEX idx_users_created ON users (created_at);
CREATE INDEX idx_word_progress_completed ON word_progress (completed_at) WHERE completed_at IS NOT NULL;
CREATE INDEX idx_quiz_attempts_created ON quiz_attempts (created_at) WHERE passed = 1;

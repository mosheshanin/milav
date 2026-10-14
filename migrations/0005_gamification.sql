-- Геймификация (docs/GAMIFICATION.md): счётчики, недельный ритм, цель дня, бейджи, таблица лидеров.
-- Миграция только добавляет таблицы и индексы, прежние таблицы не меняются.

-- Одна строка на пользователя. Создаётся лениво при первом запросе после выпуска пересчётом из word_progress,
-- lesson_passed и quiz_attempts (так подхватывается прежний прогресс). Очки = words_done + letters_done.
CREATE TABLE user_stats (
  user_id INTEGER PRIMARY KEY REFERENCES users(id),

  -- Счётчики очков и бейджей
  words_done INTEGER NOT NULL DEFAULT 0,
  letters_done INTEGER NOT NULL DEFAULT 0,
  passed_lessons INTEGER NOT NULL DEFAULT 0,
  alphabet_lessons INTEGER NOT NULL DEFAULT 0,
  perfect_quizzes INTEGER NOT NULL DEFAULT 0,
  topics_closed INTEGER NOT NULL DEFAULT 0,
  sections_mask INTEGER NOT NULL DEFAULT 0,
  returns INTEGER NOT NULL DEFAULT 0,

  -- Дни и недели ритма по местному времени пользователя (номера дней и недель: packages/shared/src/gamification/time.ts)
  tz TEXT NOT NULL DEFAULT 'Asia/Jerusalem',
  tz_changed_day INTEGER NOT NULL DEFAULT 0,
  active_days INTEGER NOT NULL DEFAULT 0,
  last_day INTEGER NOT NULL DEFAULT 0,
  week_idx INTEGER NOT NULL DEFAULT 0,
  week_days INTEGER NOT NULL DEFAULT 0,
  week_words INTEGER NOT NULL DEFAULT 0,
  rhythm_weeks INTEGER NOT NULL DEFAULT 0,
  rhythm_hist INTEGER NOT NULL DEFAULT 0,
  prev_week_idx INTEGER NOT NULL DEFAULT 0,
  prev_week_days INTEGER NOT NULL DEFAULT 0,
  prev_week_words INTEGER NOT NULL DEFAULT 0,

  -- Цель дня (0 = выключена)
  daily_goal INTEGER NOT NULL DEFAULT 5,
  goal_day INTEGER NOT NULL DEFAULT 0,
  goal_words INTEGER NOT NULL DEFAULT 0,
  goal_days INTEGER NOT NULL DEFAULT 0,

  -- Таблица лидеров (по умолчанию человек не участвует). Неделя таблицы одна для всех, по Иерусалиму.
  lb_optin INTEGER NOT NULL DEFAULT 0,
  lb_banned INTEGER NOT NULL DEFAULT 0,
  lb_week_idx INTEGER NOT NULL DEFAULT 0,
  lb_week_points INTEGER NOT NULL DEFAULT 0,
  lb_updated_at INTEGER NOT NULL DEFAULT 0,

  -- Сравнение с теми, кто пришёл в одно время
  cohort_week INTEGER NOT NULL DEFAULT 0,
  cohort_excluded INTEGER NOT NULL DEFAULT 0,

  -- Версия каталога бейджей, по которой пользователь уже проверен (новые бейджи выдаются задним числом лениво)
  badges_ver INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

-- Только участники, не забаненные: остальные строки индекс не трогает. Очки в индекс не входят,
-- поэтому начисление очка не добавляет записи в индекс.
CREATE INDEX idx_user_stats_lb ON user_stats (user_id) WHERE lb_optin = 1 AND lb_banned = 0;
-- Группы «пришли в одно время». cohort_week не меняется после создания строки.
CREATE INDEX idx_user_stats_cohort ON user_stats (cohort_week) WHERE cohort_excluded = 0;

-- Полученные бейджи. Первичный ключ делает выдачу идемпотентной (INSERT OR IGNORE).
CREATE TABLE user_badges (
  user_id INTEGER NOT NULL REFERENCES users(id),
  badge_id TEXT NOT NULL,
  earned_at INTEGER NOT NULL,        -- секунды Unix; у выданных задним числом восстановлено, где можно
  retro INTEGER NOT NULL DEFAULT 0,  -- 1: выдан пересчётом задним числом
  seen INTEGER NOT NULL DEFAULT 0,   -- 0: человек ещё не видел поздравление
  PRIMARY KEY (user_id, badge_id)
) WITHOUT ROWID;

-- Снимки таблицы лидеров: board = 'week' | 'all'. data = JSON [[id, очки], ...] по порядку мест.
CREATE TABLE board_snapshots (
  board TEXT PRIMARY KEY,
  week_idx INTEGER NOT NULL,
  built_at INTEGER NOT NULL,
  lease_until INTEGER NOT NULL DEFAULT 0,
  data TEXT NOT NULL
) WITHOUT ROWID;

-- Снимки сравнения: ключ 'c:<неделя>'. Только размеры групп и квантили, ни имён, ни id.
CREATE TABLE cohort_snapshots (
  cohort TEXT PRIMARY KEY,
  built_at INTEGER NOT NULL,
  data TEXT NOT NULL                 -- JSON { week: {size,p25,p50,p75} | null, window: {...} | null }
) WITHOUT ROWID;

// Правила геймификации в одном месте (решения владельца от 13–14.10.2026: docs/GAMIFICATION.md). Меняются только здесь.

/** Часовой пояс по умолчанию, пока приложение не прислало свой, и пояс таблицы лидеров (одна неделя для всех). */
export const DEFAULT_TZ = "Asia/Jerusalem";
export const LEADERBOARD_TZ = DEFAULT_TZ;

/** С какого дня начинается неделя: 0 — воскресенье, 1 — понедельник (решение владельца: воскресенье). */
export const WEEK_START_DAY = 0;

/** Сколько дней занятий в неделе делают её «ритмичной». */
export const RHYTHM_DAYS_PER_WEEK = 3;

/** Перерыв в днях, после которого возвращение отмечается бейджем (дней без занятий подряд). */
export const RETURN_GAP_DAYS = 14;

/** Цель дня: допустимые значения (0 — выключена) и значение по умолчанию (решение владельца: включена на 5). */
export const DAILY_GOAL_OPTIONS = [0, 3, 5, 10] as const;
export const DEFAULT_DAILY_GOAL = 5;

/**
 * Версия каталога бейджей. Растёт, когда меняются правила уже существующих бейджей; новые бейджи и бейджи, ставшие
 * достижимыми из-за нового контента, учитываются через число бейджей в каталоге (см. `buildCatalog`).
 */
export const CATALOG_VERSION = 1;

/** Таблица лидеров: сколько мест показывать, сколько соседей выше и ниже своего места, как долго живёт снимок (секунды). */
export const LEADERBOARD_TOP = 20;
export const LEADERBOARD_AROUND = 2;
export const BOARD_TTL_SECONDS = { week: 10 * 60, all: 30 * 60 } as const;
/** Сколько секунд обновитель снимка держит «аренду», чтобы одновременно не пересобирали двое. */
export const BOARD_LEASE_SECONDS = 30;
/** Сколько знаков имени показывается в таблице. */
export const DISPLAY_NAME_MAX = 20;
export const DISPLAY_NAME_FALLBACK = "Игрок";

/** Сравнение с теми, кто пришёл в одно время: минимальный размер группы, окно в неделях, как часто пересчитывать (секунды). */
export const COHORT_MIN_SIZE = 20;
export const COHORT_WINDOW_WEEKS = 2;
export const COHORT_TTL_SECONDS = 24 * 60 * 60;

/** Ссылка на приложение для кнопки «Поделиться» (решение владельца). */
export const SHARE_URL = "https://t.me/milavbotbot";

/** Ограничение на число id в одном запросе «просмотрено». */
export const MAX_SEEN_IDS = 100;

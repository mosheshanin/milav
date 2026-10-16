// Панель администратора (docs/ADMIN.md): роли, настройки приложения в базе, ответы API панели.
import { DAILY_GOAL_OPTIONS } from "./gamification/constants";

/** Роль в команде. Владелец задаётся секретом и всегда администратор. */
export type StaffRole = "admin" | "reviewer";
export const STAFF_ROLES: readonly StaffRole[] = ["admin", "reviewer"];
export const STAFF_ROLE_TITLES: Record<StaffRole, string> = { admin: "Администратор", reviewer: "Проверяющий" };

/** Роль текущего пользователя в ответе /api/me (только у команды). */
export interface StaffInfo {
  role: StaffRole;
  /** Владелец из секрета Cloudflare: его нельзя убрать из панели. */
  owner: boolean;
}

/** Положение новой функции: выключена, только для команды (администраторы и проверяющие), для всех. */
export type FeatureMode = "off" | "team" | "all";
export const FEATURE_MODES: readonly FeatureMode[] = ["off", "team", "all"];
export const FEATURE_MODE_TITLES: Record<FeatureMode, string> = { off: "Выкл.", team: "Команда", all: "Все" };

/** Включена ли функция для человека с такой ролью (или без роли). */
export function featureOn(mode: FeatureMode, staff: StaffInfo | null | undefined): boolean {
  return mode === "all" || (mode === "team" && !!staff);
}

/** Описание настройки приложения: по нему сервер проверяет значение, а панель рисует выбор. */
export type ConfigDef =
  | { kind: "feature"; title: string; hint: string }
  | { kind: "choice"; title: string; hint: string; options: readonly number[] };

/**
 * Настройки приложения, которые меняются из панели без выкладки. Значение по умолчанию (пока в базе ничего нет)
 * задаёт сервер: у таблицы лидеров это прежняя переменная LEADERBOARD_ENABLED.
 */
export const APP_CONFIG = {
  leaderboard: {
    kind: "feature",
    title: "Таблица лидеров",
    hint: "«Команда»: таблицу видят только администраторы и проверяющие. При выключении данные участников сохраняются.",
  },
  reminders: {
    kind: "feature",
    title: "Напоминания от бота",
    hint: "Предложение включить напоминания, раздел в «Настройках» и отправка. «Команда»: только администраторам и проверяющим (для проверки). При выключении сообщения перестают уходить, выбор учеников сохраняется.",
  },
  defaultDailyGoal: {
    kind: "choice",
    title: "Цель дня для новых учеников",
    hint: "Сколько слов в день предлагать тем, кто открывает приложение впервые. У остальных цель не меняется.",
    options: DAILY_GOAL_OPTIONS,
  },
} as const satisfies Record<string, ConfigDef>;

export type ConfigKey = keyof typeof APP_CONFIG;
export const CONFIG_KEYS = Object.keys(APP_CONFIG) as ConfigKey[];

export interface AppConfig {
  leaderboard: FeatureMode;
  reminders: FeatureMode;
  defaultDailyGoal: number;
}

/** Проверяет значение настройки. Возвращает true, если его можно сохранить. */
export function isValidConfigValue(key: ConfigKey, value: unknown): boolean {
  const def: ConfigDef = APP_CONFIG[key];
  if (def.kind === "feature") return (FEATURE_MODES as readonly unknown[]).includes(value);
  return def.options.includes(value as number);
}

/** Подпись значения для панели и журнала. */
export function configValueTitle(key: ConfigKey, value: unknown): string {
  const def: ConfigDef = APP_CONFIG[key];
  if (def.kind === "feature") return FEATURE_MODE_TITLES[value as FeatureMode] ?? String(value);
  if (key === "defaultDailyGoal") return value === 0 ? "Выкл." : `${value} сл.`;
  return String(value);
}

/** Сколько новых ролей и записей журнала отдавать за раз. */
export const ADMIN_LOG_PAGE = 50;
export const MAX_STAFF = 50;

// ---- Ответы API панели ----

/** Цифры за один день (или за неделю). */
export interface DayNumbers {
  /** Новые ученики: впервые открыли приложение. */
  newUsers: number;
  /** Открывали приложение (за неделю это разные люди, а не сумма по дням). */
  active: number;
  /** Выучено слов и букв (пройдены все этапы). */
  learned: number;
  /** Сдано викторин (все попытки со сдачей, в том числе повторные). */
  quizzesPassed: number;
}

export interface OverviewDay extends DayNumbers {
  /** Дата по Иерусалиму, `YYYY-MM-DD`. */
  date: string;
}

export interface AdminOverviewResponse {
  today: OverviewDay;
  /** Сегодня и шесть прошлых дней. */
  week: DayNumbers;
  /** Семь дней перед ними. */
  prevWeek: DayNumbers;
  /** Последние 14 дней до вчера включительно, от новых к старым. */
  days: OverviewDay[];
  /** Всего учеников в базе. */
  totalUsers: number;
  /** С какого дня считается «открывали» (до этого дня таблицы посещений ещё не было). */
  activeSince: string | null;
}

export interface ConfigItem {
  key: ConfigKey;
  value: FeatureMode | number;
  /** true, если значение ещё не меняли из панели (действует значение по умолчанию). */
  isDefault: boolean;
  updatedAt: number | null;
  updatedBy: number | null;
}

export interface AdminConfigResponse {
  items: ConfigItem[];
}

export interface StaffMember {
  userId: number;
  role: StaffRole;
  /** Имя из Telegram, если человек уже открывал приложение. */
  name: string | null;
  owner: boolean;
  addedBy: number | null;
  addedAt: number | null;
}

export interface AdminTeamResponse {
  members: StaffMember[];
}

export interface AdminLogEntry {
  id: number;
  at: number;
  actor: number;
  actorName: string | null;
  /** config.set, staff.add, staff.change, staff.remove */
  action: string;
  target: string | null;
  oldValue: unknown;
  newValue: unknown;
}

export interface AdminLogResponse {
  entries: AdminLogEntry[];
  /** id для следующей страницы (записи старше), null если больше нет. */
  nextBefore: number | null;
}

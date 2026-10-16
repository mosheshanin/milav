import type { StaffInfo } from "@milav/shared";
import type { AuthUser } from "./auth";
import type { ReminderScheduler } from "./scheduler";

/** Привязки и переменные Worker (см. wrangler.jsonc). */
export type Bindings = {
  DB: D1Database;
  /** Workers AI: распознавание речи. Недоступен при локальной разработке. */
  AI?: unknown;
  /** Токен бота. Задаётся секретом в Cloudflare, в репозитории его нет. */
  BOT_TOKEN?: string;
  /** "true" только для локальной разработки: разрешает вход без Telegram. */
  ALLOW_DEV_AUTH?: string;
  /**
   * Telegram id тех, кто может записывать шаблоны букв, через запятую. Секрет в Cloudflare (в репозитории его нет,
   * кроме тестового значения в env.local). Если не задан, записывать не может никто.
   */
  TEMPLATE_RECORDER_IDS?: string;
  /**
   * Владельцы (всегда администраторы панели): Telegram id через запятую. Секрет в Cloudflare. Читается вместе с
   * TEMPLATE_RECORDER_IDS (прежнее имя), см. admin.ts и docs/ADMIN.md.
   */
  ADMIN_IDS?: string;
  /**
   * Таблица лидеров по умолчанию: "1" включена для всех, иначе выключена. Действует, пока настройку «Таблица лидеров»
   * не поменяли в панели администратора (app_config, admin.ts): значение из панели главнее.
   */
  LEADERBOARD_ENABLED?: string;
  /** Напоминания по умолчанию (пока их не меняли в панели): "off", "team" или "all". Без переменной "team". */
  REMINDERS_DEFAULT?: string;
  /** Таймер напоминаний (Durable Object, scheduler.ts). В тестах его нет. */
  REMINDER_SCHEDULER?: DurableObjectNamespace<ReminderScheduler>;
};

export type AppEnv = {
  Bindings: Bindings;
  /** staff есть только после requireAdmin или requireStaff. */
  Variables: { user: AuthUser; staff?: StaffInfo };
};

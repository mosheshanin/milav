import type { AuthUser } from "./auth";

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
};

export type AppEnv = {
  Bindings: Bindings;
  Variables: { user: AuthUser };
};

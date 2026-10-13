// С чем открыто приложение. Параметр запуска задаёт ссылка вида https://t.me/<бот>/<приложение>?startapp=record:
// Telegram кладёт его в `initDataUnsafe.start_param` и в хеш адреса (`tgWebAppStartParam`).

export type LaunchTarget = "record" | null;

export interface LaunchInput {
  /** `Telegram.WebApp.initDataUnsafe.start_param`. */
  startParam?: string;
  /** `location.hash` (там Telegram дублирует параметр запуска). */
  hash: string;
  /** `location.search`. */
  search: string;
  /** Локальная разработка: тестовые параметры адреса (?record) разрешены. */
  allowDev: boolean;
}

/**
 * Куда открыть приложение при первом запуске. Сейчас единственная особая цель это скрытый экран записи шаблонов
 * букв (`startapp=record`). Это только выбор экрана: пускает ли сервер, решает проверка Telegram id (GET /api/templates).
 */
export function launchTargetFrom(input: LaunchInput): LaunchTarget {
  if (input.startParam === "record") return "record";
  try {
    if (new URLSearchParams(input.hash.replace(/^#/, "")).get("tgWebAppStartParam") === "record") return "record";
  } catch {
    // Нечитаемый хеш: параметра запуска нет.
  }
  if (input.allowDev && new URLSearchParams(input.search).has("record")) return "record";
  return null;
}

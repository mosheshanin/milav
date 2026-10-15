// Текущий экран приложения и его сохранение между перезагрузками.
//
// Экран хранится в sessionStorage, а не в адресе: Telegram передаёт параметры запуска (initData) в хеше адреса,
// и менять его опасно для входа. sessionStorage живёт, пока открыто окно приложения, и переживает перезагрузку.

export type Screen =
  | { name: "home" }
  | { name: "study"; lessonId: string }
  | { name: "quiz"; lessonId: string }
  /** Практика форм глагола после урока (ничего не сохраняет). */
  | { name: "practice"; lessonId: string }
  /** Достижения, ритм и настройки (геймификация). */
  | { name: "achievements" }
  /** Таблица лидеров. */
  | { name: "leaderboard" }
  /** Настройки; `from` это экран, куда ведёт «назад» (главная или достижения). */
  | { name: "settings"; from: "home" | "achievements" }
  /** Скрытый экран записи шаблонов букв (только владелец, см. docs/DEPLOY.md). */
  | { name: "record" };

export const HOME: Screen = { name: "home" };
export const RECORD: Screen = { name: "record" };
export const ACHIEVEMENTS: Screen = { name: "achievements" };
export const LEADERBOARD: Screen = { name: "leaderboard" };

/** Ключ в sessionStorage. Его же читает отчёт об ошибке (lib/telemetry.ts), чтобы знать экран. */
export const SCREEN_KEY = "milav:screen";
const KEY = SCREEN_KEY;

/** Минимум от Storage, чтобы код проверялся без браузера. */
export interface ScreenStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** sessionStorage, если он доступен (в некоторых окнах и режимах доступ к нему бросает ошибку). */
export function browserStorage(): ScreenStorage | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

export function saveScreen(storage: ScreenStorage | null, screen: Screen): void {
  try {
    storage?.setItem(KEY, JSON.stringify(screen));
  } catch {
    // Не получилось сохранить: приложение просто не запомнит место.
  }
}

/**
 * Было ли в этом окне уже сохранено место. Нужно, чтобы параметр запуска (например, `startapp=record`) действовал
 * только при первом открытии: если человек потом ушёл на главную и перезагрузил приложение, его не возвращает назад.
 */
export function hasSavedScreen(storage: ScreenStorage | null): boolean {
  try {
    return !!storage?.getItem(KEY);
  } catch {
    return false;
  }
}

/**
 * Экран, на который вернуться после перезагрузки.
 * Викторина и практика форм после перезагрузки начинаются заново, поэтому их открывать нельзя: возвращаем на урок.
 * Неизвестный урок и любой мусор в хранилище ведут на главную.
 */
export function restoreScreen(storage: ScreenStorage | null, lessonExists: (lessonId: string) => boolean): Screen {
  let raw: unknown;
  try {
    const text = storage?.getItem(KEY);
    raw = text ? JSON.parse(text) : null;
  } catch {
    return HOME;
  }
  if (typeof raw !== "object" || raw === null) return HOME;
  const { name, lessonId } = raw as { name?: unknown; lessonId?: unknown };
  if (name === "record") return RECORD;
  if (name === "achievements") return ACHIEVEMENTS;
  if (name === "leaderboard") return LEADERBOARD;
  if (name === "settings") {
    const from = (raw as { from?: unknown }).from;
    return { name: "settings", from: from === "achievements" ? "achievements" : "home" };
  }
  if ((name === "study" || name === "quiz" || name === "practice") && typeof lessonId === "string" && lessonExists(lessonId)) {
    return { name: "study", lessonId };
  }
  return HOME;
}

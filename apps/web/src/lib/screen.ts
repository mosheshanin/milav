// Текущий экран приложения и его сохранение между перезагрузками.
//
// Экран хранится в sessionStorage, а не в адресе: Telegram передаёт параметры запуска (initData) в хеше адреса,
// и менять его опасно для входа. sessionStorage живёт, пока открыто окно приложения, и переживает перезагрузку.

export type Screen =
  | { name: "home" }
  | { name: "study"; lessonId: string }
  | { name: "quiz"; lessonId: string }
  /** Достижения, ритм и настройки (геймификация). */
  | { name: "achievements" }
  /** Таблица лидеров. */
  | { name: "leaderboard" }
  /** Скрытый экран записи шаблонов букв (только владелец, см. docs/DEPLOY.md). */
  | { name: "record" };

export const HOME: Screen = { name: "home" };
export const RECORD: Screen = { name: "record" };
export const ACHIEVEMENTS: Screen = { name: "achievements" };
export const LEADERBOARD: Screen = { name: "leaderboard" };

const KEY = "milav:screen";

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
 * Викторина после перезагрузки начинается заново, поэтому её открывать нельзя: возвращаем на урок.
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
  if ((name === "study" || name === "quiz") && typeof lessonId === "string" && lessonExists(lessonId)) {
    return { name: "study", lessonId };
  }
  return HOME;
}

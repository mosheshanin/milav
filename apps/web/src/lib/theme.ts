// Тема оформления: светлая, тёмная или «как в Telegram». Выбор хранится на этом устройстве (как вибрация).
//
// Как устроено: цвета интерфейса это токены в index.css; тёмная тема переопределяет их под `:root[data-theme="dark"]`.
// Здесь только выбор темы и её применение: атрибут `data-theme` на <html>, `color-scheme`, цвет шапки и фона Telegram.
// Позже сюда же добавится цветовая схема (атрибут `data-palette` и свои наборы токенов), выбор голоса живёт отдельно.
import { getTelegram } from "../telegram";

export type ThemeChoice = "system" | "light" | "dark";
export type Theme = "light" | "dark";

export const THEME_CHOICES: readonly ThemeChoice[] = ["system", "light", "dark"];

export const THEME_TITLES: Record<ThemeChoice, string> = {
  system: "Как в Telegram",
  light: "Светлая",
  dark: "Тёмная",
};

/** Ключ в localStorage. */
export const THEME_KEY = "milav:theme";

/** Минимум от Storage, чтобы код проверялся без браузера. */
export interface ThemeStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function localStorageOrNull(): ThemeStorage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function loadThemeChoice(storage: ThemeStorage | null = localStorageOrNull()): ThemeChoice {
  try {
    const value = storage?.getItem(THEME_KEY);
    return THEME_CHOICES.includes(value as ThemeChoice) ? (value as ThemeChoice) : "system";
  } catch {
    return "system";
  }
}

export function saveThemeChoice(choice: ThemeChoice, storage: ThemeStorage | null = localStorageOrNull()): void {
  try {
    storage?.setItem(THEME_KEY, choice);
  } catch {
    // Хранилище недоступно: выбор не запомнится, но применится до закрытия приложения.
  }
}

/**
 * Какая тема получится. «Как в Telegram»: в Telegram берём его схему (`colorScheme`), вне Telegram системную
 * настройку устройства (`prefers-color-scheme`).
 */
export function resolveTheme(choice: ThemeChoice, telegramScheme: string | undefined, prefersDark: boolean): Theme {
  if (choice !== "system") return choice;
  if (telegramScheme === "dark" || telegramScheme === "light") return telegramScheme;
  return prefersDark ? "dark" : "light";
}

function prefersDark(): boolean {
  try {
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  } catch {
    return false;
  }
}

/** Значение токена из index.css (например, `--color-page`) для текущей темы. */
export function cssToken(name: string, fallback: string): string {
  try {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
  } catch {
    return fallback;
  }
}

let current: Theme = "light";
const listeners = new Set<(theme: Theme) => void>();

/** Текущая тема (уже применённая). */
export function currentTheme(): Theme {
  return current;
}

/** Подписка на смену темы (холсту для письма нужно перерисоваться другими цветами). Возвращает отписку. */
export function onThemeChange(listener: (theme: Theme) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Применяет тему к странице и красит шапку и фон Telegram в цвета приложения. Старые версии Telegram пропускаются. */
export function applyTheme(choice: ThemeChoice = loadThemeChoice()): Theme {
  const tg = getTelegram();
  const theme = resolveTheme(choice, tg?.colorScheme, prefersDark());
  const root = document.documentElement;
  root.dataset.theme = theme;
  root.style.colorScheme = theme;
  const page = cssToken("--color-page", theme === "dark" ? "#0f172a" : "#f8fafc");
  const surface = cssToken("--color-surface", theme === "dark" ? "#1e293b" : "#ffffff");
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", surface);
  if (tg) {
    const supports = (version: string) => {
      try {
        return tg.isVersionAtLeast?.(version) ?? false;
      } catch {
        return false;
      }
    };
    try {
      // Цвет шапки Telegram совпадает с шапкой приложения, фон с фоном страницы (видно при прокрутке за край).
      if (supports("6.9")) tg.setHeaderColor?.(surface);
      if (supports("6.1")) tg.setBackgroundColor?.(page);
      if (supports("7.10")) tg.setBottomBarColor?.(page);
    } catch {
      // Метод не поддерживается этой версией Telegram.
    }
  }
  if (theme !== current) {
    current = theme;
    for (const listener of listeners) listener(theme);
  }
  return theme;
}

/** Сохраняет выбор и сразу применяет его. */
export function setThemeChoice(choice: ThemeChoice): Theme {
  saveThemeChoice(choice);
  return applyTheme(choice);
}

/**
 * Применяет тему при запуске (до первого кадра, чтобы не мигало) и следит за сменой темы Telegram или устройства:
 * она важна только при выборе «Как в Telegram».
 */
export function initTheme(): void {
  applyTheme();
  const follow = () => {
    if (loadThemeChoice() === "system") applyTheme("system");
  };
  try {
    getTelegram()?.onEvent?.("themeChanged", follow);
  } catch {
    // Событие не поддерживается этой версией Telegram.
  }
  try {
    window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", follow);
  } catch {
    // Старый браузер без addEventListener у MediaQueryList.
  }
}

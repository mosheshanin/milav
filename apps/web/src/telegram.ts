// Минимальные типы Telegram WebApp SDK (скрипт подключён в index.html).
import { launchTargetFrom, type LaunchTarget } from "./lib/launch";

export interface TelegramUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
}

/** Кнопка «назад» в шапке Telegram (она же системная кнопка и свайп назад на телефонах). Есть с версии 6.1. */
export interface TelegramBackButton {
  show: () => void;
  hide: () => void;
  onClick: (callback: () => void) => void;
  offClick: (callback: () => void) => void;
}

export interface TelegramWebApp {
  initData: string;
  /** Платформа приложения Telegram: ios, android, tdesktop, macos, weba, webk и т. д. */
  platform?: string;
  initDataUnsafe: { user?: TelegramUser; start_param?: string };
  ready: () => void;
  expand: () => void;
  BackButton?: TelegramBackButton;
  /** Родной диалог подтверждения (с версии 6.2). */
  showConfirm?: (message: string, callback: (confirmed: boolean) => void) => void;
  /** Спрашивать подтверждение, когда человек закрывает приложение (с версии 6.2). */
  enableClosingConfirmation?: () => void;
  disableClosingConfirmation?: () => void;
}

declare global {
  interface Window {
    Telegram?: { WebApp?: TelegramWebApp };
  }
}

/** Возвращает WebApp, если приложение открыто внутри Telegram, иначе null. */
export function getTelegram(): TelegramWebApp | null {
  return window.Telegram?.WebApp ?? null;
}

const LOCAL_HOSTS = ["localhost", "127.0.0.1"];

/** Куда открыть приложение при первом запуске (сейчас особая цель одна: скрытый экран записи шаблонов букв). */
export function launchTarget(): LaunchTarget {
  return launchTargetFrom({
    startParam: getTelegram()?.initDataUnsafe.start_param,
    hash: location.hash,
    search: location.search,
    allowDev: import.meta.env.DEV || LOCAL_HOSTS.includes(location.hostname),
  });
}

/** Telegram id текущего пользователя: нужен экрану записи, чтобы показать, какой id внести в секрет. */
export function currentUserId(): number | null {
  const fromTelegram = getTelegram()?.initDataUnsafe.user?.id;
  if (fromTelegram) return fromTelegram;
  const match = /^dev (\d{1,15}):/.exec(authHeader() ?? "");
  return match ? Number(match[1]) : null;
}

/** Сообщает Telegram, что приложение загружено, и раскрывает его на весь экран. */
export function initTelegram(): void {
  const tg = getTelegram();
  if (!tg) return;
  tg.ready();
  tg.expand();
}

/**
 * Заголовок авторизации для API.
 * В Telegram это подписанные данные запуска. На локальной машине (без Telegram) подставляется
 * тестовый пользователь, номер можно задать в адресе: ?dev=1002. В остальных случаях null.
 */
export function authHeader(): string | null {
  const initData = getTelegram()?.initData;
  if (initData) return `tma ${initData}`;
  if (import.meta.env.DEV || LOCAL_HOSTS.includes(location.hostname)) {
    const id = new URLSearchParams(location.search).get("dev") ?? "1001";
    return `dev ${/^\d{1,15}$/.test(id) ? id : "1001"}:Tester`;
  }
  return null;
}

/**
 * Спрашивает подтверждение. В Telegram это родной диалог, а если он не поддерживается (старая версия)
 * или приложение открыто вне Telegram, обычный `confirm`.
 */
export function confirmAction(message: string): Promise<boolean> {
  const tg = getTelegram();
  if (tg?.showConfirm) {
    return new Promise((resolve) => {
      try {
        tg.showConfirm?.(message, (confirmed) => resolve(confirmed));
      } catch {
        resolve(window.confirm(message));
      }
    });
  }
  return Promise.resolve(window.confirm(message));
}

/** Включает или выключает вопрос «закрыть приложение?» (например, пока идёт викторина). Старые версии молча пропускаются. */
export function setClosingConfirmation(enabled: boolean): void {
  try {
    const tg = getTelegram();
    if (enabled) tg?.enableClosingConfirmation?.();
    else tg?.disableClosingConfirmation?.();
  } catch {
    // Метод не поддерживается этой версией Telegram.
  }
}

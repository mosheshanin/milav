// Минимальные типы Telegram WebApp SDK (скрипт подключён в index.html).

export interface TelegramUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
}

export interface TelegramWebApp {
  initData: string;
  /** Платформа приложения Telegram: ios, android, tdesktop, macos, weba, webk и т. д. */
  platform?: string;
  initDataUnsafe: { user?: TelegramUser };
  ready: () => void;
  expand: () => void;
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

/** Сообщает Telegram, что приложение загружено, и раскрывает его на весь экран. */
export function initTelegram(): void {
  const tg = getTelegram();
  if (!tg) return;
  tg.ready();
  tg.expand();
}

const LOCAL_HOSTS = ["localhost", "127.0.0.1"];

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

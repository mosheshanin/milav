// Минимальные типы Telegram WebApp SDK (скрипт подключён в index.html).
// Полный набор типов добавим, когда понадобятся другие методы.

export interface TelegramUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
}

export interface TelegramWebApp {
  initData: string;
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

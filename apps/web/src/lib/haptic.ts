// Отклик устройства Telegram (HapticFeedback, с версии 6.1). Старые версии молча пропускаются.
import { getTelegram } from "../telegram";

const KEY = "milav:haptics";

/** Включена ли вибрация (настройка хранится только на этом устройстве). По умолчанию включена. */
export function hapticsEnabled(): boolean {
  try {
    return window.localStorage.getItem(KEY) !== "off";
  } catch {
    return true;
  }
}

export function setHapticsEnabled(on: boolean): void {
  try {
    window.localStorage.setItem(KEY, on ? "on" : "off");
  } catch {
    // Хранилище недоступно: настройка не запомнится.
  }
}

/** success: бейдж, смена статуса, цель дня; light: переключение вкладок. */
export function haptic(kind: "success" | "light"): void {
  if (!hapticsEnabled()) return;
  try {
    const feedback = getTelegram()?.HapticFeedback;
    if (kind === "success") feedback?.notificationOccurred("success");
    else feedback?.impactOccurred("light");
  } catch {
    // Метод не поддерживается этой версией Telegram.
  }
}

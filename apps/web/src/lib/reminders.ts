// Включение напоминаний из приложения: разрешение Telegram «боту можно писать вам», запрос к серверу, понятные ошибки.
import type { ReminderInfo } from "@milav/shared";
import { ApiError, api } from "../api";
import { getTelegram } from "../telegram";

/** Ссылка на бота: если он заблокирован или не нажат «Старт», человек открывает чат и нажимает «Старт». */
export const BOT_LINK = "https://t.me/milavbotbot";

/**
 * Разрешение писать: в Telegram видно по `allows_write_to_pm`. Если его нет, просим родным диалогом (Telegram 6.9+).
 * Вне Telegram или в старой версии спросить нельзя: тогда решит сервер (бот попробует написать).
 */
export function requestWriteAccess(): Promise<boolean> {
  const tg = getTelegram();
  if (!tg || tg.initDataUnsafe?.user?.allows_write_to_pm || !tg.requestWriteAccess) return Promise.resolve(true);
  return new Promise((resolve) => {
    try {
      tg.requestWriteAccess?.((granted) => resolve(granted));
    } catch {
      resolve(true);
    }
  });
}

export type EnableOutcome = { ok: true; reminders: ReminderInfo } | { ok: false; reason: "denied" | "blocked" | "error"; reminders?: ReminderInfo; text: string };

const BLOCKED_TEXT = "Бот не может вам написать. Откройте чат с ботом, нажмите «Старт» (или «Разблокировать») и включите напоминания снова.";

/** Включает напоминания на `minute`. Бот сразу присылает подтверждение в чат. */
export async function enableReminders(minute: number): Promise<EnableOutcome> {
  if (!(await requestWriteAccess())) {
    return { ok: false, reason: "denied", text: "Без разрешения бот не сможет присылать напоминания. Можно включить позже в «Настройках»." };
  }
  try {
    const res = await api.reminders({ enabled: true, minute });
    return { ok: true, reminders: res.reminders };
  } catch (e) {
    if (e instanceof ApiError && e.code === "bot_blocked") return { ok: false, reason: "blocked", text: BLOCKED_TEXT };
    return { ok: false, reason: "error", text: "Не удалось включить напоминания. Проверьте интернет и попробуйте ещё раз." };
  }
}

/** Открывает чат с ботом (внутри Telegram, если можно). */
export function openBotChat(): void {
  const tg = getTelegram();
  if (tg?.openTelegramLink) tg.openTelegramLink(BOT_LINK);
  else window.open(BOT_LINK, "_blank", "noopener");
}

// Тексты панели администратора: строки журнала, сравнение недель, ошибки. Чистые функции (с тестами).
import {
  APP_CONFIG,
  CONFIG_KEYS,
  STAFF_ROLE_TITLES,
  configValueTitle,
  type AdminLogEntry,
  type ConfigKey,
  type StaffRole,
} from "@milav/shared";
import { ApiError } from "../api";

const roleTitle = (value: unknown) => (STAFF_ROLE_TITLES[value as StaffRole] ?? String(value)).toLowerCase();

/** Что произошло, одной строкой: «Таблица лидеров: Все → Команда», «Добавлен проверяющий 123». */
export function logEntryText(entry: AdminLogEntry): string {
  const target = entry.target ?? "";
  switch (entry.action) {
    case "config.set": {
      if (!(CONFIG_KEYS as string[]).includes(target)) return `Настройка ${target}: ${String(entry.oldValue)} → ${String(entry.newValue)}`;
      const key = target as ConfigKey;
      return `${APP_CONFIG[key].title}: ${configValueTitle(key, entry.oldValue)} → ${configValueTitle(key, entry.newValue)}`;
    }
    case "staff.add":
      return `Добавлен в команду: id ${target}, ${roleTitle(entry.newValue)}`;
    case "staff.change":
      return `Роль id ${target}: ${roleTitle(entry.oldValue)} → ${roleTitle(entry.newValue)}`;
    case "staff.remove":
      return `Убран из команды: id ${target} (был ${roleTitle(entry.oldValue)})`;
    default:
      return `${entry.action} ${target}`.trim();
  }
}

/** Изменение к прошлой неделе: «+3», «−2», «0». */
export function deltaText(now: number, before: number): string {
  const diff = now - before;
  if (diff === 0) return "0";
  return diff > 0 ? `+${diff}` : `−${-diff}`;
}

/** Направление изменения для цвета: рост, падение, без изменений. */
export function deltaTone(now: number, before: number): "up" | "down" | "same" {
  return now > before ? "up" : now < before ? "down" : "same";
}

/** Дата и время по часам телефона: «15.10, 23:50». */
export function dateTimeText(seconds: number): string {
  return new Date(seconds * 1000).toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Дата `YYYY-MM-DD` коротко: «15.10, чт». */
export function dayText(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(y!, m! - 1, d!));
  const weekday = date.toLocaleDateString("ru-RU", { weekday: "short", timeZone: "UTC" });
  return `${String(d).padStart(2, "0")}.${String(m).padStart(2, "0")}, ${weekday}`;
}

/** Ошибка действия в панели по-русски. */
export function adminErrorText(error: unknown): string {
  if (error instanceof ApiError) {
    switch (error.code) {
      case "owner_locked":
        return "Владельца нельзя изменить из панели: он задан в настройках сервера.";
      case "self":
        return "Свою роль поменять нельзя. Попросите другого администратора.";
      case "too_many":
        return "В команде уже слишком много людей. Сначала уберите кого-нибудь.";
      case "bad_user_id":
        return "Неверный Telegram id: это число, его видно в «Настройках» у человека.";
      case "not_found":
        return "Этого человека уже нет в команде. Обновите список.";
      case "forbidden":
        return "Нет доступа: панель открыта только администраторам.";
      case "rate_limited":
        return "Слишком много действий подряд. Подождите минуту.";
    }
    if (error.status !== 0) return "Сервер не принял изменение. Попробуйте ещё раз.";
  }
  return "Нет связи с сервером. Проверьте интернет и попробуйте ещё раз.";
}

/** Telegram id из поля ввода: только цифры (пробелы по краям отбрасываются), иначе null. */
export function parseTelegramId(text: string): number | null {
  const t = text.trim();
  return /^\d{1,15}$/.test(t) && Number(t) > 0 ? Number(t) : null;
}

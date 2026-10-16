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

/** Начало длинного текста для строки журнала. */
const short = (value: unknown) => {
  const text = String(value ?? "");
  return text.length > 60 ? `${text.slice(0, 57)}…` : text;
};

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
    case "reminder.add":
      return `Новый текст напоминания №${target}: «${short(entry.newValue)}»`;
    case "reminder.edit":
      return `Текст напоминания №${target}: «${short(entry.oldValue)}» → «${short(entry.newValue)}»`;
    case "reminder.toggle":
      return `Текст напоминания №${target} ${entry.newValue ? "включён" : "выключен"}`;
    case "reminder.remove":
      return `Удалён текст напоминания №${target}: «${short(entry.oldValue)}»`;
    case "review.set": {
      const next = entry.newValue as { verdict?: string; fixes?: Record<string, string>; comment?: string } | null;
      const fixes = Object.keys(next?.fixes ?? {}).length;
      const what = next?.verdict === "ok" ? "верно" : `замечания${fixes ? ` (исправлений: ${fixes})` : ""}${next?.comment ? `, «${short(next.comment)}»` : ""}`;
      return `Проверка ${target}: ${what}`;
    }
    case "review.remove":
      return `Отозвана проверка ${target}`;
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
      case "stale":
        return "Слово успели изменить, пока вы его смотрели. Откройте его заново.";
      case "same_value":
        return "Исправление совпадает с тем, что уже в уроке. Уберите его или измените.";
      case "too_long":
        return "Слишком длинно: исправление до 200 знаков, комментарий до 1000.";
      case "empty_fix":
        return "Напишите исправление или комментарий.";
      case "fixes_with_ok":
        return "Есть исправления: отправьте их как замечания.";
      case "bad_value":
        return "Значение не подходит: пустое или с переводом строки.";
      case "bad_field":
        return "Такое поле исправить нельзя. Обновите карточку.";
    }
    if (error.status !== 0) return "Сервер не принял изменение. Попробуйте ещё раз.";
  }
  return "Нет связи с сервером. Проверьте интернет и попробуйте ещё раз.";
}

/** Ошибка проверки текста напоминания по-русски. */
export function reminderTextErrorText(error: string, name?: string): string {
  switch (error.replace(/^text_/, "")) {
    case "empty":
      return "Текст пустой.";
    case "too_long":
      return "Текст длиннее 500 знаков.";
    case "bad_braces":
      return "Фигурные скобки только для подстановок: {имя}. Проверьте, что у каждой открывающей есть закрывающая.";
    case "unknown_placeholder":
      return `Неизвестная подстановка {${name ?? ""}}. Список подстановок над текстами.`;
  }
  return "Текст не подходит.";
}

/** Telegram id из поля ввода: только цифры (пробелы по краям отбрасываются), иначе null. */
export function parseTelegramId(text: string): number | null {
  const t = text.trim();
  return /^\d{1,15}$/.test(t) && Number(t) > 0 ? Number(t) : null;
}

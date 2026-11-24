// Тексты панели администратора: строки журнала, сравнение недель, ошибки. Чистые функции (с тестами).
import {
  APP_CONFIG,
  BOT_TEXTS,
  CONFIG_KEYS,
  isBotTextKey,
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
    case "bot.text":
      return `Сообщение бота «${isBotTextKey(target) ? BOT_TEXTS[target].title : target}»: «${short(entry.oldValue)}» → «${short(entry.newValue)}»`;
    case "student.leaderboard":
      return entry.newValue ? `Ученик id ${target} убран из таблицы лидеров` : `Ученик id ${target} возвращён в таблицу лидеров`;
    case "channel.post": {
      const post = entry.newValue as { text?: string; photo?: boolean } | null;
      return `Пост в канал ${target}${post?.photo ? " с картинкой" : ""}: «${short(post?.text)}»`;
    }
    case "bot.reset":
      return `Сообщение бота «${isBotTextKey(target) ? BOT_TEXTS[target].title : target}»: возвращён исходный текст`;
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
      case "bot_blocked":
        return "Бот не может вам написать: нажмите «Старт» в чате с ботом и попробуйте снова.";
      case "telegram_error":
        return "Telegram не принял сообщение. Попробуйте ещё раз через минуту.";
      case "channel_not_found":
        return "Канал не найден. Проверьте @имя канала и что бот добавлен в него администратором.";
      case "bot_not_admin":
        return "Бот не может публиковать в канале: добавьте @milavbotbot в администраторы канала с правом «Публикация сообщений».";
      case "bad_format":
        return "Telegram не понял разметку текста. Проверьте пары ** и __.";
      case "bad_button_url":
        return "Telegram не принял ссылку кнопки. Проверьте её: она должна начинаться с https://.";
      case "photo_bad":
        return "Telegram не смог обработать картинку. Попробуйте другой файл (JPEG или PNG).";
      case "no_token":
        return "На сервере нет токена бота: отправить пост нельзя.";
    }
    if (error.code.startsWith("post_") || error.code.startsWith("photo_")) return channelPostErrorText(error.code);
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

/** Ошибка проверки текста бота («Сообщения бота») по-русски. */
export function botTextErrorText(error: string, max: number, name?: string): string {
  switch (error.replace(/^text_/, "")) {
    case "empty":
      return "Текст пустой.";
    case "too_long":
      return `Текст длиннее ${max} знаков.`;
    case "bad_braces":
      return "Фигурные скобки только для подстановок, например {имя}. Проверьте, что у каждой открывающей есть закрывающая.";
    case "unknown_placeholder":
      return `Подстановку {${name ?? ""}} в этом тексте использовать нельзя. Доступные перечислены под полем.`;
    case "multiline":
      return "Здесь текст в одну строку: перенос строки на кнопке и в меню не виден.";
  }
  return "Текст не подходит.";
}

/** Telegram id из поля ввода: только цифры (пробелы по краям отбрасываются), иначе null. */
export function parseTelegramId(text: string): number | null {
  const t = text.trim();
  return /^\d{1,15}$/.test(t) && Number(t) > 0 ? Number(t) : null;
}

/** Ошибка поста в канал по-русски (проверка полей в панели и ответ сервера). */
export function channelPostErrorText(error: string, max?: number): string {
  switch (error.replace(/^post_/, "")) {
    case "empty":
      return "Напишите текст или выберите картинку.";
    case "too_long":
      return max ? `Слишком длинно: не больше ${max} знаков${max <= 1024 ? " (с картинкой текст — это подпись)" : ""}.` : "Текст слишком длинный.";
    case "bad_channel":
      return "Канал пишется как @имя (например, @milavnews) или числовой id вида -100….";
    case "button_text_missing":
      return "Напишите надпись на кнопке или выключите кнопку.";
    case "button_url_missing":
      return "Укажите ссылку для кнопки.";
    case "button_too_long":
      return "Надпись на кнопке слишком длинная: до 64 знаков.";
    case "bad_button_url":
      return "Ссылка кнопки должна начинаться с https://, например https://t.me/milavbotbot?startapp.";
    case "photo_type":
      return "Картинка должна быть JPEG или PNG.";
    case "photo_too_big":
      return "Картинка больше 5 МБ. Уменьшите её или выберите другую.";
    default:
      return "Пост не прошёл проверку. Проверьте поля.";
  }
}

// Напоминания от бота (docs/REMINDERS.md): время, шаббат, тексты с подстановками. Чистые функции: часы передаются
// аргументами, поэтому одинаково работают на сервере, в приложении и в тестах.
import { dayInWeek, localDayStartMs, localEpochDay } from "./gamification/time";

/** Время напоминания по умолчанию: 20:00 по часам ученика (минуты от полуночи). */
export const DEFAULT_REMINDER_MINUTE = 20 * 60;

/** Готовые варианты времени в настройках (минуты от полуночи). Своё время тоже можно выбрать. */
export const REMINDER_TIME_OPTIONS = [8 * 60, 12 * 60, 18 * 60, 20 * 60, 21 * 60] as const;

/** «20:00» из минут от полуночи. */
export function minuteText(minute: number): string {
  const h = Math.floor(minute / 60);
  const m = minute % 60;
  return `${h}:${String(m).padStart(2, "0")}`;
}

/** Допустимое время: целое число минут от 0:00 до 23:59, кратное 5 (так сервер успевает отправить вовремя). */
export function isValidReminderMinute(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value < 1440 && value % 5 === 0;
}

/**
 * Шаббат: с пятницы 15:00 до конца субботы по местному времени ученика напоминания не отправляются (решение владельца
 * 16.10). Свечи зажигают от ~16:00 зимой до ~19:15 летом, поэтому граница пятницы взята с запасом.
 */
export const SHABBAT_FRIDAY_FROM_MINUTE = 15 * 60;

/** Попадает ли местный день (номер) и минута дня в шаббат. День недели 0 = воскресенье, 5 = пятница, 6 = суббота. */
export function isShabbat(localDay: number, minuteOfDay: number): boolean {
  const weekday = dayInWeek(localDay);
  return weekday === 6 || (weekday === 5 && minuteOfDay >= SHABBAT_FRIDAY_FROM_MINUTE);
}

const clockFormatters = new Map<string, Intl.DateTimeFormat>();

/** Местный день и минута дня по часам на стене (в день перевода часов это не «минуты от полуночи»). */
export function localDayMinute(tz: string, ms: number): { day: number; minute: number } {
  let f = clockFormatters.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", minute: "numeric", hourCycle: "h23" });
    clockFormatters.set(tz, f);
  }
  const parts = f.formatToParts(new Date(ms));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return { day: localEpochDay(tz, ms), minute: (get("hour") % 24) * 60 + get("minute") };
}

/**
 * Следующий момент напоминания строго позже `afterMs`: ближайший день, когда местное время `minute` ещё впереди
 * и это не шаббат. Возвращает миллисекунды.
 */
export function nextReminderAt(tz: string, minute: number, afterMs: number): number {
  const today = localEpochDay(tz, afterMs);
  for (let day = today; day < today + 8; day++) {
    if (isShabbat(day, minute)) continue;
    let at = localDayStartMs(tz, day) + minute * 60_000;
    // В день перевода часов от полуночи до нужного времени не ровно minute минут: поправляем по местным часам.
    const actual = localDayMinute(tz, at);
    if (actual.day === day) at += (minute - actual.minute) * 60_000;
    if (at > afterMs) return at;
  }
  // Сюда не попасть (в неделе всегда есть будний день), но на всякий случай: через сутки.
  return afterMs + 86_400_000;
}

// ---- Тексты ----

/** Вид текста: ежедневное напоминание или подтверждение «напоминания включены». Новые виды добавятся на этапах 2–3. */
export type ReminderKind = "daily" | "enabled";
export const REMINDER_KINDS: readonly ReminderKind[] = ["daily", "enabled"];
export const REMINDER_KIND_TITLES: Record<ReminderKind, string> = {
  daily: "Ежедневное",
  enabled: "Напоминания включены",
};
export const REMINDER_KIND_HINTS: Record<ReminderKind, string> = {
  daily: "Приходит в выбранное время, если сегодня ещё не занимались. Каждый раз выбирается случайный текст, но не тот же, что в прошлый раз.",
  enabled: "Приходит сразу, когда человек включил напоминания: так он видит, что бот может ему писать.",
};

/** Подстановки: имя в фигурных скобках → что подставляется. */
export const REMINDER_PLACEHOLDERS = {
  имя: "имя из Telegram",
  время: "время напоминания, например 20:00",
  осталось_слов: "сколько слов осталось до цели дня (текст выбирается, только если цель включена)",
  дней_на_неделе: "сколько дней занятий на этой неделе",
  слов_за_неделю: "сколько слов выучено на этой неделе",
  статус: "следующая фигура, например «Конь»",
  до_статуса: "сколько уроков до следующей фигуры (текст выбирается, только если она есть)",
  к_повторению: "сколько слов пора повторить, например «7 слов» (текст выбирается, только если их 5 и больше; такие тексты бот берёт через раз)",
} as const;

export type ReminderPlaceholder = keyof typeof REMINDER_PLACEHOLDERS;

/** Какие подстановки можно использовать в каком виде. */
export const KIND_PLACEHOLDERS: Record<ReminderKind, readonly ReminderPlaceholder[]> = {
  daily: ["имя", "время", "осталось_слов", "дней_на_неделе", "слов_за_неделю", "статус", "до_статуса", "к_повторению"],
  enabled: ["имя", "время"],
};

export const REMINDER_TEXT_MAX = 500;
export const MAX_REMINDER_TEXTS = 100;

const PLACEHOLDER_RE = /\{([^{}]*)\}/g;

/** Имена подстановок в тексте (с повторами не возвращаются). */
export function placeholdersIn(text: string): string[] {
  return [...new Set([...text.matchAll(PLACEHOLDER_RE)].map((m) => m[1]!))];
}

export type ReminderTextError = "empty" | "too_long" | "bad_braces" | "unknown_placeholder";

/** Проверка текста перед сохранением. Возвращает код ошибки и, для неизвестной подстановки, её имя. */
export function checkReminderText(kind: ReminderKind, text: unknown): { ok: true; text: string } | { ok: false; error: ReminderTextError; name?: string } {
  if (typeof text !== "string") return { ok: false, error: "empty" };
  // Управляющие символы (кроме переноса строки) убираем, края обрезаем.
  const clean = text.replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, "").replace(/\r\n?/g, "\n").trim();
  if (!clean) return { ok: false, error: "empty" };
  if ([...clean].length > REMINDER_TEXT_MAX) return { ok: false, error: "too_long" };
  if (clean.replace(PLACEHOLDER_RE, "").includes("{") || clean.replace(PLACEHOLDER_RE, "").includes("}")) {
    return { ok: false, error: "bad_braces" };
  }
  const allowed = KIND_PLACEHOLDERS[kind] as readonly string[];
  const unknown = placeholdersIn(clean).find((name) => !allowed.includes(name));
  if (unknown !== undefined) return { ok: false, error: "unknown_placeholder", name: unknown };
  return { ok: true, text: clean };
}

/** Данные для подстановок. Нет значения: текст с такой подстановкой не выбирается. */
export type ReminderVars = Partial<Record<ReminderPlaceholder, string>>;

/** Подставляет значения. null, если для какой-то подстановки нет данных. */
export function renderReminder(text: string, vars: ReminderVars): string | null {
  let missing = false;
  const out = text.replace(PLACEHOLDER_RE, (_, name: string) => {
    const value = vars[name as ReminderPlaceholder];
    if (value === undefined) {
      missing = true;
      return "";
    }
    return value;
  });
  return missing ? null : out;
}

/**
 * Выбирает текст: случайный из тех, что можно заполнить данными, и по возможности не тот, что был в прошлый раз.
 * `random` от 0 до 1 (в тестах задаётся).
 */
export function pickReminder<T extends { id: number; text: string }>(
  texts: readonly T[],
  vars: ReminderVars,
  lastId: number | null,
  random: number,
): { id: number; text: string } | null {
  const usable = texts.map((t) => ({ id: t.id, text: renderReminder(t.text, vars) })).filter((t): t is { id: number; text: string } => t.text !== null);
  const fresh = usable.filter((t) => t.id !== lastId);
  const pool = fresh.length > 0 ? fresh : usable;
  if (pool.length === 0) return null;
  return pool[Math.min(pool.length - 1, Math.floor(random * pool.length))]!;
}

/** Подстановка, по которой узнаются тексты о повторении слов. */
export const REPEAT_PLACEHOLDER = "{к_повторению}";

/** «1 слово», «3 слова», «7 слов». */
export function wordsText(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  const word = mod10 === 1 && mod100 !== 11 ? "слово" : mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14) ? "слова" : "слов";
  return `${n} ${word}`;
}

/**
 * Выбор ежедневного текста с учётом повторения: если подстановка «к повторению» заполнена (слов набралось
 * REPEAT_REMINDER_MIN и больше), а прошлый текст был не о повторении, берётся текст о повторении. Так напоминания
 * о повторении и обычные чередуются (docs/REMINDERS.md, «Повторение»). Если текстов о повторении нет, выбор обычный.
 */
export function pickDailyReminder<T extends { id: number; text: string }>(
  texts: readonly T[],
  vars: ReminderVars,
  lastId: number | null,
  random: number,
): { id: number; text: string } | null {
  const isRepeat = (t: { text: string }) => t.text.includes(REPEAT_PLACEHOLDER);
  const last = texts.find((t) => t.id === lastId);
  if (vars.к_повторению !== undefined && !(last && isRepeat(last))) {
    const chosen = pickReminder(texts.filter(isRepeat), vars, lastId, random);
    if (chosen) return chosen;
  }
  return pickReminder(texts, vars, lastId, random);
}

// ---- Ответы API ----

/** Напоминания в профиле (/api/me). Поля нет, если функция выключена для этого человека. */
export interface ReminderInfo {
  enabled: boolean;
  /** Минуты от полуночи по часам ученика. */
  minute: number;
  /** Можно ли сейчас предложить включить напоминания (после выученного слова). */
  offer: boolean;
  /** Бот не может писать: человек его заблокировал или не нажимал «Старт». */
  blocked: boolean;
}

export interface ReminderSettingsRequest {
  enabled?: boolean;
  minute?: number;
  /** «Не сейчас» на предложении: спросить снова не раньше чем через неделю. */
  dismissOffer?: boolean;
}

export interface ReminderTextItem {
  id: number;
  kind: ReminderKind;
  text: string;
  enabled: boolean;
  sent: number;
  /** Сколько раз после этого текста приложение открыли в течение суток. */
  opened: number;
  updatedAt: number;
  updatedBy: number | null;
}

export interface AdminRemindersResponse {
  texts: ReminderTextItem[];
  /** Сколько учеников включили напоминания. */
  subscribers: number;
  /** Сколько выключили сами или заблокировали бота. */
  blocked: number;
}

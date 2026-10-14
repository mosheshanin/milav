// Дни и недели по местному времени пользователя. Чистые функции: часы и часовой пояс передаются аргументами.
import { WEEK_START_DAY } from "./constants";

const MS_PER_DAY = 86_400_000;

/** Допустимое название часового пояса IANA (например, Asia/Jerusalem). */
export function isValidTimeZone(tz: unknown): tz is string {
  if (typeof tz !== "string" || tz.length === 0 || tz.length > 64) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(tz: string): Intl.DateTimeFormat {
  let f = formatters.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", { timeZone: tz, year: "numeric", month: "numeric", day: "numeric" });
    formatters.set(tz, f);
  }
  return f;
}

/** Номер местного дня (число дней с 1.01.1970) для момента `ms` в поясе `tz`. Граница дня это местная полночь. */
export function localEpochDay(tz: string, ms: number): number {
  const parts = formatterFor(tz).formatToParts(new Date(ms));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return Math.floor(Date.UTC(get("year"), get("month") - 1, get("day")) / MS_PER_DAY);
}

/** Момент из времени базы (`YYYY-MM-DD HH:MM:SS`, UTC) в миллисекундах. NaN, если строка не разобралась. */
export function parseDbTime(value: string): number {
  return Date.parse(`${value.replace(" ", "T")}Z`);
}

/** Номер недели: целое число, растёт на 1 с началом каждой недели (первый день недели задаёт WEEK_START_DAY). */
export function weekIndex(epochDay: number): number {
  // 1.01.1970 был четвергом (4). Сдвигаем так, чтобы первый день недели давал остаток 0.
  return Math.floor((epochDay + 4 - WEEK_START_DAY) / 7);
}

/** Номер дня внутри недели: 0 — первый день недели (воскресенье), 6 — последний. */
export function dayInWeek(epochDay: number): number {
  return (((epochDay + 4 - WEEK_START_DAY) % 7) + 7) % 7;
}

/** Первый день недели (номер дня) по номеру недели. */
export function weekStartDay(week: number): number {
  return week * 7 - 4 + WEEK_START_DAY;
}

/** Дата `YYYY-MM-DD` по номеру дня. */
export function epochDayToIso(epochDay: number): string {
  return new Date(epochDay * MS_PER_DAY).toISOString().slice(0, 10);
}

/** Номер дня в UTC (для ограничения «не чаще раза в сутки»). */
export function utcEpochDay(ms: number): number {
  return Math.floor(ms / MS_PER_DAY);
}

/** Число единичных битов. */
export function popcount(n: number): number {
  let count = 0;
  let v = n >>> 0;
  while (v) {
    count += v & 1;
    v >>>= 1;
  }
  return count;
}

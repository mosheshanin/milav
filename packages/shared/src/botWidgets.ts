// Карточки в чате с ботом (виджеты Telegram, Bot API 10.4, docs/WIDGETS.md): «Мой прогресс» (/progress) и
// «Напоминания» (/reminders). Здесь данные карточек, разбор запросов от них и подписи для запасного текста.
// Вёрстка карточек: botWidgetHtml.ts.
//
// Карточка это HTML, который Telegram рисует прямо в сообщении. Код карточки после отправки не меняется, меняются
// только данные (до 1024 байт). Сети у карточки нет: она отправляет боту короткий запрос (1–64 байта), бот отвечает
// данными (до 1024 байт). Поэтому данные здесь в коротком JSON, а подписи считает сама карточка.

import { REMINDER_TIME_OPTIONS, wordsText } from "./reminders";
import { statusPath } from "./status";

/** Предел данных карточки и ответа бота (Bot API: chat_data и answerWidgetQuery до 1024 байт). */
export const WIDGET_DATA_MAX_BYTES = 1024;
/** Предел запроса от карточки (Bot API: 1–64 байта). */
export const WIDGET_QUERY_MAX_BYTES = 64;
/** Предел HTML карточки: 32 КБ как есть и 4 КБ после сжатия zlib (уровень 9). */
export const WIDGET_HTML_MAX_BYTES = 32_768;
export const WIDGET_HTML_MAX_COMPRESSED = 4_096;

/** «1 урок», «3 урока», «7 уроков» (и другие слова с тем же склонением). */
export function plural(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

export const lessonsText = (n: number) => `${n} ${plural(n, "урок", "урока", "уроков")}`;
const daysText = (n: number) => `${n} ${plural(n, "дня", "дней", "дней")}`;

// ---- Карточка «Мой прогресс» ----

/**
 * Данные карточки прогресса. Короткие имена полей: данные идут в сообщение и в ответ бота (до 1024 байт).
 * Подписи («урока», «дней») считает карточка, в данных только числа и фигуры.
 */
export interface ProgressCardData {
  v: 1;
  /** Фигура статуса и её имя. */
  s: string;
  sn: string;
  /** Сдано уроков. */
  l: number;
  /** Следующая фигура: символ, имя и сколько уроков осталось; null: высшая фигура (Король). */
  nx: { s: string; n: string; left: number } | null;
  /** Путь к следующей фигуре в процентах, 0–100. */
  f: number;
  /** Очки. */
  p: number;
  /** Цель дня: сделано и цель; null: цель выключена. */
  g: [number, number] | null;
  /** Дни недели с занятиями, с воскресенья: строка из 7 знаков «0» и «1». */
  w: string;
  /** Сегодняшний день недели, 0 = воскресенье. */
  t: number;
  /** Дней занятий на этой неделе и сколько нужно для ритмичной недели. */
  wd: number;
  wt: number;
  /** Слов пора повторить; null: повторение выключено. */
  r: number | null;
}

export interface ProgressCardInput {
  passedLessons: number;
  points: number;
  /** Неделя и цель дня (как в блоке «Мой путь»: viewPlay). */
  week: { days: readonly boolean[]; todayIndex: number; daysThisWeek: number; target: number };
  goal: { target: number; done: number } | null;
  /** Слов к повторению; null, если повторение выключено для человека. */
  repeatDue: number | null;
}

export function progressCard(input: ProgressCardInput): ProgressCardData {
  const path = statusPath(input.passedLessons);
  return {
    v: 1,
    s: path.symbol,
    sn: path.name,
    l: path.passed,
    nx: path.next && path.to !== null ? { s: path.next.symbol, n: path.next.name, left: path.to - path.passed } : null,
    f: Math.round(path.fraction * 100),
    p: input.points,
    g: input.goal ? [Math.min(input.goal.done, 999), input.goal.target] : null,
    w: Array.from({ length: 7 }, (_, i) => (input.week.days[i] ? "1" : "0")).join(""),
    t: input.week.todayIndex,
    wd: input.week.daysThisWeek,
    wt: input.week.target,
    r: input.repeatDue,
  };
}

/**
 * Подстановки текстовой карточки прогресса (запасной вариант, когда Telegram не принимает виджеты, и подпись для
 * старых клиентов). Тексты в «Сообщениях бота»: progress.text.
 */
export function progressVars(card: ProgressCardData): {
  статус: string;
  уроков: string;
  путь: string;
  очков: string;
  цель: string;
  неделя: string;
  повторить: string;
} {
  return {
    статус: `${card.s} ${card.sn}`,
    уроков: lessonsText(card.l),
    путь: card.nx ? `${card.nx.s} ${card.nx.n}, через ${lessonsText(card.nx.left)}` : "у вас высшая фигура 👑",
    очков: String(card.p),
    цель: card.g === null ? "выключена" : card.g[0] >= card.g[1] ? `выполнена ✅ (${wordsText(card.g[0])})` : `${card.g[0]} из ${wordsText(card.g[1])}`,
    // Набрали норму ритма: «4 дня, неделя ритмичная ✅» (а не «4 из 3 дней»); иначе «2 из 3 дней».
    неделя:
      card.wd >= card.wt
        ? `${card.wd} ${plural(card.wd, "день", "дня", "дней")}, неделя ритмичная ✅`
        : `${card.wd} из ${daysText(card.wt)}`,
    повторить: card.r === null ? "выключено" : card.r === 0 ? "пока нечего" : wordsText(card.r),
  };
}

// ---- Карточка «Напоминания» ----

export interface RemindersCardData {
  v: 1;
  /** Напоминания доступны этому человеку (настройка «Напоминания от бота» в панели). */
  a: boolean;
  /** Включены. */
  on: boolean;
  /** Время, минуты от полуночи по часам ученика. */
  m: number;
  /** Готовые варианты времени (если своё время не из списка, карточка покажет и его). */
  o: readonly number[];
  /** Пауза на шаббат включена в панели (подпись «В шаббат не пишу»). */
  sh: boolean;
}

export function remindersCard(input: { available: boolean; enabled: boolean; minute: number; shabbat: boolean }): RemindersCardData {
  return { v: 1, a: input.available, on: input.available && input.enabled, m: input.minute, o: REMINDER_TIME_OPTIONS, sh: input.shabbat };
}

// ---- Запросы от карточек ----

/**
 * Что просит карточка. Коды короткие (запрос до 64 байт):
 * - `p`: свежие данные прогресса (карточка просит сама, когда появляется на экране, и по кнопке «Обновить»);
 * - `r`: свежее состояние напоминаний; `r:on`, `r:off`: включить, выключить; `r:t:<минуты>`: время.
 */
export type WidgetRequest =
  | { kind: "progress" }
  | { kind: "reminders" }
  | { kind: "remindersOn" }
  | { kind: "remindersOff" }
  | { kind: "remindersTime"; minute: number };

export function parseWidgetRequest(data: unknown): WidgetRequest | null {
  if (typeof data !== "string" || data.length === 0 || data.length > WIDGET_QUERY_MAX_BYTES) return null;
  if (data === "p") return { kind: "progress" };
  if (data === "r") return { kind: "reminders" };
  if (data === "r:on") return { kind: "remindersOn" };
  if (data === "r:off") return { kind: "remindersOff" };
  const time = /^r:t:(\d{1,4})$/.exec(data);
  if (time) {
    const minute = Number(time[1]);
    // Те же правила, что у времени в «Настройках»: кратно 5 минутам, в пределах суток.
    if (minute < 1440 && minute % 5 === 0) return { kind: "remindersTime", minute };
  }
  return null;
}

/** Размер строки в байтах UTF-8. */
export function utf8Bytes(text: string): number {
  let bytes = 0;
  for (const ch of text) {
    const code = ch.codePointAt(0)!;
    bytes += code < 0x80 ? 1 : code < 0x800 ? 2 : code < 0x10000 ? 3 : 4;
  }
  return bytes;
}

/** Данные карточки строкой для Telegram. Больше предела не бывает (проверяет тест), но страхуемся. */
export function widgetDataJson(data: ProgressCardData | RemindersCardData): string {
  const json = JSON.stringify(data);
  if (utf8Bytes(json) > WIDGET_DATA_MAX_BYTES) throw new Error("widget data too large");
  return json;
}

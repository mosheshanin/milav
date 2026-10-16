// Повторение слов (задача 10, решения владельца 16.10.2026, docs/SPEC.md «Повторение»): коробки Лейтнера.
// Чистые функции: день передаётся аргументом, поэтому одинаково работают на сервере, в приложении и в тестах.
import type { PlayEvent } from "./gamification/types";

/**
 * Паузы коробок в днях. Слово начинает в первой коробке (повторить на следующий день после изучения).
 * Вспомнил: слово переходит в следующую коробку и ждёт дольше. Забыл: возвращается в первую (повторить завтра).
 */
export const REPEAT_INTERVALS = [1, 3, 7, 14, 30, 60] as const;

/** Последняя коробка (пауза 60 дней): слово «прочно выучено». */
export const REPEAT_LAST_BOX = REPEAT_INTERVALS.length - 1;

/** Сколько слов в одном подходе «Повторить». */
export const REPEAT_SESSION_SIZE = 10;

/**
 * Упражнения повторения: на слух выбрать перевод, по ивриту выбрать перевод, по-русски выбрать иврит, набрать слово
 * на клавиатуре. Без микрофона и рисования (решение владельца: повторять можно где угодно, 2–3 минуты на подход).
 */
export const REPEAT_TYPES = ["hear-ru", "he-ru", "ru-he", "type"] as const;

/**
 * Формы глаголов (решение владельца 17.10): глагол в подходе примерно в половине случаев спрашивается формой,
 * как в «Практике форм»: «выбери форму» (дан «Прошедшее · он», выбрать форму иврита) или «что это за форма?».
 * Ответ двигает коробку глагола. Отдельных коробок у форм нет.
 */
export const REPEAT_FORM_TYPES = ["form-pick", "form-name"] as const;
export const REPEAT_FORM_SHARE = 0.5;

export type RepeatType = (typeof REPEAT_TYPES)[number] | (typeof REPEAT_FORM_TYPES)[number];
export const ALL_REPEAT_TYPES: readonly RepeatType[] = [...REPEAT_TYPES, ...REPEAT_FORM_TYPES];

export const REPEAT_TYPE_TITLES: Record<RepeatType, string> = {
  "hear-ru": "Послушай и выбери перевод",
  "he-ru": "Прочитай и выбери перевод",
  "ru-he": "Выбери слово на иврите",
  type: "Напиши на иврите",
  "form-pick": "Выбери форму глагола",
  "form-name": "Что это за форма?",
};

export const isFormRepeatType = (type: RepeatType): type is (typeof REPEAT_FORM_TYPES)[number] =>
  type === "form-pick" || type === "form-name";

/** Названия коробок для «Моих слов»: насколько крепко слово помнится. */
export const REPEAT_BOX_TITLES = ["Новое", "Свежее", "Знакомое", "Уверенное", "Крепкое", "Прочное"] as const;

/** Бот напоминает о повторении, когда к нему накопилось столько слов (docs/REMINDERS.md, «Повторение»). */
export const REPEAT_REMINDER_MIN = 5;

/** Состояние слова в повторении (строка repeat_state). Дни это номера местных дней ученика. */
export interface RepeatState {
  box: number;
  dueDay: number;
  /** Лучшая коробка, в которой слово уже было: «прочно выучено» засчитывается один раз. */
  bestBox: number;
  /** Сколько раз вспомнил и сколько раз забыл. */
  reps: number;
  lapses: number;
}

/**
 * Состояние слова, которое ещё ни разу не повторяли: первая коробка, повторить на следующий день после изучения.
 * День изучения берётся по UTC (как в SQL напоминаний, `julianday`), поэтому граница может отличаться от местной
 * на несколько часов: для первого повторения это неважно.
 */
export function initialRepeatState(completedUtcDay: number): RepeatState {
  return { box: 0, dueDay: completedUtcDay + REPEAT_INTERVALS[0], bestBox: 0, reps: 0, lapses: 0 };
}

/** Пора ли повторять слово в день `today`. */
export function isRepeatDue(state: Pick<RepeatState, "dueDay">, today: number): boolean {
  return state.dueDay <= today;
}

/** Ответ на повторение в день `today`: новая коробка и следующий день. `mastered` значит «впервые дошло до последней коробки». */
export function applyRepeatAnswer(state: RepeatState, correct: boolean, today: number): { state: RepeatState; mastered: boolean } {
  if (!correct) {
    return {
      state: { ...state, box: 0, dueDay: today + REPEAT_INTERVALS[0], lapses: state.lapses + 1 },
      mastered: false,
    };
  }
  const box = Math.min(state.box + 1, REPEAT_LAST_BOX);
  return {
    state: { ...state, box, dueDay: today + REPEAT_INTERVALS[box]!, bestBox: Math.max(state.bestBox, box), reps: state.reps + 1 },
    mastered: box === REPEAT_LAST_BOX && state.bestBox < REPEAT_LAST_BOX,
  };
}

/** Через сколько дней повторить (0 — сегодня или уже пора). */
export function repeatDueIn(dueDay: number, today: number): number {
  return Math.max(0, dueDay - today);
}

/** «сегодня», «завтра», «через 3 дн.» */
export function dueInText(days: number): string {
  if (days <= 0) return "сегодня";
  if (days === 1) return "завтра";
  return `через ${days} дн.`;
}

/**
 * Какие слова взять в подход: те, что пора повторять, сначала самые просроченные, при равенстве из младших коробок
 * (их легче забыть), затем по id, чтобы порядок не зависел от базы.
 */
export function chooseRepeatWords<T extends { wordId: string; box: number; dueDay: number }>(items: readonly T[], today: number, limit = REPEAT_SESSION_SIZE): T[] {
  return items
    .filter((i) => isRepeatDue(i, today))
    .sort((a, b) => a.dueDay - b.dueDay || a.box - b.box || (a.wordId < b.wordId ? -1 : a.wordId > b.wordId ? 1 : 0))
    .slice(0, limit);
}

/**
 * Упражнения для `n` слов: виды идут по кругу со случайного места, поэтому в подходе из 10 слов каждого вида
 * два или три, а не одно и то же подряд. `rng` от 0 до 1.
 */
export function repeatTypesFor(n: number, rng: () => number): RepeatType[] {
  const start = Math.floor(rng() * REPEAT_TYPES.length);
  const types = Array.from({ length: n }, (_, i) => REPEAT_TYPES[(start + i) % REPEAT_TYPES.length]!);
  for (let i = types.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [types[i], types[j]] = [types[j]!, types[i]!];
  }
  return types;
}

/** Сводка для главной: сколько слов пора повторить и сколько всего выучено. */
export interface RepeatSummary {
  due: number;
  total: number;
  /** Через сколько дней следующее повторение, если сегодня повторять нечего (null, если слов нет или есть что повторить). */
  nextDueIn: number | null;
}

export function repeatSummary(items: readonly { dueDay: number }[], today: number): RepeatSummary {
  let due = 0;
  let next = Infinity;
  for (const i of items) {
    if (i.dueDay <= today) due++;
    else next = Math.min(next, i.dueDay - today);
  }
  return { due, total: items.length, nextDueIn: due === 0 && Number.isFinite(next) ? next : null };
}

// ---- Ответы API ----

/** Слово для повторения и «Моих слов»: только то, что нужно показать и озвучить. */
export interface RepeatWord {
  id: string;
  lessonId: string;
  he: string;
  niqqud?: string;
  translit: string;
  ru: string;
  audio?: string;
}

/** Вопрос о форме глагола: какая форма спрашивается и варианты (`<время>:<ключ>`, как в «Практике форм»). */
export interface RepeatFormQuestion {
  /** Спрашиваемая форма, `past:3ms`. */
  id: string;
  /** «Прошедшее · он». */
  slot: string;
  /** Форма с огласовками, транскрипция и озвучка: для «что это за форма?» и разбора ответа. */
  niqqud: string;
  translit: string;
  audio?: string;
  /** У «выбери форму» текст варианта это форма иврита, у «что это за форма?» подпись «Прошедшее · он». */
  options: { id: string; text: string }[];
}

export interface RepeatQuestion {
  wordId: string;
  type: RepeatType;
  /** Варианты ответа (id слов) у упражнений с выбором; у «Напиши на иврите» и форм глагола пусто. */
  options: string[];
  /** Только у вопросов о форме глагола. */
  form?: RepeatFormQuestion;
}

/** GET /api/repeat/session. */
export interface RepeatSessionResponse {
  questions: RepeatQuestion[];
  /** Слова вопросов и вариантов ответа. */
  words: Record<string, RepeatWord>;
  summary: RepeatSummary;
}

/** POST /api/repeat/answer. */
export interface RepeatAnswerRequest {
  wordId: string;
  type: RepeatType;
  /** У вопросов о форме: какая форма спрашивалась (`past:3ms`); `choice` тогда тоже форма. */
  form?: string;
  choice?: string;
  typed?: string;
  /** «Не помню». */
  giveUp?: boolean;
}

export interface RepeatAnswerResponse {
  correct: boolean;
  box: number;
  /** Через сколько дней слово вернётся. */
  dueIn: number;
  /** Цель дня и бейджи: повторённое слово засчитывается в цель и ритм, очков не даёт. */
  play: PlayEvent;
}

export interface MyWordItem {
  word: RepeatWord;
  box: number;
  dueIn: number;
  reps: number;
  lapses: number;
}

/** GET /api/repeat/words: все выученные слова (кроме букв алфавита). */
export interface MyWordsResponse {
  items: MyWordItem[];
  summary: RepeatSummary;
}

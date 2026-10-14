// Недельный ритм и цель дня: конечный автомат без обращений к базе и часам (docs/GAMIFICATION.md, раздел 6).
//
// Правила: день занятий это местный день, в который пройдено слово (буква) или завершена викторина. Неделя ритмична,
// если в ней RHYTHM_DAYS_PER_WEEK и больше дней занятий. Счёт недель ритма только растёт, ничего не сгорает.
import { RETURN_GAP_DAYS, RHYTHM_DAYS_PER_WEEK } from "./constants";
import { dayInWeek, popcount, weekIndex } from "./time";

export interface PlayState {
  /** Сколько разных дней занятий было всего. */
  activeDays: number;
  /** Последний день занятий (номер дня); 0 — занятий ещё не было. */
  lastDay: number;
  /** Неделя, к которой относятся weekDays и weekWords. */
  weekIdx: number;
  /** Дни занятий этой недели, битовая маска: бит 0 — первый день недели. */
  weekDays: number;
  weekWords: number;
  /** Сколько недель были ритмичными (растёт сразу, как только в неделе набралось нужное число дней). */
  rhythmWeeks: number;
  /** Последние 8 недель: бит 0 — текущая неделя (weekIdx), бит 1 — предыдущая и т. д.; 1 — неделя ритмична. */
  rhythmHist: number;
  /** Итоги прошлой недели, если она идёт сразу перед weekIdx (иначе prevWeekIdx = 0). */
  prevWeekIdx: number;
  prevWeekDays: number;
  prevWeekWords: number;
  /** Сколько раз человек вернулся после перерыва RETURN_GAP_DAYS и больше. */
  returns: number;
  /** День, к которому относится goalWords, и сколько слов за этот день пройдено. */
  goalDay: number;
  goalWords: number;
  /** Сколько дней цель была выполнена. */
  goalDays: number;
}

export const EMPTY_PLAY: PlayState = {
  activeDays: 0,
  lastDay: 0,
  weekIdx: 0,
  weekDays: 0,
  weekWords: 0,
  rhythmWeeks: 0,
  rhythmHist: 0,
  prevWeekIdx: 0,
  prevWeekDays: 0,
  prevWeekWords: 0,
  returns: 0,
  goalDay: 0,
  goalWords: 0,
  goalDays: 0,
};

export interface ActivityResult {
  state: PlayState;
  /** Этот день занятий новый (первое занятие в этот местный день). */
  newDay: boolean;
  /** Цель дня выполнена именно этим событием. */
  goalMet: boolean;
}

/**
 * Учитывает занятие: `words` пройденных слов или букв (0 для викторины) в местный день `day`.
 * День не может идти назад: если человек сменил пояс «назад», занятие засчитывается в последний известный день.
 * `dailyGoal` равен 0, когда цель выключена.
 */
export function applyActivity(prev: PlayState, input: { day: number; words: number }, dailyGoal: number): ActivityResult {
  const s: PlayState = { ...prev };
  const day = Math.max(input.day, s.lastDay);
  const week = weekIndex(day);

  // Новая неделя: закрываем прошлую (сдвигаем окно последних 8 недель) и запоминаем её итоги.
  if (s.weekIdx === 0) {
    s.weekIdx = week;
  } else if (week > s.weekIdx) {
    const gap = week - s.weekIdx;
    s.rhythmHist = gap >= 8 ? 0 : (s.rhythmHist << gap) & 0xff;
    if (gap === 1) {
      s.prevWeekIdx = s.weekIdx;
      s.prevWeekDays = popcount(s.weekDays);
      s.prevWeekWords = s.weekWords;
    } else {
      s.prevWeekIdx = 0;
      s.prevWeekDays = 0;
      s.prevWeekWords = 0;
    }
    s.weekIdx = week;
    s.weekDays = 0;
    s.weekWords = 0;
  }

  const newDay = day !== s.lastDay;
  if (newDay) {
    if (s.lastDay !== 0 && day - s.lastDay - 1 >= RETURN_GAP_DAYS) s.returns += 1;
    s.activeDays += 1;
    const before = popcount(s.weekDays);
    s.weekDays |= 1 << dayInWeek(day);
    if (before < RHYTHM_DAYS_PER_WEEK && popcount(s.weekDays) >= RHYTHM_DAYS_PER_WEEK) {
      s.rhythmWeeks += 1;
      s.rhythmHist |= 1;
    }
    s.lastDay = day;
  }

  s.weekWords += input.words;

  if (s.goalDay !== day) {
    s.goalDay = day;
    s.goalWords = 0;
  }
  const goalBefore = s.goalWords;
  s.goalWords += input.words;
  const goalMet = dailyGoal > 0 && input.words > 0 && goalBefore < dailyGoal && s.goalWords >= dailyGoal;
  if (goalMet) s.goalDays += 1;

  return { state: s, newDay, goalMet };
}

export interface PlayView {
  /** Дни текущей недели (с первого дня недели): был ли день занятий. */
  days: boolean[];
  /** Номер сегодняшнего дня в неделе (0–6). */
  todayIndex: number;
  daysThisWeek: number;
  wordsThisWeek: number;
  rhythmWeeks: number;
  /** Сколько из последних 8 недель ритмичные (с текущей). */
  rhythmLast8: number;
  /** Цель дня; null, если выключена. */
  goal: { target: number; done: number; met: boolean } | null;
  /** Итоги прошлой недели, если на ней были слова. */
  recap: { weekIdx: number; words: number; days: number } | null;
}

/** Что показать человеку сегодня (`today`: номер местного дня) по сохранённому состоянию. */
export function viewPlay(state: PlayState, today: number, dailyGoal: number): PlayView {
  const day = Math.max(today, state.lastDay);
  const week = weekIndex(day);

  let weekDays = 0;
  let weekWords = 0;
  let hist = state.rhythmHist;
  let recapSource: { days: number; words: number; idx: number } | null = null;

  if (state.weekIdx === 0) {
    hist = 0;
  } else if (state.weekIdx >= week) {
    weekDays = state.weekDays;
    weekWords = state.weekWords;
    if (state.prevWeekIdx === week - 1) {
      recapSource = { days: state.prevWeekDays, words: state.prevWeekWords, idx: state.prevWeekIdx };
    }
  } else {
    const gap = week - state.weekIdx;
    hist = gap >= 8 ? 0 : (hist << gap) & 0xff;
    if (gap === 1) recapSource = { days: popcount(state.weekDays), words: state.weekWords, idx: state.weekIdx };
  }

  const done = state.goalDay === day ? state.goalWords : 0;
  return {
    days: Array.from({ length: 7 }, (_, i) => (weekDays & (1 << i)) !== 0),
    todayIndex: dayInWeek(day),
    daysThisWeek: popcount(weekDays),
    wordsThisWeek: weekWords,
    rhythmWeeks: state.rhythmWeeks,
    rhythmLast8: popcount(hist & 0xff),
    goal: dailyGoal > 0 ? { target: dailyGoal, done, met: done >= dailyGoal } : null,
    recap: recapSource && recapSource.words > 0 ? { weekIdx: recapSource.idx, words: recapSource.words, days: recapSource.days } : null,
  };
}

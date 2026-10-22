// Типы API геймификации (docs/GAMIFICATION.md, раздел 10).
import type { Gender } from "../types";
import type { Metrics } from "./badges";

/** Путь к следующему шахматному статусу. */
export interface StatusPath {
  key: string;
  name: string;
  symbol: string;
  /** Сданных уроков в начале текущего статуса и нужно для следующего (null у Короля). */
  from: number;
  to: number | null;
  passed: number;
  /** Доля пройденного внутри текущего статуса, от 0 до 1 (у Короля 1). */
  fraction: number;
  next: { key: string; name: string; symbol: string } | null;
}

/** Настройки, которые человек может менять. */
export interface PlaySettings {
  dailyGoal: number;
  /** Участвует ли в таблице лидеров (по умолчанию нет). */
  leaderboard: boolean;
  /** Не учитывать меня в сравнении с теми, кто пришёл в одно время. */
  cohortExcluded: boolean;
  /** От чьего лица показывать и озвучивать фразы-примеры: m мужчины (по умолчанию), f женщины (docs/SPEC.md, «Род во фразах-примерах»). */
  gender: Gender;
}

/** Блок «Мой путь» из GET /api/me. */
export interface PlayInfo {
  tz: string;
  statusPath: StatusPath;
  week: {
    /** Дни текущей недели с первого дня недели: был ли день занятий. */
    days: boolean[];
    todayIndex: number;
    daysThisWeek: number;
    /** Сколько дней занятий делают неделю ритмичной. */
    target: number;
    wordsThisWeek: number;
    rhythmWeeks: number;
    rhythmLast8: number;
  };
  /** Цель дня; null, если выключена. */
  goal: { target: number; done: number; met: boolean } | null;
  activeDays: number;
  unseenBadges: number;
  /** Итоги прошлой недели, если на ней были слова. */
  recap: { weekIdx: number; words: number; days: number } | null;
  settings: PlaySettings;
  /** Включено ли на сервере то, что выпускается отдельно (таблица лидеров ждёт политику конфиденциальности). */
  features: { leaderboard: boolean; repeat: boolean };
}

/** Что отдаёт сервер после события (слово пройдено или викторина закончена). */
export interface PlayEvent {
  /** Бейджи, полученные этим событием. */
  newBadges: string[];
  /** Цель дня после события; null, если выключена. */
  goal: { target: number; done: number; met: boolean } | null;
  /** Цель выполнена именно этим событием. */
  goalMet: boolean;
}

/** GET /api/achievements. */
export interface AchievementsResponse {
  earned: { id: string; earnedAt: number; seen: boolean; retro: boolean }[];
  counters: Metrics;
  catalogVersion: number;
}

export interface BoardRow {
  rank: number;
  name: string;
  points: number;
  me?: true;
}

/** GET /api/leaderboard?board=week|all. В ответе нет id, username и фамилий. */
export interface LeaderboardResponse {
  board: "week" | "all";
  /** Дата последнего дня текущей недели таблицы (`YYYY-MM-DD`, по Иерусалиму); у «всё время» null. */
  weekEndsOn: string | null;
  participating: boolean;
  /** Сколько участников с очками в снимке. */
  total: number;
  top: BoardRow[];
  /** Своё место; null, если человек не участвует. rank null, пока снимок его не учёл. */
  me: { rank: number | null; points: number; around: BoardRow[] } | null;
  /** Когда собран снимок (секунды Unix). */
  asOf: number;
}

/** GET /api/cohort. */
export interface CohortResponse {
  /** week: группа той же недели; window: ±2 недели; none: данных мало или человек не учитывается. */
  level: "week" | "window" | "none";
  size: number;
  p25?: number;
  p50?: number;
  p75?: number;
  mine: number;
  /** Человек отключил учёт в сравнении. */
  excluded: boolean;
}

/** PUT /api/settings: любые поля по отдельности. */
export interface SettingsRequest {
  leaderboard?: boolean;
  dailyGoal?: number;
  tz?: string;
  cohortExcluded?: boolean;
  gender?: Gender;
}

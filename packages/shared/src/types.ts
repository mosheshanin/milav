import type { Stroke } from "./handwriting/types";

/** Четыре этапа изучения слова. */
export const STAGES = ["listen", "speak", "write", "type"] as const;
export type Stage = (typeof STAGES)[number];

export const STAGE_TITLES: Record<Stage, string> = {
  listen: "Слушай",
  speak: "Говори",
  write: "Пиши",
  type: "Печатай",
};

export type Gender = "m" | "f";

export interface Phrase {
  he: string;
  translit: string;
  ru: string;
}

export interface Word {
  /** Уникальный id слова, например "animals-1-tsipor". */
  id: string;
  /** Слово на иврите, без огласовок. */
  he: string;
  /** То же слово с огласовками. Отправляется в синтезатор речи, чтобы он не гадал с гласными. На экране не показывается. */
  niqqud?: string;
  /** Транскрипция кириллицей. */
  translit: string;
  /** Перевод на русский. */
  ru: string;
  /** Род (для слов, у которых он есть). */
  gender?: Gender;
  /** Простая фраза со словом, по которой легко запомнить род. */
  example?: Phrase;
  /** Картинка слова: путь от корня сайта, файл лежит в apps/web/public/words. */
  image?: string;
  /** Путь к файлу озвучки. Если не задан, используется синтезатор браузера. */
  audio?: string;
}

export type Section = "nouns" | "verbs" | "adjectives";

export const SECTION_TITLES: Record<Section, string> = {
  nouns: "Существительные",
  verbs: "Глаголы",
  adjectives: "Прилагательные",
};

export interface Lesson {
  id: string;
  section: Section;
  /** Тема, например «Животные». */
  topic: string;
  /** Номер урока внутри темы, начиная с 1. */
  number: number;
  /** Бесплатный ли урок (первые 3 в теме). */
  free: boolean;
  title: string;
  words: Word[];
}

/** Типы вопросов викторины (по 5 вопросов каждого типа). */
export const QUESTION_TYPES = ["hear-ru", "he-ru", "ru-he", "speak", "write"] as const;
export type QuestionType = (typeof QUESTION_TYPES)[number];

export const QUESTION_TITLES: Record<QuestionType, string> = {
  "hear-ru": "Послушай слово и выбери перевод",
  "he-ru": "Прочитай слово и выбери перевод",
  "ru-he": "Выбери слово на иврите",
  speak: "Произнеси слово на иврите",
  write: "Напиши слово на иврите",
};

/** Ответ API на запрос профиля. */
export interface MeResponse {
  user: { id: number; firstName: string; username?: string };
  points: number;
  passedLessons: number;
  status: StatusInfo;
}

export interface StatusInfo {
  key: "pawn" | "knight" | "bishop" | "rook" | "queen" | "king";
  name: string;
  symbol: string;
  /** Сколько сданных уроков до следующего статуса (null у Короля). */
  nextAt: number | null;
}

/** Прогресс по этапам одного слова. */
export interface WordProgress {
  wordId: string;
  listen: boolean;
  speak: boolean;
  write: boolean;
  type: boolean;
  completed: boolean;
}

/**
 * Что клиент присылает вместе с отметкой этапа (POST /api/progress/stage).
 * «Говори» здесь нет: его отмечает только проверка речи на сервере.
 * - listen: достаточно самой отметки;
 * - type: набранное слово, сервер сверяет с написанием слова;
 * - write: штрихи по одному списку на каждую букву слова (в порядке написания), сервер сам распознаёт буквы.
 */
export type StageProof =
  | { stage: "listen" }
  | { stage: "type"; typed: string }
  | { stage: "write"; strokes: Stroke[][] };

/**
 * Вопрос викторины, как его выдаёт сервер (POST /api/quiz/start).
 * `options` это id слов-вариантов для вопросов с выбором (у «произнеси» и «напиши» пусто);
 * подписи вариантов приложение берёт из слов урока.
 */
export interface QuizQuestion {
  type: QuestionType;
  wordId: string;
  options: string[];
}

export interface QuizStartResponse {
  sessionId: string;
  lessonId: string;
  questions: QuizQuestion[];
}

/**
 * Ответ на вопрос (POST /api/quiz/answer). Что в нём лежит, зависит от типа вопроса:
 * - выбор: `choice`, id выбранного слова;
 * - письмо: `strokes`, штрихи каждой буквы (у буквы, которую не удалось написать, пустой список);
 * - «произнеси»: запись уходит отдельным запросом (POST /api/quiz/speech), здесь только `giveUp`;
 * - `giveUp`: отказаться от вопроса («произнеси» и письмо), он засчитывается неверным.
 */
export interface QuizAnswerRequest {
  sessionId: string;
  index: number;
  choice?: string;
  strokes?: Stroke[][];
  giveUp?: boolean;
}

/** Итог викторины, который считает сервер. */
export interface QuizResult {
  passed: boolean;
  correct: number;
  total: number;
  mistakes: number;
  firstTimePassed: boolean;
  passedLessons: number;
  status: StatusInfo;
}

/**
 * Ответ сервера на ответ ученика (и на запись голоса).
 * `final: false` бывает только у «произнеси»: ответ не принят, но попытка ещё есть (`attemptsLeft`).
 */
export interface QuizAnswerResponse {
  index: number;
  correct: boolean;
  final: boolean;
  /** Сколько верных и неверных ответов уже принято. */
  correctCount: number;
  mistakes: number;
  attemptsLeft?: number;
  /** «Произнеси»: что услышал распознаватель. */
  heard?: string;
  /** Письмо: номера букв (с нуля, в порядке написания), которые не приняты. */
  failedLetters?: number[];
  /** Ошибок больше допустимого: викторина прервана, ничего не сохранено. */
  aborted?: boolean;
  /** Есть, когда принят последний вопрос: итог уже записан. */
  result?: QuizResult;
  /** Ответ на повторный запрос того же вопроса (например, после обрыва связи): ничего не изменилось. */
  repeat?: boolean;
}

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

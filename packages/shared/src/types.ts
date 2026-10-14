import type { PlayEvent, PlayInfo } from "./gamification/types";
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

/** Кто и когда проверил слово: носитель языка, дата `YYYY-MM-DD`. */
export interface Reviewed {
  by: string;
  at: string;
}

/** Одна из форм прилагательного: иврит, огласовки (для озвучки) и транскрипция. */
export interface WordForm {
  he: string;
  niqqud: string;
  translit: string;
}

/** Остальные формы прилагательного. Основная форма (мужской род, единственное число) лежит в самом слове. */
export interface AdjectiveForms {
  /** Женский род, единственное число. */
  f: WordForm;
  /** Мужской род, множественное число. */
  mp: WordForm;
  /** Женский род, множественное число. */
  fp: WordForm;
}

export interface Word {
  /** Уникальный id слова, например "animals-1-tsipor". Прогресс пользователей привязан к нему: не менять. */
  id: string;
  /**
   * Слово на иврите, без огласовок. Основная форма: у существительных единственное число, у глаголов инфинитив,
   * у прилагательных мужской род единственное число.
   */
  he: string;
  /** То же слово с огласовками. Отправляется в синтезатор речи, чтобы он не гадал с гласными. На экране не показывается. */
  niqqud?: string;
  /** Транскрипция кириллицей. Стандарт: docs/CONTENT.md. */
  translit: string;
  /** Перевод на русский. */
  ru: string;
  /** Род (у существительных обязателен). */
  gender?: Gender;
  /** Простая фраза со словом, по которой легко запомнить род (у существительных) или употребление. */
  example?: Phrase;
  /** Три остальные формы прилагательного (только раздел «Прилагательные»). */
  forms?: AdjectiveForms;
  /** Картинка слова: путь от корня сайта, файл лежит в apps/web/public/words. Необязательна: без неё карточка показывает запасной вариант. */
  image?: string;
  /** Путь к файлу озвучки. Если не задан, используется синтезатор браузера. */
  audio?: string;
  /** Проверка носителем языка: `false` пока не проверено, иначе кто и когда проверил. */
  reviewed: false | Reviewed;
}

export type Section = "nouns" | "verbs" | "adjectives";

export const SECTION_TITLES: Record<Section, string> = {
  nouns: "Существительные",
  verbs: "Глаголы",
  adjectives: "Прилагательные",
};

export interface Lesson {
  /** Id урока: `<topicId>-<number>`, например "animals-1". */
  id: string;
  /** Постоянный латинский ключ темы, например "animals". Название темы на экране (`topic`) можно менять, ключ нет. */
  topicId: string;
  section: Section;
  /** Название темы на экране, например «Животные». */
  topic: string;
  /** Номер урока внутри темы, начиная с 1. */
  number: number;
  /** Бесплатный ли урок (первые FREE_LESSONS_PER_TOPIC в теме). */
  free: boolean;
  title: string;
  words: Word[];
}

// ---------------------------------------------------------------------------------------------------------------------
// Алфавит: отдельный раздел урока со своими элементами (буквами). Правила и решения: docs/SPEC.md, docs/CONTENT.md.

/** Название буквы: иврит, огласовки (для озвучки) и русское название. */
export interface LetterName {
  /** Название буквами без огласовок, например «אלף» или «כף סופית». */
  he: string;
  /** То же с огласовками. Уходит в синтезатор речи; на экране не показывается. */
  niqqud: string;
  /** Русское название, например «алеф»; у конечных форм «конечная каф» (то же, что в LETTER_NAMES). */
  ru: string;
}

/** Слово-пример к букве: у обычной буквы оно начинается с неё, у конечной формы заканчивается ею. */
export interface LetterExample {
  he: string;
  niqqud: string;
  translit: string;
  ru: string;
  /** Картинка: `/words/<id буквы>-example.svg` (или png, webp). Необязательна. */
  image?: string;
  /** Озвучка слова-примера: `/audio/<id буквы>-example.mp3`. Заполняет скрипт озвучки. */
  audio?: string;
}

/**
 * Одна из 27 форм алфавита (22 буквы и 5 конечных). Единица изучения: у неё свои этапы «слушай», «пиши», «печатай»
 * и свои очки. Прогресс привязан к `id`, поэтому его менять нельзя.
 */
export interface Letter {
  /** Уникальный id: `<id урока>-<ключ из LETTER_KEYS>`, например "alphabet-1-alef". */
  id: string;
  /** Сама форма, одна буква иврита («א», «ך»). Пишется и набирается на этапах «пиши» и «печатай». */
  he: string;
  name: LetterName;
  /** Звук кириллицей, как показывается ученику («б», «б, в», у молчащей буквы объяснение). */
  sound: string;
  example: LetterExample;
  /** Озвучка названия буквы: `/audio/<id>.mp3`. Заполняет скрипт озвучки. */
  audio?: string;
  /** Проверка носителем языка: названия, звука и слова-примера. `false` пока не проверено. */
  reviewed: false | Reviewed;
}

/** Урок алфавита: 5–6 форм, всегда бесплатный. Раздел `alphabet`, тема «Алфавит». */
export interface AlphabetLesson {
  /** Id урока: `alphabet-<номер>`. */
  id: string;
  topicId: string;
  section: "alphabet";
  topic: string;
  number: number;
  free: boolean;
  title: string;
  letters: Letter[];
}

/** Любой урок: обычный (слова) или алфавита (буквы). */
export type AnyLesson = Lesson | AlphabetLesson;

/** То, что изучают в уроке: слово или буква. */
export type StudyItem = Word | Letter;

/** Название темы алфавита на главной. */
export const ALPHABET_TITLE = "Алфавит";

/** Типы вопросов викторины обычного урока (по 5 вопросов каждого типа). */
export const QUESTION_TYPES = ["hear-ru", "he-ru", "ru-he", "speak", "write"] as const;
/** Типы вопросов викторины алфавита (по 5 вопросов каждого типа). */
export const ALPHABET_QUESTION_TYPES = ["hear-letter", "letter-name", "name-write", "name-type"] as const;
export type QuestionType = (typeof QUESTION_TYPES)[number] | (typeof ALPHABET_QUESTION_TYPES)[number];

export const QUESTION_TITLES: Record<QuestionType, string> = {
  "hear-ru": "Послушай слово и выбери перевод",
  "he-ru": "Прочитай слово и выбери перевод",
  "ru-he": "Выбери слово на иврите",
  speak: "Произнеси слово на иврите",
  write: "Напиши слово на иврите",
  "hear-letter": "Послушай название и выбери букву",
  "letter-name": "Посмотри на букву и выбери название",
  "name-write": "Напиши букву по названию",
  "name-type": "Найди букву на клавиатуре",
};

/** Ответ API на запрос профиля. */
export interface MeResponse {
  user: { id: number; firstName: string; username?: string };
  points: number;
  passedLessons: number;
  status: StatusInfo;
  /** Ритм, цель дня, путь к следующему статусу и настройки (геймификация). */
  play: PlayInfo;
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

/** Один записанный вариант начертания буквы (инструмент записи шаблонов, доступен только владельцу). */
export interface TemplateItem {
  /** Одна из 27 форм (22 буквы и 5 конечных). */
  letter: string;
  /** Номер варианта, с нуля: от 0 до TEMPLATE_VARIANTS_PER_LETTER - 1. */
  slot: number;
  /** Штрихи как нарисованы на холсте. */
  strokes: Stroke[];
  /** Время записи по UTC, `YYYY-MM-DD HH:MM:SS`. */
  recordedAt: string;
}

/** GET /api/templates: все записанные варианты. */
export interface TemplatesResponse {
  /** Сколько вариантов нужно на каждую форму. */
  variants: number;
  items: TemplateItem[];
}

/** PUT /api/templates: записать (или перезаписать) вариант. */
export interface TemplateSaveRequest {
  letter: string;
  slot: number;
  strokes: Stroke[];
}

/**
 * Ответ на запись варианта. Вариант сохраняется всегда; `accepted` и `looksLike` предупреждают, если рисунок
 * по существующим шаблонам (шрифты и уже выгруженные в репозиторий) больше похож на другую букву.
 */
export interface TemplateSaveResponse {
  item: TemplateItem;
  /** Распознаватель принял бы этот рисунок как ожидаемую букву. */
  accepted: boolean;
  /** На какую букву рисунок похож больше всего (при accepted это сама буква). */
  looksLike: string;
}

/**
 * Вопрос викторины, как его выдаёт сервер (POST /api/quiz/start).
 * `options` это id слов-вариантов для вопросов с выбором (у «произнеси» и «напиши» пусто);
 * подписи вариантов приложение берёт из слов урока.
 */
export interface QuizQuestion {
  type: QuestionType;
  /** Id слова (в уроке алфавита id буквы). Название осталось прежним, чтобы не менять сохранённые сессии и статистику. */
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
 * - выбор: `choice`, id выбранного слова (или буквы);
 * - письмо: `strokes`, штрихи каждой буквы (у буквы, которую не удалось написать, пустой список);
 *   в викторине алфавита одна буква, то есть один элемент;
 * - «найди букву на клавиатуре»: `typed`, нажатая буква;
 * - «произнеси»: запись уходит отдельным запросом (POST /api/quiz/speech), здесь только `giveUp`;
 * - `giveUp`: отказаться от вопроса («произнеси» и письмо), он засчитывается неверным.
 */
export interface QuizAnswerRequest {
  sessionId: string;
  index: number;
  choice?: string;
  strokes?: Stroke[][];
  typed?: string;
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
  /** Бейджи, цель дня и смена статуса, полученные этой викториной. */
  play: PlayEvent;
  /** Статус изменился именно этой сдачей урока. */
  statusChanged?: { from: StatusInfo["key"]; to: StatusInfo["key"] };
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

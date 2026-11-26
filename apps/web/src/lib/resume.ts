import { ALPHABET_SECTION, PAID_LESSONS_OPEN, lessonOpenWithoutPurchase, type LessonMeta, type Stage, type WordProgress } from "@milav/shared";

/** Порядок разделов на главной: алфавит первым, это стартовая точка новичка. */
export const SECTION_ORDER = [ALPHABET_SECTION, "basics", "numbers", "nouns", "verbs", "adjectives"] as const;

/** Прогресс по уроку, как его отдаёт сервер (нужна только часть полей). */
export interface LessonState {
  words: WordProgress[];
  quiz: { passed: boolean };
}

/** Куда привести человека кнопкой «Продолжить». */
export type Resume =
  | {
      kind: "word";
      lessonId: string;
      /** Номер слова с нуля: первое непройденное слово урока. */
      wordIndex: number;
      /** Первый непройденный этап этого слова. */
      stage: Stage;
      /** Начат ли урок (хотя бы один этап пройден). Если нет, кнопка называется «Начать». */
      started: boolean;
    }
  | { kind: "quiz"; lessonId: string };

/** Урок в манифесте: для выбора места продолжения слова не нужны, хватает числа слов и этапов. */
type ResumeLesson = Pick<LessonMeta, "id" | "section" | "topic" | "number" | "free" | "stages">;

/** Уроки в том порядке, в каком они показаны на главной: раздел (алфавит первый), тема (по первому появлению), номер урока. */
export function orderLessons<T extends ResumeLesson>(lessons: readonly T[]): T[] {
  const result: T[] = [];
  for (const section of SECTION_ORDER) {
    const topics = new Map<string, T[]>();
    for (const lesson of lessons.filter((l) => l.section === section)) {
      topics.set(lesson.topic, [...(topics.get(lesson.topic) ?? []), lesson]);
    }
    for (const list of topics.values()) result.push(...[...list].sort((a, b) => a.number - b.number));
  }
  return result;
}

function isStarted(state: LessonState): boolean {
  return state.words.some((w) => w.listen || w.speak || w.write || w.type);
}

/**
 * Место, с которого продолжить. Выводится из прогресса, который и так загружен на главной, поэтому в базе
 * ничего отдельно не хранится: берём первый начатый и не сданный урок (если такого нет, первый не сданный)
 * и в нём первое непройденное слово и этап. Когда все слова пройдены, а викторина не сдана, ведём к ней.
 * Платные уроки предлагаем, только пока они открыты всем (PAID_LESSONS_OPEN): иначе прогресс по ним не загружается.
 */
export function findResume(lessons: readonly ResumeLesson[], progress: Record<string, LessonState | undefined>): Resume | null {
  const open = orderLessons(lessons).filter((l) => {
    const state = progress[l.id];
    return lessonOpenWithoutPurchase(l, PAID_LESSONS_OPEN) && state && !state.quiz.passed;
  });
  const lesson = open.find((l) => isStarted(progress[l.id]!)) ?? open[0];
  if (!lesson) return null;

  const state = progress[lesson.id]!;
  const wordIndex = state.words.findIndex((w) => !w.completed);
  if (wordIndex === -1) return { kind: "quiz", lessonId: lesson.id };

  const word = state.words[wordIndex]!;
  return {
    kind: "word",
    lessonId: lesson.id,
    wordIndex,
    // Этапы урока свои: у буквы нет «говори», иначе после «слушай» её отправило бы на несуществующий этап.
    stage: lesson.stages.find((s) => !word[s]) ?? "listen",
    started: isStarted(state),
  };
}

/** Куда ведут кнопки карточки «С чего начнём?»: первый урок алфавита и первый урок слов (порядок главной). */
export interface FirstSteps {
  alphabet: string;
  words: string;
}

/**
 * Новичок (вопрос 149, решение владельца 26.11.2026): прогресс загружен, и ни один урок не начат и не сдан.
 * Тогда главная открывается карточкой «С чего начнём?» с двумя кнопками. Если прогресса нет (запрос не удался)
 * или нужного урока нет, карточки нет: остаётся обычная «Начать».
 */
export function firstSteps(lessons: readonly ResumeLesson[], progress: Record<string, LessonState | undefined>): FirstSteps | null {
  const states = Object.values(progress).filter((s): s is LessonState => !!s);
  if (states.length === 0 || states.some((s) => s.quiz.passed || isStarted(s))) return null;
  const open = orderLessons(lessons).filter((l) => lessonOpenWithoutPurchase(l, PAID_LESSONS_OPEN) && progress[l.id]);
  const alphabet = open.find((l) => l.section === ALPHABET_SECTION);
  const words = open.find((l) => l.section !== ALPHABET_SECTION);
  return alphabet && words ? { alphabet: alphabet.id, words: words.id } : null;
}

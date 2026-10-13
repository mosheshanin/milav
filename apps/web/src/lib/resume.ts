import { STAGES, type Lesson, type Section, type Stage, type WordProgress } from "@milav/shared";

/** Порядок разделов на главной. */
export const SECTION_ORDER: Section[] = ["nouns", "verbs", "adjectives"];

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

/** Уроки в том порядке, в каком они показаны на главной: раздел, тема (по первому появлению), номер урока. */
export function orderLessons(lessons: Lesson[]): Lesson[] {
  const result: Lesson[] = [];
  for (const section of SECTION_ORDER) {
    const topics = new Map<string, Lesson[]>();
    for (const lesson of lessons.filter((l) => l.section === section)) {
      topics.set(lesson.topic, [...(topics.get(lesson.topic) ?? []), lesson]);
    }
    for (const list of topics.values()) result.push(...[...list].sort((a, b) => a.number - b.number));
  }
  return result;
}

function isStarted(state: LessonState): boolean {
  return state.words.some((w) => STAGES.some((s) => w[s]));
}

/**
 * Место, с которого продолжить. Выводится из прогресса, который и так загружен на главной, поэтому в базе
 * ничего отдельно не хранится: берём первый начатый и не сданный урок (если такого нет, первый не сданный)
 * и в нём первое непройденное слово и этап. Когда все слова пройдены, а викторина не сдана, ведём к ней.
 * Платные уроки пока не предлагаем: прогресс по ним не загружается.
 */
export function findResume(lessons: Lesson[], progress: Record<string, LessonState | undefined>): Resume | null {
  const open = orderLessons(lessons).filter((l) => {
    const state = progress[l.id];
    return l.free && state && !state.quiz.passed;
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
    stage: STAGES.find((s) => !word[s]) ?? "listen",
    started: isStarted(state),
  };
}

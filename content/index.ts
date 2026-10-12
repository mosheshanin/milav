import type { Lesson, Word } from "@milav/shared";
import animals1 from "./lessons/animals-1.json";

/**
 * Все уроки. Чтобы добавить урок: положить JSON в content/lessons, импортировать здесь
 * и запустить `npm test` (content/content.test.ts проверит формат).
 */
export const lessons = [animals1] as unknown as Lesson[];

export function getLesson(id: string): Lesson | undefined {
  return lessons.find((l) => l.id === id);
}

export function findWord(wordId: string): { lesson: Lesson; word: Word } | undefined {
  for (const lesson of lessons) {
    const word = lesson.words.find((w) => w.id === wordId);
    if (word) return { lesson, word };
  }
  return undefined;
}

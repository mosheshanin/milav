import type { Lesson, Word } from "@milav/shared";
import { lessonFiles } from "./registry";

/**
 * Все уроки. Список в content/registry.ts создаёт `npm run content:index` по файлам из content/lessons;
 * формат и правила проверяют тесты (`npm run validate:content`). Как добавить урок: docs/CONTENT.md.
 */
export const lessons = lessonFiles as unknown as Lesson[];

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

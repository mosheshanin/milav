import type { AlphabetLesson, AnyLesson, Catalog, ContentInfo, Letter, Lesson, StudyItem, Word } from "@milav/shared";
import { buildCatalog, isAlphabetLesson } from "@milav/shared";
import { contentInfoOf } from "./info";
import { lessonFiles } from "./registry";

/**
 * Все файлы уроков, обычные и алфавит. Список в content/registry.ts создаёт `npm run content:index` по файлам из
 * content/lessons; формат и правила проверяют тесты (`npm run validate:content`). Как добавить урок: docs/CONTENT.md.
 */
const everyLesson = lessonFiles as unknown as AnyLesson[];

/** Уроки обычных разделов (слова). Алфавит отдельно: у него другие элементы, этапы и викторина. */
export const lessons: Lesson[] = everyLesson.filter((l): l is Lesson => !isAlphabetLesson(l));

/** Уроки алфавита (буквы), по номеру. */
export const alphabetLessons: AlphabetLesson[] = everyLesson
  .filter(isAlphabetLesson)
  .sort((a, b) => a.number - b.number);

/** Все уроки: сначала алфавит, потом обычные в порядке реестра. */
export const allLessons: AnyLesson[] = [...alphabetLessons, ...lessons];

/** Обычный урок по id. Уроки алфавита здесь не ищутся: для них `getAnyLesson`. */
export function getLesson(id: string): Lesson | undefined {
  return lessons.find((l) => l.id === id);
}

/** Урок любого вида по id. */
export function getAnyLesson(id: string): AnyLesson | undefined {
  return allLessons.find((l) => l.id === id);
}

export function findWord(wordId: string): { lesson: Lesson; word: Word } | undefined {
  for (const lesson of lessons) {
    const word = lesson.words.find((w) => w.id === wordId);
    if (word) return { lesson, word };
  }
  return undefined;
}

export function findLetter(letterId: string): { lesson: AlphabetLesson; letter: Letter } | undefined {
  for (const lesson of alphabetLessons) {
    const letter = lesson.letters.find((l) => l.id === letterId);
    if (letter) return { lesson, letter };
  }
  return undefined;
}

/** Слово или буква по id, вместе с уроком. Сервер ищет так то, что изучают на этапах. */
export function findStudyItem(id: string): { lesson: AnyLesson; item: StudyItem } | undefined {
  const word = findWord(id);
  if (word) return { lesson: word.lesson, item: word.word };
  const letter = findLetter(id);
  return letter ? { lesson: letter.lesson, item: letter.letter } : undefined;
}

/** Сведения о контенте для геймификации: сколько слов, уроков, разделов и тем (от них зависит, какие бейджи достижимы). */
export function contentInfo(): ContentInfo {
  return contentInfoOf(allLessons);
}

/** Каталог бейджей для текущего контента. Один и тот же код считает его на сервере и в приложении. */
export const catalog: Catalog = buildCatalog(contentInfo());

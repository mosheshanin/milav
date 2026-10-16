import { createHash } from "node:crypto";
import { isAlphabetLesson, lessonItems, stagesFor, type AnyLesson, type LessonMeta } from "@milav/shared";
import { contentInfoOf } from "./info";
import type { ContentManifest } from "./manifest";
import { readLessonFiles } from "./registryGen";

/** Версия урока: начало хэша его содержимого. Меняется при любой правке урока (слово, озвучка, картинка). */
export function lessonVersion(lesson: AnyLesson): string {
  return createHash("sha256").update(JSON.stringify(lesson)).digest("hex").slice(0, 10);
}

/** Урок без слов: то, что нужно главной. */
export function lessonMeta(lesson: AnyLesson): LessonMeta {
  return {
    id: lesson.id,
    topicId: lesson.topicId,
    section: lesson.section,
    topic: lesson.topic,
    number: lesson.number,
    free: lesson.free,
    title: lesson.title,
    count: lessonItems(lesson).length,
    stages: [...stagesFor(lesson)],
    ...(isAlphabetLesson(lesson) ? { letters: lesson.letters.map((l) => l.he) } : {}),
    v: lessonVersion(lesson),
  };
}

/** Манифест для приложения: уроки без слов (в порядке `allLessons`) и сведения о контенте для бейджей. */
export function buildManifest(all: readonly AnyLesson[]): ContentManifest {
  return { lessons: all.map(lessonMeta), info: contentInfoOf(all) };
}

/**
 * Текст файла content/manifest.json. Создаёт `npm run content:index` (вместе с реестром), тест manifest.test.ts
 * сверяет файл с уроками: если урок поменяли и забыли пересобрать манифест, тест падает.
 */
export function renderManifest(all: readonly AnyLesson[]): string {
  return JSON.stringify(buildManifest(all), null, 2) + "\n";
}

/**
 * Манифест прямо по файлам каталога уроков, в том же порядке, что `allLessons`: сначала алфавит, потом остальные
 * в порядке реестра. Так инструменты (`content:index`, `content:new`, генератор глаголов) пересобирают манифест сразу
 * после записи нового урока, не дожидаясь пересборки реестра.
 */
export function renderManifestFromDir(lessonsDir: URL): string {
  const lessons = readLessonFiles(lessonsDir).map((e) => e.data as unknown as AnyLesson);
  const alphabet = lessons.filter(isAlphabetLesson).sort((a, b) => a.number - b.number);
  return renderManifest([...alphabet, ...lessons.filter((l) => !isAlphabetLesson(l))]);
}

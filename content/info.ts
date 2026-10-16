import type { AnyLesson, ContentInfo } from "@milav/shared";
import { isAlphabetLesson } from "@milav/shared";

/**
 * Сведения о контенте для геймификации: сколько слов, уроков, разделов и тем (от них зависит, какие бейджи достижимы).
 * Считается по полному списку уроков: сервер делает это при запуске (content/index.ts), а для приложения результат
 * заранее записан в манифест (content/manifest.json), потому что слов уроков в приложении нет.
 */
export function contentInfoOf(all: readonly AnyLesson[]): ContentInfo {
  const topics = new Map<string, { id: string; title: string; lessonIds: string[] }>();
  let totalWords = 0;
  let alphabetLessons = 0;
  let alphabetLetters = 0;
  for (const lesson of all) {
    if (isAlphabetLesson(lesson)) {
      alphabetLessons += 1;
      alphabetLetters += lesson.letters.length;
      continue;
    }
    totalWords += lesson.words.length;
    const topic = topics.get(lesson.topicId) ?? { id: lesson.topicId, title: lesson.topic, lessonIds: [] };
    topic.lessonIds.push(lesson.id);
    topics.set(lesson.topicId, topic);
  }
  return {
    totalWords,
    totalLessons: all.length,
    alphabetLessons,
    alphabetLetters,
    sections: [...new Set(all.map((l) => l.section))],
    topics: [...topics.values()],
  };
}

// Этот файл создаёт `npm run content:index` (tools/content-index.ts), руками не правится.
// Тест content/registry.test.ts следит, чтобы список совпадал с файлами в content/lessons.
import lesson_animals_1 from "./lessons/animals-1.json";

export const lessonFiles: unknown[] = [
  lesson_animals_1,
];

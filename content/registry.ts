// Этот файл создаёт `npm run content:index` (tools/content-index.ts), руками не правится.
// Тест content/registry.test.ts следит, чтобы список совпадал с файлами в content/lessons.
import lesson_animals_1 from "./lessons/animals-1.json";
import lesson_animals_2 from "./lessons/animals-2.json";
import lesson_animals_3 from "./lessons/animals-3.json";
import lesson_food_1 from "./lessons/food-1.json";
import lesson_food_2 from "./lessons/food-2.json";
import lesson_food_3 from "./lessons/food-3.json";

export const lessonFiles: unknown[] = [
  lesson_animals_1,
  lesson_animals_2,
  lesson_animals_3,
  lesson_food_1,
  lesson_food_2,
  lesson_food_3,
];

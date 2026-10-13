// Этот файл создаёт `npm run content:index` (tools/content-index.ts), руками не правится.
// Тест content/registry.test.ts следит, чтобы список совпадал с файлами в content/lessons.
import lesson_animals_1 from "./lessons/animals-1.json";
import lesson_animals_2 from "./lessons/animals-2.json";
import lesson_animals_3 from "./lessons/animals-3.json";
import lesson_colors_1 from "./lessons/colors-1.json";
import lesson_colors_2 from "./lessons/colors-2.json";
import lesson_family_1 from "./lessons/family-1.json";
import lesson_family_2 from "./lessons/family-2.json";
import lesson_family_3 from "./lessons/family-3.json";
import lesson_food_1 from "./lessons/food-1.json";
import lesson_food_2 from "./lessons/food-2.json";
import lesson_food_3 from "./lessons/food-3.json";
import lesson_home_1 from "./lessons/home-1.json";
import lesson_home_2 from "./lessons/home-2.json";
import lesson_home_3 from "./lessons/home-3.json";

export const lessonFiles: unknown[] = [
  lesson_animals_1,
  lesson_animals_2,
  lesson_animals_3,
  lesson_colors_1,
  lesson_colors_2,
  lesson_family_1,
  lesson_family_2,
  lesson_family_3,
  lesson_food_1,
  lesson_food_2,
  lesson_food_3,
  lesson_home_1,
  lesson_home_2,
  lesson_home_3,
];

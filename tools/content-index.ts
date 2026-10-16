// Обновляет content/registry.ts (для сервера) и content/manifest.json (для приложения) по файлам из content/lessons.
// Запуск: npm run content:index
import { writeContentIndex } from "../content/writeIndex";

const count = writeContentIndex();
console.log(`content/registry.ts и content/manifest.json обновлены: уроков ${count}`);

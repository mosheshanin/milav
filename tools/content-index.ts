// Обновляет content/registry.ts по файлам из content/lessons. Запуск: npm run content:index
import { writeFileSync } from "node:fs";
import { renderRegistry } from "../content/registryGen";

const registry = new URL("../content/registry.ts", import.meta.url);
const text = renderRegistry(new URL("../content/lessons/", import.meta.url));
writeFileSync(registry, text);
console.log(`content/registry.ts обновлён: уроков ${(text.match(/^import /gm) ?? []).length}`);

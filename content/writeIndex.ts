import { writeFileSync } from "node:fs";
import { renderManifestFromDir } from "./manifestGen";
import { readLessonFiles, renderRegistry } from "./registryGen";

const lessonsDir = new URL("./lessons/", import.meta.url);

/**
 * Пересобирает оба файла-указателя по content/lessons: реестр для сервера (content/registry.ts, все уроки целиком)
 * и манифест для приложения (content/manifest.json, уроки без слов). Вызывают `content:index`, `content:new`
 * и генератор глаголов. Возвращает число уроков.
 */
export function writeContentIndex(): number {
  writeFileSync(new URL("./registry.ts", import.meta.url), renderRegistry(lessonsDir));
  writeFileSync(new URL("./manifest.json", import.meta.url), renderManifestFromDir(lessonsDir));
  return readLessonFiles(lessonsDir).length;
}

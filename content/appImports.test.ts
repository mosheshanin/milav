import { readFileSync, readdirSync, statSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Приложение берёт уроки из манифеста (`@milav/content/manifest`) и по API. Импорт `@milav/content` целиком
// положил бы все слова, в том числе платные, в файлы приложения. Тесты приложения импортировать его могут:
// в сборку они не попадают. Окончательную проверку по собранным файлам делает tools/check-bundle.mjs.

const srcDir = new URL("../apps/web/src/", import.meta.url);

function sourceFiles(dir: URL, prefix = ""): { path: string; text: string }[] {
  const out: { path: string; text: string }[] = [];
  for (const name of readdirSync(dir)) {
    const url = new URL(name, dir);
    if (statSync(url).isDirectory()) out.push(...sourceFiles(new URL(`${name}/`, dir), `${prefix}${name}/`));
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) {
      out.push({ path: `${prefix}${name}`, text: readFileSync(url, "utf8") });
    }
  }
  return out;
}

describe("приложение не тянет уроки целиком", () => {
  it("в коде приложения (кроме тестов) нет импорта @milav/content и файлов content/ напрямую", () => {
    const offenders = sourceFiles(srcDir)
      .filter(({ text }) => /from\s+["']@milav\/content["']|import\(\s*["']@milav\/content["']|content\/(lessons|registry|index)/.test(text))
      .map((f) => f.path);
    expect(offenders, "используйте apps/web/src/lib/lessons.ts (манифест) и api.lesson()").toEqual([]);
  });
});

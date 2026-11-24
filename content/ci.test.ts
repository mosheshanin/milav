import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const root = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const scripts = JSON.parse(root("package.json")).scripts as Record<string, string>;

/**
 * Проверки контента должны выполняться везде, где выкладывается или собирается проект:
 * Cloudflare запускает `npm run check`, GitHub CI запускает `npm test` и отдельный шаг контента.
 * Тест не даёт этому незаметно сломаться (например, если из vitest выпадет каталог content).
 */
describe("проверки контента входят в check и CI", () => {
  it("vitest берёт тесты из content", () => {
    expect(root("vitest.config.ts")).toContain("content/**/*.test.ts");
  });

  it("npm test запускает все тесты, а validate:content это их часть", () => {
    expect(scripts.test).toBe("vitest run");
    expect(scripts["validate:content"]).toBe("vitest run content");
  });

  it("npm run check включает npm test", () => {
    expect(scripts.check).toContain("npm test");
  });

  it("GitHub CI запускает validate:content отдельным шагом", () => {
    expect(root(".github/workflows/ci.yml")).toContain("npm run validate:content");
  });

  it("GitHub CI запускает сквозной тест группами, и в группах есть все сценарии и все уроки алфавита", () => {
    expect(root(".github/workflows/ci.yml")).toContain("node tools/e2e-group.mjs");
    const groups = root("tools/e2e-group.mjs");
    expect(root("tools/e2e-alphabet.mjs")).toContain("E2E_ALPHABET");
    for (const id of ["alphabet-1", "alphabet-2", "alphabet-3", "alphabet-4", "alphabet-5", "alphabet-6"]) expect(groups, id).toContain(`"${id}"`);
    const scenarios = ["lesson", "alphabet", "geresh", "alphabet-all", "record", "admin", "review", "reminders", "gamification", "repeat", "numbers", "overflow"];
    for (const name of scenarios) expect(groups, name).toContain(`"e2e-${name}.mjs"`);
  });

  it("команды инструментов контента на месте", () => {
    for (const name of ["content:index", "content:new", "content:report"]) expect(scripts[name], name).toBeTruthy();
  });
});

describe("манифест приложения: защита и пересборка", () => {
  it("сборка проверяет, что в файлах приложения нет слов уроков, и check включает сборку", () => {
    expect(scripts.build).toContain("node tools/check-bundle.mjs");
    expect(scripts.check).toContain("npm run build");
    expect(root("tools/check-bundle.mjs")).toContain("apps/web/dist");
  });

  it("озвучка и ящик картинок пересобирают манифест после правки уроков и коммитят его", () => {
    const audio = root(".github/workflows/generate-audio.yml");
    expect(audio).toContain("npm run content:index");
    expect(audio).toMatch(/git add [^\n]*content\/manifest\.json/);
    expect(root("tools/images-inbox.ts")).toContain("writeContentIndex()");
    expect(root(".github/workflows/images-inbox.yml")).toMatch(/git add [^\n]*content\/manifest\.json/);
  });
});

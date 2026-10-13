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

  it("GitHub CI запускает сквозной тест алфавита, и скрипт на месте", () => {
    expect(root(".github/workflows/ci.yml")).toContain("node tools/e2e-alphabet.mjs");
    expect(root("tools/e2e-alphabet.mjs")).toContain("E2E_ALPHABET");
  });

  it("команды инструментов контента на месте", () => {
    for (const name of ["content:index", "content:new", "content:report"]) expect(scripts[name], name).toBeTruthy();
  });
});

// Защита токенов тёмной темы (apps/web/src/index.css). Лежит здесь, как и headers-file.test.ts: тесты сервера
// не проходят проверку типов приложения, поэтому могут читать файлы с диска.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const css = readFileSync(fileURLToPath(new URL("../../web/src/index.css", import.meta.url)), "utf8");

// Защита тёмной темы: каждый цветовой токен из @theme (кроме цветов бренда из логотипа) должен иметь тёмное значение
// в `:root[data-theme="dark"]`, иначе новый цвет останется светлым и выпадет из тёмной темы.

function block(selector: string): string {
  const start = css.indexOf(selector);
  expect(start, `нет блока ${selector}`).toBeGreaterThanOrEqual(0);
  const open = css.indexOf("{", start);
  let depth = 0;
  for (let i = open; i < css.length; i++) {
    if (css[i] === "{") depth++;
    if (css[i] === "}" && --depth === 0) return css.slice(open + 1, i);
  }
  throw new Error(`не закрыт блок ${selector}`);
}

const colors = (text: string) => new Set([...text.matchAll(/(--color-[\w-]+)\s*:/g)].map((m) => m[1]!));

describe("токены тёмной темы", () => {
  const light = colors(block("@theme"));
  const dark = colors(block(':root[data-theme="dark"]'));

  it("у каждого цвета интерфейса есть тёмное значение", () => {
    const missing = [...light].filter((t) => !t.startsWith("--color-brand-") && !dark.has(t));
    expect(missing).toEqual([]);
  });

  it("тёмная тема не вводит токенов, которых нет в светлой", () => {
    expect([...dark].filter((t) => !light.has(t))).toEqual([]);
  });

  it("затемнение под листами не завязано на цвет текста (в тёмной теме он светлый)", () => {
    expect(css).toContain("--color-scrim");
  });
});

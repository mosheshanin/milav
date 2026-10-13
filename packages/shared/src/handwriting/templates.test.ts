import { describe, expect, it } from "vitest";
import { HEBREW_LETTERS, TEMPLATE_VARIANTS_PER_LETTER } from "../constants";
import baseRaw from "./baseTemplates.json";
import ownRaw from "./ownTemplates.json";
import { CLOUD_SIZE } from "./recognizer";
import { STATIC_TEMPLATES } from "./staticTemplates";
import { buildTemplates, loadBaseTemplates, loadTemplates, type RawTemplate } from "./templates";

describe("сборка шаблонов", () => {
  it("плоский список координат превращается в точки", () => {
    const [t] = buildTemplates([{ letter: "א", source: "own", aspect: 0.9, heightRatio: 0.8, points: [1, 2, 3, 4] }]);
    expect(t).toEqual({
      letter: "א",
      source: "own",
      aspect: 0.9,
      heightRatio: 0.8,
      points: [
        { x: 1, y: 2 },
        { x: 3, y: 4 },
      ],
    });
  });

  it("несколько списков склеиваются по порядку: сначала шрифты, потом записанные", () => {
    const a: RawTemplate = { letter: "א", source: "font:a", aspect: 1, heightRatio: 1, points: [0, 0] };
    const b: RawTemplate = { letter: "ב", source: "own", aspect: 1, heightRatio: 1, points: [0, 0] };
    expect(buildTemplates([a], [b]).map((t) => t.source)).toEqual(["font:a", "own"]);
  });
});

describe("набор шаблонов приложения и сервера", () => {
  it("статический набор сервера совпадает с набором, который грузит приложение", async () => {
    const lazy = await loadTemplates();
    expect(lazy.length).toBeGreaterThan(0);
    expect(STATIC_TEMPLATES).toEqual(lazy);
  });

  it("набор состоит из шрифтов и записанных, шрифтовая часть не меняется", async () => {
    const base = await loadBaseTemplates();
    expect(base.length).toBe(baseRaw.length);
    expect(STATIC_TEMPLATES.length).toBe(base.length + ownRaw.length);
    expect(STATIC_TEMPLATES.slice(0, base.length)).toEqual(base);
  });

  it("у каждой из 27 форм есть шаблоны", () => {
    for (const letter of HEBREW_LETTERS) {
      expect(STATIC_TEMPLATES.some((t) => t.letter === letter), `нет шаблонов для ${letter}`).toBe(true);
    }
  });
});

// ownTemplates.json собирается из рисунков владельца (tools/build-own-templates.mjs). Файл попадает и в приложение,
// и на сервер, поэтому испорченные данные должны останавливать сборку, а не выкладку.
describe("файл записанных шаблонов (ownTemplates.json)", () => {
  const own = ownRaw as RawTemplate[];

  it("каждый шаблон корректен", () => {
    own.forEach((t, i) => {
      const where = `шаблон ${i} (${t.letter})`;
      expect(HEBREW_LETTERS as readonly string[], `${where}: неизвестная буква`).toContain(t.letter);
      expect(t.source, `${where}: источник`).toBe("own");
      expect(t.points.length, `${where}: число координат`).toBe(CLOUD_SIZE * 2);
      for (const v of t.points) {
        expect(Number.isFinite(v), `${where}: координата`).toBe(true);
        // Облако центрировано, большая сторона равна 1 (допуск на округление до тысячных).
        expect(Math.abs(v), `${where}: координата вне квадрата`).toBeLessThanOrEqual(0.5005);
      }
      expect(t.aspect, `${where}: aspect`).toBeGreaterThan(0.04);
      expect(t.aspect, `${where}: aspect`).toBeLessThan(20.01);
      expect(t.heightRatio, `${where}: heightRatio`).toBeGreaterThan(0.01);
      expect(t.heightRatio, `${where}: heightRatio`).toBeLessThan(5.01);
    });
  });

  it("вариантов на форму не больше положенного", () => {
    const counts = new Map<string, number>();
    for (const t of own) counts.set(t.letter, (counts.get(t.letter) ?? 0) + 1);
    for (const [letter, n] of counts) {
      expect(n, `слишком много вариантов у ${letter}`).toBeLessThanOrEqual(TEMPLATE_VARIANTS_PER_LETTER);
    }
  });
});

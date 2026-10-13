import { describe, expect, it } from "vitest";
import { HEBREW_LETTERS } from "../constants";
import { CANVAS_LINE_HEIGHT } from "./canvas";
import {
  buildOwnTemplates,
  drawingsFromRows,
  evaluateDrawings,
  rawTemplateFromDrawing,
  sortDrawings,
  withRecognizer,
  type RecordedDrawing,
} from "./ownCalibration";
import { RECOGNIZER, featuresFromStrokes } from "./recognizer";
import { buildTemplates, loadBaseTemplates } from "./templates";
import type { Stroke, Template } from "./types";

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** «Рисунок» по шаблону шрифта: одним штрихом по точкам шаблона, чуть искажённым, в пикселях холста. */
function drawingFrom(t: Template, slot: number, rng: () => number): RecordedDrawing {
  const h = t.heightRatio * CANVAS_LINE_HEIGHT;
  const scale = t.aspect <= 1 ? h : h * t.aspect;
  const sx = 1 + (rng() - 0.5) * 0.1;
  const sy = 1 + (rng() - 0.5) * 0.1;
  const stroke: Stroke = t.points.map((p) => ({
    x: 150 + p.x * scale * sx + (rng() - 0.5) * 2,
    y: 110 + p.y * scale * sy + (rng() - 0.5) * 2,
  }));
  return { letter: t.letter, slot, strokes: [stroke] };
}

async function sample(perLetter: number, seed: number) {
  const fonts = await loadBaseTemplates();
  const rng = mulberry32(seed);
  const drawings: RecordedDrawing[] = [];
  for (const letter of HEBREW_LETTERS) {
    const pool = fonts.filter((t) => t.letter === letter);
    for (let slot = 0; slot < perLetter; slot++) drawings.push(drawingFrom(pool[slot % pool.length]!, slot, rng));
  }
  return { fonts, drawings };
}

describe("шаблоны владельца из рисунков", () => {
  it("шаблон из рисунка совпадает с признаками, которые считаются при проверке буквы", async () => {
    const { drawings } = await sample(1, 1);
    const d = drawings[0]!;
    const raw = rawTemplateFromDrawing(d)!;
    const f = featuresFromStrokes(d.strokes, CANVAS_LINE_HEIGHT)!;
    expect(raw.source).toBe("own");
    expect(raw.letter).toBe(d.letter);
    expect(raw.points).toHaveLength(f.points.length * 2);
    expect(raw.aspect).toBeCloseTo(f.aspect, 3);
    expect(raw.heightRatio).toBeCloseTo(f.heightRatio, 3);
    expect(Math.max(...raw.points.map(Math.abs))).toBeLessThanOrEqual(0.5005);
  });

  it("порядок: по алфавиту форм и номеру варианта; лишнее отбрасывается", async () => {
    const { drawings } = await sample(2, 2);
    const shuffled = [...drawings].reverse();
    const junk: RecordedDrawing[] = [
      { letter: "x", slot: 0, strokes: drawings[0]!.strokes },
      { letter: "א", slot: 9, strokes: [] },
    ];
    const sorted = sortDrawings([...shuffled, ...junk]);
    expect(sorted.map((d) => `${d.letter}${d.slot}`)).toEqual(drawings.map((d) => `${d.letter}${d.slot}`));
    expect(buildOwnTemplates([...shuffled, ...junk])).toHaveLength(HEBREW_LETTERS.length * 2);
  });

  it("собранные шаблоны годятся для buildTemplates", async () => {
    const { drawings } = await sample(1, 3);
    const built = buildTemplates(buildOwnTemplates(drawings));
    expect(built).toHaveLength(HEBREW_LETTERS.length);
    expect(built[0]!.points).toHaveLength(48);
  });
});

describe("оценка распознавателя на рисунках", () => {
  it("рисунки, похожие на шрифты, почти все принимаются, чужие буквы почти не принимаются", async () => {
    const { fonts, drawings } = await sample(3, 4);
    const report = evaluateDrawings(drawings, fonts, "leave-one-out");
    expect(report.drawings).toBe(HEBREW_LETTERS.length * 3);
    // Синтетический штрих соединяет разрозненные части шаблона лишними отрезками, поэтому не всё принимается.
    expect(report.acceptRate).toBeGreaterThan(0.6);
    expect(report.falseAcceptRate).toBeLessThan(0.1);
    expect(report.letters).toHaveLength(HEBREW_LETTERS.length);
    for (const l of report.letters) {
      expect(l.drawings).toBe(3);
      expect(l.accepted + l.rejectedSlots.length).toBe(3);
      expect(l.nearestWrong).not.toBeNull();
    }
  });

  it("режим «против шрифтов» не использует рисунки как шаблоны; leave-one-out не использует сам рисунок", async () => {
    const { fonts, drawings } = await sample(2, 5);
    // Рисунок, составленный из шаблона шрифта почти точь-в-точь, в режиме «fonts» очень близок к нему.
    const exact: RecordedDrawing = drawingFrom(fonts[0]!, 0, () => 0.5);
    const alone = evaluateDrawings([exact], fonts, "fonts");
    expect(alone.letters[0]!.meanDistance).toBeLessThan(0.08);
    // Единственный рисунок не может «подсказать сам себе» в leave-one-out: результат совпадает с режимом «fonts».
    const loo = evaluateDrawings([exact], fonts, "leave-one-out");
    expect(loo.letters[0]!.meanDistance).toBeCloseTo(alone.letters[0]!.meanDistance, 12);
    expect(drawings.length).toBeGreaterThan(0);
  });

  it("строгие параметры принимают меньше, мягкие больше; после withRecognizer всё возвращается", async () => {
    const { fonts, drawings } = await sample(2, 6);
    const before = { ...RECOGNIZER };
    const strict = withRecognizer({ maxDistance: 0.02 }, () => evaluateDrawings(drawings, fonts, "fonts"));
    const loose = withRecognizer({ maxDistance: 0.5, slack: 100 }, () => evaluateDrawings(drawings, fonts, "fonts"));
    expect(strict.acceptRate).toBeLessThan(loose.acceptRate);
    expect(loose.falseAcceptRate).toBeGreaterThan(strict.falseAcceptRate);
    expect({ ...RECOGNIZER }).toEqual(before);
  });

  it("пустая выгрузка даёт пустой отчёт без ошибок", async () => {
    const fonts = await loadBaseTemplates();
    const report = evaluateDrawings([], fonts);
    expect(report).toMatchObject({ drawings: 0, accepted: 0, acceptRate: 0, falseAcceptRate: 0, letters: [] });
  });
});

describe("разбор выгрузки из D1", () => {
  const flat = JSON.stringify([[1, 2, 3, 4], [5, 6]]);
  const expected = [{ letter: "א", slot: 0, strokes: [[{ x: 1, y: 2 }, { x: 3, y: 4 }], [{ x: 5, y: 6 }]] }];

  it("понимает массив строк, { results } и ответ в несколько запросов", () => {
    const row = { letter: "א", slot: 0, strokes: flat };
    expect(drawingsFromRows([row])).toEqual(expected);
    expect(drawingsFromRows({ results: [row] })).toEqual(expected);
    expect(drawingsFromRows({ result: [{ results: [row] }] })).toEqual(expected);
    expect(drawingsFromRows([{ results: [row] }])).toEqual(expected);
  });

  it("список точек {x, y} из API тоже подходит", () => {
    const strokes = [[{ x: 1, y: 2 }]];
    expect(drawingsFromRows([{ letter: "ב", slot: 3, strokes }])).toEqual([{ letter: "ב", slot: 3, strokes }]);
  });

  it("мусор не молчит", () => {
    expect(() => drawingsFromRows({})).toThrow();
    expect(() => drawingsFromRows([{ letter: "א", slot: "0", strokes: flat }])).toThrow(/Строка 0/);
    expect(() => drawingsFromRows([{ letter: "א", slot: 0, strokes: "5" }])).toThrow(/Строка 0/);
  });
});

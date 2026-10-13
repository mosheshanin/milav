import { describe, expect, it } from "vitest";
import { bitmapPoints, samplePoints, thin } from "./skeleton";
import {
  CLOUD_SIZE,
  checkLetter,
  chamfer,
  featuresFromPoints,
  featuresFromStrokes,
  resampleStrokes,
} from "./recognizer";
import type { Stroke, Template } from "./types";

const line = (x1: number, y1: number, x2: number, y2: number, steps = 30): Stroke =>
  Array.from({ length: steps + 1 }, (_, i) => ({
    x: x1 + ((x2 - x1) * i) / steps,
    y: y1 + ((y2 - y1) * i) / steps,
  }));

describe("утончение", () => {
  it("толстая линия превращается в линию в 1 пиксель", () => {
    const w = 40;
    const h = 40;
    const bitmap = new Uint8Array(w * h);
    for (let y = 5; y < 35; y++) for (let x = 17; x < 23; x++) bitmap[y * w + x] = 1; // полоса шириной 6
    const skeleton = thin(bitmap, w, h);
    const points = bitmapPoints(skeleton, w, h);
    expect(points.length).toBeGreaterThan(15);
    expect(points.length).toBeLessThan(40);
    // Все точки скелета около середины полосы.
    for (const p of points) expect(Math.abs(p.x - 19.5)).toBeLessThanOrEqual(1.5);
  });

  it("выбор точек даёт не больше запрошенного и покрывает всю фигуру", () => {
    const pts = bitmapPoints(
      Uint8Array.from({ length: 100 }, (_, i) => (i % 10 === 0 ? 1 : 0)),
      10,
      10,
    );
    expect(samplePoints(pts, 5).length).toBe(5);
    expect(samplePoints(pts, 50).length).toBe(pts.length);
  });
});

describe("штрихи", () => {
  it("равномерное разбиение сохраняет концы и количество точек", () => {
    const pts = resampleStrokes([line(0, 0, 100, 0)], CLOUD_SIZE);
    expect(pts.length).toBe(CLOUD_SIZE);
    expect(pts[0]).toEqual({ x: 0, y: 0 });
    expect(pts[CLOUD_SIZE - 1]!.x).toBeCloseTo(100);
  });

  it("точка без движения не ломает расчёт", () => {
    const pts = resampleStrokes([[{ x: 5, y: 5 }]], CLOUD_SIZE);
    expect(pts.length).toBe(CLOUD_SIZE);
    expect(featuresFromPoints(pts, 100)).not.toBeNull();
  });

  it("пустой ввод не даёт признаков", () => {
    expect(featuresFromStrokes([], 100)).toBeNull();
  });
});

// Три простые «буквы»: вертикальная линия (как ו), горизонтальная (как ־) и угол (как ר).
function makeTemplate(letter: string, strokes: Stroke[]): Template {
  const f = featuresFromStrokes(strokes, 100)!;
  return { letter, source: "test", ...f };
}

const templates: Template[] = [
  makeTemplate("ו", [line(50, 0, 50, 100)]),
  makeTemplate("ר", [line(0, 0, 80, 0), line(80, 0, 80, 100)]),
  makeTemplate("ב", [line(0, 0, 0, 100), line(0, 100, 80, 100), line(0, 0, 80, 0)]),
];

describe("распознавание простых фигур", () => {
  it("узнаёт фигуру при смещении, масштабе и дрожании руки", () => {
    const wobble = (s: Stroke): Stroke => s.map((p, i) => ({ x: p.x * 1.4 + 30 + Math.sin(i) * 2, y: p.y * 1.3 + 12 + Math.cos(i) * 2 }));
    const drawn = featuresFromStrokes([wobble(line(50, 0, 50, 100))], 130)!;
    const result = checkLetter(drawn, templates, "ו");
    expect(result.best).toBe("ו");
    expect(result.ok).toBe(true);
  });

  it("не принимает другую фигуру за ожидаемую", () => {
    const drawn = featuresFromStrokes([line(0, 0, 0, 100), line(0, 100, 80, 100), line(0, 0, 80, 0)], 100)!;
    const result = checkLetter(drawn, templates, "ו");
    expect(result.best).toBe("ב");
    expect(result.ok).toBe(false);
  });

  it("не принимает случайную закорючку", () => {
    const scribble = featuresFromStrokes([line(0, 0, 100, 100), line(100, 0, 0, 100, 10), line(0, 50, 100, 50, 8)], 100)!;
    expect(checkLetter(scribble, templates, "ר").ok).toBe(false);
  });

  it("расстояние между одинаковыми облаками равно нулю", () => {
    const f = featuresFromStrokes([line(0, 0, 10, 40)], 100)!;
    expect(chamfer(f.points, f.points)).toBeCloseTo(0);
  });
});

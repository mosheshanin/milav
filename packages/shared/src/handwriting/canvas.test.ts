import { describe, expect, it } from "vitest";
import { roundStrokes, thinStrokes } from "./canvas";
import type { Stroke } from "./types";

describe("прореживание штрихов", () => {
  it("убирает точки ближе минимального расстояния, концы оставляет", () => {
    const stroke: Stroke = Array.from({ length: 101 }, (_, i) => ({ x: i * 0.2, y: 0 }));
    const [thinned] = thinStrokes([stroke], 1);
    expect(thinned![0]).toEqual(stroke[0]);
    expect(thinned![thinned!.length - 1]).toEqual(stroke[100]);
    // 20 пикселей длины, шаг не меньше 1: около 20 точек вместо 101.
    expect(thinned!.length).toBeGreaterThan(15);
    expect(thinned!.length).toBeLessThan(25);
    for (let i = 2; i < thinned!.length - 1; i++) {
      expect(Math.hypot(thinned![i]!.x - thinned![i - 1]!.x, thinned![i]!.y - thinned![i - 1]!.y)).toBeGreaterThanOrEqual(1 - 1e-9);
    }
  });

  it("одиночное касание и короткие штрихи не меняются", () => {
    const tap: Stroke = [{ x: 5, y: 5 }];
    const short: Stroke = [{ x: 0, y: 0 }, { x: 0.1, y: 0 }];
    expect(thinStrokes([tap, short])).toEqual([tap, short]);
  });

  it("не портит исходные данные и сохраняет порядок штрихов", () => {
    const a: Stroke = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 20, y: 0 }];
    const b: Stroke = [{ x: 0, y: 5 }, { x: 10, y: 5 }, { x: 20, y: 5 }];
    const input = [a, b];
    const out = thinStrokes(input);
    expect(out).toEqual(input);
    expect(out[0]).not.toBe(a);
  });

  it("форма остаётся той же: после прореживания и округления облако почти не меняется", () => {
    const circle: Stroke = Array.from({ length: 400 }, (_, i) => ({
      x: 100 + 40 * Math.cos((i / 400) * 2 * Math.PI),
      y: 100 + 40 * Math.sin((i / 400) * 2 * Math.PI),
    }));
    const [thinned] = roundStrokes(thinStrokes([circle]));
    // Окружность длиной около 251 px при шаге от 1 px: порядка 200 точек вместо 400.
    expect(thinned!.length).toBeLessThan(circle.length * 0.6);
    expect(thinned!.length).toBeGreaterThan(150);
  });
});

import type { Stroke } from "./types";

// Геометрия холста для рукописного ввода. Клиент рисует по ней направляющие, а сервер по ней же
// проверяет штрихи: высота обычной буквы должна быть одинаковой там и там, иначе распознавание разойдётся.

/** Высота холста в пикселях. */
export const CANVAS_HEIGHT = 220;
/** Положение верхней линии и базовой линии (доли высоты). Расстояние между ними — высота обычной буквы. */
export const CANVAS_TOP_LINE = 0.17;
export const CANVAS_BASE_LINE = 0.62;
/** Высота обычной буквы (например, «א») в пикселях холста. */
export const CANVAS_LINE_HEIGHT = (CANVAS_BASE_LINE - CANVAS_TOP_LINE) * CANVAS_HEIGHT;

/** Знаков после запятой в координатах штрихов, которые уходят на сервер. */
export const STROKE_DECIMALS = 1;

/**
 * Убирает точки, которые ближе `minDistance` пикселей к предыдущей оставленной. Первая и последняя точка штриха
 * остаются, одиночное касание не меняется. Нужно, чтобы медленный штрих (по точке на каждое движение пальца)
 * не раздувал запрос: форма при этом не меняется, потому что распознавание всё равно берёт точки равномерно по длине.
 */
export function thinStrokes(strokes: Stroke[], minDistance = 1): Stroke[] {
  return strokes.map((stroke) => {
    if (stroke.length <= 2) return stroke.slice();
    const kept = [stroke[0]!];
    for (let i = 1; i < stroke.length - 1; i++) {
      const last = kept[kept.length - 1]!;
      const p = stroke[i]!;
      if (Math.hypot(p.x - last.x, p.y - last.y) >= minDistance) kept.push(p);
    }
    kept.push(stroke[stroke.length - 1]!);
    return kept;
  });
}

/**
 * Округляет координаты штрихов. Клиент проверяет букву уже по округлённым штрихам и отправляет их же,
 * поэтому всё, что принял клиент, принимает и сервер (результат не зависит от округления).
 */
export function roundStrokes(strokes: Stroke[], decimals = STROKE_DECIMALS): Stroke[] {
  const k = 10 ** decimals;
  const round = (v: number) => Math.round(v * k) / k;
  return strokes.map((stroke) => stroke.map((p) => ({ x: round(p.x), y: round(p.y) })));
}

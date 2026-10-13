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
 * Округляет координаты штрихов. Клиент проверяет букву уже по округлённым штрихам и отправляет их же,
 * поэтому всё, что принял клиент, принимает и сервер (результат не зависит от округления).
 */
export function roundStrokes(strokes: Stroke[], decimals = STROKE_DECIMALS): Stroke[] {
  const k = 10 ** decimals;
  const round = (v: number) => Math.round(v * k) / k;
  return strokes.map((stroke) => stroke.map((p) => ({ x: round(p.x), y: round(p.y) })));
}

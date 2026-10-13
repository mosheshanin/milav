import type { Point } from "./types";

/**
 * Утончение растрового изображения до линии толщиной в 1 пиксель (алгоритм Жанга-Суня).
 * `bitmap`: 1 там, где есть чернила. Возвращает новый массив того же размера.
 */
export function thin(bitmap: Uint8Array, width: number, height: number): Uint8Array {
  const img = bitmap.slice();
  const at = (x: number, y: number) => y * width + x;

  let changed = true;
  while (changed) {
    changed = false;
    for (let step = 0; step < 2; step++) {
      const remove: number[] = [];
      for (let y = 1; y < height - 1; y++) {
        for (let x = 1; x < width - 1; x++) {
          if (!img[at(x, y)]) continue;
          const p2 = img[at(x, y - 1)]!;
          const p3 = img[at(x + 1, y - 1)]!;
          const p4 = img[at(x + 1, y)]!;
          const p5 = img[at(x + 1, y + 1)]!;
          const p6 = img[at(x, y + 1)]!;
          const p7 = img[at(x - 1, y + 1)]!;
          const p8 = img[at(x - 1, y)]!;
          const p9 = img[at(x - 1, y - 1)]!;

          const neighbours = p2 + p3 + p4 + p5 + p6 + p7 + p8 + p9;
          if (neighbours < 2 || neighbours > 6) continue;

          const ring = [p2, p3, p4, p5, p6, p7, p8, p9, p2];
          let transitions = 0;
          for (let i = 0; i < 8; i++) if (ring[i] === 0 && ring[i + 1] === 1) transitions++;
          if (transitions !== 1) continue;

          if (step === 0) {
            if (p2 * p4 * p6 !== 0 || p4 * p6 * p8 !== 0) continue;
          } else if (p2 * p4 * p8 !== 0 || p2 * p6 * p8 !== 0) {
            continue;
          }
          remove.push(at(x, y));
        }
      }
      for (const i of remove) img[i] = 0;
      if (remove.length > 0) changed = true;
    }
  }
  return img;
}

/** Координаты всех «чернильных» пикселей. */
export function bitmapPoints(bitmap: Uint8Array, width: number, height: number): Point[] {
  const points: Point[] = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (bitmap[y * width + x]) points.push({ x, y });
    }
  }
  return points;
}

/** Выбирает `count` точек, равномерно покрывающих фигуру (farthest point sampling). */
export function samplePoints(points: Point[], count: number): Point[] {
  if (points.length <= count) return points.slice();
  const chosen: Point[] = [points[0]!];
  const nearest = points.map((p) => (p.x - chosen[0]!.x) ** 2 + (p.y - chosen[0]!.y) ** 2);
  while (chosen.length < count) {
    let best = 0;
    for (let i = 1; i < nearest.length; i++) if (nearest[i]! > nearest[best]!) best = i;
    const next = points[best]!;
    chosen.push(next);
    for (let i = 0; i < points.length; i++) {
      const d = (points[i]!.x - next.x) ** 2 + (points[i]!.y - next.y) ** 2;
      if (d < nearest[i]!) nearest[i] = d;
    }
  }
  return chosen;
}

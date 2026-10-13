import type { LetterCheck, LetterFeatures, Point, Ranked, Stroke, Template } from "./types";

/** Сколько точек берём с каждой буквы. */
export const CLOUD_SIZE = 48;

/**
 * Параметры решения. Подобраны на шаблонах из шрифтов (см. tools/handwriting-lab.mjs) и
 * должны быть перекалиброваны, когда появятся шаблоны, нарисованные людьми.
 */
export const RECOGNIZER = {
  /** Вес различия пропорций рамки буквы. */
  aspectWeight: 0.03,
  /** Вес различия высоты буквы относительно строки. */
  heightWeight: 0.04,
  /** Максимально допустимое расстояние до ожидаемой буквы. */
  maxDistance: 0.16,
  /**
   * Ожидаемая буква принимается, если она не хуже лучшей более чем в столько раз.
   * 1.0 значит «должна быть самой похожей». На стенде (чужой стиль письма): 1.0 даёт 1.8% ложных
   * принятий, 1.1 даёт 4.4% ложных и больше принятых верных букв.
   */
  slack: 1.1,
};

function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Равномерно по длине линии берёт `count` точек со всех штрихов. */
export function resampleStrokes(strokes: Stroke[], count: number): Point[] {
  const segments: { a: Point; b: Point; length: number }[] = [];
  let total = 0;
  for (const stroke of strokes) {
    for (let i = 1; i < stroke.length; i++) {
      const length = distance(stroke[i - 1]!, stroke[i]!);
      if (length > 0) {
        segments.push({ a: stroke[i - 1]!, b: stroke[i]!, length });
        total += length;
      }
    }
  }
  const first = strokes.find((s) => s.length > 0)?.[0];
  if (!first) return [];
  if (total < 1e-6) return Array.from({ length: count }, () => ({ ...first }));

  const out: Point[] = [];
  let segIndex = 0;
  let passed = 0;
  for (let k = 0; k < count; k++) {
    const target = count === 1 ? 0 : (k * total) / (count - 1);
    while (segIndex < segments.length - 1 && passed + segments[segIndex]!.length < target) {
      passed += segments[segIndex]!.length;
      segIndex++;
    }
    const seg = segments[segIndex]!;
    const t = Math.min(1, Math.max(0, (target - passed) / seg.length));
    out.push({ x: seg.a.x + (seg.b.x - seg.a.x) * t, y: seg.a.y + (seg.b.y - seg.a.y) * t });
  }
  return out;
}

/**
 * Превращает облако точек в признаки: форма (центр в нуле, размер 1), пропорции и высота
 * относительно строки. `lineHeight` — высота обычной буквы в тех же единицах.
 */
export function featuresFromPoints(points: Point[], lineHeight: number): LetterFeatures | null {
  if (points.length === 0 || lineHeight <= 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  const w = maxX - minX;
  const h = maxY - minY;
  const scale = Math.max(w, h, 1e-3);
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
  return {
    points: points.map((p) => ({ x: (p.x - cx) / scale, y: (p.y - cy) / scale })),
    aspect: clamp(w / Math.max(h, 1e-3), 0.05, 20),
    heightRatio: clamp(h / lineHeight, 0.02, 5),
  };
}

export function featuresFromStrokes(strokes: Stroke[], lineHeight: number): LetterFeatures | null {
  return featuresFromPoints(resampleStrokes(strokes, CLOUD_SIZE), lineHeight);
}

/** Симметричное расстояние между облаками: средняя дистанция до ближайшей точки в обе стороны. */
export function chamfer(a: Point[], b: Point[]): number {
  if (a.length === 0 || b.length === 0) return Infinity;
  const oneWay = (from: Point[], to: Point[]) => {
    let sum = 0;
    for (const p of from) {
      let best = Infinity;
      for (const q of to) {
        const d = (p.x - q.x) ** 2 + (p.y - q.y) ** 2;
        if (d < best) best = d;
      }
      sum += Math.sqrt(best);
    }
    return sum / from.length;
  };
  return (oneWay(a, b) + oneWay(b, a)) / 2;
}

export function templateDistance(f: LetterFeatures, t: LetterFeatures): number {
  return (
    chamfer(f.points, t.points) +
    RECOGNIZER.aspectWeight * Math.abs(Math.log(f.aspect / t.aspect)) +
    RECOGNIZER.heightWeight * Math.abs(Math.log(f.heightRatio / t.heightRatio))
  );
}

/** Для каждой буквы берёт лучший из её шаблонов и сортирует по похожести. */
export function rank(f: LetterFeatures, templates: Template[]): Ranked[] {
  const best = new Map<string, number>();
  for (const t of templates) {
    const d = templateDistance(f, t);
    const prev = best.get(t.letter);
    if (prev === undefined || d < prev) best.set(t.letter, d);
  }
  return [...best.entries()].map(([letter, distance]) => ({ letter, distance })).sort((a, b) => a.distance - b.distance);
}

/** Проверяет, что нарисована ожидаемая буква. */
export function checkLetter(f: LetterFeatures, templates: Template[], expected: string): LetterCheck {
  const ranking = rank(f, templates);
  const mine = ranking.find((r) => r.letter === expected);
  const top = ranking[0];
  if (!mine || !top) return { ok: false, best: top?.letter ?? "", distance: Infinity, ranking };
  const ok = mine.distance <= RECOGNIZER.maxDistance && mine.distance <= top.distance * RECOGNIZER.slack;
  return { ok, best: top.letter, distance: mine.distance, ranking };
}

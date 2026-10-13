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

/** Равномерно по длине линии берёт `count` точек со всех штрихов. */
export function resampleStrokes(strokes: Stroke[], count: number): Point[] {
  const segments: { a: Point; b: Point; length: number }[] = [];
  let total = 0;
  for (const stroke of strokes) {
    for (let i = 1; i < stroke.length; i++) {
      const length = Math.hypot(stroke[i - 1]!.x - stroke[i]!.x, stroke[i - 1]!.y - stroke[i]!.y);
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

// Расстояние между облаками считается тысячи раз на одну проверку буквы (шаблонов сотни), а у бесплатного тарифа
// Workers на запрос всего 10 мс процессорного времени. Поэтому координаты лежат в плоских Float64Array
// (x1, y1, x2, y2, ...), а матрица расстояний считается один раз для обеих сторон.

const flatCache = new WeakMap<Point[], Float64Array>();

/** Плоский массив координат облака; для одного и того же массива точек строится один раз. */
function flatten(points: Point[]): Float64Array {
  let flat = flatCache.get(points);
  if (!flat) {
    flat = new Float64Array(points.length * 2);
    for (let i = 0; i < points.length; i++) {
      flat[i * 2] = points[i]!.x;
      flat[i * 2 + 1] = points[i]!.y;
    }
    flatCache.set(points, flat);
  }
  return flat;
}

let columnMin = new Float64Array(CLOUD_SIZE * 2);

/**
 * Симметричное расстояние между облаками: средняя дистанция до ближайшей точки в обе стороны.
 * Каждое квадратное расстояние считается один раз и идёт и в минимум по строке, и в минимум по столбцу;
 * суммы берутся в том же порядке, что и в прямой реализации, поэтому результат совпадает с ней.
 */
function chamferFlat(a: Float64Array, b: Float64Array): number {
  const n = a.length / 2;
  const m = b.length / 2;
  if (columnMin.length < m) columnMin = new Float64Array(m);
  const col = columnMin;
  col.fill(Infinity, 0, m);

  let rowSum = 0;
  for (let i = 0; i < n; i++) {
    const ax = a[i * 2]!;
    const ay = a[i * 2 + 1]!;
    let best = Infinity;
    for (let j = 0; j < m; j++) {
      const dx = ax - b[j * 2]!;
      const dy = ay - b[j * 2 + 1]!;
      const d = dx * dx + dy * dy;
      if (d < best) best = d;
      if (d < col[j]!) col[j] = d;
    }
    rowSum += Math.sqrt(best);
  }
  let colSum = 0;
  for (let j = 0; j < m; j++) colSum += Math.sqrt(col[j]!);
  return (rowSum / n + colSum / m) / 2;
}

export function chamfer(a: Point[], b: Point[]): number {
  if (a.length === 0 || b.length === 0) return Infinity;
  return chamferFlat(flatten(a), flatten(b));
}

// Нижняя оценка расстояния через сетку. Облако (центр в нуле, большая сторона 1) лежит в квадрате [-0.5; 0.5].
// Квадрат делится на GRID x GRID клеток. Для облака считается, как далеко центр каждой клетки от ближайшей занятой клетки.
// Точка внутри клетки отстоит от её центра не больше чем на полдиагонали, поэтому настоящее расстояние от точки
// рисунка до ближайшей точки шаблона не меньше «расстояние между центрами клеток минус две полдиагонали».
// Сумма таких оценок по точкам не больше настоящего расстояния Чамфера, а стоит она ~100 обращений к таблице вместо ~4600
// вычислений. Если даже оценка не позволяет шаблону оказаться заметно ближе ожидаемой буквы, облако считать не нужно.
const GRID = 16;
/** Запас на точки шаблонов, чуть вышедшие за квадрат из-за округления в JSON (до 0.0005), и на погрешность чисел. */
const BOUND_MARGIN = 0.002;
const BOUND_LOSS = Math.SQRT2 / GRID + BOUND_MARGIN;
const FAR = 1e9;

interface CloudIndex {
  /** Клетки облака в порядке точек. */
  cells: Uint16Array;
  /** Нижняя оценка расстояния до облака для точки, попавшей в клетку (по индексу клетки). */
  bound: Float64Array;
}

const indexCache = new WeakMap<Point[], CloudIndex>();

/** Квадраты расстояний вдоль одной линии (алгоритм Фельценсвальба): d[q] = min_p ((q - p)^2 + f[p]). */
function distanceLine(f: Float64Array, d: Float64Array, v: Int32Array, z: Float64Array): void {
  const n = f.length;
  let k = 0;
  v[0] = 0;
  z[0] = -Infinity;
  z[1] = Infinity;
  for (let q = 1; q < n; q++) {
    let s = (f[q]! + q * q - (f[v[k]!]! + v[k]! * v[k]!)) / (2 * q - 2 * v[k]!);
    while (s <= z[k]!) {
      k--;
      s = (f[q]! + q * q - (f[v[k]!]! + v[k]! * v[k]!)) / (2 * q - 2 * v[k]!);
    }
    k++;
    v[k] = q;
    z[k] = s;
    z[k + 1] = Infinity;
  }
  k = 0;
  for (let q = 0; q < n; q++) {
    while (z[k + 1]! < q) k++;
    d[q] = (q - v[k]!) * (q - v[k]!) + f[v[k]!]!;
  }
}

function cloudIndex(points: Point[]): CloudIndex {
  let index = indexCache.get(points);
  if (index) return index;

  const cells = new Uint16Array(points.length);
  const grid = new Float64Array(GRID * GRID).fill(FAR);
  const clampCell = (v: number) => Math.min(GRID - 1, Math.max(0, Math.floor((v + 0.5) * GRID)));
  for (let i = 0; i < points.length; i++) {
    const cell = clampCell(points[i]!.y) * GRID + clampCell(points[i]!.x);
    cells[i] = cell;
    grid[cell] = 0;
  }

  // Двумерное преобразование расстояний: сначала по столбцам, затем по строкам.
  const line = new Float64Array(GRID);
  const out = new Float64Array(GRID);
  const v = new Int32Array(GRID);
  const z = new Float64Array(GRID + 1);
  for (let x = 0; x < GRID; x++) {
    for (let y = 0; y < GRID; y++) line[y] = grid[y * GRID + x]!;
    distanceLine(line, out, v, z);
    for (let y = 0; y < GRID; y++) grid[y * GRID + x] = out[y]!;
  }
  for (let y = 0; y < GRID; y++) {
    for (let x = 0; x < GRID; x++) line[x] = grid[y * GRID + x]!;
    distanceLine(line, out, v, z);
    for (let x = 0; x < GRID; x++) grid[y * GRID + x] = out[x]!;
  }

  const bound = new Float64Array(GRID * GRID);
  for (let c = 0; c < bound.length; c++) bound[c] = Math.max(0, Math.sqrt(grid[c]!) / GRID - BOUND_LOSS);
  index = { cells, bound };
  indexCache.set(points, index);
  return index;
}

/**
 * Заранее строит для шаблонов всё, что иначе строилось бы при первой проверке (плоские массивы и сетки оценки).
 * Сервер вызывает это при запуске процесса, чтобы первый запрос после простоя не тратил на подготовку лимит
 * процессорного времени запроса. На результат проверки не влияет.
 */
export function warmUpTemplates(templates: Template[]): void {
  for (const t of templates) {
    flatten(t.points);
    cloudIndex(t.points);
  }
}

/** Число, которое заведомо не больше `chamfer(a, b)` (проверяется тестом). Считается быстро. */
export function chamferLowerBound(a: Point[], b: Point[]): number {
  if (a.length === 0 || b.length === 0) return Infinity;
  const ia = cloudIndex(a);
  const ib = cloudIndex(b);
  let sumA = 0;
  for (let i = 0; i < ia.cells.length; i++) sumA += ib.bound[ia.cells[i]!]!;
  let sumB = 0;
  for (let i = 0; i < ib.cells.length; i++) sumB += ia.bound[ib.cells[i]!]!;
  return (sumA / ia.cells.length + sumB / ib.cells.length) / 2;
}

/** Добавка к расстоянию за различие пропорций и высоты (не меньше нуля). */
function shapeExtra(f: LetterFeatures, t: LetterFeatures): number {
  return (
    RECOGNIZER.aspectWeight * Math.abs(Math.log(f.aspect / t.aspect)) +
    RECOGNIZER.heightWeight * Math.abs(Math.log(f.heightRatio / t.heightRatio))
  );
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

/** Проверяет, что нарисована ожидаемая буква. Возвращает ещё и полный список похожести (для стенда и подсказок). */
export function checkLetter(f: LetterFeatures, templates: Template[], expected: string): LetterCheck {
  const ranking = rank(f, templates);
  const mine = ranking.find((r) => r.letter === expected);
  const top = ranking[0];
  if (!mine || !top) return { ok: false, best: top?.letter ?? "", distance: Infinity, ranking };
  const ok = mine.distance <= RECOGNIZER.maxDistance && mine.distance <= top.distance * RECOGNIZER.slack;
  return { ok, best: top.letter, distance: mine.distance, ranking };
}

/**
 * Принята ли ожидаемая буква. Решение то же, что у `checkLetter(...).ok`, но без полного списка и с досрочными выходами:
 * сначала считаются только шаблоны ожидаемой буквы, при слишком большом расстоянии остальные не нужны, а среди остальных
 * достаточно найти один, который заметно ближе. Это основной путь приложения и сервера (см. тест «решения совпадают»).
 *
 * Вывод: пусть `mine` — лучшее расстояние до шаблонов ожидаемой буквы, `top` — лучшее среди всех (top ≤ mine).
 * Условие `mine <= top * slack` нарушается только тогда, когда у какого-то шаблона другой буквы `d * slack < mine`.
 */
export function isLetterAccepted(f: LetterFeatures, templates: Template[], expected: string): boolean {
  let mine = Infinity;
  for (const t of templates) {
    if (t.letter !== expected) continue;
    const d = templateDistance(f, t);
    if (d < mine) mine = d;
  }
  const { maxDistance, slack } = RECOGNIZER;
  if (!(mine <= maxDistance)) return false;
  // При slack < 1 даже совпадение с лучшей буквой не проходит (как в checkLetter).
  if (mine > mine * slack) return false;

  // Шаблон другой буквы нарушает условие, только если d * slack < mine. Расстояние d не меньше добавки за форму плюс
  // нижней оценки по сетке: если с ними нарушения нет, облако считать не нужно (допуск 1e-9 на погрешность чисел
  // делает пропуск только осторожнее).
  const keep = mine * (1 + 1e-9);
  for (const t of templates) {
    if (t.letter === expected) continue;
    const extra = shapeExtra(f, t);
    if (extra * slack >= keep) continue;
    if ((chamferLowerBound(f.points, t.points) + extra) * slack >= keep) continue;
    if (templateDistance(f, t) * slack < mine) return false;
  }
  return true;
}

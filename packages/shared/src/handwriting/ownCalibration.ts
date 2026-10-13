// Шаблоны, записанные владельцем, и проверка распознавателя на них.
// Чистый TypeScript: используется инструментом tools/own-templates.ts и тестами.
import { CANVAS_LINE_HEIGHT } from "./canvas";
import { HEBREW_LETTERS } from "../constants";
import { RECOGNIZER, featuresFromStrokes, rank } from "./recognizer";
import { buildTemplates, type RawTemplate } from "./templates";
import type { Ranked, Stroke, Template } from "./types";

/** Рисунок, как он лежит в data/handwriting/own-strokes.json (выгрузка из таблицы letter_templates в D1). */
export interface RecordedDrawing {
  letter: string;
  slot: number;
  strokes: Stroke[];
}

const COORD_DECIMALS = 4;

/** Шаблон из рисунка: те же признаки, что считаются при проверке буквы, поэтому сравнение честное. */
export function rawTemplateFromDrawing(drawing: RecordedDrawing, lineHeight = CANVAS_LINE_HEIGHT): RawTemplate | null {
  const f = featuresFromStrokes(drawing.strokes, lineHeight);
  if (!f) return null;
  const k = 10 ** COORD_DECIMALS;
  const round = (v: number) => Math.round(v * k) / k;
  return {
    letter: drawing.letter,
    source: "own",
    aspect: round(f.aspect),
    heightRatio: round(f.heightRatio),
    points: f.points.flatMap((p) => [round(p.x), round(p.y)]),
  };
}

/** Рисунки в порядке формы по алфавиту и номера варианта; неизвестные формы и пустые рисунки пропускаются. */
export function sortDrawings(drawings: RecordedDrawing[]): RecordedDrawing[] {
  const order = (letter: string) => (HEBREW_LETTERS as readonly string[]).indexOf(letter);
  return drawings
    .filter((d) => order(d.letter) >= 0 && d.strokes.length > 0)
    .sort((a, b) => order(a.letter) - order(b.letter) || a.slot - b.slot);
}

/** Содержимое ownTemplates.json. */
export function buildOwnTemplates(drawings: RecordedDrawing[], lineHeight = CANVAS_LINE_HEIGHT): RawTemplate[] {
  return sortDrawings(drawings).flatMap((d) => rawTemplateFromDrawing(d, lineHeight) ?? []);
}

export interface LetterReport {
  letter: string;
  drawings: number;
  accepted: number;
  /** Номера вариантов, которые распознаватель не принял за свою букву. */
  rejectedSlots: number[];
  /** Среднее и наибольшее расстояние от рисунков до своей буквы (чем меньше, тем лучше). */
  meanDistance: number;
  maxDistance: number;
  /** Наименьшее расстояние от рисунков этой буквы до чужой буквы и до какой именно. */
  nearestWrong: { letter: string; distance: number } | null;
}

export interface PairCount {
  drawn: string;
  other: string;
  count: number;
}

export interface EvaluationReport {
  drawings: number;
  accepted: number;
  /** Доля принятых верных букв. */
  acceptRate: number;
  /** Доля принятых рисунков среди всех пар «нарисована X, а нужна Y». */
  falseAcceptRate: number;
  letters: LetterReport[];
  /** Чаще всего рисунок X больше похож на Y (первое место в списке), по убыванию. */
  confusions: PairCount[];
  /** Чаще всего рисунок X принят как Y (обман), по убыванию. */
  falseAccepts: PairCount[];
}

export type EvaluationMode =
  /** Против шрифтов и остальных рисунков владельца (без самого рисунка): честная оценка на новых рисунках. */
  | "leave-one-out"
  /** Только против шрифтов: каково распознавание без записанных шаблонов. */
  | "fonts";

/**
 * Прогоняет рисунки через распознаватель с текущими параметрами RECOGNIZER и собирает отчёт.
 * `fonts` — шаблоны из шрифтов (loadBaseTemplates).
 */
export function evaluateDrawings(
  drawings: RecordedDrawing[],
  fonts: Template[],
  mode: EvaluationMode = "leave-one-out",
  lineHeight = CANVAS_LINE_HEIGHT,
): EvaluationReport {
  const sorted = sortDrawings(drawings);
  const raws = sorted.map((d) => rawTemplateFromDrawing(d, lineHeight));
  const own = buildTemplates(raws.filter((r): r is RawTemplate => r !== null));
  // Соответствие рисунка и его шаблона (пустые рисунки в шаблоны не попали).
  const ownIndex = new Map<RecordedDrawing, number>();
  let next = 0;
  sorted.forEach((d, i) => {
    if (raws[i]) ownIndex.set(d, next++);
  });

  const perLetter = new Map<string, { distances: number[]; rejected: number[]; wrong: Ranked | null }>();
  const confusion = new Map<string, number>();
  const falseAccept = new Map<string, number>();
  let accepted = 0;
  let evaluated = 0;
  let pairs = 0;
  let falsePairs = 0;

  for (const d of sorted) {
    const index = ownIndex.get(d);
    if (index === undefined) continue;
    const f = featuresFromStrokes(d.strokes, lineHeight)!;
    const templates = mode === "fonts" ? fonts : [...fonts, ...own.filter((_, j) => j !== index)];
    const ranking = rank(f, templates);
    const top = ranking[0];
    if (!top) continue;
    evaluated++;
    const ok = (r: Ranked) => r.distance <= RECOGNIZER.maxDistance && r.distance <= top.distance * RECOGNIZER.slack;

    const mine = ranking.find((r) => r.letter === d.letter);
    const entry = perLetter.get(d.letter) ?? { distances: [], rejected: [], wrong: null };
    if (mine && ok(mine)) accepted++;
    else entry.rejected.push(d.slot);
    entry.distances.push(mine?.distance ?? Infinity);
    perLetter.set(d.letter, entry);

    if (top.letter !== d.letter) {
      const key = `${d.letter}>${top.letter}`;
      confusion.set(key, (confusion.get(key) ?? 0) + 1);
    }
    for (const r of ranking) {
      if (r.letter === d.letter) continue;
      pairs++;
      if (!entry.wrong || r.distance < entry.wrong.distance) entry.wrong = r;
      if (ok(r)) {
        falsePairs++;
        const key = `${d.letter}>${r.letter}`;
        falseAccept.set(key, (falseAccept.get(key) ?? 0) + 1);
      }
    }
  }

  const letters: LetterReport[] = HEBREW_LETTERS.flatMap((letter) => {
    const e = perLetter.get(letter);
    if (!e) return [];
    const finite = e.distances.filter(Number.isFinite);
    return [
      {
        letter,
        drawings: e.distances.length,
        accepted: e.distances.length - e.rejected.length,
        rejectedSlots: e.rejected,
        meanDistance: finite.length ? finite.reduce((s, v) => s + v, 0) / finite.length : Infinity,
        maxDistance: finite.length ? Math.max(...finite) : Infinity,
        nearestWrong: e.wrong ? { letter: e.wrong.letter, distance: e.wrong.distance } : null,
      },
    ];
  });

  const toPairs = (m: Map<string, number>): PairCount[] =>
    [...m]
      .map(([key, count]) => {
        const [drawn = "", other = ""] = key.split(">");
        return { drawn, other, count };
      })
      .sort((a, b) => b.count - a.count || a.drawn.localeCompare(b.drawn));

  return {
    drawings: evaluated,
    accepted,
    acceptRate: evaluated ? accepted / evaluated : 0,
    falseAcceptRate: pairs ? falsePairs / pairs : 0,
    letters,
    confusions: toPairs(confusion),
    falseAccepts: toPairs(falseAccept),
  };
}

export type RecognizerParams = Partial<typeof RECOGNIZER>;

/** Выполняет `fn` с временно изменёнными параметрами распознавателя и возвращает всё как было. */
export function withRecognizer<T>(params: RecognizerParams, fn: () => T): T {
  const saved = { ...RECOGNIZER };
  Object.assign(RECOGNIZER, params);
  try {
    return fn();
  } finally {
    Object.assign(RECOGNIZER, saved);
  }
}

/** Строки из ответа D1 бывают массивом, { results: [...] } или { result: [{ results }] }: достаём сами строки. */
function rowsFrom(data: unknown): Record<string, unknown>[] {
  if (Array.isArray(data)) {
    const first = data[0];
    if (first && typeof first === "object" && "results" in first) {
      return data.flatMap((x) => rowsFrom((x as { results: unknown }).results));
    }
    return data as Record<string, unknown>[];
  }
  if (data && typeof data === "object") {
    const o = data as { results?: unknown; result?: unknown };
    if (o.results) return rowsFrom(o.results);
    if (o.result) return rowsFrom(o.result);
  }
  throw new Error("В выгрузке не нашлось строк из letter_templates");
}

/**
 * Рисунки из выгрузки таблицы letter_templates (SELECT letter, slot, strokes FROM letter_templates).
 * Штрихи в таблице лежат строкой JSON из плоских списков x, y; список точек {x, y} (как отдаёт API) тоже подходит.
 */
export function drawingsFromRows(data: unknown): RecordedDrawing[] {
  return rowsFrom(data).map((row, i) => {
    const raw = typeof row.strokes === "string" ? (JSON.parse(row.strokes) as unknown) : row.strokes;
    if (typeof row.letter !== "string" || typeof row.slot !== "number" || !Array.isArray(raw)) {
      throw new Error(`Строка ${i} не похожа на запись шаблона`);
    }
    const strokes: Stroke[] = raw.map((s: unknown) => {
      if (Array.isArray(s) && s.every((v) => typeof v === "number")) {
        return Array.from({ length: Math.floor(s.length / 2) }, (_, k) => ({ x: s[k * 2] as number, y: s[k * 2 + 1] as number }));
      }
      return s as Stroke;
    });
    return { letter: row.letter, slot: row.slot, strokes };
  });
}

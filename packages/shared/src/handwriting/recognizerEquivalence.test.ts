import { describe, expect, it } from "vitest";
import { loadBaseTemplates } from "./templates";
import { HEBREW_LETTERS } from "../constants";
import {
  RECOGNIZER,
  checkLetter,
  chamfer,
  chamferLowerBound,
  featuresFromPoints,
  isLetterAccepted,
  templateDistance,
  warmUpTemplates,
} from "./recognizer";
import type { LetterFeatures, Point, Template } from "./types";

// Прямая реализация, какой она была до ускорения: объекты точек, два отдельных прохода, возведение в степень.
// Ускоренный код обязан принимать и отклонять буквы точно так же.
function naiveChamfer(a: Point[], b: Point[]): number {
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

function naiveDistance(f: LetterFeatures, t: LetterFeatures): number {
  return (
    naiveChamfer(f.points, t.points) +
    RECOGNIZER.aspectWeight * Math.abs(Math.log(f.aspect / t.aspect)) +
    RECOGNIZER.heightWeight * Math.abs(Math.log(f.heightRatio / t.heightRatio))
  );
}

function naiveAccepts(f: LetterFeatures, templates: Template[], expected: string): boolean {
  const best = new Map<string, number>();
  for (const t of templates) {
    const d = naiveDistance(f, t);
    const prev = best.get(t.letter);
    if (prev === undefined || d < prev) best.set(t.letter, d);
  }
  const ranking = [...best.entries()].sort((a, b) => a[1] - b[1]);
  const mine = best.get(expected);
  const top = ranking[0];
  if (mine === undefined || !top) return false;
  return mine <= RECOGNIZER.maxDistance && mine <= top[1] * RECOGNIZER.slack;
}

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Рисунок «чужой рукой»: поворот, растяжение, наклон, дрожание (как в стенде, tools/handwriting-lab.mjs). */
function sketch(t: Template, rng: () => number, strength: number): LetterFeatures {
  const lineHeight = 100;
  const h = t.heightRatio * lineHeight;
  const scale = t.aspect <= 1 ? h : h * t.aspect;
  const angle = (((rng() * 2 - 1) * 12 * Math.PI) / 180) * strength;
  const sx = 1 + (rng() * 2 - 1) * 0.2 * strength;
  const sy = 1 + (rng() * 2 - 1) * 0.2 * strength;
  const shear = (rng() * 2 - 1) * 0.2 * strength;
  const jitter = 0.018 * lineHeight * strength;
  const points = t.points.map((p) => {
    let x = p.x * scale * sx;
    let y = p.y * scale * sy;
    x += shear * y;
    return {
      x: x * Math.cos(angle) - y * Math.sin(angle) + (rng() - 0.5) * 2 * jitter,
      y: x * Math.sin(angle) + y * Math.cos(angle) + (rng() - 0.5) * 2 * jitter,
    };
  });
  return featuresFromPoints(points, lineHeight)!;
}

describe("ускоренное распознавание даёт те же решения", () => {
  it("расстояние между облаками совпадает с прямой реализацией", async () => {
    const templates = await loadBaseTemplates();
    const rng = mulberry32(7);
    for (let i = 0; i < 40; i++) {
      const a = templates[Math.floor(rng() * templates.length)]!;
      const b = templates[Math.floor(rng() * templates.length)]!;
      expect(chamfer(a.points, b.points)).toBeCloseTo(naiveChamfer(a.points, b.points), 12);
      expect(templateDistance(a, b)).toBeCloseTo(naiveDistance(a, b), 12);
    }
  });

  it("нижняя оценка по сетке никогда не больше настоящего расстояния", async () => {
    const templates = await loadBaseTemplates();
    const rng = mulberry32(31);
    let tight = 0;
    for (let i = 0; i < 600; i++) {
      const source = templates[Math.floor(rng() * templates.length)]!;
      const other = templates[Math.floor(rng() * templates.length)]!;
      // Рисунок с сильным искажением и дрожанием, в том числе выходящий к краям квадрата.
      const drawn = sketch(source, rng, 0.5 + rng() * 2);
      const exact = naiveChamfer(drawn.points, other.points);
      const bound = chamferLowerBound(drawn.points, other.points);
      expect(bound).toBeLessThanOrEqual(exact);
      expect(bound).toBeGreaterThanOrEqual(0);
      if (bound > exact * 0.5) tight++;
    }
    // Оценка не должна быть бесполезной: заметная доля пар оценивается с точностью лучше двух раз.
    expect(tight).toBeGreaterThan(150);
  });

  it("isLetterAccepted и checkLetter решают так же, как прямая реализация", async () => {
    const templates = await loadBaseTemplates();
    const rng = mulberry32(2024);
    let accepted = 0;
    let rejected = 0;
    // Каждый шаблон рисуем со средним и сильным искажением и сверяем с верной буквой и со случайной чужой.
    for (const source of templates.filter((_, i) => i % 3 === 0)) {
      for (const strength of [0.8, 1.6]) {
        const drawn = sketch(source, rng, strength);
        const wrong = HEBREW_LETTERS[Math.floor(rng() * HEBREW_LETTERS.length)]!;
        for (const expected of [source.letter, wrong]) {
          const truth = naiveAccepts(drawn, templates, expected);
          expect(isLetterAccepted(drawn, templates, expected), `${source.letter} как ${expected}`).toBe(truth);
          expect(checkLetter(drawn, templates, expected).ok, `${source.letter} как ${expected} (checkLetter)`).toBe(truth);
          if (truth) accepted++;
          else rejected++;
        }
      }
    }
    // Проверка осмысленна, только если встретились и принятые, и отклонённые буквы.
    expect(accepted).toBeGreaterThan(20);
    expect(rejected).toBeGreaterThan(20);
    // Прямая реализация медленная: здесь около 3 с, на сборщике Cloudflare больше 5 с (сборка 16.10 упала по таймауту).
  }, 60_000);

  it("при slack меньше 1 решение тоже совпадает (стенд перебирает параметры)", async () => {
    const templates = await loadBaseTemplates();
    const saved = { ...RECOGNIZER };
    try {
      RECOGNIZER.slack = 0.9;
      const rng = mulberry32(5);
      for (const source of templates.filter((_, i) => i % 20 === 0)) {
        const drawn = sketch(source, rng, 1);
        expect(isLetterAccepted(drawn, templates, source.letter)).toBe(naiveAccepts(drawn, templates, source.letter));
      }
    } finally {
      Object.assign(RECOGNIZER, saved);
    }
  });

  it("прогрев шаблонов не меняет решений", async () => {
    const templates = await loadBaseTemplates();
    const rng = mulberry32(77);
    const cases = templates.filter((_, i) => i % 9 === 0).map((source) => ({ source, drawn: sketch(source, rng, 1.2) }));
    const before = cases.map(({ source, drawn }) => isLetterAccepted(drawn, templates, source.letter));
    warmUpTemplates(templates);
    const after = cases.map(({ source, drawn }) => isLetterAccepted(drawn, templates, source.letter));
    expect(after).toEqual(before);
    expect(after.filter(Boolean).length).toBeGreaterThan(5);
  });

  it("буква без шаблонов не принимается", async () => {
    const templates = await loadBaseTemplates();
    const drawn = sketch(templates[0]!, mulberry32(1), 1);
    expect(isLetterAccepted(drawn, templates, "x")).toBe(false);
  });
});

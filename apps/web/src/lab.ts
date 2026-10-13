// Лаборатория: измеряет, насколько хорошо распознаются буквы, нарисованные «другим почерком».
// «Пользователь» берёт буквы одного шрифта и искажает их, шаблоны строятся из другого шрифта.
import "./lib/handwriting/fonts";
import {
  HEBREW_LETTERS,
  RECOGNIZER,
  checkLetter,
  featuresFromPoints,
  rank,
  type Point,
  type Template,
} from "@milav/shared";
import { GLYPH_FONTS, REFERENCE_HEIGHT, rasterizeFont, templatesFromSkeletons } from "./lib/handwriting/glyphTemplates";

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Искажение, имитирующее руку: поворот, разное растяжение по осям, наклон, дрожание. */
function distort(points: Point[], rng: () => number, strength: number): Point[] {
  const angle = ((rng() * 2 - 1) * 12 * Math.PI) / 180 * strength;
  const sx = 1 + (rng() * 2 - 1) * 0.2 * strength;
  const sy = 1 + (rng() * 2 - 1) * 0.2 * strength;
  const shear = (rng() * 2 - 1) * 0.2 * strength;
  const jitter = 1.8 * strength;
  const cx = points.reduce((s, p) => s + p.x, 0) / points.length;
  const cy = points.reduce((s, p) => s + p.y, 0) / points.length;
  return points.map((p) => {
    let x = (p.x - cx) * sx;
    let y = (p.y - cy) * sy;
    x += shear * y;
    const rx = x * Math.cos(angle) - y * Math.sin(angle);
    const ry = x * Math.sin(angle) + y * Math.cos(angle);
    return { x: rx + (rng() - 0.5) * 2 * jitter, y: ry + (rng() - 0.5) * 2 * jitter };
  });
}

interface Params {
  aspectWeight?: number;
  heightWeight?: number;
  maxDistance?: number;
  slack?: number;
}

async function run(params: Params, strength: number, trials: number, sameFont = false, fontNames?: string[]) {
  Object.assign(RECOGNIZER, params);
  const chosen = GLYPH_FONTS.filter((f) => !fontNames || fontNames.includes(f.family));
  const skeletons = await Promise.all(chosen.map(async (f) => ({ f, sk: await rasterizeFont(f) })));
  const rng = mulberry32(12345);

  let samples = 0;
  let top1 = 0;
  let accepted = 0;
  let falseAccepts = 0;
  let falseChecks = 0;
  const confusions = new Map<string, number>();
  const perFont = new Map<string, { n: number; ok: number }>();
  const perLetter = new Map<string, { n: number; ok: number }>();

  for (const user of skeletons) {
    const sources = sameFont ? [user] : skeletons.filter((s) => s.f !== user.f);
    const templates: Template[] = sources.flatMap((o) => templatesFromSkeletons(o.sk, o.f.source));
    for (const letter of HEBREW_LETTERS) {
      const base = user.sk.get(letter);
      if (!base) continue;
      for (let i = 0; i < trials; i++) {
        const drawn = distort(base, rng, strength);
        // Пользователь рисует в масштабе строки: размер вариативен ±15%.
        const zoom = 0.85 + rng() * 0.3;
        const scaled = drawn.map((p) => ({ x: p.x * zoom, y: p.y * zoom }));
        const features = featuresFromPoints(scaled, REFERENCE_HEIGHT * zoom);
        if (!features) continue;
        samples++;
        const ranking = rank(features, templates);
        if (ranking[0]!.letter === letter) top1++;
        else {
          const key = `${letter}→${ranking[0]!.letter}`;
          confusions.set(key, (confusions.get(key) ?? 0) + 1);
        }
        const stat = perLetter.get(letter) ?? { n: 0, ok: 0 };
        const fstat = perFont.get(user.f.family) ?? { n: 0, ok: 0 };
        stat.n++;
        fstat.n++;
        if (checkLetter(features, templates, letter).ok) {
          accepted++;
          stat.ok++;
          fstat.ok++;
        }
        perFont.set(user.f.family, fstat);
        perLetter.set(letter, stat);
        for (const wrong of HEBREW_LETTERS) {
          if (wrong === letter) continue;
          falseChecks++;
          if (checkLetter(features, templates, wrong).ok) falseAccepts++;
        }
      }
    }
  }
  const worst = [...perLetter.entries()]
    .map(([letter, s]) => ({ letter, rate: s.ok / s.n }))
    .sort((a, b) => a.rate - b.rate)
    .slice(0, 6);
  const topConfusions = [...confusions.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
  return {
    params: { ...RECOGNIZER },
    strength,
    samples,
    top1: +(top1 / samples).toFixed(3),
    acceptRate: +(accepted / samples).toFixed(3),
    falseAcceptRate: +(falseAccepts / falseChecks).toFixed(4),
    perFont: [...perFont.entries()].map(([font, v]) => ({ font, accept: +(v.ok / v.n).toFixed(2) })),
    worst,
    topConfusions,
  };
}

/** Выгружает базовые шаблоны из всех шрифтов в компактном виде (см. tools/build-glyph-templates.mjs). */
async function exportTemplates() {
  const out: { letter: string; source: string; aspect: number; heightRatio: number; points: number[] }[] = [];
  for (const font of GLYPH_FONTS) {
    const skeletons = await rasterizeFont(font);
    for (const t of templatesFromSkeletons(skeletons, font.source)) {
      out.push({
        letter: t.letter,
        source: t.source,
        aspect: +t.aspect.toFixed(3),
        heightRatio: +t.heightRatio.toFixed(3),
        points: t.points.flatMap((p) => [+p.x.toFixed(3), +p.y.toFixed(3)]),
      });
    }
  }
  return out;
}

(window as unknown as { lab: unknown }).lab = { run, exportTemplates };
document.title = "lab-ready";

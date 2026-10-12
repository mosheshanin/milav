import type { Template } from "./types";

interface RawTemplate {
  letter: string;
  source: string;
  aspect: number;
  heightRatio: number;
  /** Плоский список координат: x1, y1, x2, y2, ... */
  points: number[];
}

let cache: Promise<Template[]> | null = null;

/**
 * Базовые шаблоны букв из шрифтов. Файл создаёт tools/build-glyph-templates.mjs.
 * Подгружается отдельным куском только когда нужен этап письма.
 */
export function loadBaseTemplates(): Promise<Template[]> {
  cache ??= import("./baseTemplates.json").then((module) =>
    (module.default as RawTemplate[]).map((t) => ({
      letter: t.letter,
      source: t.source,
      aspect: t.aspect,
      heightRatio: t.heightRatio,
      points: Array.from({ length: t.points.length / 2 }, (_, i) => ({
        x: t.points[i * 2]!,
        y: t.points[i * 2 + 1]!,
      })),
    })),
  );
  cache.catch(() => {
    cache = null;
  });
  return cache;
}

import type { Template } from "./types";

/** Шаблон в файле: плоский список координат нужен, чтобы JSON был компактным. */
export interface RawTemplate {
  letter: string;
  /** Откуда шаблон: `font:<семейство>` для шрифтов, `own` для записанных владельцем. */
  source: string;
  aspect: number;
  heightRatio: number;
  /** Плоский список координат: x1, y1, x2, y2, ... */
  points: number[];
}

/** Превращает шаблоны из файлов в рабочий вид. Порядок сохраняется (сначала первый список). Клиент и сервер собирают набор этой функцией. */
export function buildTemplates(...lists: RawTemplate[][]): Template[] {
  return lists.flatMap((list) =>
    list.map((t) => ({
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
}

// Файлы шаблонов подгружаются отдельными кусками и только когда нужен этап письма.
// Сервер читает те же файлы, но статически и при запуске (staticTemplates.ts).
let baseCache: Promise<Template[]> | null = null;
let allCache: Promise<Template[]> | null = null;

/** Только шаблоны из шрифтов (baseTemplates.json, создаёт tools/build-glyph-templates.mjs). Нужны тестам и стенду. */
export function loadBaseTemplates(): Promise<Template[]> {
  baseCache ??= import("./baseTemplates.json").then((m) => buildTemplates(m.default as RawTemplate[]));
  baseCache.catch(() => {
    baseCache = null;
  });
  return baseCache;
}

/**
 * Все шаблоны, по которым проверяются буквы: шрифты и записанные владельцем (ownTemplates.json).
 * Приложение и сервер используют один и тот же набор в одном и том же порядке.
 */
export function loadTemplates(): Promise<Template[]> {
  allCache ??= Promise.all([import("./baseTemplates.json"), import("./ownTemplates.json")]).then(([base, own]) =>
    buildTemplates(base.default as RawTemplate[], own.default as RawTemplate[]),
  );
  allCache.catch(() => {
    allCache = null;
  });
  return allCache;
}

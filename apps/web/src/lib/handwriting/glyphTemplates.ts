import { HEBREW_LETTERS } from "@milav/shared";
import { CLOUD_SIZE, featuresFromPoints } from "./recognizer";
import { bitmapPoints, samplePoints, thin } from "./skeleton";
import type { Point, Template } from "./types";

/**
 * Базовые шаблоны: буквы из шрифтов (рукописный и печатный) утончаются до линии.
 * Это стартовый набор. Позже к нему добавятся шаблоны, нарисованные людьми.
 */
export const GLYPH_FONTS = [
  { family: "Gveret Levin", source: "font:gveret-levin", weight: 400 },
  { family: "Playpen Sans Hebrew", source: "font:playpen", weight: 400 },
  { family: "Amatic SC", source: "font:amatic", weight: 400 },
  { family: "Karantina", source: "font:karantina", weight: 400 },
  { family: "Heebo", source: "font:heebo", weight: 400 },
  { family: "Assistant", source: "font:assistant", weight: 400 },
  { family: "Rubik", source: "font:rubik", weight: 400 },
  { family: "Alef", source: "font:alef", weight: 400 },
  { family: "Varela Round", source: "font:varela", weight: 400 },
  { family: "David Libre", source: "font:david", weight: 400 },
] as const;

export type GlyphFont = (typeof GLYPH_FONTS)[number];

const CANVAS_SIZE = 220;
/** Высота обычной буквы (א) в пикселях при растеризации; остальные подгоняются к ней. */
export const REFERENCE_HEIGHT = 100;

interface Ink {
  bitmap: Uint8Array;
  top: number;
  bottom: number;
}

function drawGlyph(ctx: CanvasRenderingContext2D, letter: string, font: GlyphFont, fontSize: number): Ink {
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
  ctx.fillStyle = "#000";
  ctx.font = `${font.weight} ${fontSize}px "${font.family}"`;
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.fillText(letter, CANVAS_SIZE / 2, CANVAS_SIZE * 0.62);

  const data = ctx.getImageData(0, 0, CANVAS_SIZE, CANVAS_SIZE).data;
  const bitmap = new Uint8Array(CANVAS_SIZE * CANVAS_SIZE);
  let top = CANVAS_SIZE;
  let bottom = -1;
  for (let y = 0; y < CANVAS_SIZE; y++) {
    for (let x = 0; x < CANVAS_SIZE; x++) {
      if ((data[(y * CANVAS_SIZE + x) * 4] ?? 255) < 128) {
        bitmap[y * CANVAS_SIZE + x] = 1;
        if (y < top) top = y;
        if (y > bottom) bottom = y;
      }
    }
  }
  return { bitmap, top, bottom };
}

/**
 * Линии-скелеты всех 27 форм из одного шрифта (облако точек в пикселях, высота «א» = REFERENCE_HEIGHT).
 * Требует браузера (canvas и загруженный шрифт).
 */
export async function rasterizeFont(font: GlyphFont): Promise<Map<string, Point[]>> {
  await document.fonts.load(`${font.weight} 64px "${font.family}"`, "אבג");
  const canvas = document.createElement("canvas");
  canvas.width = CANVAS_SIZE;
  canvas.height = CANVAS_SIZE;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("canvas недоступен");

  // Подбираем размер шрифта так, чтобы высота «א» равнялась REFERENCE_HEIGHT.
  const probe = drawGlyph(ctx, "א", font, 100);
  const probeHeight = probe.bottom - probe.top + 1;
  if (probeHeight <= 1) throw new Error(`шрифт ${font.family} не содержит иврит`);
  const fontSize = (100 * REFERENCE_HEIGHT) / probeHeight;

  const result = new Map<string, Point[]>();
  for (const letter of HEBREW_LETTERS) {
    const ink = drawGlyph(ctx, letter, font, fontSize);
    if (ink.bottom < 0) continue;
    const skeleton = thin(ink.bitmap, CANVAS_SIZE, CANVAS_SIZE);
    result.set(letter, samplePoints(bitmapPoints(skeleton, CANVAS_SIZE, CANVAS_SIZE), CLOUD_SIZE));
  }
  return result;
}

/** Превращает скелеты одного шрифта в шаблоны. */
export function templatesFromSkeletons(skeletons: Map<string, Point[]>, source: string): Template[] {
  const templates: Template[] = [];
  for (const [letter, points] of skeletons) {
    const features = featuresFromPoints(points, REFERENCE_HEIGHT);
    if (features) templates.push({ letter, source, ...features });
  }
  return templates;
}

let cache: Promise<Template[]> | null = null;

/** Шаблоны из всех шрифтов. Строятся один раз и кэшируются. */
export function loadGlyphTemplates(): Promise<Template[]> {
  cache ??= Promise.all(
    GLYPH_FONTS.map(async (font) => templatesFromSkeletons(await rasterizeFont(font), font.source)),
  ).then((all) => all.flat());
  cache.catch(() => {
    cache = null;
  });
  return cache;
}

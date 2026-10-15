// Запись шаблонов букв (скрытый инструмент владельца). Рисунки сохраняются в D1 (миграция 0004) как приёмник,
// в распознавание они попадают после выгрузки в репозиторий (tools/build-own-templates.mjs).
import {
  CANVAS_LINE_HEIGHT,
  HEBREW_LETTERS,
  TEMPLATE_VARIANTS_PER_LETTER,
  checkLetter,
  featuresFromStrokes,
  isLetterAccepted,
  roundStrokes,
  type Stroke,
  type TemplateItem,
  type TemplateSaveResponse,
} from "@milav/shared";
import { parseStrokes } from "./stageProof";
import { templates } from "./templates";

/** Самый маленький допустимый рисунок: большая сторона не короче четверти высоты обычной буквы (иначе это случайное касание). */
const MIN_SIZE = CANVAS_LINE_HEIGHT / 4;

export type TemplateInputError = "bad_letter" | "bad_slot" | "bad_strokes" | "too_small";

/** Проверяет форму и номер варианта. Возвращает разобранные значения или код ошибки. */
export function parseTemplateTarget(
  letter: unknown,
  slot: unknown,
): { ok: true; letter: string; slot: number } | { ok: false; error: TemplateInputError } {
  if (typeof letter !== "string" || !(HEBREW_LETTERS as readonly string[]).includes(letter)) {
    return { ok: false, error: "bad_letter" };
  }
  if (typeof slot !== "number" || !Number.isInteger(slot) || slot < 0 || slot >= TEMPLATE_VARIANTS_PER_LETTER) {
    return { ok: false, error: "bad_slot" };
  }
  return { ok: true, letter, slot };
}

/** Штрихи варианта: правильной формы, округлённые до 0,1 пикселя и не крошечные. */
export function parseTemplateStrokes(
  value: unknown,
): { ok: true; strokes: Stroke[] } | { ok: false; error: TemplateInputError } {
  const parsed = parseStrokes(value);
  if (!parsed) return { ok: false, error: "bad_strokes" };
  const strokes = roundStrokes(parsed);
  const points = strokes.flat();
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const size = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
  return size >= MIN_SIZE ? { ok: true, strokes } : { ok: false, error: "too_small" };
}

interface Row {
  letter: string;
  slot: number;
  strokes: string;
  recorded_at: string;
}

/** В базе штрих это плоский список x1, y1, x2, y2, ...: вдвое короче списка объектов. */
function packStrokes(strokes: Stroke[]): string {
  return JSON.stringify(strokes.map((stroke) => stroke.flatMap((p) => [p.x, p.y])));
}

function unpackStrokes(text: string): Stroke[] {
  const flat = JSON.parse(text) as number[][];
  return flat.map((stroke) => Array.from({ length: stroke.length / 2 }, (_, i) => ({ x: stroke[i * 2]!, y: stroke[i * 2 + 1]! })));
}

function toItem(row: Row): TemplateItem {
  return { letter: row.letter, slot: row.slot, strokes: unpackStrokes(row.strokes), recordedAt: row.recorded_at };
}

export async function listTemplates(db: D1Database): Promise<TemplateItem[]> {
  const { results } = await db
    .prepare("SELECT letter, slot, strokes, recorded_at FROM letter_templates ORDER BY letter, slot")
    .all<Row>();
  return results.map(toItem);
}

/** Записывает вариант. Если такой уже есть, заменяет его (так перезаписывают неудачный вариант). */
export async function saveTemplate(
  db: D1Database,
  userId: number,
  letter: string,
  slot: number,
  strokes: Stroke[],
): Promise<TemplateItem> {
  const row = await db
    .prepare(
      `INSERT INTO letter_templates (letter, slot, strokes, recorded_by) VALUES (?1, ?2, ?3, ?4)
       ON CONFLICT (letter, slot) DO UPDATE SET
         strokes = excluded.strokes, recorded_by = excluded.recorded_by, recorded_at = datetime('now')
       RETURNING letter, slot, strokes, recorded_at`,
    )
    .bind(letter, slot, packStrokes(strokes), userId)
    .first<Row>();
  if (!row) throw new Error("letter_templates: запись не вернула строку");
  return toItem(row);
}

/** Удаляет вариант. Возвращает false, если такого не было. */
export async function deleteTemplate(db: D1Database, letter: string, slot: number): Promise<boolean> {
  const result = await db.prepare("DELETE FROM letter_templates WHERE letter = ?1 AND slot = ?2").bind(letter, slot).run();
  return (result.meta?.changes ?? 0) > 0;
}

/**
 * Предупреждение при записи: принял бы распознаватель этот рисунок как ожидаемую букву и на какую букву он похож.
 * Считается по шаблонам, которые уже в репозитории (шрифты и ранее выгруженные), а не по тому, что лежит в базе.
 * Полный список похожести (около 5 мс) нужен только когда рисунок не принят.
 */
export function checkRecorded(letter: string, strokes: Stroke[]): Pick<TemplateSaveResponse, "accepted" | "looksLike"> {
  const features = featuresFromStrokes(strokes, CANVAS_LINE_HEIGHT);
  if (!features) return { accepted: false, looksLike: "" };
  if (isLetterAccepted(features, templates, letter)) return { accepted: true, looksLike: letter };
  return { accepted: false, looksLike: checkLetter(features, templates, letter).best };
}

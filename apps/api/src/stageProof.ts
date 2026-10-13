import {
  CANVAS_LINE_HEIGHT,
  MAX_POINTS_PER_LETTER,
  MAX_STROKES_PER_LETTER,
  checkLetter,
  featuresFromStrokes,
  loadBaseTemplates,
  wordLetters,
  type Stroke,
  type Word,
} from "@milav/shared";

/** Координаты точек холста не выходят за разумные пределы (холст около 400 x 220 пикселей). */
const MAX_COORDINATE = 5000;

export type ProofResult =
  | { ok: true }
  | { ok: false; status: 400 | 422; error: "proof_required" | "type_mismatch" | "write_rejected"; failedLetters?: number[] };

/** Разбирает штрихи одной буквы из тела запроса. Возвращает null, если форма неверна. */
export function parseStrokes(value: unknown): Stroke[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_STROKES_PER_LETTER) return null;
  let points = 0;
  const strokes: Stroke[] = [];
  for (const rawStroke of value) {
    if (!Array.isArray(rawStroke) || rawStroke.length === 0) return null;
    points += rawStroke.length;
    if (points > MAX_POINTS_PER_LETTER) return null;
    const stroke: Stroke = [];
    for (const p of rawStroke) {
      const x = (p as { x?: unknown } | null)?.x;
      const y = (p as { y?: unknown } | null)?.y;
      if (typeof x !== "number" || typeof y !== "number" || !Number.isFinite(x) || !Number.isFinite(y)) return null;
      if (Math.abs(x) > MAX_COORDINATE || Math.abs(y) > MAX_COORDINATE) return null;
      stroke.push({ x, y });
    }
    strokes.push(stroke);
  }
  return strokes;
}

/** Этап «печатай»: набранное слово должно совпасть с написанием слова (с конечными формами). */
export function verifyTyped(word: Word, typed: unknown): ProofResult {
  if (typeof typed !== "string" || typed.length === 0 || typed.length > 64) {
    return { ok: false, status: 400, error: "proof_required" };
  }
  const expected = wordLetters(word.he).join("");
  return typed.normalize("NFC") === expected ? { ok: true } : { ok: false, status: 422, error: "type_mismatch" };
}

/**
 * Распознаёт штрихи букв слова теми же шаблонами и правилами, что и приложение.
 * Возвращает номера букв, которые не приняты, или null, если данные неверной формы (не тот список, не те штрихи).
 * `allowSkipped`: пустой список у буквы означает «не удалось написать» (в викторине так бывает) и считается
 * не принятой буквой, а не ошибкой формы.
 */
export async function recognizeLetters(
  word: Word,
  strokesPerLetter: unknown,
  allowSkipped: boolean,
): Promise<number[] | null> {
  const letters = wordLetters(word.he);
  if (!Array.isArray(strokesPerLetter) || strokesPerLetter.length !== letters.length) return null;

  const parsed: (Stroke[] | "skipped")[] = [];
  for (const item of strokesPerLetter) {
    if (allowSkipped && Array.isArray(item) && item.length === 0) {
      parsed.push("skipped");
      continue;
    }
    const strokes = parseStrokes(item);
    if (!strokes) return null;
    parsed.push(strokes);
  }

  const templates = await loadBaseTemplates();
  const failedLetters: number[] = [];
  letters.forEach((letter, i) => {
    const drawn = parsed[i]!;
    if (drawn === "skipped") {
      failedLetters.push(i);
      return;
    }
    const features = featuresFromStrokes(drawn, CANVAS_LINE_HEIGHT);
    if (!features || !checkLetter(features, templates, letter).ok) failedLetters.push(i);
  });
  return failedLetters;
}

/**
 * Этап «пиши»: на каждую букву слова нужны штрихи, сервер сам распознаёт их теми же шаблонами и правилами,
 * что и приложение. Если хоть одна буква не принята, этап не засчитывается.
 */
export async function verifyWritten(word: Word, strokesPerLetter: unknown): Promise<ProofResult> {
  const failedLetters = await recognizeLetters(word, strokesPerLetter, false);
  if (!failedLetters) return { ok: false, status: 400, error: "proof_required" };
  return failedLetters.length === 0 ? { ok: true } : { ok: false, status: 422, error: "write_rejected", failedLetters };
}

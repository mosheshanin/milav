// Что уже записано из шаблонов букв и что записывать дальше (экран записи, apps/web/src/screens/Record.tsx).
import { HEBREW_LETTERS, type TemplateItem } from "@milav/shared";

export type LetterStatus = "empty" | "partial" | "done";

/** Сколько вариантов записано у каждой формы (номера вне 0..variants-1 и неизвестные формы не считаются). */
export function letterCounts(items: TemplateItem[], variants: number): Map<string, number> {
  const slots = new Map<string, Set<number>>();
  for (const item of items) {
    if (item.slot < 0 || item.slot >= variants || !(HEBREW_LETTERS as readonly string[]).includes(item.letter)) continue;
    const set = slots.get(item.letter) ?? new Set<number>();
    set.add(item.slot);
    slots.set(item.letter, set);
  }
  return new Map([...slots].map(([letter, set]) => [letter, set.size]));
}

export function letterStatus(count: number, variants: number): LetterStatus {
  if (count <= 0) return "empty";
  return count >= variants ? "done" : "partial";
}

/** Сколько вариантов нужно всего. */
export function totalNeeded(variants: number): number {
  return HEBREW_LETTERS.length * variants;
}

/** Сколько вариантов записано из нужных. */
export function doneTotal(items: TemplateItem[], variants: number): number {
  let sum = 0;
  for (const n of letterCounts(items, variants).values()) sum += n;
  return sum;
}

/** Первый незанятый номер варианта у формы или null, если заняты все. */
export function firstFreeSlot(items: TemplateItem[], letter: string, variants: number): number | null {
  const taken = new Set(items.filter((i) => i.letter === letter).map((i) => i.slot));
  for (let slot = 0; slot < variants; slot++) if (!taken.has(slot)) return slot;
  return null;
}

/**
 * Следующая форма, у которой записаны не все варианты. Ищет по алфавиту после `after` (по кругу, саму `after` в конце),
 * без `after` начинает с первой. Null, если записано всё.
 */
export function nextIncompleteLetter(items: TemplateItem[], variants: number, after?: string): string | null {
  const counts = letterCounts(items, variants);
  const start = after ? HEBREW_LETTERS.indexOf(after as (typeof HEBREW_LETTERS)[number]) : -1;
  for (let step = 1; step <= HEBREW_LETTERS.length; step++) {
    const letter = HEBREW_LETTERS[(start + step + HEBREW_LETTERS.length) % HEBREW_LETTERS.length]!;
    if ((counts.get(letter) ?? 0) < variants) return letter;
  }
  return null;
}

/** Применяет сохранение к списку: вариант с тем же номером заменяется, остальные остаются. */
export function withItem(items: TemplateItem[], item: TemplateItem): TemplateItem[] {
  return [...items.filter((i) => !(i.letter === item.letter && i.slot === item.slot)), item];
}

/** Применяет удаление к списку. */
export function withoutItem(items: TemplateItem[], letter: string, slot: number): TemplateItem[] {
  return items.filter((i) => !(i.letter === letter && i.slot === slot));
}

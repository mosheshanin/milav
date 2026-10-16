// Раздел «Контент» (проверка слов носителем): фильтры, поиск, порядок и подписи. Чистые функции (с тестами).
import { reviewValueTitle, type ReviewField, type ReviewListItem, type ReviewListLesson, type ReviewStatus } from "@milav/shared";

export type ReviewFilter = "all" | ReviewStatus | "noImage";

export const REVIEW_FILTERS: readonly ReviewFilter[] = ["new", "fix", "ok", "done", "noImage", "all"];

export const REVIEW_FILTER_TITLES: Record<ReviewFilter, string> = {
  all: "Все",
  new: "Не проверено",
  fix: "Замечания",
  ok: "Ждут переноса",
  done: "Проверено",
  noImage: "Без картинки",
};

/** Короткая подпись состояния в строке списка. */
export const STATUS_CHIP: Record<ReviewStatus, { title: string; tone: "neutral" | "accent" | "success" | "danger" }> = {
  new: { title: "Не проверено", tone: "neutral" },
  fix: { title: "Замечания", tone: "danger" },
  ok: { title: "Ждёт переноса", tone: "accent" },
  done: { title: "Проверено", tone: "success" },
};

/** Для поиска: нижний регистр, без ударений и огласовок, ё как е. */
export function searchKey(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-֑ͯ-ׇ]/g, "")
    .replace(/ё/g, "е")
    .toLowerCase()
    .trim();
}

export function matchesFilter(item: ReviewListItem, filter: ReviewFilter): boolean {
  if (filter === "all") return true;
  if (filter === "noImage") return !item.hasImage;
  return item.status === filter;
}

/** Слова под фильтром и поиском (по ивриту, переводу, транскрипции и id), в порядке уроков. */
export function visibleItems(items: readonly ReviewListItem[], filter: ReviewFilter, query: string): ReviewListItem[] {
  const q = searchKey(query);
  return items.filter((i) => matchesFilter(i, filter) && (!q || [i.he, i.ru, i.translit, i.id].some((t) => searchKey(t).includes(q))));
}

/** Сколько слов под каждым фильтром (без учёта поиска). */
export function filterCounts(items: readonly ReviewListItem[]): Record<ReviewFilter, number> {
  const counts = Object.fromEntries(REVIEW_FILTERS.map((f) => [f, 0])) as Record<ReviewFilter, number>;
  for (const item of items) for (const f of REVIEW_FILTERS) if (matchesFilter(item, f)) counts[f] += 1;
  return counts;
}

/** Слова по урокам для показа: только уроки, где что-то осталось после фильтра. */
export function groupByLesson(lessons: readonly ReviewListLesson[], items: readonly ReviewListItem[]): { lesson: ReviewListLesson; items: ReviewListItem[] }[] {
  return lessons.map((lesson) => ({ lesson, items: items.filter((i) => i.lessonId === lesson.id) })).filter((g) => g.items.length > 0);
}

/** Следующее слово в списке после `id` (после сохранения отзыва карточка переходит к нему). */
export function nextItemId(items: readonly ReviewListItem[], id: string): string | null {
  const index = items.findIndex((i) => i.id === id);
  return index >= 0 ? (items[index + 1]?.id ?? null) : null;
}

/** Группы полей в порядке показа. */
export function fieldGroups(fields: readonly ReviewField[]): { group: string; fields: ReviewField[] }[] {
  const groups = new Map<string, ReviewField[]>();
  for (const f of fields) groups.set(f.group, [...(groups.get(f.group) ?? []), f]);
  return [...groups].map(([group, list]) => ({ group, fields: list }));
}

/** Исправления, которые действительно отличаются от урока: обрезанные, без пустых и без совпадающих. */
export function realFixes(fields: readonly ReviewField[], edits: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of fields) {
    const value = edits[f.path]?.trim();
    if (value && value !== f.value) out[f.path] = value;
  }
  return out;
}

/** Исправление одной строкой: «Перевод: кот → кошка». Для поля, которого уже нет, только путь. */
export function fixText(fields: readonly ReviewField[], path: string, value: string): string {
  const field = fields.find((f) => f.path === path);
  if (!field) return `${path}: ${value}`;
  const title = field.group === "Слово" ? field.label : `${field.group}, ${field.label.charAt(0).toLowerCase()}${field.label.slice(1)}`;
  return `${title}: ${reviewValueTitle(field, field.value)} → ${reviewValueTitle(field, value)}`;
}

/** Цвет подписи состояния в строке списка. */
export const STATUS_TEXT_CLASS: Record<ReviewStatus, string> = {
  new: "text-ink-soft",
  fix: "text-danger",
  ok: "text-accent",
  done: "text-success",
};

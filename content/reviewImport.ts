// Перенос отзывов проверяющего в уроки (панель, этап 3; инструмент `npm run content:reviews`, tools/content-reviews.ts).
//
// На входе выгрузка отзывов (GET /api/review/export, кнопка «Скопировать для Claude» в панели или строки таблицы
// content_reviews из D1) и уроки. Для каждого слова:
// - отзыв на другую версию слова не переносится (слово уже поменяли после отзыва);
// - исправления всех проверяющих применяются; разные исправления одного поля это конфликт, слово пропускается;
// - отзыв «есть замечания» только с комментарием (без исправлений) решает человек: слово пропускается;
// - иначе `reviewed` становится `{ by, at }`: имена проверяющих и самая поздняя дата отзыва.
// Чистая функция без файлов: её проверяет content/reviewImport.test.ts.
import {
  REVIEW_VERDICTS,
  applyReviewFixes,
  isVoicedPath,
  reviewFingerprint,
  type AnyLesson,
  type ReviewExportItem,
  type ReviewVerdict,
  type StudyItem,
} from "@milav/shared";

export interface ImportOutcome {
  /** Уроки, в которых что-то изменилось (новые копии). */
  changed: AnyLesson[];
  /** Слова, отмеченные проверенными: id → что сделано. */
  applied: { id: string; lessonId: string; fixes: string[]; by: string; at: string; comments: string[] }[];
  /** Слова, которые нужно переозвучить: исправлены огласовки или иврит фразы. */
  revoice: string[];
  /** Пропущенные слова с причиной. */
  skipped: { id: string; reason: string; comments?: string[] }[];
}

/** Строка из выгрузки панели или из D1 (`fixes` там строка JSON, имя в `first_name`). */
type RawRow = Partial<ReviewExportItem> & {
  item_id?: string;
  lesson_id?: string;
  fixes?: Record<string, string> | string;
  first_name?: string | null;
  updated_at?: number;
};

const isoDay = (seconds: number) => new Date(seconds * 1000).toISOString().slice(0, 10);

/**
 * Приводит выгрузку к списку отзывов. Понимает ответ панели (`{ items }`), список отзывов и вывод
 * `wrangler d1 execute --json` (`[{ results: [...] }]`) с колонками таблицы content_reviews.
 */
export function parseReviewExport(data: unknown): ReviewExportItem[] {
  let rows: unknown = data;
  if (rows && typeof rows === "object" && !Array.isArray(rows) && Array.isArray((rows as { items?: unknown }).items)) rows = (rows as { items: unknown[] }).items;
  if (Array.isArray(rows) && rows.length > 0 && Array.isArray((rows[0] as { results?: unknown })?.results)) {
    rows = (rows as { results: unknown[] }[]).flatMap((r) => r.results);
  }
  if (!Array.isArray(rows)) throw new Error("выгрузка не похожа на отзывы: нужен { items: [...] } или список строк");
  return (rows as RawRow[]).map((r, i) => {
    const itemId = r.itemId ?? r.item_id;
    const verdict = r.verdict as ReviewVerdict;
    const fixes = typeof r.fixes === "string" ? (JSON.parse(r.fixes) as Record<string, string>) : (r.fixes ?? {});
    if (!itemId || !REVIEW_VERDICTS.includes(verdict) || typeof r.version !== "string" || typeof r.reviewer !== "number") {
      throw new Error(`строка ${i + 1}: нет itemId, verdict, version или reviewer`);
    }
    return {
      itemId,
      lessonId: r.lessonId ?? r.lesson_id ?? "",
      version: r.version,
      reviewer: r.reviewer,
      reviewerName: r.reviewerName ?? r.first_name ?? null,
      verdict,
      fixes,
      comment: r.comment ?? "",
      date: r.date ?? isoDay(r.updated_at ?? 0),
    };
  });
}

const itemsOf = (lesson: AnyLesson): StudyItem[] => ("letters" in lesson ? lesson.letters : lesson.words);

export function importReviews(lessons: readonly AnyLesson[], reviews: readonly ReviewExportItem[]): ImportOutcome {
  const copies = new Map<string, AnyLesson>();
  const where = new Map<string, { lessonId: string; index: number }>();
  for (const lesson of lessons) itemsOf(lesson).forEach((item, index) => where.set(item.id, { lessonId: lesson.id, index }));
  const lessonById = new Map(lessons.map((l) => [l.id, l]));
  const copyOf = (id: string) => {
    let copy = copies.get(id);
    if (!copy) {
      copy = JSON.parse(JSON.stringify(lessonById.get(id))) as AnyLesson;
      copies.set(id, copy);
    }
    return copy;
  };

  const byItem = new Map<string, ReviewExportItem[]>();
  for (const r of reviews) byItem.set(r.itemId, [...(byItem.get(r.itemId) ?? []), r]);

  const outcome: ImportOutcome = { changed: [], applied: [], revoice: [], skipped: [] };
  const name = (r: ReviewExportItem) => r.reviewerName?.trim() || `id ${r.reviewer}`;

  for (const [id, group] of byItem) {
    const place = where.get(id);
    if (!place) {
      outcome.skipped.push({ id, reason: "такого слова нет в уроках" });
      continue;
    }
    const item = itemsOf(lessonById.get(place.lessonId)!)[place.index]!;
    const version = reviewFingerprint(item);
    const current = group.filter((r) => r.version === version);
    const comments = current.filter((r) => r.comment).map((r) => `${name(r)}: ${r.comment}`);
    if (current.length === 0) {
      outcome.skipped.push({ id, reason: "слово изменилось после отзыва (отзыв устарел)" });
      continue;
    }
    const commentOnly = current.filter((r) => r.verdict === "fix" && Object.keys(r.fixes).length === 0);
    if (commentOnly.length > 0) {
      outcome.skipped.push({ id, reason: "замечание без исправлений: решить вручную", comments });
      continue;
    }
    const fixes: Record<string, string> = {};
    let conflict: string | null = null;
    for (const r of current) {
      for (const [path, value] of Object.entries(r.fixes)) {
        if (path in fixes && fixes[path] !== value) conflict = path;
        fixes[path] = value;
      }
    }
    if (conflict) {
      outcome.skipped.push({ id, reason: `разные исправления поля ${conflict}: решить вручную`, comments });
      continue;
    }

    let next: StudyItem;
    try {
      next = applyReviewFixes(item, fixes);
    } catch (e) {
      outcome.skipped.push({ id, reason: `исправление не применяется: ${(e as Error).message}`, comments });
      continue;
    }
    const by = [...new Set(current.map(name))].join(", ");
    const at = current.map((r) => r.date).sort().at(-1)!;
    next.reviewed = { by, at };
    itemsOf(copyOf(place.lessonId))[place.index] = next;
    outcome.applied.push({ id, lessonId: place.lessonId, fixes: Object.keys(fixes), by, at, comments });
    if (Object.keys(fixes).some(isVoicedPath)) outcome.revoice.push(id);
  }

  outcome.changed = lessons.filter((l) => copies.has(l.id)).map((l) => copies.get(l.id)!);
  return outcome;
}

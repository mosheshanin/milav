// Перенос отзывов проверяющего в уроки (content/reviewImport.ts) на настоящих уроках, без записи файлов.
import { describe, expect, it } from "vitest";
import { reviewFields, reviewFingerprint, type ReviewExportItem, type StudyItem, type Word } from "@milav/shared";
import { allLessons, lessons } from "./index";
import { importReviews, parseReviewExport } from "./reviewImport";
import { schemaProblems } from "./validate";

const lesson = lessons[0]!;
const [w1, w2, w3] = lesson.words as [Word, Word, Word];
const verbWord = lessons.flatMap((l) => l.words).find((w) => w.verb)!;

const rev = (item: StudyItem, extra: Partial<ReviewExportItem> = {}): ReviewExportItem => ({
  itemId: item.id,
  lessonId: "",
  version: reviewFingerprint(item),
  reviewer: 1,
  reviewerName: "Ави",
  verdict: "ok",
  fixes: {},
  comment: "",
  date: "2026-10-16",
  ...extra,
});

const itemIn = (outcome: ReturnType<typeof importReviews>, id: string) =>
  outcome.changed.flatMap((l) => ("words" in l ? l.words : l.letters) as StudyItem[]).find((i) => i.id === id);

describe("перенос отзывов", () => {
  it("«верно» ставит reviewed, исправления применяются; исходные уроки не меняются", () => {
    const before = JSON.stringify(allLessons);
    const out = importReviews(allLessons, [rev(w1), rev(w2, { verdict: "fix", fixes: { ru: "кошечка" }, date: "2026-10-15" })]);
    expect(JSON.stringify(allLessons)).toBe(before);
    expect(out.changed.map((l) => l.id)).toEqual([lesson.id]);
    expect(itemIn(out, w1.id)!.reviewed).toEqual({ by: "Ави", at: "2026-10-16" });
    expect(itemIn(out, w2.id)).toMatchObject({ ru: "кошечка", reviewed: { by: "Ави", at: "2026-10-15" } });
    expect(out.applied.map((a) => a.id)).toEqual([w1.id, w2.id]);
    expect(out.revoice).toEqual([]);
    // Урок после переноса по-прежнему проходит схему.
    expect(schemaProblems(out.changed[0]!)).toEqual([]);
  });

  it("исправленные огласовки и формы глагола попадают в список на переозвучку", () => {
    const path = reviewFields(verbWord).find((f) => f.path.endsWith(".niqqud") && f.path.startsWith("verb."))!.path;
    const out = importReviews(allLessons, [rev(w1, { verdict: "fix", fixes: { niqqud: `${w1.niqqud}ּ` } }), rev(verbWord, { verdict: "fix", fixes: { [path]: "x" } })]);
    expect(out.revoice.sort()).toEqual([w1.id, verbWord.id].sort());
  });

  it("два проверяющих: имена через запятую, поздняя дата; разные правки одного поля это конфликт", () => {
    const out = importReviews(allLessons, [
      rev(w1, { reviewer: 1, reviewerName: "Ави" }),
      rev(w1, { reviewer: 2, reviewerName: null, date: "2026-10-20" }),
      rev(w2, { reviewer: 1, verdict: "fix", fixes: { ru: "а" } }),
      rev(w2, { reviewer: 2, verdict: "fix", fixes: { ru: "б" } }),
    ]);
    expect(itemIn(out, w1.id)!.reviewed).toEqual({ by: "Ави, id 2", at: "2026-10-20" });
    expect(out.skipped).toEqual([{ id: w2.id, reason: "разные исправления поля ru: решить вручную", comments: [] }]);
  });

  it("пропускает устаревшие отзывы, неизвестные слова и замечания без исправлений", () => {
    const out = importReviews(allLessons, [
      rev(w1, { version: "старая" }),
      rev(w2, { verdict: "fix", comment: "Фраза звучит странно" }),
      { ...rev(w3), itemId: "nope-1-x" },
    ]);
    expect(out.changed).toEqual([]);
    expect(out.skipped).toEqual([
      { id: w1.id, reason: "слово изменилось после отзыва (отзыв устарел)" },
      { id: w2.id, reason: "замечание без исправлений: решить вручную", comments: ["Ави: Фраза звучит странно"] },
      { id: "nope-1-x", reason: "такого слова нет в уроках" },
    ]);
  });

  it("после переноса отпечаток слова меняется: в панели отзыв больше не «ждёт переноса»", () => {
    const out = importReviews(allLessons, [rev(w1)]);
    expect(reviewFingerprint(itemIn(out, w1.id)!)).not.toBe(reviewFingerprint(w1));
  });
});

describe("разбор выгрузки", () => {
  it("понимает ответ панели, список строк и вывод wrangler d1 --json", () => {
    const item = rev(w1, { verdict: "fix", fixes: { ru: "кот" } });
    expect(parseReviewExport({ exportedAt: 1, items: [item] })).toEqual([item]);
    expect(parseReviewExport([item])).toEqual([item]);
    const d1 = [
      {
        results: [
          { item_id: w1.id, reviewer: 1, lesson_id: lesson.id, version: item.version, verdict: "fix", fixes: '{"ru":"кот"}', comment: "", updated_at: 1792130400, first_name: "Ави" },
        ],
        success: true,
      },
    ];
    expect(parseReviewExport(d1)).toEqual([{ ...item, lessonId: lesson.id, date: "2026-10-16" }]);
    expect(() => parseReviewExport({ nope: 1 })).toThrow();
    expect(() => parseReviewExport([{ itemId: "x" }])).toThrow();
  });
});

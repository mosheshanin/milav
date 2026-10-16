// Поля для проверки носителем (packages/shared/src/review.ts) на всём настоящем контенте: каждое поле находится по
// своему пути, правка меняет ровно его, отпечаток не зависит от озвучки и картинок.
import { describe, expect, it } from "vitest";
import {
  applyReviewFixes,
  checkReview,
  isLetter,
  isVoicedPath,
  reviewFields,
  reviewFingerprint,
  reviewStatusOf,
  type StudyItem,
} from "@milav/shared";
import { allLessons } from "./index";

const items: StudyItem[] = allLessons.flatMap((l) => ("letters" in l ? l.letters : l.words));

const at = (item: unknown, path: string) => path.split(".").reduce((node: any, key) => node?.[key], item);

describe("поля для проверки", () => {
  it("у каждого слова и буквы поля уникальны и указывают на настоящие значения", () => {
    for (const item of items) {
      const fields = reviewFields(item);
      expect(fields.length, item.id).toBeGreaterThan(3);
      expect(new Set(fields.map((f) => f.path)).size, item.id).toBe(fields.length);
      for (const f of fields) expect(at(item, f.path), `${item.id} ${f.path}`).toBe(f.value);
    }
  });

  it("у глагола все формы (до 27 × 3 поля) и корень", () => {
    const verb = items.find((i) => !isLetter(i) && i.verb)!;
    const paths = reviewFields(verb).map((f) => f.path);
    expect(paths).toContain("verb.root");
    expect(paths.filter((p) => p.startsWith("verb.present.")).length).toBe(12);
    expect(paths.filter((p) => /^verb\.\w+\.\w+\.niqqud$/.test(p)).every(isVoicedPath)).toBe(true);
  });

  it("правка по пути меняет только это поле и не трогает исходное слово", () => {
    for (const item of items.filter((_, i) => i % 7 === 0)) {
      for (const f of reviewFields(item)) {
        const value = f.kind === "gender" ? (f.value === "m" ? "f" : "m") : `${f.value}·`;
        const changed = applyReviewFixes(item, { [f.path]: value });
        expect(at(changed, f.path)).toBe(value);
        expect(at(item, f.path)).toBe(f.value);
        const back = applyReviewFixes(changed, { [f.path]: f.value });
        expect(back).toEqual(item);
      }
    }
    expect(() => applyReviewFixes(items[0]!, { audio: "/x.mp3" })).toThrow();
  });
});

describe("отпечаток версии", () => {
  it("не зависит от озвучки, картинки и порядка ключей, но меняется от текста и отметки reviewed", () => {
    const word = items.find((i) => !isLetter(i) && i.example)! as any;
    const base = reviewFingerprint(word);
    expect(base).toMatch(/^[0-9a-f]{14}$/);
    expect(reviewFingerprint({ ...word, audio: "/audio/other.mp3", image: undefined })).toBe(base);
    expect(reviewFingerprint({ ...word, example: { ...word.example, audio: undefined } })).toBe(base);
    expect(reviewFingerprint(Object.fromEntries(Object.entries(word).reverse()) as StudyItem)).toBe(base);
    expect(reviewFingerprint({ ...word, ru: `${word.ru}!` })).not.toBe(base);
    expect(reviewFingerprint({ ...word, reviewed: { by: "Ави", at: "2026-10-16" } })).not.toBe(base);
  });

  it("у всех слов и букв разные отпечатки", () => {
    expect(new Set(items.map(reviewFingerprint)).size).toBe(items.length);
  });
});

describe("проверка отзыва и состояние", () => {
  const word = items.find((i) => !isLetter(i))!;
  it("принимает «верно» и замечания, отклоняет неверное", () => {
    expect(checkReview(word, { verdict: "ok" })).toEqual({ ok: true, verdict: "ok", fixes: {}, comment: "" });
    expect(checkReview(word, { verdict: "fix", comment: " строка 1\nстрока 2 " })).toMatchObject({ ok: true, comment: "строка 1\nстрока 2" });
    expect(checkReview(word, { verdict: "fix", fixes: { "example.nope": "x" } })).toEqual({ ok: false, error: "bad_field" });
    expect(checkReview(word, { verdict: "fix", fixes: { ru: "a\u0007" } })).toEqual({ ok: false, error: "bad_value" });
    expect(checkReview(word, null)).toEqual({ ok: false, error: "bad_verdict" });
  });

  it("замечания главнее «верно», без отзывов решает отметка в уроке", () => {
    expect(reviewStatusOf(false, [])).toBe("new");
    expect(reviewStatusOf({ by: "Ави", at: "2026-10-16" }, [])).toBe("done");
    expect(reviewStatusOf(false, ["ok"])).toBe("ok");
    expect(reviewStatusOf({ by: "Ави", at: "2026-10-16" }, ["ok", "fix"])).toBe("fix");
  });
});

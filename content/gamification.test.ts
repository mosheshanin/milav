// Каталог бейджей на настоящем контенте: каждый показываемый бейдж достижим, пороги берутся из уроков.
import { describe, expect, it } from "vitest";
import { alphabetLessons, allLessons, catalog, contentInfo, lessons } from "./index";

const info = contentInfo();

describe("сведения о контенте", () => {
  it("совпадают с уроками", () => {
    expect(info.totalLessons).toBe(allLessons.length);
    expect(info.totalWords).toBe(lessons.reduce((n, l) => n + l.words.length, 0));
    expect(info.alphabetLessons).toBe(alphabetLessons.length);
    expect(info.alphabetLetters).toBe(27);
    expect(info.sections).toContain("alphabet");
  });

  it("по теме на каждый topicId обычных уроков, алфавита среди тем нет", () => {
    expect(info.topics.map((t) => t.id).sort()).toEqual([...new Set(lessons.map((l) => l.topicId))].sort());
    expect(info.topics.some((t) => t.id === "alphabet")).toBe(false);
    for (const topic of info.topics) for (const id of topic.lessonIds) expect(allLessons.some((l) => l.id === id)).toBe(true);
  });
});

describe("каталог на настоящем контенте", () => {
  it("каждый показываемый бейдж достижим", () => {
    for (const b of catalog.badges) {
      if (b.topicId) {
        expect(info.topics.find((t) => t.id === b.topicId), b.id).toBeDefined();
        continue;
      }
      switch (b.metric) {
        case "words":
          expect(b.threshold, b.id).toBeLessThanOrEqual(info.totalWords);
          break;
        case "letters":
          expect(b.threshold, b.id).toBeLessThanOrEqual(info.alphabetLetters);
          break;
        case "lessons":
          expect(b.threshold, b.id).toBeLessThanOrEqual(info.totalLessons);
          break;
        case "alphabetLessons":
          expect(b.threshold, b.id).toBeLessThanOrEqual(info.alphabetLessons);
          break;
        case "sections":
          expect(b.threshold, b.id).toBeLessThanOrEqual(info.sections.length);
          break;
        case "perfectQuizzes":
          expect(b.threshold, b.id).toBeLessThanOrEqual(info.totalLessons);
          break;
        default:
          break;
      }
    }
  });

  it("бейджи алфавита и тем есть, сейчас достижимого на глаголы нет", () => {
    const ids = catalog.badges.map((b) => b.id);
    expect(ids).toContain("alphabet-letters");
    expect(ids).toContain("alphabet-passed");
    expect(ids).toContain("topic-animals");
    expect(ids).toContain("first-word");
    if (!info.sections.includes("verbs")) expect(ids).not.toContain("variety-4");
  });

  it("версия каталога положительная и зависит от числа бейджей", () => {
    expect(catalog.version).toBeGreaterThan(1000);
    expect(catalog.version % 1000).toBe(catalog.badges.length);
  });
});

import { describe, expect, it } from "vitest";
import {
  BADGE_ICONS,
  BADGE_CATEGORIES,
  buildCatalog,
  closedTopics,
  countByRarity,
  crossedBadges,
  eligibleBadges,
  shareText,
  ZERO_METRICS,
  type ContentInfo,
  type Metrics,
} from "./badges";

const info: ContentInfo = {
  totalWords: 140,
  totalLessons: 19,
  alphabetLessons: 5,
  alphabetLetters: 27,
  sections: ["alphabet", "nouns", "adjectives"],
  topics: [
    { id: "animals", title: "Животные", lessonIds: ["animals-1", "animals-2", "animals-3"] },
    { id: "food", title: "Еда", lessonIds: ["food-1"] },
  ],
};

const catalog = buildCatalog(info);
const ids = catalog.badges.map((b) => b.id);
const m = (patch: Partial<Metrics>): Metrics => ({ ...ZERO_METRICS, ...patch });

describe("каталог бейджей", () => {
  it("id уникальны, kebab-case и не короче двух знаков", () => {
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
  });

  it("у каждого бейджа есть русское название и описание нужной длины, иконка из списка, известный раздел", () => {
    const categories = BADGE_CATEGORIES.map((c) => c.key);
    for (const b of catalog.badges) {
      expect(b.title.length, b.id).toBeGreaterThan(2);
      expect(b.title.length, b.id).toBeLessThanOrEqual(40);
      expect(b.description.length, b.id).toBeGreaterThan(8);
      expect(b.description.length, b.id).toBeLessThanOrEqual(90);
      expect(b.title, b.id).toMatch(/[а-яё]/i);
      expect(b.description, b.id).toMatch(/[а-яё]/i);
      expect(BADGE_ICONS, b.id).toContain(b.icon);
      expect(categories, b.id).toContain(b.category);
    }
  });

  it("пороги внутри семейства растут, редкость не убывает", () => {
    const rank = { common: 0, rare: 1, epic: 2, legendary: 3 };
    for (const family of ["words", "lessons", "rhythm", "days", "goal"]) {
      const members = catalog.badges.filter((b) => b.id.startsWith(`${family}-`));
      for (let i = 1; i < members.length; i++) {
        expect(members[i]!.threshold, members[i]!.id).toBeGreaterThan(members[i - 1]!.threshold);
        expect(rank[members[i]!.rarity], members[i]!.id).toBeGreaterThanOrEqual(rank[members[i - 1]!.rarity]);
      }
    }
  });

  it("недостижимые при этом контенте бейджи в каталог не попадают", () => {
    expect(ids).toContain("words-100");
    expect(ids).not.toContain("words-250");
    expect(ids).not.toContain("words-1000");
    expect(ids).not.toContain("lessons-25");
    expect(ids).not.toContain("variety-4");
    expect(ids).toContain("variety-3");
    const big = buildCatalog({ ...info, totalWords: 1200, totalLessons: 130, sections: ["alphabet", "nouns", "verbs", "adjectives"] });
    expect(big.badges.map((b) => b.id)).toEqual(expect.arrayContaining(["words-1000", "lessons-25", "variety-4"]));
  });

  it("бейджи алфавита берут пороги из контента, у тем по бейджу на тему", () => {
    expect(catalog.byId.get("alphabet-letters")).toMatchObject({ threshold: 27, metric: "letters" });
    expect(catalog.byId.get("alphabet-passed")).toMatchObject({ threshold: 5, metric: "alphabetLessons" });
    expect(catalog.byId.get("topic-animals")).toMatchObject({ metric: null, topicId: "animals", title: "Тема закрыта: «Животные»" });
    expect(catalog.byId.get("topic-food")).toBeDefined();
    expect(buildCatalog({ ...info, alphabetLetters: 0, alphabetLessons: 0 }).byId.has("alphabet-letters")).toBe(false);
  });

  it("версия растёт, когда в каталоге появляются бейджи", () => {
    const grown = buildCatalog({ ...info, totalWords: 300 });
    expect(grown.version).toBeGreaterThan(catalog.version);
  });

  it("распределение по редкости: есть все четыре", () => {
    const withBig = buildCatalog({ ...info, totalWords: 1200, totalLessons: 130 });
    const counts = countByRarity(withBig.badges);
    expect(counts.common).toBeGreaterThan(0);
    expect(counts.rare).toBeGreaterThan(0);
    expect(counts.epic).toBeGreaterThan(0);
    expect(counts.legendary).toBeGreaterThan(0);
  });
});

describe("выдача по счётчикам", () => {
  const none = new Set<string>();

  it("пересечение порога выдаёт бейдж один раз: раньше не было, теперь есть", () => {
    expect(crossedBadges(catalog, m({ words: 9 }), m({ words: 10 }), none, none)).toEqual(["words-10"]);
    expect(crossedBadges(catalog, m({ words: 10 }), m({ words: 11 }), none, none)).toEqual([]);
    expect(crossedBadges(catalog, m({}), m({ words: 1 }), none, none)).toEqual(["first-word"]);
  });

  it("одно событие может пересечь несколько порогов", () => {
    const crossed = crossedBadges(catalog, m({}), m({ lessons: 1, perfectQuizzes: 1 }), none, none);
    expect(crossed.sort()).toEqual(["first-lesson", "quiz-perfect"]);
  });

  it("граничные значения порогов ритма и дней", () => {
    expect(crossedBadges(catalog, m({ rhythmWeeks: 3 }), m({ rhythmWeeks: 4 }), none, none)).toEqual(["rhythm-4"]);
    expect(crossedBadges(catalog, m({ activeDays: 6 }), m({ activeDays: 7 }), none, none)).toEqual(["days-7"]);
    expect(crossedBadges(catalog, m({ goalDays: 6 }), m({ goalDays: 7 }), none, none)).toEqual(["goal-7"]);
    expect(crossedBadges(catalog, m({ returns: 0 }), m({ returns: 1 }), none, none)).toEqual(["return-14"]);
  });

  it("тема закрывается, когда сданы все её уроки", () => {
    const before = closedTopics(info, new Set(["animals-1", "animals-2", "food-1"]));
    const after = closedTopics(info, new Set(["animals-1", "animals-2", "animals-3", "food-1"]));
    expect([...before]).toEqual(["food"]);
    expect([...after].sort()).toEqual(["animals", "food"]);
    expect(crossedBadges(catalog, m({}), m({}), before, after)).toEqual(["topic-animals"]);
  });

  it("полный пересчёт: eligibleBadges даёт всё заслуженное", () => {
    const got = eligibleBadges(catalog, m({ words: 55, lessons: 2, activeDays: 8, sections: 2 }), new Set(["food"]));
    expect(got.sort()).toEqual(["days-7", "first-lesson", "first-word", "topic-food", "variety-2", "words-10", "words-50"]);
  });

  it("текст «Поделиться» содержит название, но не имя и не id", () => {
    expect(shareText(catalog.byId.get("words-100")!)).toBe("Я получил(а) бейдж «Центр доски» в Milav");
  });
});

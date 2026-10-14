import { describe, expect, it } from "vitest";
import { ZERO_METRICS, type AchievementsResponse } from "@milav/shared";
import { catalog } from "@milav/content";
import { cohortText, groupBadges, plural, statusPathText, weekdayLabels } from "./play";

const first = catalog.badges[0]!;

describe("groupBadges", () => {
  it("раскладывает каталог по разделам, ничего не теряя", () => {
    const groups = groupBadges(catalog, null);
    expect(groups.reduce((n, g) => n + g.badges.length, 0)).toBe(catalog.badges.length);
    expect(groups.every((g) => g.badges.every((b) => !b.earned))).toBe(true);
  });

  it("отмечает полученные и показывает прогресс остальных", () => {
    const data: AchievementsResponse = {
      earned: [{ id: first.id, earnedAt: 1_700_000_000, seen: false, retro: true }],
      counters: { ...ZERO_METRICS, words: 7 },
      catalogVersion: catalog.version,
    };
    const all = groupBadges(catalog, data).flatMap((g) => g.badges);
    const got = all.find((b) => b.def.id === first.id)!;
    expect(got).toMatchObject({ earned: true, retro: true, fresh: true, progress: null });
    const words10 = all.find((b) => b.def.id === "words-10");
    expect(words10?.progress).toEqual({ value: 7, target: 10 });
  });

  it("прогресс не превышает порог", () => {
    const data: AchievementsResponse = { earned: [], counters: { ...ZERO_METRICS, words: 99 }, catalogVersion: catalog.version };
    const b = groupBadges(catalog, data).flatMap((g) => g.badges).find((x) => x.def.id === "words-10");
    expect(b?.progress).toEqual({ value: 10, target: 10 });
  });
});

describe("подписи", () => {
  it("склоняет числа", () => {
    expect([1, 2, 5, 11, 21, 22, 25].map((n) => plural(n, "неделя", "недели", "недель"))).toEqual([
      "неделя", "недели", "недель", "недель", "неделя", "недели", "недель",
    ]);
  });

  it("неделя начинается с воскресенья", () => {
    expect(weekdayLabels()).toEqual(["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"]);
  });

  it("путь статуса: следующий и высший", () => {
    const base = { key: "knight", name: "Конь", symbol: "♞", from: 5, passed: 7, fraction: 0.1 };
    expect(statusPathText({ ...base, to: 20, next: { key: "bishop", name: "Слон", symbol: "♝" } })).toEqual({
      title: "Конь → Слон",
      progress: "7 из 20",
    });
    expect(statusPathText({ ...base, name: "Король", to: null, next: null }).title).toContain("высший");
  });

  it("сравнение: нет данных, нет текста", () => {
    expect(cohortText({ level: "none", size: 0, mine: 3 })).toBeNull();
    expect(cohortText({ level: "week", size: 25, p25: 2, p50: 5, p75: 9, mine: 4 })).toContain("от 2 до 9");
  });
});

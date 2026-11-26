import { describe, expect, it } from "vitest";
import { FULL_DURATIONS, splashMode, splashStats, type SplashInput } from "./splash";

const base: SplashInput = { seen: false, automated: false, forced: null, deepLink: false };

describe("какую заставку показать", () => {
  it("первый запуск — полная, дальше — только логотип", () => {
    expect(splashMode(base)).toBe("full");
    expect(splashMode({ ...base, seen: true })).toBe("short");
  });

  it("автотестам и особым ссылкам заставка не мешает", () => {
    expect(splashMode({ ...base, automated: true })).toBe("none");
    expect(splashMode({ ...base, deepLink: true })).toBe("none");
  });

  it("параметр адреса сильнее всего", () => {
    expect(splashMode({ ...base, automated: true, forced: "full" })).toBe("full");
    expect(splashMode({ ...base, automated: true, forced: "1" })).toBe("full");
    expect(splashMode({ ...base, seen: false, forced: "short" })).toBe("short");
    expect(splashMode({ ...base, forced: "off" })).toBe("none");
    expect(splashMode({ ...base, seen: true, forced: "что-то" })).toBe("short");
  });

  it("полная заставка — 5 слайдов, около 15 секунд, каждый слайд не короче 2,6 с (анимации успевают)", () => {
    expect(FULL_DURATIONS).toHaveLength(5);
    const total = FULL_DURATIONS.reduce((a, b) => a + b, 0);
    expect(total).toBeGreaterThan(13000);
    expect(total).toBeLessThan(17000);
    for (const ms of FULL_DURATIONS) expect(ms).toBeGreaterThanOrEqual(2600);
  });
});

describe("цифры последнего слайда", () => {
  it("слова без букв алфавита, уроки все", () => {
    const metas = [
      { section: "alphabet" as const, count: 5 },
      { section: "nouns" as const, count: 10 },
      { section: "verbs" as const, count: 10 },
    ];
    expect(splashStats(metas)).toEqual({ words: 20, lessons: 3 });
  });
});

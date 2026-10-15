import { describe, expect, it } from "vitest";
import { THEME_CHOICES, THEME_KEY, loadThemeChoice, resolveTheme, saveThemeChoice, type ThemeStorage } from "./theme";

function memoryStorage(initial: Record<string, string> = {}): ThemeStorage & { data: Record<string, string> } {
  const data = { ...initial };
  return {
    data,
    getItem: (k) => data[k] ?? null,
    setItem: (k, v) => {
      data[k] = v;
    },
  };
}

describe("выбор темы", () => {
  it("по умолчанию «Как в Telegram»", () => {
    expect(loadThemeChoice(memoryStorage())).toBe("system");
    expect(loadThemeChoice(null)).toBe("system");
  });

  it("сохраняется и читается каждый вариант", () => {
    for (const choice of THEME_CHOICES) {
      const storage = memoryStorage();
      saveThemeChoice(choice, storage);
      expect(storage.data[THEME_KEY]).toBe(choice);
      expect(loadThemeChoice(storage)).toBe(choice);
    }
  });

  it("мусор в хранилище и сломанное хранилище дают «Как в Telegram»", () => {
    expect(loadThemeChoice(memoryStorage({ [THEME_KEY]: "purple" }))).toBe("system");
    const broken: ThemeStorage = {
      getItem: () => {
        throw new Error("нет доступа");
      },
      setItem: () => {
        throw new Error("нет доступа");
      },
    };
    expect(loadThemeChoice(broken)).toBe("system");
    expect(() => saveThemeChoice("dark", broken)).not.toThrow();
  });
});

describe("какая тема получится", () => {
  it("явный выбор важнее Telegram и устройства", () => {
    expect(resolveTheme("light", "dark", true)).toBe("light");
    expect(resolveTheme("dark", "light", false)).toBe("dark");
  });

  it("«Как в Telegram» берёт схему Telegram", () => {
    expect(resolveTheme("system", "dark", false)).toBe("dark");
    expect(resolveTheme("system", "light", true)).toBe("light");
  });

  it("вне Telegram (или без схемы) берёт настройку устройства", () => {
    expect(resolveTheme("system", undefined, true)).toBe("dark");
    expect(resolveTheme("system", undefined, false)).toBe("light");
    expect(resolveTheme("system", "unknown", true)).toBe("dark");
  });
});

import { describe, expect, it } from "vitest";
import { ACHIEVEMENTS, HOME, LEADERBOARD, RECORD, hasSavedScreen, restoreScreen, saveScreen, type ScreenStorage } from "./screen";

function memoryStorage(initial: Record<string, string> = {}): ScreenStorage & { data: Record<string, string> } {
  const data = { ...initial };
  return {
    data,
    getItem: (k) => data[k] ?? null,
    setItem: (k, v) => {
      data[k] = v;
    },
  };
}

const exists = (id: string) => id === "animals-1";

describe("сохранение экрана", () => {
  it("урок восстанавливается как урок", () => {
    const storage = memoryStorage();
    saveScreen(storage, { name: "study", lessonId: "animals-1" });
    expect(restoreScreen(storage, exists)).toEqual({ name: "study", lessonId: "animals-1" });
  });

  it("викторина после перезагрузки превращается в урок: она начинается заново", () => {
    const storage = memoryStorage();
    saveScreen(storage, { name: "quiz", lessonId: "animals-1" });
    expect(restoreScreen(storage, exists)).toEqual({ name: "study", lessonId: "animals-1" });
  });

  it("достижения и таблица восстанавливаются как есть", () => {
    for (const screen of [ACHIEVEMENTS, LEADERBOARD]) {
      const storage = memoryStorage();
      saveScreen(storage, screen);
      expect(restoreScreen(storage, exists)).toEqual(screen);
    }
  });

  it("главная остаётся главной", () => {
    const storage = memoryStorage();
    saveScreen(storage, HOME);
    expect(restoreScreen(storage, exists)).toEqual(HOME);
  });

  it("пустое хранилище, мусор и неизвестный урок ведут на главную", () => {
    expect(restoreScreen(memoryStorage(), exists)).toEqual(HOME);
    expect(restoreScreen(null, exists)).toEqual(HOME);
    for (const bad of ["не json", "null", "5", '"study"', '{"name":"study"}', '{"name":"study","lessonId":7}', '{"name":"fly","lessonId":"animals-1"}']) {
      expect(restoreScreen(memoryStorage({ "milav:screen": bad }), exists)).toEqual(HOME);
    }
    const storage = memoryStorage();
    saveScreen(storage, { name: "study", lessonId: "deleted-lesson" });
    expect(restoreScreen(storage, exists)).toEqual(HOME);
  });

  it("экран записи шаблонов восстанавливается после перезагрузки", () => {
    const storage = memoryStorage();
    saveScreen(storage, RECORD);
    expect(restoreScreen(storage, exists)).toEqual(RECORD);
  });

  it("видно, было ли уже сохранено место (параметр запуска действует только в первый раз)", () => {
    const storage = memoryStorage();
    expect(hasSavedScreen(storage)).toBe(false);
    expect(hasSavedScreen(null)).toBe(false);
    saveScreen(storage, HOME);
    expect(hasSavedScreen(storage)).toBe(true);
  });

  it("если хранилище бросает ошибки, приложение не падает", () => {
    const broken: ScreenStorage = {
      getItem: () => {
        throw new Error("нет доступа");
      },
      setItem: () => {
        throw new Error("нет доступа");
      },
    };
    expect(() => saveScreen(broken, HOME)).not.toThrow();
    expect(restoreScreen(broken, exists)).toEqual(HOME);
    expect(hasSavedScreen(broken)).toBe(false);
  });
});

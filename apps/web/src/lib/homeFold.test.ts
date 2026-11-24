import { afterEach, describe, expect, it, vi } from "vitest";
import { loadOpen, revealed, saveOpen, sectionKey, toggled, topicKey } from "./homeFold";

function fakeStorage(initial: Record<string, string> = {}) {
  const data = { ...initial };
  return {
    data,
    getItem: (k: string) => (k in data ? data[k] : null),
    setItem: (k: string, v: string) => {
      data[k] = v;
    },
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("homeFold", () => {
  it("ключи раздела и темы различаются", () => {
    expect(sectionKey("nouns")).toBe("section:nouns");
    expect(topicKey("animals")).toBe("topic:animals");
  });

  it("toggled переключает блок и не меняет исходный набор", () => {
    const open = new Set(["topic:animals"]);
    const a = toggled(open, "section:nouns");
    expect([...a].sort()).toEqual(["section:nouns", "topic:animals"]);
    const b = toggled(a, "topic:animals");
    expect([...b]).toEqual(["section:nouns"]);
    expect([...open]).toEqual(["topic:animals"]);
  });

  it("revealed раскрывает раздел и тему урока, у алфавита только раздел, ничего не сворачивает", () => {
    const open = new Set(["topic:food"]);
    expect([...revealed(open, { section: "nouns", topicId: "animals" })].sort()).toEqual(["section:nouns", "topic:animals", "topic:food"]);
    expect([...revealed(open, { section: "alphabet", topicId: "alphabet" })].sort()).toEqual(["section:alphabet", "topic:food"]);
    expect([...open]).toEqual(["topic:food"]);
    const again = revealed(revealed(new Set(), { section: "verbs", topicId: "paal" }), { section: "verbs", topicId: "paal" });
    expect([...again].sort()).toEqual(["section:verbs", "topic:paal"]);
  });

  it("по умолчанию всё свёрнуто", () => {
    vi.stubGlobal("window", { localStorage: fakeStorage() });
    expect(loadOpen().size).toBe(0);
  });

  it("сохраняет и читает набор", () => {
    const storage = fakeStorage();
    vi.stubGlobal("window", { localStorage: storage });
    saveOpen(new Set(["topic:food", "section:nouns"]));
    expect([...loadOpen()].sort()).toEqual(["section:nouns", "topic:food"]);
  });

  it("повреждённые данные дают пустой набор, чужие значения отбрасываются", () => {
    vi.stubGlobal("window", { localStorage: fakeStorage({ "milav:home-open": "{не json" }) });
    expect(loadOpen().size).toBe(0);
    vi.stubGlobal("window", { localStorage: fakeStorage({ "milav:home-open": '["section:verbs", 5, null]' }) });
    expect([...loadOpen()]).toEqual(["section:verbs"]);
    vi.stubGlobal("window", { localStorage: fakeStorage({ "milav:home-open": '{"a":1}' }) });
    expect(loadOpen().size).toBe(0);
  });

  it("недоступное хранилище не роняет приложение", () => {
    vi.stubGlobal("window", {
      get localStorage(): Storage {
        throw new Error("blocked");
      },
    });
    expect(loadOpen().size).toBe(0);
    expect(() => saveOpen(new Set(["section:nouns"]))).not.toThrow();
  });
});

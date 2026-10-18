import { describe, expect, it } from "vitest";
import { buildLessonTemplate, templateProblems, type NewLessonOptions } from "./template";
import { schemaProblems } from "./validate";

const keys = ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"];
const base: NewLessonOptions = { topicId: "animals", number: 2, section: "nouns", topic: "Животные", title: "Дикие животные", keys };

/** Заполняет все пустые поля шаблона допустимыми значениями (так, как это сделал бы автор). */
function fill(node: any, path: string[] = []): any {
  if (Array.isArray(node)) return node.map((n) => fill(n, path));
  if (node && typeof node === "object") {
    return Object.fromEntries(Object.entries(node).map(([k, v]) => [k, fill(v, [...path, k])]));
  }
  if (node !== "") return node;
  const key = path[path.length - 1];
  const inExample = path.includes("example");
  switch (key) {
    case "he":
      return inExample ? "זה חתול שחור" : "חתול";
    case "niqqud":
      return "חָתוּל";
    case "translit":
      return inExample ? "зэ хатуль шахор" : "хату́ль";
    case "ru":
      return "кот";
    case "gender":
      return "m";
    case "binyan":
      return "paal";
    case "root":
      return "כתב";
    default:
      throw new Error(`не знаю, чем заполнить ${path.join(".")}`);
  }
}

describe("шаблон нового урока", () => {
  it("поля урока и id слов", () => {
    const t = buildLessonTemplate(base) as any;
    expect(t).toMatchObject({ $schema: "../schema.json", id: "animals-2", topicId: "animals", section: "nouns", number: 2, free: false });
    expect(t.words.map((w: any) => w.id)).toEqual(keys.map((k) => `animals-2-${k}`));
  });

  it("бесплатность по номеру: 1 бесплатный, 2 платный", () => {
    expect((buildLessonTemplate({ ...base, number: 1 }) as any).free).toBe(true);
    expect((buildLessonTemplate({ ...base, number: 2 }) as any).free).toBe(false);
  });

  it("существительное: род и фраза; без forms", () => {
    const w = (buildLessonTemplate(base) as any).words[0];
    expect(Object.keys(w)).toEqual(["id", "he", "niqqud", "translit", "ru", "gender", "example", "reviewed"]);
    expect(w.reviewed).toBe(false);
  });

  it("глагол: фраза и блок verb, без рода и forms", () => {
    const w = (buildLessonTemplate({ ...base, section: "verbs" }) as any).words[0];
    expect(Object.keys(w)).toEqual(["id", "he", "niqqud", "translit", "ru", "example", "verb", "reviewed"]);
  });

  it("глагол: пустые бинъян, корень и все 27 форм по временам", () => {
    const v = (buildLessonTemplate({ ...base, section: "verbs" }) as any).words[0].verb;
    expect(Object.keys(v)).toEqual(["binyan", "root", "present", "past", "future", "imperative"]);
    expect([4, 9, 10, 4]).toEqual(["present", "past", "future", "imperative"].map((t) => Object.keys(v[t]).length));
    expect(v.present.ms).toEqual({ he: "", niqqud: "", translit: "" });
    expect(v.binyan).toBe("");
    expect(v.root).toBe("");
  });

  it("в теме-бинъяне бинъян подставляется по topicId, в тематической теме остаётся пустым", () => {
    const paal = (buildLessonTemplate({ ...base, section: "verbs", topicId: "paal", topic: "Пааль" }) as any).words[0];
    expect(paal.verb.binyan).toBe("paal");
    const themed = (buildLessonTemplate({ ...base, section: "verbs", topicId: "motion", topic: "Движение" }) as any).words[0];
    expect(themed.verb.binyan).toBe("");
  });

  it("прилагательное: фраза и три формы", () => {
    const w = (buildLessonTemplate({ ...base, section: "adjectives" }) as any).words[0];
    expect(Object.keys(w)).toEqual(["id", "he", "niqqud", "translit", "ru", "example", "forms", "reviewed"]);
    expect(Object.keys(w.forms)).toEqual(["f", "mp", "fp"]);
  });

  it("пока шаблон пуст, схема его не принимает (поля не забыть)", () => {
    expect(schemaProblems(buildLessonTemplate(base)).length).toBeGreaterThan(0);
  });

  for (const section of ["nouns", "verbs", "adjectives"] as const) {
    it(`заполненный шаблон раздела ${section} проходит схему`, () => {
      expect(schemaProblems(fill(buildLessonTemplate({ ...base, section })))).toEqual([]);
    });
  }

  describe("ошибки параметров", () => {
    const bad: [string, Partial<NewLessonOptions>][] = [
      ["topicId с заглавной", { topicId: "Animals" }],
      ["номер 0", { number: 0 }],
      ["дробный номер", { number: 1.5 }],
      ["неизвестный раздел", { section: "animals" as any }],
      ["пустое название темы", { topic: " " }],
      ["пустое название урока", { title: "" }],
      ["9 ключей", { keys: keys.slice(0, 9) }],
      ["повтор ключа", { keys: [...keys.slice(0, 9), "a"] }],
      ["ключ кириллицей", { keys: [...keys.slice(0, 9), "кот"] }],
    ];
    for (const [name, over] of bad) {
      it(name, () => {
        expect(templateProblems({ ...base, ...over }).length).toBeGreaterThan(0);
        expect(() => buildLessonTemplate({ ...base, ...over })).toThrow();
      });
    }
  });
});

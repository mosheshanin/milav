import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { allLessons } from "./index";
import { renderRegistry } from "./registryGen";

const lessonsDir = new URL("./lessons/", import.meta.url);

describe("реестр уроков (content/registry.ts)", () => {
  it("совпадает с файлами в content/lessons (если нет: npm run content:index)", () => {
    const actual = readFileSync(new URL("./registry.ts", import.meta.url), "utf8");
    expect(actual).toBe(renderRegistry(lessonsDir));
  });

  it("в приложение попадает ровно столько уроков, сколько файлов", () => {
    const files = readdirSync(lessonsDir).filter((f) => f.endsWith(".json"));
    expect(allLessons.length).toBe(files.length);
  });

  it("порядок: сначала алфавит, затем по ключу темы и по номеру урока", () => {
    const keyOf = (l: (typeof allLessons)[number]) => `${l.topicId}:${String(l.number).padStart(4, "0")}`;
    const alphabet = allLessons.filter((l) => l.topicId === "alphabet").map(keyOf);
    const rest = allLessons.filter((l) => l.topicId !== "alphabet").map(keyOf);
    expect(allLessons.slice(0, alphabet.length).map(keyOf)).toEqual(alphabet);
    expect(alphabet).toEqual([...alphabet].sort());
    expect(rest).toEqual([...rest].sort());
  });
});

import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { lessons } from "./index";
import { renderRegistry } from "./registryGen";

const lessonsDir = new URL("./lessons/", import.meta.url);

describe("реестр уроков (content/registry.ts)", () => {
  it("совпадает с файлами в content/lessons (если нет: npm run content:index)", () => {
    const actual = readFileSync(new URL("./registry.ts", import.meta.url), "utf8");
    expect(actual).toBe(renderRegistry(lessonsDir));
  });

  it("в приложение попадает ровно столько уроков, сколько файлов", () => {
    const files = readdirSync(lessonsDir).filter((f) => f.endsWith(".json"));
    expect(lessons.length).toBe(files.length);
  });

  it("порядок: по ключу темы, затем по номеру урока", () => {
    const keys = lessons.map((l) => `${l.topicId}:${String(l.number).padStart(4, "0")}`);
    expect(keys).toEqual([...keys].sort());
  });
});

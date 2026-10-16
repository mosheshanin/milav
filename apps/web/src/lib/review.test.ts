import { describe, expect, it } from "vitest";
import type { ReviewField, ReviewListItem } from "@milav/shared";
import { fieldGroups, filterCounts, fixText, groupByLesson, nextItemId, realFixes, searchKey, visibleItems } from "./review";

const item = (id: string, extra: Partial<ReviewListItem> = {}): ReviewListItem => ({
  id,
  kind: "word",
  lessonId: "animals-1",
  he: "חתול",
  translit: "хату́ль",
  ru: "кот",
  hasImage: true,
  status: "new",
  mine: null,
  reviewed: false,
  ...extra,
});

const items = [
  item("animals-1-cat"),
  item("animals-1-dog", { he: "כלב", translit: "ке́лев", ru: "собака", status: "fix", hasImage: false }),
  item("food-1-apple", { lessonId: "food-1", he: "תפוח", translit: "тапу́ах", ru: "яблоко", status: "done" }),
  item("food-1-honey", { lessonId: "food-1", he: "דבש", translit: "два́ш", ru: "мёд", status: "ok" }),
];

const fields: ReviewField[] = [
  { path: "he", group: "Слово", label: "Иврит", value: "חתול", kind: "he" },
  { path: "ru", group: "Слово", label: "Перевод", value: "кот", kind: "text" },
  { path: "gender", group: "Слово", label: "Род", value: "m", kind: "gender" },
  { path: "example.ru", group: "Фраза", label: "Перевод", value: "Это кот", kind: "text" },
];

describe("список проверки", () => {
  it("фильтры и счётчики", () => {
    expect(visibleItems(items, "fix", "").map((i) => i.id)).toEqual(["animals-1-dog"]);
    expect(visibleItems(items, "noImage", "").map((i) => i.id)).toEqual(["animals-1-dog"]);
    expect(visibleItems(items, "all", "")).toHaveLength(4);
    expect(filterCounts(items)).toEqual({ new: 1, fix: 1, ok: 1, done: 1, noImage: 1, all: 4 });
  });

  it("поиск без ударений, огласовок и разницы е/ё, по ивриту, переводу и id", () => {
    expect(searchKey("Ёлка́")).toBe("елка");
    expect(searchKey("חָתוּל")).toBe("חתול");
    expect(visibleItems(items, "all", "мед").map((i) => i.id)).toEqual(["food-1-honey"]);
    expect(visibleItems(items, "all", "хатуль").map((i) => i.id)).toEqual(["animals-1-cat"]);
    expect(visibleItems(items, "all", "כלב").map((i) => i.id)).toEqual(["animals-1-dog"]);
    expect(visibleItems(items, "all", "food-1").map((i) => i.id)).toEqual(["food-1-apple", "food-1-honey"]);
    expect(visibleItems(items, "fix", "яблоко")).toEqual([]);
  });

  it("группы по урокам без пустых и следующее слово", () => {
    const lessons = [
      { id: "animals-1", title: "Животные · 1" },
      { id: "colors-1", title: "Цвета · 1" },
      { id: "food-1", title: "Еда · 1" },
    ];
    expect(groupByLesson(lessons, items).map((g) => [g.lesson.id, g.items.length])).toEqual([
      ["animals-1", 2],
      ["food-1", 2],
    ]);
    expect(nextItemId(items, "animals-1-dog")).toBe("food-1-apple");
    expect(nextItemId(items, "food-1-honey")).toBeNull();
    expect(nextItemId(items, "nope")).toBeNull();
  });
});

describe("правки", () => {
  it("поля по группам в порядке показа", () => {
    expect(fieldGroups(fields).map((g) => [g.group, g.fields.length])).toEqual([
      ["Слово", 3],
      ["Фраза", 1],
    ]);
  });

  it("в отзыв уходят только настоящие изменения", () => {
    expect(realFixes(fields, { he: " חתול ", ru: " кошка ", "example.ru": "", nope: "x" })).toEqual({ ru: "кошка" });
  });

  it("исправление одной строкой", () => {
    expect(fixText(fields, "ru", "кошка")).toBe("Перевод: кот → кошка");
    expect(fixText(fields, "gender", "f")).toBe("Род: мужской → женский");
    expect(fixText(fields, "example.ru", "Это котик")).toBe("Фраза, перевод: Это кот → Это котик");
    expect(fixText(fields, "verb.root", "כתב")).toBe("verb.root: כתב");
  });
});

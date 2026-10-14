import { describe, expect, it } from "vitest";
import { applyImage, imagePath, imageUses, missingImages, parseInboxName, planInbox, targetsOf, type RawLesson } from "./inbox";

const lessons = (): RawLesson[] => [
  {
    words: [
      { id: "food-2-pomegranate", he: "רימון", ru: "гранат" },
      { id: "home-1-room", he: "חדר", ru: "комната", image: "/words/home-1-room.svg" },
    ],
  },
  {
    letters: [
      { id: "alphabet-5-resh", example: { he: "רימון", ru: "гранат" } },
      { id: "alphabet-1-he", example: { he: "הר", ru: "гора" } },
      { id: "alphabet-2-het", example: { he: "חדר", ru: "комната", image: "/words/home-1-room.svg" } },
    ],
  },
];

describe("имя файла", () => {
  it("id и расширение, регистр расширения не важен", () => {
    expect(parseInboxName("animals-1-cat.png")).toEqual({ id: "animals-1-cat", ext: "png" });
    expect(parseInboxName("animals-1-cat.JPG")).toEqual({ id: "animals-1-cat", ext: "jpg" });
    expect(parseInboxName("a.svg")).toEqual({ id: "a", ext: "svg" });
  });

  it("лишнее не принимается", () => {
    for (const bad of ["cat.gif", "Cat.png", "cat", "cat.png.png", "кот.png", "cat copy.png", ".png"]) expect(parseInboxName(bad), bad).toBeNull();
  });

  it("путь: слово и пример буквы", () => {
    expect(imagePath({ kind: "word", id: "animals-1-cat" }, "webp")).toBe("/words/animals-1-cat.webp");
    expect(imagePath({ kind: "letter", id: "alphabet-1-he" }, "webp")).toBe("/words/alphabet-1-he-example.webp");
  });
});

describe("цели и список без картинки", () => {
  it("слова и слова-примеры букв", () => {
    expect(targetsOf(lessons()).map((t) => t.id)).toEqual(["food-2-pomegranate", "home-1-room", "alphabet-5-resh", "alphabet-1-he", "alphabet-2-het"]);
    expect(missingImages(lessons()).map((t) => t.id)).toEqual(["food-2-pomegranate", "alphabet-5-resh", "alphabet-1-he"]);
  });
});

describe("план ящика", () => {
  const targets = targetsOf(lessons());

  it("известные имена принимаются", () => {
    const plan = planInbox(["food-2-pomegranate.png", "README.md", ".gitkeep"], targets);
    expect(plan.problems).toEqual([]);
    expect(plan.accepted.map((a) => [a.file, a.target.id])).toEqual([["food-2-pomegranate.png", "food-2-pomegranate"]]);
  });

  it("неизвестное слово, плохое имя и два файла на слово остаются проблемами", () => {
    const plan = planInbox(["nope-1-x.png", "Bad Name.png", "home-1-room.png", "home-1-room.jpg"], targets);
    expect(plan.accepted).toEqual([]);
    expect(plan.problems.join("\n")).toContain("нет слова или буквы с id «nope-1-x»");
    expect(plan.problems.join("\n")).toContain("Bad Name.png: имя должно быть");
    expect(plan.problems.filter((p) => p.includes("несколько файлов")).length).toBe(2);
  });
});

describe("запись картинки в уроки", () => {
  it("у слова ставится image, и пример буквы с тем же ивритом получает ту же картинку", () => {
    const data = lessons();
    const target = targetsOf(data).find((t) => t.id === "food-2-pomegranate")!;
    expect(applyImage(data, target, "/words/food-2-pomegranate.webp")).toBe(2);
    expect(data[0]!.words![0]!.image).toBe("/words/food-2-pomegranate.webp");
    expect(data[1]!.letters![0]!.example.image).toBe("/words/food-2-pomegranate.webp");
    expect(data[1]!.letters![1]!.example.image).toBeUndefined();
  });

  it("замена картинки слова обновляет и пример буквы, который показывал старую", () => {
    const data = lessons();
    const target = targetsOf(data).find((t) => t.id === "home-1-room")!;
    expect(applyImage(data, target, "/words/home-1-room.webp")).toBe(2);
    expect(data[1]!.letters![2]!.example.image).toBe("/words/home-1-room.webp");
    expect(imageUses(data, "/words/home-1-room.svg")).toBe(0);
  });

  it("картинка буквы меняет только её", () => {
    const data = lessons();
    const target = targetsOf(data).find((t) => t.id === "alphabet-1-he")!;
    expect(applyImage(data, target, "/words/alphabet-1-he-example.webp")).toBe(1);
    expect(data[1]!.letters![1]!.example.image).toBe("/words/alphabet-1-he-example.webp");
  });

  it("повтор того же пути ничего не меняет", () => {
    const data = lessons();
    const target = targetsOf(data).find((t) => t.id === "home-1-room")!;
    expect(applyImage(data, { ...target, image: "/words/home-1-room.svg" }, "/words/home-1-room.svg")).toBe(0);
  });

  it("счётчик использований", () => {
    expect(imageUses(lessons(), "/words/home-1-room.svg")).toBe(2);
  });
});

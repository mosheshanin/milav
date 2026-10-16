import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildCatalog, lessonItems, stagesFor } from "@milav/shared";
import { allLessons, catalog, contentInfo } from "./index";
import { manifest } from "./manifest";
import { lessonVersion, renderManifest, renderManifestFromDir } from "./manifestGen";

const lessonsDir = new URL("./lessons/", import.meta.url);
const fileText = readFileSync(new URL("./manifest.json", import.meta.url), "utf8");

describe("манифест для приложения (content/manifest.json)", () => {
  it("совпадает с уроками (если нет: npm run content:index)", () => {
    expect(fileText).toBe(renderManifest(allLessons));
  });

  it("сборка по файлам каталога даёт тот же манифест и тот же порядок, что allLessons", () => {
    expect(renderManifestFromDir(lessonsDir)).toBe(renderManifest(allLessons));
    expect(manifest.lessons.map((l) => l.id)).toEqual(allLessons.map((l) => l.id));
  });

  it("у каждого урока верные число слов, этапы и бесплатность", () => {
    for (const lesson of allLessons) {
      const meta = manifest.lessons.find((m) => m.id === lesson.id)!;
      expect(meta.count, lesson.id).toBe(lessonItems(lesson).length);
      expect(meta.stages, lesson.id).toEqual([...stagesFor(lesson)]);
      expect(meta.free, lesson.id).toBe(lesson.free);
      expect(meta.v, lesson.id).toBe(lessonVersion(lesson));
    }
  });

  it("сведения о контенте и каталог бейджей те же, что на сервере", () => {
    expect(manifest.info).toEqual(contentInfo());
    const fromManifest = buildCatalog(manifest.info);
    expect(fromManifest.version).toBe(catalog.version);
    expect(fromManifest.badges.map((b) => b.id)).toEqual(catalog.badges.map((b) => b.id));
  });

  it("слов уроков в манифесте нет: ни id, ни переводов, ни написания", () => {
    for (const lesson of allLessons) {
      if (lesson.section === "alphabet") continue; // алфавит бесплатный, формы букв на главной показываются
      for (const item of lessonItems(lesson)) {
        expect(fileText.includes(`"${item.id}"`), item.id).toBe(false);
        expect(fileText.includes(item.he), `${item.id}: ${item.he}`).toBe(false);
      }
    }
  });

  it("версия урока меняется от любой правки слова", () => {
    const lesson = allLessons.find((l) => l.section !== "alphabet")!;
    const edited = JSON.parse(JSON.stringify(lesson)) as typeof lesson;
    lessonItems(edited)[0]!.translit += "!";
    expect(lessonVersion(edited)).not.toBe(lessonVersion(lesson));
  });
});

import { describe, expect, it } from "vitest";
import type { Section } from "@milav/shared";
import { allLessons } from "@milav/content";
import { DEFAULT_EMOJI, LESSON_EMOJI, SECTION_EMOJI, TOPIC_EMOJI, lessonEmoji, sectionEmoji, topicEmoji } from "./homeEmoji";

describe("homeEmoji", () => {
  it("у каждой темы есть эмодзи", () => {
    const missing = [...new Set(allLessons.map((l) => l.topicId))].filter((t) => !TOPIC_EMOJI[t]);
    expect(missing, "добавьте эмодзи темы в TOPIC_EMOJI (apps/web/src/lib/homeEmoji.ts)").toEqual([]);
  });

  it("у каждого раздела слов своё эмодзи, не как у алфавита", () => {
    const sections = [...new Set(allLessons.map((l) => l.section))].filter((s): s is Section => s !== "alphabet");
    for (const section of sections) expect(sectionEmoji(section), section).not.toBe(DEFAULT_EMOJI);
    const all = [...Object.values(SECTION_EMOJI), TOPIC_EMOJI.alphabet];
    expect(new Set(all).size).toBe(all.length);
  });

  it("у каждого урока есть эмодзи", () => {
    const missing = allLessons.filter((l) => !LESSON_EMOJI[l.id]).map((l) => l.id);
    expect(missing, "добавьте эмодзи урока в LESSON_EMOJI (apps/web/src/lib/homeEmoji.ts)").toEqual([]);
  });

  it("эмодзи уроков внутри темы не повторяются", () => {
    const byTopic = new Map<string, string[]>();
    for (const l of allLessons) byTopic.set(l.topicId, [...(byTopic.get(l.topicId) ?? []), lessonEmoji(l)]);
    for (const [topic, list] of byTopic) expect(new Set(list).size, topic).toBe(list.length);
  });

  it("запасные варианты: урок без эмодзи берёт эмодзи темы, тема без эмодзи книгу", () => {
    expect(lessonEmoji({ id: "animals-99", topicId: "animals" })).toBe(TOPIC_EMOJI.animals);
    expect(lessonEmoji({ id: "new-1", topicId: "new" })).toBe(DEFAULT_EMOJI);
    expect(topicEmoji("new")).toBe(DEFAULT_EMOJI);
  });
});

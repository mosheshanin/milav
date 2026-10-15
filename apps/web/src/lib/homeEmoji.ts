// Эмодзи тем и уроков на главной. Это оформление, а не контент урока, поэтому оно живёт здесь, а не в JSON уроков.
// Новому уроку или теме нужно добавить эмодзи сюда: это проверяет тест `homeEmoji.test.ts`.
// Если эмодзи нет, урок получает эмодзи своей темы, тема получает книгу.

import type { AnyLesson } from "@milav/shared";

export const DEFAULT_EMOJI = "📘";

/** По `topicId`. */
export const TOPIC_EMOJI: Record<string, string> = {
  alphabet: "🔤",
  animals: "🐾",
  food: "🍽️",
  family: "👨‍👩‍👧",
  home: "🏠",
  colors: "🎨",
  paal: "✍️",
  piel: "💬",
};

/** По id урока. */
export const LESSON_EMOJI: Record<string, string> = {
  "alphabet-1": "🌱",
  "alphabet-2": "👣",
  "alphabet-3": "✋",
  "alphabet-4": "👁️",
  "alphabet-5": "🏁",
  "alphabet-6": "👖",
  "animals-1": "🐶",
  "animals-2": "🦁",
  "animals-3": "🐠",
  "food-1": "🥖",
  "food-2": "🍓",
  "food-3": "🥗",
  "family-1": "💞",
  "family-2": "🤝",
  "family-3": "👫",
  "home-1": "🚪",
  "home-2": "🛋️",
  "home-3": "🧺",
  "colors-1": "🔴",
  "colors-2": "🌗",
  "colors-3": "🦓",
  "paal-1": "✏️",
  "paal-2": "🙌",
  "paal-3": "🔟",
  "piel-1": "🗣️",
  "piel-2": "💼",
  "piel-3": "✨",
};

export function topicEmoji(topicId: string): string {
  return TOPIC_EMOJI[topicId] ?? DEFAULT_EMOJI;
}

export function lessonEmoji(lesson: Pick<AnyLesson, "id" | "topicId">): string {
  return LESSON_EMOJI[lesson.id] ?? topicEmoji(lesson.topicId);
}

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
  city: "🏙️",
  abstract: "💭",
  colors: "🎨",
  body: "🧍",
  qualities: "⚖️",
  paal: "✍️",
  piel: "💬",
  hifil: "🚀",
  nifal: "🔄",
  hitpael: "👔",
  weak: "🍃",
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
  "food-1": "🥖",
  "food-2": "🍎",
  "food-3": "☕",
  "food-4": "🍯",
  "family-1": "💞",
  "family-2": "🤝",
  "family-3": "👫",
  "family-4": "💍",
  "home-1": "🚪",
  "home-2": "🛋️",
  "home-3": "🧺",
  "home-4": "🏢",
  "city-1": "🏪",
  "city-2": "🚌",
  "city-3": "🚦",
  "abstract-1": "🔑",
  "abstract-2": "🧩",
  "abstract-3": "🔭",
  "abstract-4": "📐",
  "colors-1": "🔴",
  "body-1": "👀",
  "body-2": "💪",
  "body-3": "💊",
  "qualities-1": "🐘",
  "qualities-2": "💎",
  "qualities-3": "🐢",
  "paal-1": "✏️",
  "paal-2": "🙌",
  "paal-3": "🔟",
  "paal-4": "🗝️",
  "paal-5": "🔮",
  "piel-1": "🗣️",
  "piel-2": "💼",
  "piel-3": "✨",
  "hifil-1": "▶️",
  "hifil-2": "📌",
  "hifil-3": "🧩",
  "nifal-1": "🚪",
  "nifal-2": "🎭",
  "nifal-3": "📦",
  "hitpael-1": "👕",
  "hitpael-2": "😍",
  "hitpael-3": "💌",
  "weak-1": "🧭",
  "weak-2": "🌅",
  "weak-3": "🏃",
  "weak-4": "🎁",
  "weak-5": "⏳",
  "weak-6": "👀",
};

export function topicEmoji(topicId: string): string {
  return TOPIC_EMOJI[topicId] ?? DEFAULT_EMOJI;
}

export function lessonEmoji(lesson: Pick<AnyLesson, "id" | "topicId">): string {
  return LESSON_EMOJI[lesson.id] ?? topicEmoji(lesson.topicId);
}

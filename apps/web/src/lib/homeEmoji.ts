// Эмодзи тем и уроков на главной. Это оформление, а не контент урока, поэтому оно живёт здесь, а не в JSON уроков.
// Новому уроку или теме нужно добавить эмодзи сюда: это проверяет тест `homeEmoji.test.ts`.
// Если эмодзи нет, урок получает эмодзи своей темы, тема получает книгу.

import type { AnyLesson, Section } from "@milav/shared";

export const DEFAULT_EMOJI = "📘";

/** Главные разделы слов на главной (21.10). Алфавит берёт эмодзи своей темы. */
export const SECTION_EMOJI: Record<Section, string> = {
  basics: "🧱",
  numbers: "🕰️",
  nouns: "📦",
  verbs: "🏃",
  adjectives: "🌈",
};

/** По `topicId`. */
export const TOPIC_EMOJI: Record<string, string> = {
  alphabet: "🔤",
  pronouns: "🙋",
  numbers: "🔢",
  connectors: "🔗",
  adverbs: "⏰",
  yesno: "👍",
  phrases: "🤝",
  animals: "🐾",
  food: "🍽️",
  family: "👨‍👩‍👧",
  home: "🏠",
  city: "🏙️",
  shops: "🛒",
  clothes: "👕",
  abstract: "💭",
  colors: "🎨",
  body: "🧍",
  nature: "🌦️",
  mood: "🙂",
  gov: "🏛️",
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
  "pronouns-1": "👋",
  "numbers-1": "🔟",
  "pronouns-2": "❓",
  "numbers-2": "🧮",
  "numbers-3": "💯",
  "numbers-4": "🔢",
  "numbers-5": "🎲",
  "numbers-6": "📅",
  "connectors-1": "🔗",
  "connectors-2": "📍",
  "connectors-3": "🧱",
  "adverbs-1": "⏰",
  "adverbs-2": "🧭",
  "adverbs-3": "📊",
  "adverbs-4": "⏳",
  "yesno-1": "✅",
  "yesno-2": "🚦",
  "phrases-1": "☀️",
  "phrases-2": "🙏",
  "phrases-3": "🗣️",
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
  "city-4": "🚗",
  "shops-1": "🏬",
  "shops-2": "🛍️",
  "clothes-1": "👗",
  "clothes-2": "👟",
  "clothes-3": "📏",
  "abstract-1": "🔑",
  "abstract-2": "🧩",
  "abstract-3": "🔭",
  "abstract-4": "📐",
  "colors-1": "🔴",
  "body-1": "👀",
  "body-2": "💪",
  "body-3": "💊",
  "body-4": "🤒",
  "nature-1": "⛅",
  "mood-1": "😢",
  "gov-1": "🛂",
  "gov-2": "🏥",
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

export function sectionEmoji(section: Section): string {
  return SECTION_EMOJI[section] ?? DEFAULT_EMOJI;
}

export function topicEmoji(topicId: string): string {
  return TOPIC_EMOJI[topicId] ?? DEFAULT_EMOJI;
}

export function lessonEmoji(lesson: Pick<AnyLesson, "id" | "topicId">): string {
  return LESSON_EMOJI[lesson.id] ?? topicEmoji(lesson.topicId);
}

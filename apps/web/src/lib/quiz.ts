import { QUESTIONS_PER_TYPE, QUESTION_TYPES, type QuestionType, type Word } from "@milav/shared";

export interface Option {
  wordId: string;
  label: string;
}

export interface Question {
  type: QuestionType;
  wordId: string;
  /** Варианты ответа для вопросов с выбором (hear-ru, he-ru, ru-he). */
  options: Option[];
}

export type Rng = () => number;

function shuffle<T>(items: T[], rng: Rng): T[] {
  const a = items.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

function choiceOptions(type: QuestionType, target: Word, words: Word[], rng: Rng): Option[] {
  if (type !== "hear-ru" && type !== "he-ru" && type !== "ru-he") return [];
  const label = (w: Word) => (type === "ru-he" ? w.he : w.ru);
  const distractors = shuffle(
    words.filter((w) => w.id !== target.id),
    rng,
  ).slice(0, 3);
  return shuffle([target, ...distractors], rng).map((w) => ({ wordId: w.id, label: label(w) }));
}

/**
 * Собирает викторину: по QUESTIONS_PER_TYPE вопросов каждого типа, всего 25 для урока из 10 слов.
 * Порядок: послушать → прочитать иврит → прочитать русский → произнести → написать.
 * Внутри типа слова не повторяются.
 */
export function generateQuiz(words: Word[], rng: Rng = Math.random): Question[] {
  const questions: Question[] = [];
  for (const type of QUESTION_TYPES) {
    const chosen = shuffle(words, rng).slice(0, QUESTIONS_PER_TYPE);
    for (const word of chosen) {
      questions.push({ type, wordId: word.id, options: choiceOptions(type, word, words, rng) });
    }
  }
  return questions;
}

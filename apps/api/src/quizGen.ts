import { QUESTIONS_PER_TYPE, QUESTION_TYPES, type QuestionType, type QuizQuestion, type Word } from "@milav/shared";

export type Rng = () => number;

/** Случайные числа из криптографического генератора: порядок и варианты нельзя угадать по предыдущей викторине. */
export const secureRandom: Rng = () => crypto.getRandomValues(new Uint32Array(1))[0]! / 4294967296;

function shuffle<T>(items: T[], rng: Rng): T[] {
  const a = items.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

/** Вопросы с выбором ответа из четырёх слов урока. */
export function isChoiceType(type: QuestionType): boolean {
  return type === "hear-ru" || type === "he-ru" || type === "ru-he";
}

function choiceOptions(type: QuestionType, target: Word, words: Word[], rng: Rng): string[] {
  if (!isChoiceType(type)) return [];
  const distractors = shuffle(
    words.filter((w) => w.id !== target.id),
    rng,
  ).slice(0, 3);
  return shuffle([target, ...distractors], rng).map((w) => w.id);
}

/**
 * Собирает викторину: по QUESTIONS_PER_TYPE вопросов каждого типа, всего 25 для урока из 10 слов.
 * Порядок: послушать → прочитать иврит → прочитать русский → произнести → написать.
 * Внутри типа слова не повторяются.
 */
export function generateQuiz(words: Word[], rng: Rng = secureRandom): QuizQuestion[] {
  const questions: QuizQuestion[] = [];
  for (const type of QUESTION_TYPES) {
    const chosen = shuffle(words, rng).slice(0, QUESTIONS_PER_TYPE);
    for (const word of chosen) {
      questions.push({ type, wordId: word.id, options: choiceOptions(type, word, words, rng) });
    }
  }
  return questions;
}

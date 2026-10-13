import {
  ALPHABET_QUESTION_TYPES,
  ALPHABET_QUIZ_RULES,
  QUESTIONS_PER_TYPE,
  QUESTION_TYPES,
  isAlphabetLesson,
  isFormPair,
  type AnyLesson,
  type Letter,
  type QuestionType,
  type QuizQuestion,
  type Word,
} from "@milav/shared";

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

/** Вопросы с выбором ответа из четырёх вариантов (слов или букв урока). */
export function isChoiceType(type: QuestionType): boolean {
  return type === "hear-ru" || type === "he-ru" || type === "ru-he" || type === "hear-letter" || type === "letter-name";
}

/** Вопросы, где ответ рисуют: «напиши слово» и «напиши букву по названию». */
export function isWriteType(type: QuestionType): boolean {
  return type === "write" || type === "name-write";
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

/**
 * Варианты ответа в вопросе с выбором в алфавите: правильная буква и три другие буквы урока.
 * Обычная и конечная форма одной буквы (כ и ך) вместе с правильным ответом не предлагаются: по названию «каф» или
 * на слух их легко перепутать, а различать их ученик учится в вопросах «напиши» и «найди на клавиатуре».
 */
function letterOptions(target: Letter, letters: Letter[], rng: Rng): string[] {
  const others = letters.filter((l) => l.id !== target.id && !isFormPair(l.he, target.he));
  const distractors = shuffle(others, rng).slice(0, 3);
  return shuffle([target, ...distractors], rng).map((l) => l.id);
}

/**
 * Викторина алфавита: по 5 вопросов четырёх типов, всего 20. Порядок: послушать название и выбрать букву →
 * увидеть букву и выбрать название → написать букву по названию → найти букву на клавиатуре.
 * Внутри типа буквы не повторяются, поэтому в уроке нужно не меньше пяти букв.
 */
export function generateAlphabetQuiz(letters: Letter[], rng: Rng = secureRandom): QuizQuestion[] {
  const questions: QuizQuestion[] = [];
  for (const type of ALPHABET_QUESTION_TYPES) {
    const chosen = shuffle(letters, rng).slice(0, ALPHABET_QUIZ_RULES.perType);
    for (const letter of chosen) {
      const options = type === "hear-letter" || type === "letter-name" ? letterOptions(letter, letters, rng) : [];
      questions.push({ type, wordId: letter.id, options });
    }
  }
  return questions;
}

/** Викторина урока любого вида. */
export function generateLessonQuiz(lesson: AnyLesson, rng: Rng = secureRandom): QuizQuestion[] {
  return isAlphabetLesson(lesson) ? generateAlphabetQuiz(lesson.letters, rng) : generateQuiz(lesson.words, rng);
}

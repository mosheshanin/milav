import {
  ALPHABET_ALL_ID,
  ALPHABET_ALL_QUIZ_RULES,
  ALPHABET_QUESTION_TYPES,
  ALPHABET_QUIZ_RULES,
  GERESH_QUESTION_TYPES,
  GERESH_QUIZ_RULES,
  QUESTIONS_PER_TYPE,
  QUESTION_TYPES,
  isAlphabetLesson,
  isFormPair,
  isGereshForm,
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
 *
 * Урок со звуками дж, ж, ч (формы с гереш, их три): три типа без «напиши» по 3 вопроса, всего 9. В выборе
 * три варианта: все формы урока.
 */
export function generateAlphabetQuiz(letters: Letter[], rng: Rng = secureRandom): QuizQuestion[] {
  const geresh = letters.length > 0 && letters.every((l) => isGereshForm(l.he));
  const types = geresh ? GERESH_QUESTION_TYPES : ALPHABET_QUESTION_TYPES;
  const perType = geresh ? GERESH_QUIZ_RULES.perType : ALPHABET_QUIZ_RULES.perType;
  const questions: QuizQuestion[] = [];
  for (const type of types) {
    const chosen = shuffle(letters, rng).slice(0, perType);
    for (const letter of chosen) {
      const options = type === "hear-letter" || type === "letter-name" ? letterOptions(letter, letters, rng) : [];
      questions.push({ type, wordId: letter.id, options });
    }
  }
  return questions;
}

/**
 * Общая викторина по всем буквам алфавита: по 7 вопросов четырёх типов, всего 28 на 27 форм. Порядок типов тот же, что
 * в викторине урока. Буквы раздаются по типам по кругу из перемешанного списка, поэтому каждая буква спрашивается хотя
 * бы один раз (в каком-то из типов), а лишние места добирает случайная буква, которой в этом типе ещё нет.
 * Внутри типа буквы не повторяются. Неверные варианты в выборе берутся из всех букв, а не из одного урока.
 */
export function generateAlphabetAllQuiz(letters: Letter[], rng: Rng = secureRandom): QuizQuestion[] {
  const types = ALPHABET_QUESTION_TYPES;
  const perType = ALPHABET_ALL_QUIZ_RULES.perType;
  const buckets: Letter[][] = types.map(() => []);
  shuffle(letters, rng).forEach((letter, i) => {
    const bucket = buckets[i % types.length]!;
    if (bucket.length < perType) bucket.push(letter);
  });
  const questions: QuizQuestion[] = [];
  types.forEach((type, t) => {
    const bucket = buckets[t]!;
    const spare = shuffle(
      letters.filter((l) => !bucket.includes(l)),
      rng,
    );
    while (bucket.length < perType && spare.length > 0) bucket.push(spare.shift()!);
    for (const letter of shuffle(bucket, rng)) {
      const options = type === "hear-letter" || type === "letter-name" ? letterOptions(letter, letters, rng) : [];
      questions.push({ type, wordId: letter.id, options });
    }
  });
  return questions;
}

/** Викторина урока любого вида (и общая по всем буквам). */
export function generateLessonQuiz(lesson: AnyLesson, rng: Rng = secureRandom): QuizQuestion[] {
  if (lesson.id === ALPHABET_ALL_ID && isAlphabetLesson(lesson)) return generateAlphabetAllQuiz(lesson.letters, rng);
  return isAlphabetLesson(lesson) ? generateAlphabetQuiz(lesson.letters, rng) : generateQuiz(lesson.words, rng);
}

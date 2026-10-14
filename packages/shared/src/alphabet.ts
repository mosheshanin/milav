// Общие правила по виду урока: что изучают в уроке (слова или буквы), какие этапы и какая викторина.
// Чистые функции без зависимостей от приложения и сервера: ими пользуются и приложение, и Worker, и инструменты контента.
import {
  ALPHABET_QUIZ_RULES,
  ALPHABET_SECTION,
  FINAL_LETTERS,
  GERESH,
  GERESH_QUIZ_RULES,
  WORD_QUIZ_RULES,
  type QuizRules,
} from "./constants";
import { STAGES, type AlphabetLesson, type AnyLesson, type Letter, type Stage, type StudyItem, type Word } from "./types";

/** Этапы изучения буквы: «говори» не используется (у отдельной буквы нет надёжного распознавания речи). */
export const LETTER_STAGES: readonly Stage[] = ["listen", "write", "type"];

/** Этапы для звуков дж, ж, ч (буква с гереш): это не отдельные буквы, рисовать их по шаблонам нечем, поэтому «слушай» и «печатай». */
export const GERESH_LETTER_STAGES: readonly Stage[] = ["listen", "type"];

/** Форма с гереш: буква и знак после неё («ג׳»). */
export function isGereshForm(he: string): boolean {
  return he.length === 2 && he.endsWith(GERESH);
}

/** Урок, в котором изучают звуки дж, ж, ч: все его формы с гереш. */
export function isGereshLesson(lesson: Pick<AnyLesson, "section"> & { letters?: Letter[] }): boolean {
  return lesson.section === ALPHABET_SECTION && !!lesson.letters?.length && lesson.letters.every((l) => isGereshForm(l.he));
}

export function isAlphabetLesson(lesson: AnyLesson): lesson is AlphabetLesson {
  return lesson.section === ALPHABET_SECTION;
}

/** Слова или буквы урока. */
export function lessonItems(lesson: AnyLesson): StudyItem[] {
  return isAlphabetLesson(lesson) ? lesson.letters : lesson.words;
}

/** Этапы, которые проходят в уроке, по порядку. Слово засчитывается, когда пройдены все они. */
export function stagesFor(lesson: AnyLesson): readonly Stage[] {
  if (!isAlphabetLesson(lesson)) return STAGES;
  return isGereshLesson(lesson) ? GERESH_LETTER_STAGES : LETTER_STAGES;
}

/** Правила викторины урока. */
export function quizRulesFor(lesson: AnyLesson | undefined): QuizRules {
  if (lesson?.section !== ALPHABET_SECTION) return WORD_QUIZ_RULES;
  return isGereshLesson(lesson) ? GERESH_QUIZ_RULES : ALPHABET_QUIZ_RULES;
}

export function isLetter(item: StudyItem): item is Letter {
  return "name" in item;
}

export function isWord(item: StudyItem): item is Word {
  return !isLetter(item);
}

/** Конечная форма (ך ם ן ף ץ). */
export function isFinalForm(letter: string): boolean {
  return letter.length === 1 && FINAL_LETTERS.includes(letter);
}

/** Обычная форма для каждой конечной. */
const REGULAR_OF_FINAL: Record<string, string> = { ך: "כ", ם: "מ", ן: "נ", ף: "פ", ץ: "צ" };

/** Буква без учёта конечной формы: «ך» даёт «כ», остальные остаются как есть. */
export function baseLetter(letter: string): string {
  return REGULAR_OF_FINAL[letter] ?? letter;
}

/** Одна и та же буква в обычной и конечной форме (כ и ך). Сама с собой не считается. */
export function isFormPair(a: string, b: string): boolean {
  return a !== b && baseLetter(a) === baseLetter(b);
}

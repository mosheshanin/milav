// Общие правила по виду урока: что изучают в уроке (слова или буквы), какие этапы и какая викторина.
// Чистые функции без зависимостей от приложения и сервера: ими пользуются и приложение, и Worker, и инструменты контента.
import {
  ALPHABET_QUIZ_RULES,
  ALPHABET_SECTION,
  FINAL_LETTERS,
  WORD_QUIZ_RULES,
  type QuizRules,
} from "./constants";
import { STAGES, type AlphabetLesson, type AnyLesson, type Letter, type Stage, type StudyItem, type Word } from "./types";

/** Этапы изучения буквы: «говори» не используется (у отдельной буквы нет надёжного распознавания речи). */
export const LETTER_STAGES: readonly Stage[] = ["listen", "write", "type"];

export function isAlphabetLesson(lesson: AnyLesson): lesson is AlphabetLesson {
  return lesson.section === ALPHABET_SECTION;
}

/** Слова или буквы урока. */
export function lessonItems(lesson: AnyLesson): StudyItem[] {
  return isAlphabetLesson(lesson) ? lesson.letters : lesson.words;
}

/** Этапы, которые проходят в уроке, по порядку. Слово засчитывается, когда пройдены все они. */
export function stagesFor(lesson: AnyLesson): readonly Stage[] {
  return isAlphabetLesson(lesson) ? LETTER_STAGES : STAGES;
}

/** Правила викторины урока. */
export function quizRulesFor(lesson: Pick<AnyLesson, "section"> | undefined): QuizRules {
  return lesson?.section === ALPHABET_SECTION ? ALPHABET_QUIZ_RULES : WORD_QUIZ_RULES;
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

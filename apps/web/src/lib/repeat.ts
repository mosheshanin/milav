// Повторение слов в приложении: подписи и отбор для карточки на главной, подхода и «Моих слов».
// Логика без React, чтобы проверялась тестами. Правила коробок живут в пакете shared (repeat.ts).
import {
  REPEAT_LAST_BOX,
  dueInText,
  typedLetters,
  typedPartLengths,
  type MyWordItem,
  type RepeatAnswerRequest,
  type RepeatQuestion,
  type RepeatSummary,
  type RepeatWord,
} from "@milav/shared";
import { plural } from "./play";

/** «7 слов». */
export function wordsCount(n: number): string {
  return `${n} ${plural(n, "слово", "слова", "слов")}`;
}

/** Подсказка в «Напиши на иврите», сколько набирать: «Букв в слове: 5», у фразы по словам «Букв: 3 + 2» (пробел ставится сам). */
export function lettersHint(he: string): string {
  const parts = typedPartLengths(he);
  return parts.length > 1 ? `Букв: ${parts.join(" + ")}, пробел встанет сам` : `Букв в слове: ${parts[0] ?? 0}`;
}

/** Текст карточки «Повторение» на главной. */
export function repeatCardText(summary: RepeatSummary): { line: string; canRepeat: boolean } {
  if (summary.due > 0) return { line: `Пора повторить: ${wordsCount(summary.due)}`, canRepeat: true };
  if (summary.nextDueIn !== null) {
    const when = dueInText(summary.nextDueIn);
    // «через 4 дн.» уже кончается точкой.
    return { line: `Всё повторено. Следующие слова ${when}${when.endsWith(".") ? "" : "."}`, canRepeat: false };
  }
  return { line: "Всё повторено.", canRepeat: false };
}

/** Через сколько вернётся слово после ответа: «Вернётся через 3 дн.», «Вернётся завтра». */
export function returnsText(dueIn: number): string {
  return `Вернётся ${dueInText(dueIn)}`;
}

/** Итог подхода. */
export function repeatVerdict(right: number, total: number): string {
  if (total === 0) return "";
  if (right === total) return "Всё вспомнили! Слова уходят на более долгую паузу.";
  if (right * 2 >= total) return "Хороший результат. Забытые слова вернутся завтра.";
  return "Ничего страшного: забытые слова вернутся завтра, так они и запоминаются.";
}

export type WordsFilter = "all" | "due" | "strong";

/** «Прочные» это слова в последней коробке (пауза 60 дней). */
export function filterWords(items: readonly MyWordItem[], filter: WordsFilter): MyWordItem[] {
  if (filter === "due") return items.filter((i) => i.dueIn === 0);
  if (filter === "strong") return items.filter((i) => i.box === REPEAT_LAST_BOX);
  return [...items];
}

/** Сколько делений полоски силы памяти закрашено: новое слово одно, прочное все шесть. */
export function strengthFilled(box: number): number {
  return Math.min(Math.max(box, 0), REPEAT_LAST_BOX) + 1;
}

/**
 * Проверка ответа на телефоне: для «Ещё раз» (тренировка без записи) и когда сервер ответил «уже повторено».
 * В подходе верность ответа определяет сервер.
 */
export function localCorrect(question: RepeatQuestion, answer: Omit<RepeatAnswerRequest, "wordId" | "type">, words: Record<string, RepeatWord>): boolean {
  if (answer.giveUp) return false;
  if (question.form) {
    if (question.type === "form-pick") {
      // Варианты «выбери форму» различаются написанием: верен вариант с той же формой иврита.
      return question.form.options.find((o) => o.id === answer.choice)?.text === question.form.niqqud;
    }
    return answer.choice === question.form.id;
  }
  if (question.type === "type") return answer.typed === typedLetters(words[question.wordId]?.he ?? "").join("");
  return answer.choice === question.wordId;
}

/** «Ещё раз»: забытые вопросы по одному разу, без повторов слова (порядок как в подходе). */
export function drillQueue(forgotten: readonly RepeatQuestion[]): RepeatQuestion[] {
  const seen = new Set<string>();
  return forgotten.filter((q) => !seen.has(q.wordId) && !!seen.add(q.wordId));
}


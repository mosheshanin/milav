import { VERB_FORM_LABELS, VERB_TENSE_TITLES, verbForms, type VerbFormEntry, type VerbTense } from "./verbs";
import { isWord } from "./alphabet";
import type { StudyItem, Word, WordForm } from "./types";

/**
 * «Практика форм» (задача 9, этап 3): тренировка форм глагола после урока.
 * Всё считается на телефоне и нигде не сохраняется: практика не влияет на сдачу урока, очки, статусы и бейджи.
 * Те же вопросы задаёт сервер в повторении слов (задача 10): форма глагола вместо инфинитива, `formQuestion`.
 * Логика здесь чистая (случайность подставляется снаружи), чтобы её проверять тестами без браузера.
 */

/** Сколько вопросов в одном подходе. */
export const PRACTICE_QUESTIONS = 10;
/** Вариантов ответа на вопрос. */
export const PRACTICE_OPTIONS = 4;

/**
 * Типы вопросов:
 *   pick      дан глагол и «время · кто делает», нужно выбрать форму иврита (с огласовками);
 *   identify  дана форма иврита (её можно послушать), нужно выбрать «время · кто делает».
 */
export type PracticeKind = "pick" | "identify";

export interface PracticeOption {
  /** `<время>:<ключ>`, например `past:3ms`. */
  id: string;
  /** Для `pick` форма с огласовками, для `identify` подпись «Прошедшее · он». */
  text: string;
}

export interface PracticeQuestion {
  kind: PracticeKind;
  wordId: string;
  /** Инфинитив на иврите и перевод: что за глагол спрашивают. */
  wordHe: string;
  wordRu: string;
  tense: VerbTense;
  key: string;
  /** Подпись формы, которую спрашивают: «Прошедшее · он». */
  slot: string;
  /** Правильная форма целиком: для показа транскрипции и озвучки в разборе ответа. */
  form: WordForm;
  options: PracticeOption[];
  correctId: string;
}

export type Random = () => number;

export const slotId = (tense: VerbTense, key: string): string => `${tense}:${key}`;

/** «Прошедшее · он», «Настоящее · м. р., ед. ч.». */
export function slotLabel(tense: VerbTense, key: string): string {
  return `${VERB_TENSE_TITLES[tense]} · ${VERB_FORM_LABELS[tense][key] ?? key}`;
}

/** Глаголы урока: только у них есть что практиковать. У букв и обычных слов блока `verb` нет. */
export function practiceWords(items: readonly StudyItem[]): Word[] {
  return items.filter((item): item is Word => isWord(item) && !!item.verb);
}

/** Перемешивание Fisher–Yates, исходный массив не меняется. */
export function shuffle<T>(list: readonly T[], rng: Random): T[] {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

/**
 * Неправильные варианты: формы того же глагола, написанные иначе, чем правильная (по огласовкам).
 * Сначала до двух форм того же времени (отличаются только лицом), остальные из других времён:
 * так выбор проверяет и время, и лицо, а не только «не похоже на остальные».
 * Для `pick` формы с одинаковым написанием схлопываются, чтобы на экране не было двух одинаковых кнопок.
 */
function distractors(entries: readonly VerbFormEntry[], correct: VerbFormEntry, kind: PracticeKind, rng: Random): VerbFormEntry[] {
  const seen = new Set<string>([correct.form.niqqud]);
  const pool = shuffle(entries, rng).filter((e) => {
    if (e.form.niqqud === correct.form.niqqud) return false;
    if (kind === "pick") {
      if (seen.has(e.form.niqqud)) return false;
      seen.add(e.form.niqqud);
    }
    return true;
  });
  const sameTense = pool.filter((e) => e.tense === correct.tense).slice(0, 2);
  const rest = pool.filter((e) => !sameTense.includes(e));
  return [...sameTense, ...rest].slice(0, PRACTICE_OPTIONS - 1);
}

function makeQuestion(word: Word, entries: readonly VerbFormEntry[], correct: VerbFormEntry, kind: PracticeKind, rng: Random): PracticeQuestion | null {
  const wrong = distractors(entries, correct, kind, rng);
  if (wrong.length < PRACTICE_OPTIONS - 1) return null;
  const option = (e: VerbFormEntry): PracticeOption => ({
    id: slotId(e.tense, e.key),
    text: kind === "pick" ? e.form.niqqud : slotLabel(e.tense, e.key),
  });
  return {
    kind,
    wordId: word.id,
    wordHe: word.he,
    wordRu: word.ru,
    tense: correct.tense,
    key: correct.key,
    slot: slotLabel(correct.tense, correct.key),
    form: correct.form,
    options: shuffle([correct, ...wrong].map(option), rng),
    correctId: slotId(correct.tense, correct.key),
  };
}

/**
 * Форма годится для вопроса `identify`, только если её написание (с огласовками) встречается у глагола один раз.
 * Иначе у вопроса два верных ответа: например, «ты (м.)» и «она» в будущем времени пишутся и читаются одинаково (תכתוב).
 */
function isUnique(entries: readonly VerbFormEntry[], entry: VerbFormEntry): boolean {
  return entries.filter((e) => e.form.niqqud === entry.form.niqqud).length === 1;
}

/**
 * Набор вопросов для одного подхода. Типы чередуются (pick, identify, …), глаголы идут по кругу в случайном порядке,
 * время выбирается равномерно (иначе повелительное, где всего 4 формы из 27, почти не встречалось бы).
 * Одна и та же форма дважды не спрашивается. Если форм не хватает на `count`, вопросов будет меньше.
 */
export function buildPractice(words: readonly Word[], rng: Random = Math.random, count: number = PRACTICE_QUESTIONS): PracticeQuestion[] {
  const verbs = shuffle(
    words.filter((w) => w.verb),
    rng,
  ).map((word) => ({ word, entries: verbForms(word.verb!) }));
  if (!verbs.length) return [];
  const used = new Set<string>();
  const questions: PracticeQuestion[] = [];

  for (let n = 0; n < count; n++) {
    const kinds: PracticeKind[] = n % 2 === 0 ? ["pick", "identify"] : ["identify", "pick"];
    let made: PracticeQuestion | null = null;
    // Глагол по кругу; если у него не осталось подходящих форм, берём следующий.
    for (let v = 0; v < verbs.length && !made; v++) {
      const { word, entries } = verbs[(n + v) % verbs.length]!;
      for (const kind of kinds) {
        const free = entries.filter((e) => !used.has(`${word.id}:${slotId(e.tense, e.key)}`) && (kind === "pick" || isUnique(entries, e)));
        const tenses = [...new Set(free.map((e) => e.tense))];
        if (!tenses.length) continue;
        const tense = tenses[Math.floor(rng() * tenses.length)]!;
        const options = shuffle(
          free.filter((e) => e.tense === tense),
          rng,
        );
        for (const correct of options) {
          made = makeQuestion(word, entries, correct, kind, rng);
          if (made) {
            used.add(`${word.id}:${slotId(correct.tense, correct.key)}`);
            break;
          }
        }
        if (made) break;
      }
    }
    if (!made) break;
    questions.push(made);
  }
  return questions;
}

/**
 * Один вопрос о форме глагола для повторения слов: «выбери форму» или «что это за форма?» (вид случайный).
 * null, если у слова нет форм или из них не собрать вопрос.
 */
export function formQuestion(word: Word, rng: Random = Math.random): PracticeQuestion | null {
  if (!word.verb) return null;
  const both = buildPractice([word], rng, 2);
  if (both.length === 0) return null;
  return both[Math.min(both.length - 1, Math.floor(rng() * both.length))]!;
}

/** Итог подхода одной строкой. */
export function practiceVerdict(correct: number, total: number): string {
  if (total <= 0) return "Пока нечего повторять";
  const share = correct / total;
  if (share === 1) return "Без ошибок!";
  if (share >= 0.8) return "Отлично";
  if (share >= 0.5) return "Неплохо, повторите ещё раз";
  return "Посмотрите формы на карточках и попробуйте снова";
}

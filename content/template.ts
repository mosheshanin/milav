import {
  ALPHABET_GROUPS,
  ALPHABET_SECTION,
  ALPHABET_TITLE,
  ALPHABET_TOPIC_ID,
  FREE_LESSONS_PER_TOPIC,
  LETTER_KEYS,
  LETTER_NAMES,
  WORDS_PER_LESSON,
} from "@milav/shared";
import type { Section } from "@milav/shared";

/**
 * Шаблон нового урока для `npm run content:new`: все поля слов на месте, но пустые (их заполняет автор).
 * Пока пустые значения не заполнены, проверка схемы краснеет, и это нормально: так не забыть поле.
 */
export interface NewLessonOptions {
  topicId: string;
  number: number;
  section: Section;
  topic: string;
  title: string;
  /** Латинские ключи слов (по одному на слово): id слова будет `<id урока>-<ключ>`. */
  keys: string[];
}

const SECTIONS: Section[] = ["nouns", "verbs", "adjectives"];
const KEY = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;

export function templateProblems(o: NewLessonOptions): string[] {
  const problems: string[] = [];
  if (!KEY.test(o.topicId)) problems.push(`topicId «${o.topicId}»: латиница в нижнем регистре, цифры и дефисы, начало с буквы`);
  if (!Number.isInteger(o.number) || o.number < 1) problems.push(`номер урока «${o.number}»: нужно целое число от 1`);
  if (!SECTIONS.includes(o.section)) problems.push(`раздел «${o.section}»: допустимы ${SECTIONS.join(", ")}`);
  if (!o.topic.trim()) problems.push("не задано название темы (--topic)");
  if (!o.title.trim()) problems.push("не задано название урока (--title)");
  if (o.keys.length !== WORDS_PER_LESSON) problems.push(`нужно ровно ${WORDS_PER_LESSON} ключей слов, получено ${o.keys.length}`);
  const seen = new Set<string>();
  for (const key of o.keys) {
    if (!KEY.test(key)) problems.push(`ключ слова «${key}»: латиница в нижнем регистре, цифры и дефисы`);
    if (seen.has(key)) problems.push(`ключ слова «${key}» повторяется`);
    seen.add(key);
  }
  return problems;
}

const phrase = () => ({ he: "", translit: "", ru: "" });
const form = () => ({ he: "", niqqud: "", translit: "" });

function wordTemplate(id: string, section: Section): Record<string, unknown> {
  const word: Record<string, unknown> = { id, he: "", niqqud: "", translit: "", ru: "" };
  if (section === "nouns") word.gender = "";
  word.example = phrase();
  if (section === "adjectives") word.forms = { f: form(), mp: form(), fp: form() };
  word.reviewed = false;
  return word;
}

/** Объект урока в порядке полей, как в готовых файлах. Бесплатность считается по номеру. */
export function buildLessonTemplate(o: NewLessonOptions): Record<string, unknown> {
  const problems = templateProblems(o);
  if (problems.length) throw new Error(problems.join("\n"));
  const id = `${o.topicId}-${o.number}`;
  return {
    $schema: "../schema.json",
    id,
    topicId: o.topicId,
    section: o.section,
    topic: o.topic,
    number: o.number,
    free: o.number <= FREE_LESSONS_PER_TOPIC,
    title: o.title,
    words: o.keys.map((key) => wordTemplate(`${id}-${key}`, o.section)),
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// Урок алфавита: буквы заданы группой ALPHABET_GROUPS, поэтому ключи слов не нужны

export function alphabetTemplateProblems(number: number, title: string): string[] {
  const problems: string[] = [];
  if (!Number.isInteger(number) || number < 1 || number > ALPHABET_GROUPS.length) {
    problems.push(`номер урока алфавита «${number}»: нужно целое число от 1 до ${ALPHABET_GROUPS.length}`);
  }
  if (!title.trim()) problems.push("не задано название урока (--title)");
  return problems;
}

/**
 * Шаблон урока алфавита для `npm run content:new -- --topic-id alphabet --number N --title "..."`.
 * Буква, её id и русское название известны заранее и сразу проставлены; название на иврите, звук, слово-пример
 * заполняет автор. Бесплатный всегда.
 */
export function buildAlphabetTemplate(number: number, title: string): Record<string, unknown> {
  const problems = alphabetTemplateProblems(number, title);
  if (problems.length) throw new Error(problems.join("\n"));
  const id = `alphabet-${number}`;
  return {
    $schema: "../schema.json",
    id,
    topicId: ALPHABET_TOPIC_ID,
    section: ALPHABET_SECTION,
    topic: ALPHABET_TITLE,
    number,
    free: true,
    title,
    letters: ALPHABET_GROUPS[number - 1]!.map((he) => ({
      id: `${id}-${LETTER_KEYS[he]}`,
      he,
      name: { he: "", niqqud: "", ru: LETTER_NAMES[he] },
      sound: "",
      example: { he: "", niqqud: "", translit: "", ru: "" },
      reviewed: false,
    })),
  };
}

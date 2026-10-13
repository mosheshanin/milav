/**
 * Правила контента, которые не выразить схемой: транскрипция и её связь с ивритом.
 * Чистые функции без зависимостей: их используют тесты (content/*.test.ts) и инструменты (tools/content-*.ts).
 * Стандарт транскрипции описан в docs/CONTENT.md.
 */

/** Знак ударения: ставится сразу после ударной гласной. */
export const ACUTE = "́";

/** Гласные русских букв транскрипции: каждая это один слог. */
const VOWELS = "аеиоуэюя";

/**
 * Согласные иврита и то, чем они передаются в транскрипции (допустимые варианты).
 * Буквы א ע ה ו י здесь нет: они могут быть гласными или молчать, их не проверяем.
 * Несколько вариантов бывает там, где буква читается по-разному (ב б/в, כ к/х, פ п/ф, ש ш/с),
 * и для редких звуков с апострофом (ג׳ дж, ז׳ ж, צ׳ ч).
 */
const CONSONANTS: Record<string, string[]> = {
  ב: ["б", "в"],
  ג: ["г", "дж"],
  ד: ["д"],
  ז: ["з", "ж"],
  ח: ["х"],
  ט: ["т"],
  כ: ["к", "х"],
  ך: ["к", "х"],
  ל: ["л"],
  מ: ["м"],
  ם: ["м"],
  נ: ["н"],
  ן: ["н"],
  ס: ["с"],
  פ: ["п", "ф"],
  ף: ["п", "ф"],
  צ: ["ц", "ч"],
  ץ: ["ц", "ч"],
  ק: ["к"],
  ר: ["р"],
  ש: ["ш", "с"],
  ת: ["т"],
};

export function stripStress(translit: string): string {
  return translit.replaceAll(ACUTE, "");
}

/** Число слогов в части транскрипции (по числу гласных). */
export function syllables(part: string): number {
  return [...stripStress(part)].filter((ch) => VOWELS.includes(ch)).length;
}

/**
 * Ударение в транскрипции слова. Правило: в слове из двух и более слогов ровно один знак ударения
 * сразу после гласной; в слове из одного слога знака нет. Слова через пробел или дефис проверяются по частям.
 */
export function stressProblems(translit: string): string[] {
  const problems: string[] = [];
  for (const part of translit.split(/[ -]/)) {
    const marks = [...part].filter((ch) => ch === ACUTE).length;
    const count = syllables(part);
    if (count === 0) {
      problems.push(`«${part}»: нет ни одной гласной`);
    } else if (count === 1 && marks > 0) {
      problems.push(`«${part}»: слово из одного слога без знака ударения`);
    } else if (count >= 2 && marks !== 1) {
      problems.push(`«${part}»: в слове из ${count} слогов нужен ровно один знак ударения, сейчас ${marks}`);
    }
    const chars = [...part];
    chars.forEach((ch, i) => {
      const prev = chars[i - 1];
      if (ch === ACUTE && (prev === undefined || !VOWELS.includes(prev))) {
        problems.push(`«${part}»: знак ударения не после гласной`);
      }
    });
  }
  return problems;
}

/**
 * Согласные иврита должны находиться в транскрипции в том же порядке (между ними могут быть любые гласные
 * и лишние буквы). Ловит опечатки и неверные буквы: «ципор» для ציפור, но не «сипор».
 */
export function skeletonProblems(he: string, translit: string): string[] {
  const plain = stripStress(translit).replace(/[ -]/g, "");
  const problems: string[] = [];
  let pos = 0;
  for (const letter of [...he]) {
    const variants = CONSONANTS[letter];
    if (!variants) continue;
    let best: { end: number } | undefined;
    for (const variant of variants) {
      const at = plain.indexOf(variant, pos);
      if (at >= 0 && (!best || at + variant.length < best.end)) best = { end: at + variant.length };
    }
    if (!best) {
      problems.push(`«${translit}»: для буквы ${letter} нет подходящей (${variants.join(" или ")}) после позиции ${pos}`);
      break; // дальше позиции уже не определены
    }
    pos = best.end;
  }
  return problems;
}

// ---------------------------------------------------------------------------------------------------------------------
// Правила уровня темы и всего набора уроков

import type { Lesson } from "@milav/shared";
import { FREE_LESSONS_PER_TOPIC } from "@milav/shared";

/** Правило проверки набора уроков: возвращает список нарушений (пустой, если всё в порядке). */
export interface SetRule {
  name: string;
  check: (lessons: Lesson[]) => string[];
}

function byTopic(lessons: Lesson[]): Map<string, Lesson[]> {
  const map = new Map<string, Lesson[]>();
  for (const lesson of lessons) map.set(lesson.topicId, [...(map.get(lesson.topicId) ?? []), lesson]);
  return map;
}

export const SET_RULES: SetRule[] = [
  {
    name: "id урока равен <topicId>-<номер>",
    check: (lessons) =>
      lessons.filter((l) => l.id !== `${l.topicId}-${l.number}`).map((l) => `${l.id}: ожидался id ${l.topicId}-${l.number}`),
  },
  {
    name: "id уроков и слов уникальны во всём наборе",
    check: (lessons) => {
      const problems: string[] = [];
      const seenLessons = new Set<string>();
      const seenWords = new Set<string>();
      for (const lesson of lessons) {
        if (seenLessons.has(lesson.id)) problems.push(`повтор id урока ${lesson.id}`);
        seenLessons.add(lesson.id);
        for (const word of lesson.words) {
          if (seenWords.has(word.id)) problems.push(`повтор id слова ${word.id}`);
          seenWords.add(word.id);
        }
      }
      return problems;
    },
  },
  {
    name: "внутри темы одинаковые название и раздел",
    check: (lessons) => {
      const problems: string[] = [];
      for (const [topicId, items] of byTopic(lessons)) {
        if (new Set(items.map((l) => l.topic)).size > 1) problems.push(`${topicId}: разные названия темы`);
        if (new Set(items.map((l) => l.section)).size > 1) problems.push(`${topicId}: разные разделы`);
      }
      return problems;
    },
  },
  {
    name: "название темы не принадлежит двум разным темам раздела",
    check: (lessons) => {
      const problems: string[] = [];
      const owners = new Map<string, string>();
      for (const lesson of lessons) {
        const key = `${lesson.section}/${lesson.topic}`;
        const owner = owners.get(key);
        if (owner !== undefined && owner !== lesson.topicId) problems.push(`название «${lesson.topic}» у тем ${owner} и ${lesson.topicId}`);
        owners.set(key, lesson.topicId);
      }
      return problems;
    },
  },
  {
    name: "номера уроков темы идут подряд с 1",
    check: (lessons) => {
      const problems: string[] = [];
      for (const [topicId, items] of byTopic(lessons)) {
        const numbers = items.map((l) => l.number).sort((a, b) => a - b);
        if (numbers.some((n, i) => n !== i + 1)) problems.push(`${topicId}: номера ${numbers.join(", ")}, ожидались подряд с 1`);
      }
      return problems;
    },
  },
  {
    name: `бесплатны ровно первые ${FREE_LESSONS_PER_TOPIC} уроков каждой темы`,
    check: (lessons) =>
      lessons
        .filter((l) => l.free !== l.number <= FREE_LESSONS_PER_TOPIC)
        .map((l) => `${l.id}: free=${l.free}, а должно быть ${l.number <= FREE_LESSONS_PER_TOPIC}`),
  },
  {
    name: "иврит не повторяется внутри темы",
    check: (lessons) => {
      const problems: string[] = [];
      for (const items of byTopic(lessons).values()) {
        const seen = new Map<string, string>();
        for (const lesson of items) {
          for (const word of lesson.words) {
            const first = seen.get(word.he);
            if (first) problems.push(`${word.he}: есть в ${first} и в ${word.id}`);
            else seen.set(word.he, word.id);
          }
        }
      }
      return problems;
    },
  },
];

/** Все нарушения правил набора, с названием правила. */
export function setProblems(lessons: Lesson[]): string[] {
  return SET_RULES.flatMap((rule) => rule.check(lessons).map((p) => `${rule.name}: ${p}`));
}

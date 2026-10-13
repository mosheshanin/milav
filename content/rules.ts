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

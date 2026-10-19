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
  let previous = "";
  for (const letter of [...he]) {
    const variants = CONSONANTS[letter];
    if (!variants) continue;
    // Удвоение и соседние буквы с одним звуком (ט и ת в בָּעַטְתִּי «баа́ти») в транскрипции пишутся один раз.
    const doubled = letter === previous || (previous !== "" && CONSONANTS[previous]?.join() === variants.join());
    previous = letter;
    let best: { end: number } | undefined;
    for (const variant of variants) {
      const at = plain.indexOf(variant, pos);
      if (at >= 0 && (!best || at + variant.length < best.end)) best = { end: at + variant.length };
    }
    if (!best && doubled) continue; // удвоение не передаётся: שָׁתְתָה звучит «шата́»
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

import type { AlphabetLesson, Lesson, VerbData } from "@milav/shared";
import {
  ALPHABET_GROUPS,
  ALPHABET_TOPIC_ID,
  BINYANIM,
  BINYAN_KEYS,
  FINAL_LETTERS,
  FREE_LESSONS_PER_TOPIC,
  GIZRA_INFO,
  GIZRA_KEYS,
  LETTER_KEYS,
  GERESH,
  VERB_FORM_KEYS,
  VERB_TENSES,
  WEAK_ROOTS_TOPIC_ID,
  isFinalForm,
  isGizra,
  isGereshForm,
  letterRuName,
  normalizeHebrew,
  verbForms,
} from "@milav/shared";

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

// ---------------------------------------------------------------------------------------------------------------------
// Глаголы (решения владельца, 14.10: CLAUDE.md, docs/CONTENT.md). У сильных корней все буквы корня стоят в каждой форме.
// Слабые корни (гзары) теряют или меняют буквы корня: у такого глагола есть поле `gizra`, и проверка допускает отсутствие
// буквы только там, где это положено типу (`gizraOptionalPositions`).

/** Форма, о которой идёт речь: инфинитив (он лежит в `he` слова) или время из блока `verb`. */
export type VerbSlot = "infinitive" | "present" | "past" | "future" | "imperative";

/**
 * Номера букв корня (с 0), которые в этой форме можно не писать, у глагола пааль. У сильного корня (нет `gizra`) таких нет.
 * Это прежнее правило частей 1–3, оно не менялось с 18.10 (тест `verbWeak.test.ts` сверяет его с общей функцией на всех глаголах).
 * - פ״נ: первая נ не пишется в будущем, повелительном и инфинитиве (יפול, תן, ליפול); у נתנ последняя נ выпадает в инфинитиве (לתת) и в прошедшем перед ת (נתתי).
 * - פ״י: первая י (у הלכ первая ה) не пишется в будущем, повелительном и инфинитиве (ישב, שב, לשבת); в настоящем и прошедшем есть.
 * - פ״א: א выпадает только в инфинитиве לומר.
 * - פ״ל (לקח): ל не пишется в будущем и повелительном (יקח, קח).
 * - ע״ו и ע״י: средняя ו или י не пишется в настоящем и прошедшем (קם, קמתי, שם, שמתי) и в книжных формах на -נה (будущее
 *   2fp, 3fp и повелительное fp: תקמנה, שמנה), в остальных формах есть.
 * - ל״ה: последняя ה заменяется окончанием (רציתי, רצו, לרצות), поэтому в любой форме может отсутствовать.
 * - ל״א: א всегда пишется, как у сильного корня.
 */
export function paalOptionalPositions(verb: Pick<VerbData, "root" | "gizra">, slot: VerbSlot, key?: string): Set<number> {
  const optional = new Set<number>();
  const future = slot === "future" || slot === "imperative" || slot === "infinitive";
  for (const g of verb.gizra ?? []) {
    if (g === "pe_nun") {
      if (future) optional.add(0);
      // נתנ: последняя נ сливается с ת и в инфинитиве (לתת), и в прошедшем перед окончанием на ת (נתתי, נתתם).
      if (verb.root === "נתנ" && (slot === "infinitive" || slot === "past")) optional.add(2);
    } else if (g === "pe_yod") {
      if (future) optional.add(0);
    } else if (g === "pe_alef") {
      if (slot === "infinitive") optional.add(0);
    } else if (g === "pe_lamed") {
      if (slot === "future" || slot === "imperative") optional.add(0);
    } else if (g === "ayin_vav" || g === "ayin_yod") {
      const book = (slot === "future" && (key === "2fp" || key === "3fp")) || (slot === "imperative" && key === "fp");
      if (slot === "present" || slot === "past" || book) optional.add(1);
    } else if (g === "lamed_he") {
      optional.add(2);
    }
  }
  return optional;
}

/** Книжные формы на -נה: будущее 2fp и 3fp, повелительное fp. */
function isBookKey(slot: VerbSlot, key?: string): boolean {
  return (slot === "future" && (key === "2fp" || key === "3fp")) || (slot === "imperative" && key === "fp");
}

/** Прошедшее с окончанием на согласную (הבנתי, הבנת, הבנו): 1s, 2ms, 2fs, 1p, 2mp, 2fp. */
const PAST_CONSONANT_ENDING: ReadonlySet<string> = new Set(["1s", "2ms", "2fs", "1p", "2mp", "2fp"]);

/** Прошедшее с окончанием на ת (נתתי, נתת, נתתם, נתתן): 1s, 2ms, 2fs, 2mp, 2fp. */
const PAST_T_ENDING: ReadonlySet<string> = new Set(["1s", "2ms", "2fs", "2mp", "2fp"]);

/** Где буква корня может не писаться: в любой форме или только в части форм. */
type OptionalWhere = (slot: VerbSlot, key?: string) => boolean;
const EVERYWHERE: OptionalWhere = () => true;

/**
 * Хифъиль, пиэль и нифъаль (часть 2 слабых корней, 18.10): буквы выпадают не так, как в пааль, поэтому правила по бинъянам.
 * Номера букв корня с 0, значение это «где можно не писать». Чего в таблице нет, то пишется всегда.
 * - Хифъиль: первая נ сливается со второй буквой (הגיד, מגיד, יגיד, הגד, להגיד), первая י становится ו (הוריד, יוריד, הורד),
 *   средняя ו становится י или не пишется (הקים, הקמתי), средняя י не пишется в прошедшем перед согласной (הבנתי), в
 *   повелительном м.р. (הבן) и в книжных формах на -נה, последняя ה заменяется окончанием (הראיתי, הראו), א всегда пишется.
 * - Пиэль: средняя י и ו остаются (סיים, קיים, כיוון), נ в начале остаётся (ניסה, ניקה); выпадает только последняя ה.
 * - Нифъаль: первая נ совпадает с приставкой (נצל, נתן: одна נ в написании покрывает корень, пропуск не нужен; у נתנ последняя נ
 *   сливается с ת в прошедшем перед ת, см. ниже),
 *   первая י становится ו (נולד, נוצר), последняя ה заменяется окончанием, средняя ו остаётся (נסוג).
 */
const BINYAN_OPTIONAL: Partial<Record<string, Partial<Record<string, readonly { position: number; where: OptionalWhere }[]>>>> = {
  hifil: {
    pe_nun: [{ position: 0, where: EVERYWHERE }],
    pe_yod: [{ position: 0, where: EVERYWHERE }],
    ayin_vav: [{ position: 1, where: EVERYWHERE }],
    ayin_yod: [
      {
        position: 1,
        where: (slot, key) => (slot === "past" && key !== undefined && PAST_CONSONANT_ENDING.has(key)) || (slot === "imperative" && key === "ms") || isBookKey(slot, key),
      },
    ],
    lamed_he: [{ position: 2, where: EVERYWHERE }],
  },
  piel: {
    lamed_he: [{ position: 2, where: EVERYWHERE }],
  },
  nifal: {
    pe_yod: [{ position: 0, where: EVERYWHERE }],
    lamed_he: [{ position: 2, where: EVERYWHERE }],
  },
};

/**
 * Номера букв корня (с 0), которые в этой форме можно не писать. У сильного корня (нет `gizra`) таких нет.
 * Пааль (и глагол без бинъяна) идёт по прежнему правилу `paalOptionalPositions`, хифъиль, пиэль и нифъаль по таблице
 * `BINYAN_OPTIONAL`, у остальных бинъянов пропусков нет.
 */
export function gizraOptionalPositions(verb: Pick<VerbData, "root" | "gizra"> & { binyan?: VerbData["binyan"] }, slot: VerbSlot, key?: string): Set<number> {
  if (verb.binyan === undefined || verb.binyan === "paal") return paalOptionalPositions(verb, slot, key);
  const optional = new Set<number>();
  const table = BINYAN_OPTIONAL[verb.binyan];
  for (const g of verb.gizra ?? []) {
    for (const rule of table?.[g] ?? []) if (rule.where(slot, key)) optional.add(rule.position);
  }
  // נתנ в нифъаль: последняя נ сливается с ת перед окончанием на ת (ניתתי, ניתת, ניתתם, ניתתן), как в пааль (נתתי).
  if (verb.binyan === "nifal" && verb.root === "נתנ" && slot === "past" && key !== undefined && PAST_T_ENDING.has(key)) optional.add(2);
  return optional;
}

/** Буквы корня стоят в тексте в том же порядке (между ними могут быть другие); буквы из `optional` (номера с 0) можно пропустить. Огласовки и конечные формы не мешают. */
function hasLettersInOrder(text: string, letters: string, optional: ReadonlySet<number> = new Set()): boolean {
  const word = normalizeHebrew(text);
  const root = [...normalizeHebrew(letters)];
  // Необязательная буква может совпасть с чужой буквой дальше в слове (גרות: ו корня גור стоит после ר), поэтому
  // перебираем оба варианта: буква есть на этом месте или пропущена.
  const match = (index: number, from: number): boolean => {
    if (index === root.length) return true;
    const at = word.indexOf(root[index]!, from);
    if (at >= 0 && match(index + 1, at + 1)) return true;
    return optional.has(index) && match(index + 1, from);
  };
  return match(0, 0);
}

/** Нарушения в поле `gizra`: коды, количество и то, что буква корня на нужном месте подходит к типу. */
export function gizraProblems(verb: Pick<VerbData, "root" | "gizra">): string[] {
  const g = verb.gizra;
  if (g === undefined) return [];
  if (!Array.isArray(g) || g.length < 1 || g.length > 2) return ["gizra: нужен список из 1–2 кодов"];
  const problems: string[] = [];
  if (new Set(g).size !== g.length) problems.push("gizra: коды повторяются");
  const root = [...verb.root];
  for (const code of g) {
    if (!isGizra(code)) {
      problems.push(`gizra: код «${String(code)}» неизвестен, допустимы ${GIZRA_KEYS.join(", ")}`);
      continue;
    }
    const info = GIZRA_INFO[code];
    const letter = root[info.position];
    if (letter === undefined || !info.letters.includes(letter)) {
      problems.push(`gizra ${code} (${info.he}): в корне ${verb.root} на месте ${info.position + 1} должна быть ${info.letters.join(" или ")}`);
    } else if (code === "pe_yod" && letter === "ה" && verb.root !== "הלכ") {
      problems.push(`gizra pe_yod: корень ${verb.root} начинается с ה, исключение сделано только для הלכ`);
    }
  }
  return problems;
}

/**
 * Нарушения у одного глагола. `he` это инфинитив (основная форма слова), `verb` блок с бинъяном, корнем и формами.
 * Проверяет полноту таблицы, огласовки и транскрипцию каждой формы, корень в каждой форме и то,
 * что бинъян соответствует написанию (приставки инфинитива и причастия).
 */
export function verbProblems(he: string, verb: VerbData): string[] {
  const problems: string[] = [];
  const info = BINYANIM[verb.binyan];
  if (!info) return [`бинъян «${String(verb.binyan)}» неизвестен, допустимы ${BINYAN_KEYS.join(", ")}`];

  if (!/^[אבגדהוזחטיכלמנסעפצקרשת]{3,4}$/.test(verb.root)) problems.push(`корень «${verb.root}»: нужны 3–4 буквы без конечных форм`);

  if (!he.startsWith(info.infinitivePrefix)) problems.push(`инфинитив ${he}: в бинъяне ${info.ru} он начинается с ${info.infinitivePrefix}`);
  problems.push(...gizraProblems(verb));
  if (!hasLettersInOrder(he, verb.root, gizraOptionalPositions(verb, "infinitive"))) problems.push(`инфинитив ${he}: нет букв корня ${verb.root} по порядку`);

  for (const tense of VERB_TENSES) {
    const set = verb[tense] as Record<string, unknown> | undefined;
    if (!set) {
      // Повелительное наклонение необязательно: у части глаголов его нет.
      if (tense !== "imperative") problems.push(`нет блока ${tense}`);
      continue;
    }
    for (const key of VERB_FORM_KEYS[tense]) {
      if (!set[key]) problems.push(`${tense}.${key}: нет формы`);
    }
    for (const key of Object.keys(set)) {
      if (!VERB_FORM_KEYS[tense].includes(key)) problems.push(`${tense}.${key}: лишний ключ формы`);
    }
  }

  for (const { tense, key, form } of verbForms(verb)) {
    const where = `${tense}.${key}`;
    if (normalizeHebrew(form.niqqud) !== normalizeHebrew(form.he)) problems.push(`${where}: огласовки ${form.niqqud} не совпадают с ${form.he}`);
    if (!hasLettersInOrder(form.he, verb.root, gizraOptionalPositions(verb, tense, key))) problems.push(`${where}: в ${form.he} нет букв корня ${verb.root} по порядку`);
    problems.push(...stressProblems(form.translit).map((p) => `${where}: ${p}`));
    problems.push(...skeletonProblems(form.he, form.translit).map((p) => `${where}: ${p}`));
  }

  const ms = verb.present?.ms;
  if (ms && info.presentPrefix && !ms.he.startsWith(info.presentPrefix)) {
    problems.push(`present.ms: ${ms.he} в бинъяне ${info.ru} начинается с ${info.presentPrefix}`);
  }
  return problems;
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
    name: "блок verb только у глаголов, а у каждого глагола он есть; бинъян, корень и формы без ошибок",
    check: (lessons) =>
      lessons.flatMap((l) =>
        l.words.flatMap((w) => {
          if (l.section !== "verbs") return w.verb ? [`${w.id}: блок verb есть у слова раздела ${l.section}`] : [];
          if (!w.verb) return [`${w.id}: у глагола нет блока verb`];
          return verbProblems(w.he, w.verb).map((p) => `${w.id}: ${p}`);
        }),
      ),
  },
  {
    name: "в теме-бинъяне (topicId равен ключу бинъяна) все глаголы этого бинъяна",
    check: (lessons) =>
      lessons
        .filter((l) => (BINYAN_KEYS as readonly string[]).includes(l.topicId))
        .flatMap((l) => [
          ...(l.section !== "verbs" ? [`${l.id}: тема ${l.topicId} это бинъян, раздел должен быть verbs`] : []),
          ...l.words.filter((w) => w.verb && w.verb.binyan !== l.topicId).map((w) => `${w.id}: бинъян ${w.verb!.binyan} в теме ${l.topicId}`),
        ]),
  },
  {
    name: "в теме слабых корней (weak) раздел verbs и у каждого глагола есть gizra",
    check: (lessons) =>
      lessons
        .filter((l) => l.topicId === WEAK_ROOTS_TOPIC_ID)
        .flatMap((l) => [
          ...(l.section !== "verbs" ? [`${l.id}: тема ${l.topicId} должна быть в разделе verbs`] : []),
          ...l.words.filter((w) => !w.verb?.gizra?.length).map((w) => `${w.id}: у глагола темы ${l.topicId} нет поля gizra`),
        ]),
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

// ---------------------------------------------------------------------------------------------------------------------
// Правила урока алфавита и связи алфавита с остальными уроками (решения владельца, 13.10: docs/CONTENT.md)

/** Правило проверки уроков алфавита: возвращает список нарушений (пустой, если всё в порядке). */
export interface AlphabetRule {
  name: string;
  check: (lessons: AlphabetLesson[]) => string[];
}

const REGULAR_OF_FINAL: Record<string, string> = { ך: "כ", ם: "מ", ן: "נ", ף: "פ", ץ: "צ" };

export const ALPHABET_RULES: AlphabetRule[] = [
  {
    name: `id урока alphabet-<номер>, тема «${ALPHABET_TOPIC_ID}», все уроки бесплатные`,
    check: (lessons) =>
      lessons.flatMap((l) => [
        ...(l.id !== `alphabet-${l.number}` ? [`${l.id}: ожидался id alphabet-${l.number}`] : []),
        ...(l.topicId !== ALPHABET_TOPIC_ID ? [`${l.id}: topicId ${l.topicId}, ожидался ${ALPHABET_TOPIC_ID}`] : []),
        ...(!l.free ? [`${l.id}: алфавит полностью бесплатный, а free=false`] : []),
      ]),
  },
  {
    name: "одинаковое название темы во всех уроках алфавита",
    check: (lessons) => (new Set(lessons.map((l) => l.topic)).size > 1 ? ["у уроков алфавита разные названия темы"] : []),
  },
  {
    name: `номера уроков идут подряд с 1, не больше ${ALPHABET_GROUPS.length}`,
    check: (lessons) => {
      const numbers = lessons.map((l) => l.number).sort((a, b) => a - b);
      const problems: string[] = [];
      if (numbers.some((n, i) => n !== i + 1)) problems.push(`номера ${numbers.join(", ")}, ожидались подряд с 1`);
      if (numbers.length > ALPHABET_GROUPS.length) problems.push(`уроков ${numbers.length}, а групп букв ${ALPHABET_GROUPS.length}`);
      return problems;
    },
  },
  {
    name: "в уроке N ровно буквы группы N в алфавитном порядке (ALPHABET_GROUPS)",
    check: (lessons) =>
      lessons.flatMap((l) => {
        const group = ALPHABET_GROUPS[l.number - 1];
        if (!group) return [];
        const actual = l.letters.map((x) => x.he).join("");
        return actual === group.join("") ? [] : [`${l.id}: буквы «${actual}», ожидались «${group.join("")}»`];
      }),
  },
  {
    name: "id буквы это <id урока>-<ключ буквы>",
    check: (lessons) =>
      lessons.flatMap((l) =>
        l.letters
          .filter((x) => x.id !== `${l.id}-${LETTER_KEYS[x.he]}`)
          .map((x) => `${x.he}: id ${x.id}, ожидался ${l.id}-${LETTER_KEYS[x.he]}`),
      ),
  },
  {
    name: "русское название буквы совпадает с LETTER_NAMES (его же показывает запись шаблонов); у формы с гереш это «<название> с апострофом»",
    check: (lessons) =>
      lessons.flatMap((l) =>
        l.letters.filter((x) => x.name.ru !== letterRuName(x.he)).map((x) => `${x.id}: «${x.name.ru}», ожидалось «${letterRuName(x.he)}»`),
      ),
  },
  {
    name: "название буквы с огласовками это то же название, что без них",
    check: (lessons) =>
      lessons.flatMap((l) =>
        l.letters
          .filter((x) => normalizeHebrew(x.name.niqqud) !== normalizeHebrew(x.name.he))
          .map((x) => `${x.id}: «${x.name.niqqud}» не совпадает с «${x.name.he}»`),
      ),
  },
  {
    name: "слово-пример: обычная буква в его начале, конечная форма в его конце",
    check: (lessons) =>
      lessons.flatMap((l) =>
        l.letters.flatMap((x) => {
          const letters = [...x.example.he];
          // У формы с гереш слово начинается с буквы и знака (ג׳ינס), и знак обязателен: без него это другое слово.
          const ok = isFinalForm(x.he) ? letters[letters.length - 1] === x.he : x.example.he.startsWith(x.he);
          return ok ? [] : [`${x.id}: слово ${x.example.he} ${isFinalForm(x.he) ? "должно заканчиваться на" : "должно начинаться с"} ${x.he}`];
        }),
      ),
  },
  {
    name: "формы с гереш (ג׳ ז׳ צ׳) не смешиваются с обычными буквами в одном уроке",
    check: (lessons) =>
      lessons.flatMap((l) => {
        const marked = l.letters.filter((x) => isGereshForm(x.he)).length;
        return marked === 0 || marked === l.letters.length ? [] : [`${l.id}: ${marked} из ${l.letters.length} форм с «${GERESH}»`];
      }),
  },
  {
    name: "слово-пример: конечные буквы только в конце слова, а в конце слова нет обычных форм",
    check: (lessons) =>
      lessons.flatMap((l) =>
        l.letters.flatMap((x) => {
          const letters = [...x.example.he];
          return letters.flatMap((ch, i) => {
            const isLast = i === letters.length - 1;
            if (FINAL_LETTERS.includes(ch) && !isLast) return [`${x.id}: ${x.example.he}, конечная ${ch} не в конце`];
            if (isLast && Object.values(REGULAR_OF_FINAL).includes(ch)) return [`${x.id}: ${x.example.he}, в конце нужна конечная форма`];
            return [];
          });
        }),
      ),
  },
  {
    name: "слово-пример: огласовки того же слова, транскрипция с ударением и согласными",
    check: (lessons) =>
      lessons.flatMap((l) =>
        l.letters.flatMap((x) => [
          ...(normalizeHebrew(x.example.niqqud) !== normalizeHebrew(x.example.he) ? [`${x.id}: огласовки ${x.example.niqqud} не совпадают с ${x.example.he}`] : []),
          ...stressProblems(x.example.translit).map((p) => `${x.id}: ${p}`),
          ...skeletonProblems(x.example.he, x.example.translit).map((p) => `${x.id}: ${p}`),
        ]),
      ),
  },
  {
    name: "буквы и слова-примеры не повторяются внутри алфавита",
    check: (lessons) => {
      const problems: string[] = [];
      const letters = new Set<string>();
      const examples = new Map<string, string>();
      for (const l of lessons) {
        for (const x of l.letters) {
          if (letters.has(x.he)) problems.push(`буква ${x.he} повторяется (${x.id})`);
          letters.add(x.he);
          const first = examples.get(x.example.he);
          if (first) problems.push(`слово-пример ${x.example.he} у ${first} и у ${x.id}`);
          else examples.set(x.example.he, x.id);
        }
      }
      return problems;
    },
  },
];

/** Все нарушения правил алфавита, с названием правила. */
export function alphabetProblems(lessons: AlphabetLesson[]): string[] {
  return ALPHABET_RULES.flatMap((rule) => rule.check(lessons).map((p) => `${rule.name}: ${p}`));
}

/**
 * Связи алфавита с остальным набором: прогресс хранится по id слова или буквы в одной таблице,
 * поэтому id уроков, слов и букв не должны совпадать ни у каких двух элементов.
 */
export function crossProblems(words: Lesson[], alphabet: AlphabetLesson[]): string[] {
  const seen = new Map<string, string>();
  const problems: string[] = [];
  const add = (id: string, what: string) => {
    const first = seen.get(id);
    if (first) problems.push(`id ${id}: ${first} и ${what}`);
    else seen.set(id, what);
  };
  for (const l of words) {
    add(l.id, `урок ${l.id}`);
    for (const w of l.words) add(w.id, `слово ${l.id}`);
  }
  for (const l of alphabet) {
    add(l.id, `урок ${l.id}`);
    for (const x of l.letters) add(x.id, `буква ${l.id}`);
  }
  return problems;
}

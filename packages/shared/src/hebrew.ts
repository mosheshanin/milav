const NIQQUD_AND_MARKS = /[֑-ׇ]/g;
const NOT_HEBREW_LETTER = /[^א-ת]/g;
const FINAL_TO_REGULAR: Record<string, string> = {
  "ך": "כ",
  "ם": "מ",
  "ן": "נ",
  "ף": "פ",
  "ץ": "צ",
};

/** Приводит текст к чистым буквам: без огласовок, знаков и пробелов, конечные формы как обычные. */
export function normalizeHebrew(text: string): string {
  return text
    .normalize("NFC")
    .replace(NIQQUD_AND_MARKS, "")
    .replace(NOT_HEBREW_LETTER, "")
    .replace(/[ךםןףץ]/g, (c) => FINAL_TO_REGULAR[c] ?? c);
}

/** Согласный «скелет» слова: без ו и י, которые в иврите пишутся по-разному (полное и неполное написание). */
export function consonantSkeleton(text: string): string {
  return normalizeHebrew(text).replace(/[וי]/g, "");
}

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a) return b.length;
  if (!b) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min((prev[j] ?? 0) + 1, (cur[j - 1] ?? 0) + 1, (prev[j - 1] ?? 0) + cost);
    }
    prev = cur;
  }
  return prev[b.length] ?? 0;
}

// ---- Сравнение по звучанию ----
// Whisper пишет слово по орфографии, а не по звуку: פרה («пара») он может записать как פארה, а ת и ט, ק и כ, ח и כ звучат одинаково.
// Поэтому слова сравниваются взвешенным расстоянием: правка, не меняющая звук, дешевле обычной ошибки.
// Цены целые, без дробей: FULL = обычная ошибка, SOFT = правка, не меняющая звук. Две мягкие правки дороже одной обычной
// (2 * SOFT > FULL), поэтому прощаем в слове не больше одной правки: две подряд уже дают другое слово (לאהוב ≠ להביא).

const FULL = 3;
const SOFT = 2;
/** Допуск в слове короче 4 букв (без י и ו): одна правка, не меняющая звук (в предельном случае פרה ~ פארה). */
export const SPEECH_BUDGET_ANY = SOFT;
/** Допуск в слове от 4 букв (без י и ו): одна правка любого рода, как и раньше. */
export const SPEECH_BUDGET_LONG = FULL;

/**
 * Пары букв с одним звуком (в обе стороны): ת и ט («т»), ק и כ («к»), א и ע (обе тихие). Не пары: ח и כ (в слове כלב «к»,
 * в חלב «х»: так легко принять собаку за молоко), ס и ש (ש даёт «ш»), ב и פ.
 */
const SAME_SOUND = new Set(["תט", "טת", "כק", "קכ", "אע", "עא"]);

/**
 * Цена убрать или добавить букву. י и ו бесплатны (полное и неполное написание, как и раньше). Буква א в середине слова
 * мягкая: Whisper дописывает её как гласный (פארה вместо פרה). В начале и на конце слова א, а также ע и ה настоящие:
 * דם и אדם, שן и שעון, ילד и ילדה, כיסא и כיס это разные слова, поэтому там цена обычная.
 */
function skipCosts(letters: string[]): number[] {
  return letters.map((ch, i) => {
    if (ch === "ו" || ch === "י") return 0;
    if (ch === "א" && i > 0 && i < letters.length - 1) return SOFT;
    return FULL;
  });
}

/** Замена буквы на другую; `atEnd`: обе буквы последние в своих словах (פרה и פרא звучат одинаково). */
function substituteCost(a: string, b: string, atEnd: boolean): number {
  if (a === b) return 0;
  if (SAME_SOUND.has(a + b)) return SOFT;
  if (atEnd && (a + b === "הא" || a + b === "אה")) return SOFT;
  return FULL;
}

/** Расстояние между словами (оба уже нормализованы `normalizeHebrew`), в единицах FULL и SOFT. */
export function soundDistance(heard: string, expected: string): number {
  const a = [...heard];
  const b = [...expected];
  const skipA = skipCosts(a);
  const skipB = skipCosts(b);
  let prev: number[] = [0];
  for (let j = 1; j <= b.length; j++) prev[j] = (prev[j - 1] ?? 0) + (skipB[j - 1] ?? FULL);
  for (let i = 1; i <= a.length; i++) {
    const cur: number[] = [(prev[0] ?? 0) + (skipA[i - 1] ?? FULL)];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(
        (prev[j] ?? 0) + (skipA[i - 1] ?? FULL),
        (cur[j - 1] ?? 0) + (skipB[j - 1] ?? FULL),
        (prev[j - 1] ?? 0) + substituteCost(a[i - 1] ?? "", b[j - 1] ?? "", i === a.length && j === b.length),
      );
    }
    prev = cur;
  }
  return prev[b.length] ?? 0;
}

/** Сколько прощаем для ожидаемого слова (нормализованного). */
export function speechBudget(expected: string): number {
  // Слово без опорных согласных (או, אי): только точное совпадение, иначе подойдёт почти любая тихая буква.
  if (!skipCosts([...expected]).some((cost) => cost === FULL)) return 0;
  // Допуск в одну ошибку, как и раньше, только от 4 букв без י и ו.
  return consonantSkeleton(expected).length >= 4 ? SPEECH_BUDGET_LONG : SPEECH_BUDGET_ANY;
}

export interface SpeechMatchDetail {
  match: boolean;
  /** Расстояние до ожидаемого слова (3 = одна обычная ошибка, 2 = одна правка, не меняющая звук); по лучшему из вариантов, null если сравнивать нечего. */
  cost: number | null;
  /** Сколько прощаем для этого слова. */
  budget: number;
  /** Нормализованное ожидаемое слово. */
  expected: string;
  /** Нормализованный вариант услышанного, который оказался ближе всего (вся фраза или одно слово). */
  closest: string;
}

/**
 * Разбор сравнения: совпало ли и насколько близко. Проверяем и всю фразу, и каждое слово по отдельности
 * (человек мог сказать лишнее). Журнал отказов речи пишет этот разбор, чтобы допуски настраивались по фактам.
 */
export function speechMatchDetail(heard: string, expected: string): SpeechMatchDetail {
  const e = normalizeHebrew(expected);
  const budget = e ? speechBudget(e) : 0;
  const candidates = [heard, ...heard.split(/\s+/).filter(Boolean)].map(normalizeHebrew).filter(Boolean);
  let cost: number | null = null;
  let closest = "";
  if (e) {
    for (const candidate of candidates) {
      const c = soundDistance(candidate, e);
      if (cost === null || c < cost) {
        cost = c;
        closest = candidate;
      }
    }
  }
  return { match: cost !== null && cost <= budget, cost, budget, expected: e, closest };
}

/**
 * Совпало ли распознанное слово с ожидаемым. Сравнение мягкое: распознавание иврита теряет огласовки и буквы ו/י,
 * путает א с ה и пишет по-разному одинаково звучащие буквы (см. `soundDistance`).
 */
export function isSpeechMatch(heard: string, expected: string): boolean {
  return speechMatchDetail(heard, expected).match;
}

const HEBREW_LETTER = /[א-ת]/;
/** Знак гереш (U+05F3) после буквы: ג׳ дж, ז׳ ж, צ׳ ч. */
const HEBREW_LETTER_OR_GERESH = /[א-ת\u05F3]/;

/** Буквы слова в порядке написания (первая буква справа): без огласовок, пробелов и знаков, конечные формы сохраняются. */
export function wordLetters(he: string): string[] {
  return [...he.normalize("NFC")].filter((ch) => HEBREW_LETTER.test(ch));
}

/**
 * Что набирают на клавиатуре: буквы слова и знаки гереш (у ג׳ ז׳ צ׳ это два знака). Для рукописного ввода нужны только
 * буквы (`wordLetters`): гереш отдельно не пишется.
 */
export function typedLetters(he: string): string[] {
  return [...he.normalize("NFC")].filter((ch) => HEBREW_LETTER_OR_GERESH.test(ch));
}

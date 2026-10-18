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

// ---- Латиница ----
// Whisper иногда пишет иврит латиницей (слово «мышь» вернулось как «akhbar», то есть עכבר). Слово при этом услышано верно, поэтому
// латиницу не выбрасываем, а переводим в согласные звуки: каждый звук это набор ивритских букв, которыми его можно записать.
// Гласные латиницы отбрасываем: в иврите их почти нет в написании, а знать гласные мы не можем. «h» это ה или ח, «kh», «ch» и «x» это
// כ без точки или ח, а «k» это כ или ק (так, чтобы כלב и חלב оставались разными словами).

const LATIN_DIGRAPHS: Record<string, string> = {
  sh: "ש",
  kh: "כח",
  ch: "כח",
  ts: "צ",
  tz: "צ",
  zh: "ז",
  th: "ת",
  ph: "פ",
};
const LATIN_SINGLE: Record<string, string> = {
  b: "ב", v: "בו", g: "ג", d: "ד", h: "הח", z: "ז", x: "כח", k: "כק", q: "ק", c: "כק", t: "תט", y: "י", j: "גזי",
  l: "ל", m: "מ", n: "נ", p: "פ", f: "פ", r: "ר", s: "סש", w: "ו",
};

/** Латинский текст как последовательность звуков (каждый: ивритские буквы, которыми его можно записать). Гласные и знаки отбрасываются. */
export function latinSounds(text: string): string[] {
  const letters = text.normalize("NFKD").toLowerCase().replace(/[^a-z]/g, "");
  const sounds: string[] = [];
  let previous: string | undefined;
  for (let i = 0; i < letters.length; i++) {
    const pair = LATIN_DIGRAPHS[letters.slice(i, i + 2)];
    const sound = pair ?? LATIN_SINGLE[letters[i] ?? ""];
    if (pair) i++;
    // Удвоенная согласная подряд («mm», «bb») это один звук; через гласную («dod», «gag») это два.
    if (sound && sound !== previous) sounds.push(sound);
    previous = sound;
  }
  return sounds;
}

/** Цена пропустить букву ожидаемого слова, когда услышанное записано латиницей: тихие א ע י ו и ה на конце слова бесплатны. */
function latinSkipCosts(letters: string[]): number[] {
  return letters.map((ch, i) => {
    if (ch === "ו" || ch === "י" || ch === "א" || ch === "ע") return 0;
    if (ch === "ה" && i === letters.length - 1) return 0;
    return FULL;
  });
}

/** Сколько опорных согласных в ожидаемом слове для сравнения с латиницей. */
function latinAnchors(expected: string): number {
  return latinSkipCosts([...expected]).filter((cost) => cost === FULL).length;
}

/** Чем кончается латинская запись: гласной (`v`, также «ah», «eh»), согласной (`c`) или неясно (`undefined`, например «y»). */
export function latinEnding(text: string): "v" | "c" | undefined {
  const letters = text.toLowerCase().replace(/[^a-z]/g, "");
  if (/[aeiou]h?$/.test(letters)) return "v";
  return /[bcdfgjklmnpqrstvwxz]$/.test(letters) ? "c" : undefined;
}

/**
 * Расстояние между латинской записью и ивритским словом (нормализованным), в единицах FULL. `ending` (`latinEnding`) различает
 * слова, которые без гласных совпадают: ילד кончается согласной, ילדה (ה на конце это «а») гласной.
 */
export function latinDistance(sounds: readonly string[], expected: string, ending?: "v" | "c"): number {
  const b = [...expected];
  const skipB = latinSkipCosts(b);
  // Звук, которым можно записать י или ו, мог быть и тихой буквой, поэтому его пропуск бесплатен.
  const skipA = sounds.map((sound) => (/[וי]/.test(sound) ? 0 : FULL));
  let prev: number[] = [0];
  for (let j = 1; j <= b.length; j++) prev[j] = (prev[j - 1] ?? 0) + (skipB[j - 1] ?? FULL);
  for (let i = 1; i <= sounds.length; i++) {
    const cur: number[] = [(prev[0] ?? 0) + (skipA[i - 1] ?? FULL)];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(
        (prev[j] ?? 0) + (skipA[i - 1] ?? FULL),
        (cur[j - 1] ?? 0) + (skipB[j - 1] ?? FULL),
        (prev[j - 1] ?? 0) + ((sounds[i - 1] ?? "").includes(b[j - 1] ?? "?") ? 0 : FULL),
      );
    }
    prev = cur;
  }
  let result = prev[b.length] ?? 0;
  const last = b[b.length - 1] ?? "";
  if (ending === "v" && skipB[b.length - 1] === FULL) result += FULL; // услышана гласная на конце, а слово кончается согласной
  if (ending === "c" && (last === "ה" || last === "א") && skipB[b.length - 1] === 0) result += FULL; // слово кончается на «а», а услышана согласная
  return result;
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
  /** Лучший вариант услышанного был записан латиницей (Whisper написал иврит латинскими буквами). */
  latin?: true;
  /** Соседнее слово, из-за которого отказано: услышанное ближе к нему, чем к ожидаемому слову (нормализованное). Иначе не задано. */
  rival?: string;
}

/**
 * Разбор сравнения: совпало ли и насколько близко. Проверяем и всю фразу, и каждое слово по отдельности
 * (человек мог сказать лишнее). Журнал отказов речи пишет этот разбор, чтобы допуски настраивались по фактам.
 *
 * `rivals`: другие слова той же темы. Если услышанное ближе к одному из них, чем к ожидаемому слову, оно не засчитывается
 * (решение владельца 18.10, вопрос 71): иначе סבא сошло бы за סבתא, а להסתיר за להסביר. Если услышанное совпало с соседом дословно,
 * отказ и при равном расстоянии (עוגה и עוגייה, קר и יקר: י и ו бесплатны, и слова иначе не различить).
 */
export function speechMatchDetail(heard: string, expected: string, rivals: readonly string[] = []): SpeechMatchDetail {
  const e = normalizeHebrew(expected);
  const budget = e ? speechBudget(e) : 0;
  const rivalKeys = [...new Set(rivals.map(normalizeHebrew))].filter((r) => r && r !== e);
  const raws = [heard, ...heard.split(/\s+/).filter(Boolean)];
  let cost: number | null = null;
  let closest = "";
  let latin = false;
  let match = false;
  let rival: string | undefined;
  if (e) {
    for (const raw of raws) {
      const candidate = normalizeHebrew(raw);
      let c: number;
      let blocker: string | undefined;
      let isLatin = false;
      if (candidate) {
        c = soundDistance(candidate, e);
        if (c <= budget) blocker = rivalKeys.find((r) => r === candidate || soundDistance(candidate, r) < c);
      } else {
        // Ивритских букв нет: возможно, иврит записан латиницей. Короткие слова (одна опорная согласная) так не проверяем:
        // по одной согласной без гласных подойдёт случайный звук.
        const sounds = latinSounds(raw);
        if (sounds.length === 0 || latinAnchors(e) < 2) continue;
        isLatin = true;
        const ending = latinEnding(raw);
        c = latinDistance(sounds, e, ending);
        // Гласных в латинской записи нет. Сосед мешает, если он ближе, а при точном совпадении звуков (c = 0) мешает и сосед с тем же
        // набором согласных (קר и יקר) не различить, отказываем. Соседи с одной опорной согласной не считаются: им подходит почти любая запись.
        if (c <= budget) blocker = rivalKeys.filter((r) => latinAnchors(r) >= 2).find((r) => { const d = latinDistance(sounds, r, ending); return d < c || (c === 0 && d === 0); });
      }
      if (cost === null || c < cost) {
        cost = c;
        closest = candidate || raw.trim().toLowerCase();
        latin = isLatin;
      }
      if (c > budget) continue;
      if (blocker === undefined) match = true;
      else rival ??= blocker;
    }
  }
  return { match, cost, budget, expected: e, closest, ...(latin ? { latin: true as const } : {}), ...(!match && rival !== undefined ? { rival } : {}) };
}

/**
 * Совпало ли распознанное слово с ожидаемым. Сравнение мягкое: распознавание иврита теряет огласовки и буквы ו/י,
 * путает א с ה и пишет по-разному одинаково звучащие буквы (см. `soundDistance`).
 */
export function isSpeechMatch(heard: string, expected: string, rivals: readonly string[] = []): boolean {
  return speechMatchDetail(heard, expected, rivals).match;
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

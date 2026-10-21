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

// ---- Слова урока из нескольких слов иврита ----
// Слово урока может состоять из двух-трёх слов иврита через пробел: «אחר כך» (потом), «בית ספר» (школа), «כמה זה עולה»
// (решение владельца 21.10). Все этапы работают с фразой целиком: пробел не рисуют и не набирают, он не буква.

/** Сколько слов иврита может быть в одном слове урока («כמה זה עולה» это три). */
export const MAX_WORD_PARTS = 3;

/** Части слова урока: слова иврита через пробел («אחר כך» → ["אחר", "כך"]). У обычного слова одна часть. */
export function wordParts(he: string): string[] {
  return he.trim().split(/\s+/).filter(Boolean);
}

/** Слово урока из нескольких слов иврита («אחר כך»). */
export function isPhrase(he: string): boolean {
  return wordParts(he).length > 1;
}

/** Разделители слов в распознанной речи: пробел, дефис и макаф (Whisper пишет «אחת-עשרה»). */
const SPEECH_WORD_BREAK = /[\s\-־]+/;

/** Текст как нормализованные слова через пробел («אַחַר כָּךְ» → «אחר ככ»): границы слов нужны сравнению по звучанию. */
export function normalizeWords(text: string): string {
  return text.split(SPEECH_WORD_BREAK).map(normalizeHebrew).filter(Boolean).join(" ");
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
/** Буква и её место в своём слове: начало и конец слова важны для тихих букв (у фразы «אחר כך» слов несколько). */
interface LetterSpot {
  ch: string;
  first: boolean;
  last: boolean;
}

/** Буквы нормализованного текста с местом в слове; слова разделены пробелами (`normalizeWords`). */
function letterSpots(text: string): LetterSpot[] {
  return text
    .split(" ")
    .filter(Boolean)
    .flatMap((part) => {
      const letters = [...part];
      return letters.map((ch, i) => ({ ch, first: i === 0, last: i === letters.length - 1 }));
    });
}

function skipCosts(letters: LetterSpot[]): number[] {
  return letters.map(({ ch, first, last }) => {
    if (ch === "ו" || ch === "י") return 0;
    if (ch === "א" && !first && !last) return SOFT;
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

/**
 * Расстояние между словами (оба уже нормализованы: `normalizeHebrew`, а у фразы `normalizeWords`, слова через пробел),
 * в единицах FULL и SOFT. Пробелы буквами не считаются: «אחרכך» и «אחר כך» совпадают, границы слов влияют только на цену
 * тихих букв в начале и конце слова.
 */
export function soundDistance(heard: string, expected: string): number {
  const a = letterSpots(heard);
  const b = letterSpots(expected);
  const skipA = skipCosts(a);
  const skipB = skipCosts(b);
  let prev: number[] = [0];
  for (let j = 1; j <= b.length; j++) prev[j] = (prev[j - 1] ?? 0) + (skipB[j - 1] ?? FULL);
  for (let i = 1; i <= a.length; i++) {
    const cur: number[] = [(prev[0] ?? 0) + (skipA[i - 1] ?? FULL)];
    const x = a[i - 1]!;
    for (let j = 1; j <= b.length; j++) {
      const y = b[j - 1]!;
      cur[j] = Math.min(
        (prev[j] ?? 0) + (skipA[i - 1] ?? FULL),
        (cur[j - 1] ?? 0) + (skipB[j - 1] ?? FULL),
        (prev[j - 1] ?? 0) + substituteCost(x.ch, y.ch, x.last && y.last),
      );
    }
    prev = cur;
  }
  return prev[b.length] ?? 0;
}

/**
 * Сколько прощаем для ожидаемого слова (нормализованного). У фразы из нескольких слов допуск один на всю фразу
 * (решение владельца 21.10): как у одного длинного слова.
 */
export function speechBudget(expected: string): number {
  // Слово без опорных согласных (או, אי): только точное совпадение, иначе подойдёт почти любая тихая буква.
  if (!skipCosts(letterSpots(expected)).some((cost) => cost === FULL)) return 0;
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
  const sounds: string[] = [];
  // По словам отдельно: «beit sefer» это т и с, а не «ts» (צ) на стыке слов.
  for (const word of text.normalize("NFKD").toLowerCase().split(/[^a-z̀-ͯ]+/)) {
    const letters = word.replace(/[^a-z]/g, "");
    let previous: string | undefined;
    for (let i = 0; i < letters.length; i++) {
      const pair = LATIN_DIGRAPHS[letters.slice(i, i + 2)];
      const sound = pair ?? LATIN_SINGLE[letters[i] ?? ""];
      if (pair) i++;
      // Удвоенная согласная подряд («mm», «bb») это один звук; через гласную («dod», «gag») это два.
      if (sound && sound !== previous) sounds.push(sound);
      previous = sound;
    }
  }
  return sounds;
}

/** Цена пропустить букву ожидаемого слова, когда услышанное записано латиницей: тихие א ע י ו и ה на конце слова бесплатны. */
function latinSkipCosts(letters: LetterSpot[]): number[] {
  return letters.map(({ ch, last }) => {
    if (ch === "ו" || ch === "י" || ch === "א" || ch === "ע") return 0;
    if (ch === "ה" && last) return 0;
    return FULL;
  });
}

/** Сколько опорных согласных в ожидаемом слове для сравнения с латиницей. */
function latinAnchors(expected: string): number {
  return latinSkipCosts(letterSpots(expected)).filter((cost) => cost === FULL).length;
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
  const spots = letterSpots(expected);
  const b = spots.map((s) => s.ch);
  const skipB = latinSkipCosts(spots);
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
  /** Засчитано по цифрам: Whisper записал число цифрами («11»), и оно равно значению слова (`value` у чисел). */
  digits?: true;
}

/** Сколько слов распознанной речи разбираем (запись короткая; длинный текст обрезаем, чтобы перебор частей не рос). */
const MAX_HEARD_WORDS = 12;

/** Варианты услышанного: весь текст и каждый кусок из идущих подряд слов (человек мог сказать лишнее до или после). */
function heardVariants(heard: string): string[] {
  const words = heard.split(SPEECH_WORD_BREAK).filter(Boolean).slice(0, MAX_HEARD_WORDS);
  const variants = [heard];
  for (let from = 0; from < words.length; from++) {
    for (let to = from + 1; to <= words.length; to++) variants.push(words.slice(from, to).join(" "));
  }
  return variants;
}

/** Ключ для точного сравнения: буквы без пробелов («אחר כך» и «אחרכך» одно и то же). */
const glued = (normalized: string) => normalized.replaceAll(" ", "");

/**
 * Разбор сравнения: совпало ли и насколько близко. Проверяем и всю фразу, и каждое слово по отдельности
 * (человек мог сказать лишнее). Журнал отказов речи пишет этот разбор, чтобы допуски настраивались по фактам.
 *
 * `rivals`: другие слова той же темы. Если услышанное ближе к одному из них, чем к ожидаемому слову, оно не засчитывается
 * (решение владельца 18.10, вопрос 71): иначе סבא сошло бы за סבתא, а להסתיר за להסביר. Если услышанное совпало с соседом дословно,
 * отказ и при равном расстоянии (עוגה и עוגייה, קר и יקר: י и ו бесплатны, и слова иначе не различить).
 * Сосед из нескольких слов («אחד עשר») мешает и тогда, когда услышанное лишь содержит ожидаемое слово: если сказано «אחד עשר»,
 * слово «אחד» не засчитывается (21.10).
 *
 * Ожидаемое слово может быть фразой из нескольких слов («אחר כך»): она сравнивается целиком, с одним допуском на всю фразу.
 * `value`: число, которое значит слово (у слов темы «Числа»). Whisper часто пишет числа цифрами («11»), и такой ответ засчитывается,
 * если цифры равны значению.
 */
export function speechMatchDetail(heard: string, expected: string, rivals: readonly string[] = [], value?: number): SpeechMatchDetail {
  const e = normalizeWords(expected);
  const budget = e ? speechBudget(e) : 0;
  const rivalKeys = [...new Set(rivals.map(normalizeWords))].filter((r) => r && glued(r) !== glued(e));
  const raws = heardVariants(heard);
  // Соседи из нескольких слов, сказанные целиком: тогда засчитывать ожидаемое слово нельзя, даже если оно прозвучало внутри.
  const phraseRivals = new Set(rivalKeys.filter((r) => r.includes(" ")).map(glued));
  const saidRival = raws.map(normalizeWords).find((v) => v.includes(" ") && phraseRivals.has(glued(v)));
  let cost: number | null = null;
  let closest = "";
  let latin = false;
  let match = false;
  let rival: string | undefined;
  if (e && value !== undefined) {
    const said = heard.match(/\d+/g)?.find((d) => Number(d) === value);
    if (said !== undefined && saidRival === undefined) return { match: true, cost: 0, budget, expected: e, closest: said, digits: true };
  }
  if (e) {
    for (const raw of raws) {
      const candidate = normalizeWords(raw);
      let c: number;
      let blocker: string | undefined;
      let isLatin = false;
      if (candidate) {
        c = soundDistance(candidate, e);
        if (c <= budget) blocker = saidRival ?? rivalKeys.find((r) => glued(r) === glued(candidate) || soundDistance(candidate, r) < c);
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

/**
 * Буквы каждого слова фразы по отдельности («בית ספר» → [[ב, י, ת], [ס, פ, ר]]): на этапе «пиши» клетки букв показываются
 * группами по словам, а рисуют все буквы подряд, пробел не рисуют. У обычного слова одна группа.
 */
export function wordLetterGroups(he: string): string[][] {
  return wordParts(he).map(wordLetters).filter((g) => g.length > 0);
}

/** Сколько знаков набирают в каждом слове фразы (`typedLetters` по частям): после них приложение само ставит пробел. */
export function typedPartLengths(he: string): number[] {
  return wordParts(he).map((p) => typedLetters(p).length).filter((n) => n > 0);
}

/**
 * Набранное с пробелами между словами фразы: пробел не набирают, его ставит приложение, как только после первого слова
 * набрана следующая буква (решение владельца 21.10). Лишние знаки остаются в конце как есть.
 */
export function spacedTyped(typed: readonly string[], he: string): string {
  const parts: string[] = [];
  let i = 0;
  for (const n of typedPartLengths(he)) {
    if (i >= typed.length) break;
    parts.push(typed.slice(i, i + n).join(""));
    i += n;
  }
  const rest = typed.slice(i).join("");
  if (parts.length === 0) return rest;
  parts[parts.length - 1] += rest;
  return parts.join(" ");
}

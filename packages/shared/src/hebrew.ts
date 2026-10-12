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

function tokenMatches(heard: string, expected: string): boolean {
  const h = normalizeHebrew(heard);
  const e = normalizeHebrew(expected);
  if (!h || !e) return false;
  if (h === e) return true;
  const hs = consonantSkeleton(h);
  const es = consonantSkeleton(e);
  if (hs && hs === es) return true;
  // Одну ошибку распознавания прощаем только в словах от 4 согласных.
  return es.length >= 4 && levenshtein(hs, es) <= 1;
}

/**
 * Совпало ли распознанное слово с ожидаемым. Сравнение мягкое: распознавание иврита
 * часто теряет огласовки и буквы ו/י. Проверяем и всю фразу, и каждое слово по отдельности.
 */
export function isSpeechMatch(heard: string, expected: string): boolean {
  if (tokenMatches(heard, expected)) return true;
  return heard
    .split(/\s+/)
    .filter(Boolean)
    .some((token) => tokenMatches(token, expected));
}

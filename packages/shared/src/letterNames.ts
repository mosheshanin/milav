/** Названия 27 форм по-русски (для подсказок и экрана записи шаблонов). */
export const LETTER_NAMES: Record<string, string> = {
  א: "алеф",
  ב: "бет",
  ג: "гимель",
  ד: "далет",
  ה: "хей",
  ו: "вав",
  ז: "зайин",
  ח: "хет",
  ט: "тет",
  י: "йод",
  כ: "каф",
  ך: "конечная каф",
  ל: "ламед",
  מ: "мем",
  ם: "конечная мем",
  נ: "нун",
  ן: "конечная нун",
  ס: "самех",
  ע: "аин",
  פ: "пе",
  ף: "конечная пе",
  צ: "цади",
  ץ: "конечная цади",
  ק: "куф",
  ר: "реш",
  ש: "шин",
  ת: "тав",
};

/** Русское название формы с гереш: «гимель с апострофом» (гереш по-русски называют апострофом). */
export const GERESH_NAME_SUFFIX = " с апострофом";

/** Русское название любой формы: 27 обычных из LETTER_NAMES и три формы с гереш (ג׳, ז׳, צ׳). */
export function letterRuName(he: string): string | undefined {
  if (LETTER_NAMES[he]) return LETTER_NAMES[he];
  const base = [...he][0];
  return he.length === 2 && he.endsWith("׳") && base && LETTER_NAMES[base] ? LETTER_NAMES[base] + GERESH_NAME_SUFFIX : undefined;
}

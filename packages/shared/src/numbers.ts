// Числа словами на иврите из озвученных кусков (тренажёр «Числа на слух», docs/SPEC.md, «Тренажёр «Числа на слух»»).
//
// Число, цена, время, возраст и этаж собираются из примерно ста коротких файлов озвучки (`numberPieces.json`), а не озвучиваются
// каждое отдельно: так 0–9999, любое время и любая цена обходятся одним набором. Слово «и» в иврите пишется слитно со следующим словом
// и меняет его огласовку (וְאַחַת, וּשְׁתַּיִים), поэтому «и» входит в куски: у каждого числа, которое может стоять после «и», есть
// «слитный» вариант с приставкой v. Здесь только чистые функции: какие куски и в каком порядке; проигрыш склейкой в приложении (`lib/numberAudio.ts`).
import PIECES from "./numberPieces.json";

export interface NumberPiece {
  id: string;
  /** Иврит без огласовок (как пишут). */
  he: string;
  /** С огласовками: этот текст уходит в синтезатор. */
  niqqud: string;
  /** Транскрипция кириллицей по стандарту проекта. */
  translit: string;
}

export const NUMBER_PIECES: readonly NumberPiece[] = PIECES;

const BY_ID = new Map(NUMBER_PIECES.map((p) => [p.id, p]));

/** Наибольшее число, которое умеем произносить (тысячи собираются до девяти тысяч девятисот девяноста девяти). */
export const MAX_SPOKEN_NUMBER = 9999;

/** Каталог файлов кусков: `/audio/num/<id>.mp3`. */
export const NUMBER_AUDIO_DIR = "/audio/num";
export const numberPieceAudio = (id: string): string => `${NUMBER_AUDIO_DIR}/${id}.mp3`;

export function numberPiece(id: string): NumberPiece {
  const piece = BY_ID.get(id);
  if (!piece) throw new Error(`Нет куска озвучки чисел «${id}»`);
  return piece;
}

/** Род числа: женский («счёт»: телефон, время, возраст, этаж) или мужской (при мужских словах: шекели, 11–19 м.). */
export type NumberGender = "f" | "m";

/** Число как последовательность кусков и готовые тексты для показа. */
export interface SpokenNumber {
  /** Кусковые id в порядке произношения. */
  ids: string[];
  /** Иврит без огласовок, слова через пробел. */
  he: string;
  niqqud: string;
  translit: string;
  /** После каких кусков (индекс в `ids`) нужна заметная пауза: так телефон делится на группы цифр. */
  groupEnds?: number[];
}

export function spoken(ids: readonly string[], groupEnds?: number[]): SpokenNumber {
  const pieces = ids.map(numberPiece);
  return {
    ids: [...ids],
    he: pieces.map((p) => p.he).join(" "),
    niqqud: pieces.map((p) => p.niqqud).join(" "),
    translit: pieces.map((p) => p.translit).join(" "),
    ...(groupEnds?.length ? { groupEnds } : {}),
  };
}

/** Слитный с «и» вариант куска (`f1` → `vf1`). Бросает ошибку, если такого куска нет: значит, число нельзя поставить после «и». */
function fuse(id: string): string {
  const fused = `v${id}`;
  if (!BY_ID.has(fused)) throw new Error(`Нет слитного с «и» куска для «${id}»`);
  return fused;
}

/** Первая часть 11–19: у части чисел она звучит иначе, чем одно число (шлош эсре, а не шалош; тша, а не те́ша). */
const FEM_TEEN_FIRST: Record<number, string> = { 1: "f1", 2: "tf2", 3: "tf3", 4: "f4", 5: "tf5", 6: "f6", 7: "tf7", 8: "f8", 9: "tf9" };
const MASC_TEEN_FIRST: Record<number, string> = { 1: "tm1", 2: "tm2", 3: "m3", 4: "m4", 5: "m5", 6: "m6", 7: "m7", 8: "m8", 9: "m9" };

interface Group {
  ids: string[];
  /** Десятки с единицей («עשרים וחמש»): «и» в них уже есть, ставить ещё одно перед группой не нужно. */
  compound?: boolean;
}

function remainderGroup(r: number, gender: NumberGender): Group {
  if (r <= 10) return { ids: [`${gender}${r}`] };
  if (r <= 19) {
    const unit = r - 10;
    const first = (gender === "f" ? FEM_TEEN_FIRST : MASC_TEEN_FIRST)[unit]!;
    return { ids: [first, gender === "f" ? "tail-f" : "tail-m"] };
  }
  const tens = r - (r % 10);
  const unit = r % 10;
  return unit === 0 ? { ids: [`t${tens}`] } : { ids: [`t${tens}`, `v${gender}${unit}`], compound: true };
}

/**
 * Число словами кусками: «и» ставится только перед последней группой (אלף ומאה, מאה עשרים וחמש, אלף ושלוש מאות).
 * `price`: число стоит перед «שקלים», поэтому оканчивающее «два» берёт форму перед существительным (עשרים ושני שקלים).
 */
export function spellNumberIds(n: number, gender: NumberGender = "f", options: { price?: boolean } = {}): string[] {
  if (!Number.isInteger(n) || n < 0 || n > MAX_SPOKEN_NUMBER) throw new RangeError(`Число ${n} вне 0…${MAX_SPOKEN_NUMBER}`);
  if (n === 0) return ["f0"];
  const thousands = Math.floor(n / 1000);
  const hundreds = Math.floor((n % 1000) / 100);
  const rest = n % 100;
  const groups: Group[] = [];
  if (thousands) groups.push({ ids: thousands === 1 ? ["th1"] : thousands === 2 ? ["th2"] : [`c${thousands}`, "thp"] });
  if (hundreds) groups.push({ ids: hundreds === 1 ? ["h1"] : hundreds === 2 ? ["h2"] : [`f${hundreds}`, "hm"] });
  if (rest) groups.push(remainderGroup(rest, gender));
  const last = groups.length > 1 ? groups[groups.length - 1] : undefined;
  if (last && !last.compound) last.ids = [fuse(last.ids[0]!), ...last.ids.slice(1)];
  const ids = groups.flatMap((g) => g.ids);
  if (options.price && ids[ids.length - 1] === "vm2") ids[ids.length - 1] = "vm2c";
  return ids;
}

/** Число словами (женский счёт по умолчанию). */
export const spellNumber = (n: number, gender: NumberGender = "f"): SpokenNumber => spoken(spellNumberIds(n, gender));

/** Цена в шекелях: «שקל אחד», «שני שקלים», «שלושה שקלים», «עשרים וחמישה שקלים». Числа при мужском слове идут в мужском роде. */
export function spellPriceIds(n: number): string[] {
  if (n === 1) return ["sh1", "m1"];
  if (n === 2) return ["m2c", "shp"];
  return [...spellNumberIds(n, "m", { price: true }), "shp"];
}
export const spellPrice = (n: number): SpokenNumber => spoken(spellPriceIds(n));

/** Минуты в разговорном «и» и «без»: 5 → «וחמש», 25 → «עשרים וחמש», 35 → «בלי עשרים וחמש». */
const MINUTES: Record<number, string[]> = {
  0: [],
  5: ["vf5"],
  10: ["vf10"],
  15: ["vquarter"],
  20: ["vt20"],
  25: ["t20", "vf5"],
  30: ["vhalf"],
  35: ["bli", "t20", "vf5"],
  40: ["bli", "t20"],
  45: ["bli", "quarter"],
  50: ["bli", "f10"],
  55: ["bli", "f5"],
};

/** Минуты, которые умеем говорить (кратные пяти). */
export const TIME_MINUTES: readonly number[] = Object.keys(MINUTES).map(Number);

/** Часы 1–12 женским счётом: «שלוש», «אחת עשרה», «שתים עשרה». */
function hourIds(hour: number): string[] {
  if (hour <= 10) return [`f${hour}`];
  return hour === 11 ? ["f1", "tail-f"] : ["tf2", "tail-f"];
}

/**
 * Время кусками: «השעה שלוש וחצי», «ארבע בלי רבע». После половины часа называется следующий час («без…»).
 * `hashaa: false` убирает «השעה» (так сравнивается услышанное: лишние слова в начале не мешают).
 */
export function spellTimeIds(hour: number, minute: number, options: { hashaa?: boolean } = {}): string[] {
  if (!Number.isInteger(hour) || hour < 1 || hour > 12) throw new RangeError(`Час ${hour} вне 1…12`);
  const minutes = MINUTES[minute];
  if (!minutes) throw new RangeError(`Минуты ${minute}: поддерживаются кратные пяти`);
  const named = minute > 30 ? (hour % 12) + 1 : hour;
  return [...(options.hashaa === false ? [] : ["hashaa"]), ...hourIds(named), ...minutes];
}
export const spellTime = (hour: number, minute: number): SpokenNumber => spoken(spellTimeIds(hour, minute));

/** Номер телефона по цифрам, как диктуют: группы 3-3-4 (054, 123, 4567), между группами пауза. */
export function spellDigits(digits: string, groupSizes: readonly number[] = [3, 3, 4]): SpokenNumber {
  if (!/^\d+$/.test(digits)) throw new RangeError("В номере только цифры");
  const ids = [...digits].map((d) => `f${d}`);
  const groupEnds: number[] = [];
  let at = 0;
  for (const size of groupSizes) {
    at += size;
    if (at < ids.length) groupEnds.push(at - 1);
  }
  return spoken(ids, groupEnds);
}

/** Возраст: «בן שלושים וחמש» (мужчина) или «בת …» (женщина): число женским счётом. */
export const spellAge = (age: number, who: "ben" | "bat"): SpokenNumber => spoken([who, ...spellNumberIds(age, "f")]);

/** Этаж: «קומה שלוש». */
export const spellFloor = (floor: number): SpokenNumber => spoken(["kuma", ...spellNumberIds(floor, "f")]);

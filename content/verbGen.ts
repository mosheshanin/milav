import type { Binyan, VerbData, WordForm } from "@milav/shared";
import { ACUTE } from "./rules";

/**
 * Генераторы форм глаголов с сильным корнем (кал и пиэль, «שלמים»): по трём буквам корня строят все 27 форм:
 * иврит без огласовок, с огласовками (дагеш по правилам бегадкефат, в пиэль ещё удвоение второй буквы корня)
 * и транскрипцию кириллицей с ударением.
 *
 * Зачем они нужны: 27 форм на глагол с огласовками, дагешами и ударениями вручную набирать долго и легко ошибиться
 * (810 форм в трёх уроках). Генератор даёт единообразные формы, а ошибки носитель исправляет уже в готовых данных:
 * после этого генератор для этого глагола больше не запускают (см. docs/CONTENT.md, «Генератор форм»).
 *
 * Пааль (`conjugatePaal`): только сильные корни с холамом в будущем (יִכְתֹּב, יִשְׁבֹּר): без гортанных (א ה ח ע), без י ו
 * в корне, без נ в начале, без одинаковых букв, без ש с точкой «син» (שׂ). Глаголы с патахом в будущем (ללמוד, יִלְמַד)
 * и слабые корни он не строит: для них нужны свои схемы.
 *
 * Пиэль (`conjugatePiel`): те же ограничения и ещё два: вторая буква корня не ר (ר не удваивается, гласная перед ней
 * меняется: בֵּרֵךְ) и третья не נ и не ת (они сливаются с окончаниями: סִמַּנּוּ, שִׁכַּתְּ).
 *
 * Каждый генератор отклоняет корень, который ему не подходит (`paalRootProblems`, `pielRootProblems`).
 */

/**
 * Гласный знак при букве. S: немая шва (закрывает слог), V: подвижная шва без звука в транскрипции (קָתְבָה → «катва»),
 * W: подвижная шва, которая читается «е» (после приставок пиэль: לְדַבֵּר «ледабер»), H: хатаф-патах (אֲ, «а»).
 */
type Vowel = "a" | "A" | "i" | "e" | "E" | "o" | "H" | "W" | "S" | "V";

const MARK: Record<Vowel, string> = {
  a: "ַ", // патах
  A: "ָ", // камац
  i: "ִ", // хирик
  e: "ֵ", // цере
  E: "ֶ", // сеголь
  o: "ֹ", // холам
  H: "ֲ", // хатаф-патах
  W: "ְ", // шва, читается «е»
  S: "ְ", // шва немая
  V: "ְ", // шва подвижная, без звука
};

const SOUND: Record<Exclude<Vowel, "S" | "V">, string> = { a: "а", A: "а", i: "и", e: "е", E: "е", o: "о", H: "а", W: "е" };

const DAGESH = "ּ";
const SHIN_DOT = "ׁ";

/**
 * Буква-носитель гласной после согласной: ו с холамом (וֹ, «о»), ו с шуруком (וּ, «у») или י после хирика
 * (דִּיבֵּר, полное письмо прошедшего пиэль: хирик стоит на согласной, сама י без знака).
 */
interface Mater {
  letter: string;
  mark: string;
  sound: string;
}
const VAV_HOLAM: Mater = { letter: "ו", mark: MARK.o, sound: "о" };
const VAV_SHURUK: Mater = { letter: "ו", mark: DAGESH, sound: "у" };
const YOD_HIRIK: Mater = { letter: "י", mark: "", sound: "и" };

/**
 * Одна буква слова с её гласной. `tail` это немая буква после гласной (י в תִּי, ה в ָה).
 * `forte`: удвоение (дагеш хазак, вторая буква корня в пиэль): дагеш стоит всегда, а ב כ פ читаются твёрдо (б, к, п).
 */
interface Unit {
  c: string;
  v?: Vowel;
  mater?: Mater;
  tail?: string;
  forte?: boolean;
}

type Stress = "last" | "penult";

const FINAL: Record<string, string> = { כ: "ך", מ: "ם", נ: "ן", פ: "ף", צ: "ץ" };
const BEGADKEFAT = "בגדכפת";

/** Звук буквы по-русски. Для ב כ פ зависит от дагеша (б/в, к/х, п/ф). */
function consonantSound(letter: string, dagesh: boolean): string {
  switch (letter) {
    case "ב":
      return dagesh ? "б" : "в";
    case "כ":
    case "ך":
      return dagesh ? "к" : "х";
    case "פ":
    case "ף":
      return dagesh ? "п" : "ф";
    case "ג":
      return "г";
    case "ד":
      return "д";
    case "ז":
      return "з";
    case "ט":
    case "ת":
      return "т";
    case "ל":
      return "л";
    case "מ":
    case "ם":
      return "м";
    case "נ":
    case "ן":
      return "н";
    case "ס":
      return "с";
    case "צ":
    case "ץ":
      return "ц";
    case "ק":
      return "к";
    case "ר":
      return "р";
    case "ש":
      return "ш";
    // Приставка י читается без «й»: יִ «и», יְ «е». א в приставке только несёт гласную: звука согласной нет.
    case "י":
    case "א":
      return "";
    default:
      throw new Error(`нет звука для буквы ${letter}`);
  }
}

interface Rendered {
  he: string;
  niqqud: string;
  translit: string;
}

/**
 * Собирает слово из букв. Дагеш у ב ג ד כ פ ת ставится в начале слова и после немой шва (бегадкефат), а после гласной
 * и подвижной шва нет; у удвоенной буквы (`forte`) дагеш стоит всегда. Конечная буква получает конечную форму,
 * у ך после согласной без гласной ставится шва (ךְ).
 */
function render(units: Unit[], stress: Stress): Rendered {
  const last = units[units.length - 1]!;
  let he = "";
  let niqqud = "";
  const chunks: { text: string; syllable: boolean }[] = [];
  let before: "start" | "vowel" | "silent" = "start";

  units.forEach((unit, i) => {
    const isLast = unit === last;
    let letter = unit.c;
    // Конечная форма: только если за буквой в слове больше ничего нет.
    if (isLast && !unit.mater && !unit.tail && FINAL[letter]) letter = FINAL[letter]!;
    const dagesh = unit.forte === true || (BEGADKEFAT.includes(unit.c) && (before === "start" || before === "silent"));

    he += letter + (unit.mater?.letter ?? "") + (unit.tail ?? "");
    // Порядок знаков как в остальных уроках: точка «шин», гласная, затем дагеш (כָּ, а не כּ+ָ).
    let marks = letter === "ש" ? SHIN_DOT : "";
    if (unit.v) marks += MARK[unit.v];
    else if (isLast && letter === "ך" && !unit.mater && !unit.tail) marks += MARK.S;
    if (dagesh) marks += DAGESH;
    niqqud += letter + marks + (unit.mater ? unit.mater.letter + unit.mater.mark : "") + (unit.tail ?? "");

    let sound = consonantSound(letter, dagesh);
    let syllable = false;
    if (unit.mater) {
      sound += unit.mater.sound;
      syllable = true;
    } else if (unit.v && unit.v !== "S" && unit.v !== "V") {
      // Сеголь в начале слова под א читается «э» (эхтов), в остальных местах «е».
      sound += i === 0 && letter === "א" && unit.v === "E" ? "э" : SOUND[unit.v];
      syllable = true;
    }
    chunks.push({ text: sound, syllable });

    before = unit.mater ? "vowel" : unit.v === "S" ? "silent" : "vowel";
  });

  const syllables = chunks.map((c, i) => (c.syllable ? i : -1)).filter((i) => i >= 0);
  const target = syllables.length < 2 ? undefined : syllables[stress === "last" ? syllables.length - 1 : syllables.length - 2];
  const translit = chunks.map((c, i) => c.text + (i === target ? ACUTE : "")).join("");
  return { he, niqqud, translit };
}

/** Общие проверки сильного корня из трёх букв для обоих генераторов. */
function strongRootProblems(root: string): string[] {
  const problems: string[] = [];
  const letters = [...root];
  if (letters.length !== 3) problems.push(`корень «${root}»: нужны ровно 3 буквы`);
  if (!letters.every((l) => /^[בגדזטכלמנספצקרשת]$/.test(l))) {
    problems.push(`корень «${root}»: допустимы только буквы בגדזטכלמנספצקרשת (без гортанных א ה ח ע, без י ו и конечных форм)`);
  }
  if (letters[0] === "נ") problems.push(`корень «${root}»: נ в начале (слабый корень)`);
  if (new Set(letters).size !== letters.length) problems.push(`корень «${root}»: есть одинаковые буквы (удвоенный корень)`);
  if (SIN_ROOTS.includes(root)) problems.push(`корень «${root}» пишется с «син» (שׂ), а генератор ставит «шин» (ש)`);
  return problems;
}

/** Проблемы корня: подходит ли он генератору пааль (сильный корень с холамом в будущем). */
export function paalRootProblems(root: string): string[] {
  return strongRootProblems(root);
}

/** Проблемы корня: подходит ли он генератору пиэль (сильный корень, вторая буква удваивается). */
export function pielRootProblems(root: string): string[] {
  const problems = strongRootProblems(root);
  const [, c2, c3] = [...root];
  if (c2 === "ר") problems.push(`корень «${root}»: ר во второй букве не удваивается (в пиэль меняется гласная: בֵּרֵךְ)`);
  if (c3 === "נ" || c3 === "ת") problems.push(`корень «${root}»: ${c3} в конце сливается с окончанием (סִמַּנּוּ, שִׁכַּתְּ)`);
  return problems;
}

/** Корни, которые пишутся с «син» (שׂ): генераторы ставят «шин», поэтому такие глаголы они не строят (שרף, שכר, שלט, שפט и др.). */
export const SIN_ROOTS: readonly string[] = ["שרפ", "שכר", "שלט", "שפט", "שמח", "שחק", "שבע", "שער", "בשר"];

type FormSpec = [units: Unit[], stress: Stress];

interface Specs {
  infinitive: FormSpec;
  present: Record<string, FormSpec>;
  past: Record<string, FormSpec>;
  future: Record<string, FormSpec>;
  imperative: Record<string, FormSpec>;
}

const u = (c: string, v?: Vowel, extra: Partial<Unit> = {}): Unit => ({ c, ...(v ? { v } : {}), ...extra });

function paalSpecs(root: string): Specs {
  const [c1, c2, c3] = [...root] as [string, string, string];
  /** Прошедшее: гласные при C1 и C2, затем C3 (со своей гласной или буквой-носителем) и окончание. */
  const past = (c1v: Vowel, c2v: Vowel, c3v: Vowel | undefined, c3extra: Partial<Unit>, ...ending: Unit[]): Unit[] => [
    u(c1, c1v),
    u(c2, c2v),
    u(c3, c3v, c3extra),
    ...ending,
  ];

  /** Будущее с холамом: приставка + корень. */
  const future = (prefix: string, tail: "o" | "V-i" | "V-u" | "on"): FormSpec => {
    const pre = u(prefix, prefix === "א" ? "E" : "i");
    switch (tail) {
      case "o":
        return [[pre, u(c1, "S"), u(c2, undefined, { mater: VAV_HOLAM }), u(c3)], "last"];
      case "V-i":
        return [[pre, u(c1, "S"), u(c2, "V"), u(c3, "i", { tail: "י" })], "last"];
      case "V-u":
        return [[pre, u(c1, "S"), u(c2, "V"), u(c3, undefined, { mater: VAV_SHURUK })], "last"];
      case "on":
        return [[pre, u(c1, "S"), u(c2, "o"), u(c3, "S"), u("נ", "A", { tail: "ה" })], "penult"];
    }
  };

  return {
    infinitive: [[u("ל", "i"), u(c1, "S"), u(c2, undefined, { mater: VAV_HOLAM }), u(c3)], "last"],
    present: {
      ms: [[u(c1, undefined, { mater: VAV_HOLAM }), u(c2, "e"), u(c3)], "last"],
      fs: [[u(c1, undefined, { mater: VAV_HOLAM }), u(c2, "E"), u(c3, "E"), u("ת")], "penult"],
      mp: [[u(c1, undefined, { mater: VAV_HOLAM }), u(c2, "V"), u(c3, "i", { tail: "י" }), u("ם")], "last"],
      fp: [[u(c1, undefined, { mater: VAV_HOLAM }), u(c2, "V"), u(c3, undefined, { mater: VAV_HOLAM }), u("ת")], "last"],
    },
    // Окончания -ти, -та, -ну безударные (ката́вти), -тем и -тен ударные, в 3-м лице ударение на последнем слоге.
    past: {
      "1s": [past("A", "a", "S", {}, u("ת", "i", { tail: "י" })), "penult"],
      "2ms": [past("A", "a", "S", {}, u("ת", "A")), "penult"],
      "2fs": [past("A", "a", "S", {}, u("ת", "S")), "last"],
      "3ms": [past("A", "a", undefined, {}), "last"],
      "3fs": [past("A", "V", "A", { tail: "ה" }), "last"],
      "1p": [past("A", "a", "S", {}, u("נ", undefined, { mater: VAV_SHURUK })), "penult"],
      "2mp": [past("V", "a", "S", {}, u("ת", "E"), u("ם")), "last"],
      "2fp": [past("V", "a", "S", {}, u("ת", "E"), u("ן")), "last"],
      "3p": [past("A", "V", undefined, { mater: VAV_SHURUK }), "last"],
    },
    future: {
      "1s": future("א", "o"),
      "2ms": future("ת", "o"),
      "2fs": future("ת", "V-i"),
      "3ms": future("י", "o"),
      "3fs": future("ת", "o"),
      "1p": future("נ", "o"),
      "2mp": future("ת", "V-u"),
      "2fp": future("ת", "on"),
      "3mp": future("י", "V-u"),
      "3fp": future("י", "on"),
    },
    imperative: {
      ms: [[u(c1, "V"), u(c2, undefined, { mater: VAV_HOLAM }), u(c3)], "last"],
      fs: [[u(c1, "i"), u(c2, "V"), u(c3, "i", { tail: "י" })], "last"],
      mp: [[u(c1, "i"), u(c2, "V"), u(c3, undefined, { mater: VAV_SHURUK })], "last"],
      fp: [[u(c1, "V"), u(c2, "o"), u(c3, "S"), u("נ", "A", { tail: "ה" })], "penult"],
    },
  };
}

/**
 * Пиэль (קִטֵּל): вторая буква корня удвоена во всех формах. Основы: прошедшее דִּבֵּר / דִּבַּרְ- (полное письмо с י: דיבר),
 * остальные времена -דַבֵּר с приставкой: לְ (инфинитив), מְ (настоящее), אֲ תְּ יְ נְ (будущее); повелительное דַּבֵּר.
 * Шва приставки подвижная (читается «е»), поэтому первая буква корня после неё без дагеша: לְבַקֵּר «левакер».
 */
function pielSpecs(root: string): Specs {
  const [c1, c2, c3] = [...root] as [string, string, string];
  const C2 = (v?: Vowel) => u(c2, v, { forte: true });
  /** Прошедшее: C1 с хириком и י, удвоенная C2 со своей гласной, C3 и окончание. */
  const past = (c2v: Vowel, c3v: Vowel | undefined, c3extra: Partial<Unit>, ...ending: Unit[]): Unit[] => [
    u(c1, "i", { mater: YOD_HIRIK }),
    C2(c2v),
    u(c3, c3v, c3extra),
    ...ending,
  ];
  /** Основа с патахом под C1 и цере под C2 (מְדַבֵּר, יְדַבֵּר, דַּבֵּר) или с подвижной шва под C2 перед окончанием на гласную. */
  const stem = (prefix: Unit[], tail: "e" | "V-i" | "V-u" | "V-im" | "V-ot" | "E-et" | "en"): FormSpec => {
    const head = [...prefix, u(c1, "a")];
    switch (tail) {
      case "e":
        return [[...head, C2("e"), u(c3)], "last"];
      case "V-i":
        return [[...head, C2("V"), u(c3, "i", { tail: "י" })], "last"];
      case "V-u":
        return [[...head, C2("V"), u(c3, undefined, { mater: VAV_SHURUK })], "last"];
      case "V-im":
        return [[...head, C2("V"), u(c3, "i", { tail: "י" }), u("ם")], "last"];
      case "V-ot":
        return [[...head, C2("V"), u(c3, undefined, { mater: VAV_HOLAM }), u("ת")], "last"];
      case "E-et":
        return [[...head, C2("E"), u(c3, "E"), u("ת")], "penult"];
      case "en":
        return [[...head, C2("e"), u(c3, "S"), u("נ", "A", { tail: "ה" })], "penult"];
    }
  };
  const pre = (letter: string): Unit[] => [u(letter, letter === "א" ? "H" : "W")];

  return {
    infinitive: stem(pre("ל"), "e"),
    present: {
      ms: stem(pre("מ"), "e"),
      fs: stem(pre("מ"), "E-et"),
      mp: stem(pre("מ"), "V-im"),
      fp: stem(pre("מ"), "V-ot"),
    },
    // Ударение как в пааль: -ти, -та, -ну безударные (диба́рти), -тем, -тен и 3-е лицо ударные.
    past: {
      "1s": [past("a", "S", {}, u("ת", "i", { tail: "י" })), "penult"],
      "2ms": [past("a", "S", {}, u("ת", "A")), "penult"],
      "2fs": [past("a", "S", {}, u("ת", "S")), "last"],
      "3ms": [past("e", undefined, {}), "last"],
      "3fs": [past("V", "A", { tail: "ה" }), "last"],
      "1p": [past("a", "S", {}, u("נ", undefined, { mater: VAV_SHURUK })), "penult"],
      "2mp": [past("a", "S", {}, u("ת", "E"), u("ם")), "last"],
      "2fp": [past("a", "S", {}, u("ת", "E"), u("ן")), "last"],
      "3p": [past("V", undefined, { mater: VAV_SHURUK }), "last"],
    },
    future: {
      "1s": stem(pre("א"), "e"),
      "2ms": stem(pre("ת"), "e"),
      "2fs": stem(pre("ת"), "V-i"),
      "3ms": stem(pre("י"), "e"),
      "3fs": stem(pre("ת"), "e"),
      "1p": stem(pre("נ"), "e"),
      "2mp": stem(pre("ת"), "V-u"),
      "2fp": stem(pre("ת"), "en"),
      "3mp": stem(pre("י"), "V-u"),
      "3fp": stem(pre("י"), "en"),
    },
    imperative: {
      ms: stem([], "e"),
      fs: stem([], "V-i"),
      mp: stem([], "V-u"),
      fp: stem([], "en"),
    },
  };
}

const toForm = ([units, stress]: FormSpec): WordForm => render(units, stress);

export interface ConjugatedVerb {
  /** Инфинитив: `he`, `niqqud`, `translit` слова. */
  infinitive: WordForm;
  verb: VerbData;
}

function conjugate(binyan: Binyan, root: string, spec: Specs): ConjugatedVerb {
  const map = (forms: Record<string, FormSpec>) => Object.fromEntries(Object.entries(forms).map(([key, s]) => [key, toForm(s)]));
  return {
    infinitive: toForm(spec.infinitive),
    verb: {
      binyan,
      root,
      present: map(spec.present) as VerbData["present"],
      past: map(spec.past) as VerbData["past"],
      future: map(spec.future) as VerbData["future"],
      imperative: map(spec.imperative) as NonNullable<VerbData["imperative"]>,
    },
  };
}

/** Все 27 форм глагола пааль с сильным корнем. Бросает ошибку, если корень генератору не подходит. */
export function conjugatePaal(root: string): ConjugatedVerb {
  const problems = paalRootProblems(root);
  if (problems.length) throw new Error(problems.join("\n"));
  return conjugate("paal", root, paalSpecs(root));
}

/** Все 27 форм глагола пиэль с сильным корнем. Бросает ошибку, если корень генератору не подходит. */
export function conjugatePiel(root: string): ConjugatedVerb {
  const problems = pielRootProblems(root);
  if (problems.length) throw new Error(problems.join("\n"));
  return conjugate("piel", root, pielSpecs(root));
}

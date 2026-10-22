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
 * Пааль (`conjugatePaal`): сильные корни с холамом в будущем (יִכְתֹּב, יִשְׁבֹּר), корни с гортанной ע или ח в начале (לַעֲבֹד,
 * תַּעֲבֹד, אֶעֱבֹד, לַחְשֹׁב), в конце (לִשְׁלֹחַ, שׁוֹלֵחַ, יִשְׁלַח, патах-гануб) или посередине (לִבְחֹר, בּוֹחֲרִים, תִּבְחֲרִי,
 * יִבְחַר: хатаф-патах под второй буквой), а также корни без гортанных с патахом в будущем (ללמוד, יִלְמַד, לְמַד: список
 * `PATAH_FUTURE`, у לשכב ещё инфинитив с патахом: `PATAH_INFINITIVE`). Без гортанных א ה в начале, י ו в корне, נ в начале,
 * одинаковых букв и ש с точкой «син» (שׂ). Слабые корни он не строит: для них нужны свои схемы.
 *
 * Пиэль (`conjugatePiel`): те же ограничения и ещё два: вторая буква корня не ר (ר не удваивается, гласная перед ней
 * меняется: בֵּרֵךְ) и третья не נ и не ת (они сливаются с окончаниями: סִמַּנּוּ, שִׁכַּתְּ).
 *
 * Хифъиль (`conjugateHifil`, 17.10): приставки הִ / הַ / מַ / תַּ / יַ, во второй букве корня хирик с י (הִסְבִּיר).
 * Первая буква корня не гортанная и не נ (הֶחְלִיט, הִכִּיר строятся иначе), третья не гортанная (הִצְלִיחַ) и не ת;
 * зато вторая может быть א ח ע (הִשְׁאִיר, הִתְחִיל): в хифъиле под ней никогда не бывает шва. Третья נ сливается
 * с окончанием -נוּ и -נָה (הִזְמַנּוּ, תַּזְמֵנָּה), это генератор учитывает.
 *
 * Нифъиль (`conjugateNifal`, 17.10): приставка נִ в прошедшем и настоящем (נִכְתַּב, נִכְתָּב), в будущем, инфинитиве и
 * повелительном נ растворяется в первой букве корня: она получает дагеш и камац (יִכָּתֵב, לְהִיכָּתֵב, הִיכָּתֵב), а ב כ פ
 * становятся твёрдыми (икате́в, но нихта́в). Без огласовок приставка пишется с י: ייכתב, תיכתב, ניכתב, היכתב, להיכתב; в 1-м
 * лице י нет (אכתב). Подвижная шва второй буквы после немой читается «е» (נִכְתְּבָה «нихтева́»). Прошедшее 3ms и настоящее ms
 * звучат одинаково (нихта́в). Первая буква корня не гортанная и не ר, נ (נֶחְשָׁב, יֵחָשֵׁב строятся иначе); вторая может быть
 * א ה ח ע (под ней вместо шва хатаф-патах: נִשְׁאֲרָה), третья может быть ח ע (патах вместо цере и сеголя: יִפָּתַח, נִפְתַּחַת).
 *
 * Хитпаэль (`conjugateHitpael`, 18.10): устроен как пиэль с приставкой: вторая буква корня удвоена (הִתְלַבֵּשׁ, מִתְלַבֵּשׁ),
 * приставки הִתְ (прошедшее, повелительное), לְהִתְ, מִתְ, אֶתְ תִּתְ יִתְ נִתְ. Первая буква корня после немой шва приставки получает
 * дагеш бегадкефат (הִתְכַּתֵּב). У первой ס ש צ ז приставка ת переставляется после неё, у צ она становится ט, у ז становится ד
 * (הִסְתַּדֵּר, הִשְׁתַּמֵּשׁ, הִצְטַעֵר, הִזְדָּרֵז). Вторая буква ר не удваивается, а под первой камац (הִתְקָרֵב); вторая א ה ח ע тоже
 * не удваивается, шва под ней заменяет хатаф-патах (הִתְנַהֲגָה). Третья נ сливается с -נוּ и -נָה (הִתְחַתַּנּוּ, תִּתְחַתֵּנָּה).
 * Прошедшее 3ms совпадает с повелительным ms, а 3p с повелительным mp (הִתְלַבֵּשׁ, הִתְלַבְּשׁוּ). Первая ד ט ת (приставка
 * растворяется), третья ח ע (патах-гануб), слабые, четырёхбуквенные и удвоенные корни генератор не строит.
 *
 * Каждый генератор отклоняет корень, который ему не подходит (`paalRootProblems`, `pielRootProblems`, `hifilRootProblems`,
 * `nifalRootProblems`, `hitpaelRootProblems`).
 */

/**
 * Гласный знак при букве. S: немая шва (закрывает слог), V: подвижная шва без звука в транскрипции (קָתְבָה → «катва»),
 * W: подвижная шва, которая читается «е» (после приставок пиэль: לְדַבֵּר «ледабер»), H: хатаф-патах (אֲ, «а»),
 * X: хатаф-сеголь (אֶעֱבֹד, «э»), F: патах-гануб, патах под конечной ח или ע после долгой гласной (שׁוֹלֵחַ):
 * читается «а» ПЕРЕД согласной («шоле́ах») и своего слога не образует.
 */
type Vowel = "a" | "A" | "i" | "e" | "E" | "o" | "H" | "W" | "S" | "V" | "X" | "F";

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
  X: "ֱ", // хатаф-сеголь
  F: "ַ", // патах-гануб
};

const SOUND: Record<Exclude<Vowel, "S" | "V" | "F">, string> = { a: "а", A: "а", i: "и", e: "е", E: "е", o: "о", H: "а", W: "е", X: "э" };

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
    case "ה":
    case "ח":
      return "х";
    // Приставка י читается без «й»: יִ «и», יְ «е». א в приставке только несёт гласную: звука согласной нет.
    case "י":
    case "א":
    case "ע":
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
  const chunks: { text: string; syllable: boolean; bare?: boolean }[] = [];
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
    // Немая шва и следом буква с тем же звуком (ט и ת в בָּעַטְתִּי): в речи один «т», а не два (баа́ти), как в שָׁתְתָה «шата́».
    const prevChunk = chunks[chunks.length - 1];
    if (prevChunk?.bare && sound !== "" && prevChunk.text === sound && !unit.forte) prevChunk.text = "";
    let syllable = false;
    if (unit.mater) {
      sound += unit.mater.sound;
      syllable = true;
    } else if (unit.v === "F") {
      // Патах-гануб читается перед согласной (шоле́ах, шоме́а) и слога не образует: ударение остаётся на предыдущем.
      sound = "а" + sound;
    } else if (unit.v && unit.v !== "S" && unit.v !== "V") {
      // Сеголь в начале слова под א читается «э» (эхтов), в остальных местах «е».
      // Приставка יַ в хифъиле читается «я» (ясби́р).
      sound += i === 0 && letter === "א" && unit.v === "E" ? "э" : i === 0 && letter === "י" && unit.v === "a" ? "я" : SOUND[unit.v];
      syllable = true;
    }
    chunks.push({ text: sound, syllable, bare: unit.v === "S" && !unit.mater && !unit.tail });

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

/**
 * Проблемы корня: подходит ли он генератору пааль. Сильный корень с холамом в будущем (יִכְתֹּב) и три вида гортанных:
 * первая ע или ח (19.10, «Пааль 4»: לַעֲבֹד, לַחְשֹׁב: приставка с патахом, хатаф-патах или немая шва), последняя ח или ע
 * (19.10: לִשְׁמֹעַ, יִשְׁמַע: патах-гануб в инфинитиве и настоящем, патах в будущем) и вторая ח или ע (19.10, «Пааль 5»:
 * לִבְחֹר, בּוֹחֲרִים, תִּבְחֲרִי: под второй буквой хатаф-патах вместо шва). Плюс сильные корни с патахом в будущем
 * (`PATAH_FUTURE`: ללמוד, יִלְמַד). Первая א ה, гортанная посередине вместе с гортанной с краю, обе крайние гортанные
 * сразу, י ו, первая נ и удвоенные корни генератор не строит.
 */
export function paalRootProblems(root: string): string[] {
  const problems: string[] = [];
  const letters = [...root];
  const [c1, c2, c3] = letters;
  const strong = (l: string | undefined) => l !== undefined && /^[בגדזטכלמנספצקרשת]$/.test(l);
  const guttural = (l: string | undefined) => l === "ח" || l === "ע";
  // Вторая א (22.10, «Пааль 6»: שאל, דאג) спрягается как вторая ח ע: שָׁאֲלָה, תִּשְׁאֲלִי, יִשְׁאַל (pealim.com).
  const middle = (l: string | undefined) => guttural(l) || l === "א";
  if (letters.length !== 3) problems.push(`корень «${root}»: нужны ровно 3 буквы`);
  if (!(strong(c1) && c1 !== "נ") && !guttural(c1)) {
    problems.push(`корень «${root}»: первая буква должна быть из בגדזטכלמספצקרשת или ע ח (без א ה, י ו и נ: это слабые корни)`);
  }
  if (!strong(c2) && !middle(c2)) problems.push(`корень «${root}»: вторая буква должна быть из בגדזטכלמנספצקרשת или א ח ע (без ה, י ו и конечных форм)`);
  if (!strong(c3) && !guttural(c3)) problems.push(`корень «${root}»: третья буква должна быть из בגדזטכלמנספצקרשת или ח ע (без א ה, י ו и конечных форм)`);
  if (guttural(c1) && guttural(c3)) problems.push(`корень «${root}»: гортанные в начале и в конце сразу`);
  if (middle(c2) && (guttural(c1) || guttural(c3))) problems.push(`корень «${root}»: гортанная посередине вместе с гортанной в начале или в конце`);
  if (new Set(letters).size !== letters.length) problems.push(`корень «${root}»: есть одинаковые буквы (удвоенный корень)`);
  if (SIN_ROOTS.includes(root)) problems.push(`корень «${root}» пишется с «син» (שׂ), а генератор ставит «шин» (ש)`);
  return problems;
}

/**
 * Корни пааль с первой ח, у которых в формах с приставкой шва немая (לַחְשֹׁב, אֶחְשֹׁב, תַּחְשְׁבִי), а не хатаф-патах
 * (לַחֲזֹר, אֶחֱזֹר, תַּחַזְרִי). Это свойство слова, правилом оно не выводится (pealim.com). У первой ע всегда хатаф.
 */
export const KHET_SILENT_SHVA: readonly string[] = ["חשב", "חתכ"];

/**
 * Корни пааль без гортанных, у которых в будущем патах, а не холам (19.10, «Пааль 5»): יִלְמַד, יִלְבַּשׁ, יִשְׁכַּב (не יִלְמֹד).
 * Отсюда же повелительное לְמַד, לְבַשׁ, שְׁכַב, fp לְמַדְנָה и будущее 2fp תִּלְמַדְנָה, а 2fs תִּלְמְדִי. Это свойство слова,
 * правилом оно не выводится (pealim.com). Настоящее и прошедшее у них как у сильных корней. У корней с гортанной на конце
 * (שלח, שמע) патах в будущем всегда, их в список не вносят.
 */
export const PATAH_FUTURE: readonly string[] = ["למד", "לבש", "שכב"];

/**
 * Корни пааль, у которых инфинитив с патахом, а не с холамом: לִשְׁכַּב (а не לִשְׁכֹּב). Остальные корни из `PATAH_FUTURE`
 * (ללמוד, ללבוש) в инфинитиве имеют холам, как сильные корни (pealim.com). Свойство слова, правилом не выводится.
 */
export const PATAH_INFINITIVE: readonly string[] = ["שכב"];

/**
 * Корни пааль с гортанной ח или ע на втором месте, у которых в будущем холам, а не патах: יִמְחֹק, אֶמְחֹק (pealim.com даёт холам
 * основным, патах запасным). У остальных корней со второй гортанной патах: יִבְחַר, יִפְחַד, יִצְחַק, יִצְעַק, יִרְחַץ, יִבְעַט.
 * Свойство слова, правилом не выводится.
 */
export const HOLAM_FUTURE_GUTTURAL2: readonly string[] = ["מחק", "דחפ"];

/** Проблемы корня: подходит ли он генератору пиэль (сильный корень, вторая буква удваивается). */
export function pielRootProblems(root: string): string[] {
  const problems = strongRootProblems(root);
  const [, c2, c3] = [...root];
  if (c2 === "ר") problems.push(`корень «${root}»: ר во второй букве не удваивается (в пиэль меняется гласная: בֵּרֵךְ)`);
  if (c3 === "נ" || c3 === "ת") problems.push(`корень «${root}»: ${c3} в конце сливается с окончанием (סִמַּנּוּ, שִׁכַּתְּ)`);
  return problems;
}

/** Проблемы корня: подходит ли он генератору хифъиль (вторая буква может быть א ח ע, третья может быть נ). */
export function hifilRootProblems(root: string): string[] {
  const problems: string[] = [];
  const letters = [...root];
  const [c1, c2, c3] = letters;
  const strong = (l: string | undefined) => l !== undefined && /^[בגדזטכלמנספצקרשת]$/.test(l);
  if (letters.length !== 3) problems.push(`корень «${root}»: нужны ровно 3 буквы`);
  if (!strong(c1) || c1 === "נ") problems.push(`корень «${root}»: первая буква должна быть из בגדזטכלמספצקרשת (без гортанных, י ו и נ)`);
  if (!(strong(c2) || (c2 !== undefined && "אחע".includes(c2)))) problems.push(`корень «${root}»: вторая буква должна быть из בגדזטכלמנספצקרשת или א ח ע`);
  if (!strong(c3) || c3 === "ת") problems.push(`корень «${root}»: третья буква должна быть из בגדזטכלמנספצקרש (без гортанных, י ו и ת)`);
  if (new Set(letters).size !== letters.length) problems.push(`корень «${root}»: есть одинаковые буквы (удвоенный корень)`);
  if (SIN_ROOTS.includes(root)) problems.push(`корень «${root}» пишется с «син» (שׂ), а генератор ставит «шин» (ש)`);
  return problems;
}

/**
 * Проблемы корня: подходит ли он генератору нифъаль. Первая буква: без гортанных и ר (у них нет дагеша, другие гласные),
 * без נ, י, ו. Вторая: любая сильная или א ה ח ע. Третья: сильная или ח ע, без נ и ת (сливаются с окончаниями), без א ה י ו.
 */
export function nifalRootProblems(root: string): string[] {
  const problems: string[] = [];
  const letters = [...root];
  const [c1, c2, c3] = letters;
  const has = (set: string, letter: string | undefined) => letter !== undefined && set.includes(letter);
  if (letters.length !== 3) problems.push(`корень «${root}»: нужны ровно 3 буквы`);
  if (!has("בגדזטכלמספצקשת", c1)) {
    problems.push(`корень «${root}»: первая буква должна быть из בגדזטכלמספצקשת (без гортанных א ה ח ע, без ר, נ, י, ו: у них другие гласные)`);
  }
  if (!has("בגדזטכלמנספצקרשתאהחע", c2)) problems.push(`корень «${root}»: вторая буква должна быть из בגדזטכלמנספצקרשת или א ה ח ע`);
  if (!has("בגדזטכלמספצקרשחע", c3)) problems.push(`корень «${root}»: третья буква должна быть из בגדזטכלמספצקרש или ח ע (без נ, ת, א, ה, י, ו)`);
  if (new Set(letters).size !== letters.length) problems.push(`корень «${root}»: есть одинаковые буквы (удвоенный корень)`);
  if (SIN_ROOTS.includes(root)) problems.push(`корень «${root}» пишется с «син» (שׂ), а генератор ставит «шин» (ש)`);
  return problems;
}

/**
 * Проблемы корня: подходит ли он генератору хитпаэль. Первая буква: любая сильная и א ה ח ע (נ тоже: в хитпаэле она не
 * меняется), без ד ט ת (приставка ת растворяется в них) и без י ו. Вторая: любая сильная, ר или א ה ח ע. Третья: сильная
 * (без ת, гортанных, י ו). Первая и третья буквы могут совпадать (שמש, זרז), вторая не может совпадать ни с первой, ни с третьей
 * (удвоенные корни вроде פלל позже).
 */
export function hitpaelRootProblems(root: string): string[] {
  const problems: string[] = [];
  const letters = [...root];
  const [c1, c2, c3] = letters;
  const has = (set: string, letter: string | undefined) => letter !== undefined && set.includes(letter);
  if (letters.length !== 3) problems.push(`корень «${root}»: нужны ровно 3 буквы`);
  if (!has("בגזכלמנספצקרשאהחע", c1)) {
    problems.push(`корень «${root}»: первая буква должна быть из בגזכלמנספצקרש или א ה ח ע (ד ט ת растворяют приставку, י ו слабые)`);
  }
  if (!has("בגדזטכלמנספצקרשתאהחע", c2)) problems.push(`корень «${root}»: вторая буква должна быть из בגדזטכלמנספצקרשת или א ה ח ע`);
  if (!has("בגדזטכלמנספצקרש", c3)) problems.push(`корень «${root}»: третья буква должна быть из בגדזטכלמנספצקרש (без ת, гортанных א ה ח ע, י ו)`);
  if (c1 !== undefined && c1 === c2) problems.push(`корень «${root}»: первая и вторая буквы одинаковые`);
  if (c2 !== undefined && c2 === c3) problems.push(`корень «${root}»: вторая и третья буквы одинаковые (удвоенный корень)`);
  if (SIN_ROOTS.includes(root)) problems.push(`корень «${root}» пишется с «син» (שׂ), а генератор ставит «шин» (ש)`);
  return problems;
}

/** Корни, которые пишутся с «син» (שׂ): генераторы ставят «шин»,поэтому такие глаголы они не строят (שרף, שכר, שלט, שפט и др.). */
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
  /** Первая ע или ח: приставки с патахом (תַּעֲבֹד), хатаф-патах в прошедшем 2mp и 2fp и в повелительном. */
  const guttural1 = c1 === "ע" || c1 === "ח";
  /** Последняя ח или ע: патах-гануб в инфинитиве и настоящем (שׁוֹלֵחַ), патах вместо холама в будущем (יִשְׁלַח). */
  const guttural3 = c3 === "ח" || c3 === "ע";
  /** Вторая ח или ע (19.10, «Пааль 5»): вместо подвижной шва под ней хатаф-патах (בּוֹחֲרִים, בָּחֲרָה, תִּבְחֲרִי), в повелительном fs и mp под первой буквой патах (בַּחֲרִי). */
  const guttural2 = c2 === "ח" || c2 === "ע" || c2 === "א";
  /**
   * Патах вместо холама в будущем и повелительном (יִלְמַד, לְמַד, תִּלְמַדְנָה): всегда при последней ח или ע, у корней со второй гортанной
   * тоже (יִבְחַר), кроме списка `HOLAM_FUTURE_GUTTURAL2` (יִמְחֹק), у остальных только корни из списка `PATAH_FUTURE`.
   */
  const patahFuture = guttural3 || (guttural2 ? !HOLAM_FUTURE_GUTTURAL2.includes(root) : PATAH_FUTURE.includes(root));
  /** Подвижная шва второй буквы корня: под гортанной она превращается в хатаф-патах. */
  const v2: Vowel = guttural2 ? "H" : "V";
  /** Под первой гортанной в формах с приставкой хатаф-патах (לַעֲבֹד), а у ח из списка `KHET_SILENT_SHVA` немая шва (לַחְשֹׁב). */
  const hataf1 = guttural1 && !KHET_SILENT_SHVA.includes(root);
  /** Гласная первой буквы корня после приставки: хатаф-патах, после אֶ хатаф-сеголь (אֶעֱבֹד), иначе немая шва. */
  const firstVowel = (prefix: string): Vowel => (hataf1 ? (prefix === "א" ? "X" : "H") : "S");
  /** Третья буква: патах-гануб, если она ח или ע и стоит после долгой гласной. */
  const last = (): Unit => (guttural3 ? u(c3, "F") : u(c3));
  /** Прошедшее: гласные при C1 и C2, затем C3 (со своей гласной или буквой-носителем) и окончание. */
  const past = (c1v: Vowel, c2v: Vowel, c3v: Vowel | undefined, c3extra: Partial<Unit>, ...ending: Unit[]): Unit[] => [
    u(c1, c1v),
    u(c2, c2v),
    u(c3, c3v, c3extra),
    ...ending,
  ];
  /** Прошедшее 2mp и 2fp: у первой гортанной хатаф-патах (עֲבַדְתֶּם), у остальных подвижная шва (כְּתַבְתֶּם). */
  const pluralFirst: Vowel = guttural1 ? "H" : "V";

  /** Будущее: приставка + корень. */
  const future = (prefix: string, tail: "o" | "V-i" | "V-u" | "on"): FormSpec => {
    const pre = u(prefix, prefix === "א" ? "E" : guttural1 ? "a" : "i");
    // Основа с шва: первая гортанная с хатаф-патахом даёт תַּעַבְדִי (патах под ע, подвижная шва под второй), с немой шва תַּחְשְׁבִי.
    const open: Vowel = hataf1 ? "a" : "S";
    switch (tail) {
      case "o":
        return patahFuture
          ? [[pre, u(c1, firstVowel(prefix)), u(c2, "a"), u(c3)], "last"]
          : [[pre, u(c1, firstVowel(prefix)), u(c2, undefined, { mater: VAV_HOLAM }), u(c3)], "last"];
      case "V-i":
        return [[pre, u(c1, open), u(c2, v2), u(c3, "i", { tail: "י" })], "last"];
      case "V-u":
        return [[pre, u(c1, open), u(c2, v2), u(c3, undefined, { mater: VAV_SHURUK })], "last"];
      case "on":
        return patahFuture
          ? [[pre, u(c1, firstVowel(prefix)), u(c2, "a"), u(c3, "S"), u("נ", "A", { tail: "ה" })], "penult"]
          : [[pre, u(c1, firstVowel(prefix)), u(c2, "o"), u(c3, "S"), u("נ", "A", { tail: "ה" })], "penult"];
    }
  };

  return {
    // Инфинитив с патахом (לִשְׁכַּב) только у корней из `PATAH_INFINITIVE`, у остальных холам (לִלְמֹד, לִבְחֹר), как у сильных корней.
    infinitive: [
      PATAH_INFINITIVE.includes(root)
        ? [u("ל", "i"), u(c1, firstVowel("ל")), u(c2, "a"), u(c3)]
        : [u("ל", guttural1 ? "a" : "i"), u(c1, firstVowel("ל")), u(c2, undefined, { mater: VAV_HOLAM }), last()],
      "last",
    ],
    present: {
      ms: [[u(c1, undefined, { mater: VAV_HOLAM }), u(c2, "e"), last()], "last"],
      fs: [guttural3 ? [u(c1, undefined, { mater: VAV_HOLAM }), u(c2, "a"), u(c3, "a"), u("ת")] : [u(c1, undefined, { mater: VAV_HOLAM }), u(c2, "E"), u(c3, "E"), u("ת")], "penult"],
      mp: [[u(c1, undefined, { mater: VAV_HOLAM }), u(c2, v2), u(c3, "i", { tail: "י" }), u("ם")], "last"],
      fp: [[u(c1, undefined, { mater: VAV_HOLAM }), u(c2, v2), u(c3, undefined, { mater: VAV_HOLAM }), u("ת")], "last"],
    },
    // Окончания -ти, -та, -ну безударные (ката́вти), -тем и -тен ударные, в 3-м лице ударение на последнем слоге.
    past: {
      "1s": [past("A", "a", "S", {}, u("ת", "i", { tail: "י" })), "penult"],
      "2ms": [past("A", "a", "S", {}, u("ת", "A")), "penult"],
      "2fs": [past("A", "a", "S", {}, u("ת", "S")), "last"],
      "3ms": [past("A", "a", undefined, {}), "last"],
      "3fs": [past("A", v2, "A", { tail: "ה" }), "last"],
      "1p": [past("A", "a", "S", {}, u("נ", undefined, { mater: VAV_SHURUK })), "penult"],
      "2mp": [past(pluralFirst, "a", "S", {}, u("ת", "E"), u("ם")), "last"],
      "2fp": [past(pluralFirst, "a", "S", {}, u("ת", "E"), u("ן")), "last"],
      "3p": [past("A", v2, undefined, { mater: VAV_SHURUK }), "last"],
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
      ms: [
        patahFuture
          ? [u(c1, "V"), u(c2, "a"), u(c3)]
          : [u(c1, guttural1 ? "H" : "V"), u(c2, undefined, { mater: VAV_HOLAM }), u(c3)],
        "last",
      ],
      // fs и mp: хирик под первой буквой (עִבְדִי, לִמְדִי), а при второй гортанной патах и хатаф-патах (בַּחֲרִי, מַחֲקוּ).
      fs: [[u(c1, guttural2 ? "a" : "i"), u(c2, v2), u(c3, "i", { tail: "י" })], "last"],
      mp: [[u(c1, guttural2 ? "a" : "i"), u(c2, v2), u(c3, undefined, { mater: VAV_SHURUK })], "last"],
      fp: [
        patahFuture
          ? [u(c1, "V"), u(c2, "a"), u(c3, "S"), u("נ", "A", { tail: "ה" })]
          : [u(c1, guttural1 ? "H" : "V"), u(c2, "o"), u(c3, "S"), u("נ", "A", { tail: "ה" })],
        "penult",
      ],
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

/**
 * Хифъиль (הִפְעִיל). Две основы: долгая -כְתִּיב (хирик и י под второй буквой: הִכְתִּיב, מַכְתִּיב, יַכְתִּיב, הַכְתִּיבִי) и
 * короткая: -כְתַּבְ- в прошедшем перед согласным окончанием (הִכְתַּבְתִּי) и -כְתֵּב в повелительном м.р. и в книжных
 * формах на -נָה (הַכְתֵּב, תַּכְתֵּבְנָה). Первая буква корня после гласной приставки без дагеша (הִכְנִיס «хихни́с»).
 * Ударение на основе, а не на окончании: הִכְתִּיבָה «хихти́ва», תַּכְתִּיבוּ «тахти́ву»; у настоящего ж.р. и мн.ч. на конце
 * (махтива́, махтиви́м). Третья נ сливается с окончаниями -נוּ и -נָה: הִזְמַנּוּ, תַּזְמֵנָּה.
 */
function hifilSpecs(root: string): Specs {
  const [c1, c2, c3] = [...root] as [string, string, string];
  const nun = c3 === "נ";
  /** Долгая основа с приставкой и окончанием. */
  const long = (prefix: Unit[], tail: "" | "a" | "i" | "u" | "im" | "ot"): Unit[] => {
    const head = [...prefix, u(c1, "S"), u(c2, "i", { mater: YOD_HIRIK })];
    switch (tail) {
      case "":
        return [...head, u(c3)];
      case "a":
        return [...head, u(c3, "A", { tail: "ה" })];
      case "i":
        return [...head, u(c3, "i", { tail: "י" })];
      case "u":
        return [...head, u(c3, undefined, { mater: VAV_SHURUK })];
      case "im":
        return [...head, u(c3, "i", { tail: "י" }), u("ם")];
      case "ot":
        return [...head, u(c3, undefined, { mater: VAV_HOLAM }), u("ת")];
    }
  };
  /** Короткая основа с цере: הַכְתֵּב или книжная форма на -נָה (при третьей נ одна נ с дагешем: תַּזְמֵנָּה). */
  const shortE = (prefix: Unit[], na: boolean): Unit[] => {
    const head = [...prefix, u(c1, "S"), u(c2, "e")];
    if (!na) return [...head, u(c3)];
    return nun ? [...head, u(c3, "A", { forte: true, tail: "ה" })] : [...head, u(c3, "S"), u("נ", "A", { tail: "ה" })];
  };
  /** Прошедшее с короткой основой: הִכְתַּבְ + окончание. */
  const pastShort = (...ending: Unit[]): Unit[] => [u("ה", "i"), u(c1, "S"), u(c2, "a"), u(c3, "S"), ...ending];
  const pre = (letter: string): Unit[] => [u(letter, "a")];
  const past = [u("ה", "i")];

  return {
    infinitive: [long([u("ל", "W"), u("ה", "a")], ""), "last"],
    present: {
      ms: [long(pre("מ"), ""), "last"],
      fs: [long(pre("מ"), "a"), "last"],
      mp: [long(pre("מ"), "im"), "last"],
      fp: [long(pre("מ"), "ot"), "last"],
    },
    // Ударение: -ти, -та, -ну безударные (хисба́рти), -тем, -тен ударные; 3-е лицо ударное на основе (хисби́р, хисби́ра, хисби́ру).
    past: {
      "1s": [pastShort(u("ת", "i", { tail: "י" })), "penult"],
      "2ms": [pastShort(u("ת", "A")), "penult"],
      "2fs": [pastShort(u("ת", "S")), "last"],
      "3ms": [long(past, ""), "last"],
      "3fs": [long(past, "a"), "penult"],
      "1p": [
        nun ? [u("ה", "i"), u(c1, "S"), u(c2, "a"), u(c3, undefined, { forte: true, mater: VAV_SHURUK })] : pastShort(u("נ", undefined, { mater: VAV_SHURUK })),
        "penult",
      ],
      "2mp": [pastShort(u("ת", "E"), u("ם")), "last"],
      "2fp": [pastShort(u("ת", "E"), u("ן")), "last"],
      "3p": [long(past, "u"), "penult"],
    },
    future: {
      "1s": [long(pre("א"), ""), "last"],
      "2ms": [long(pre("ת"), ""), "last"],
      "2fs": [long(pre("ת"), "i"), "penult"],
      "3ms": [long(pre("י"), ""), "last"],
      "3fs": [long(pre("ת"), ""), "last"],
      "1p": [long(pre("נ"), ""), "last"],
      "2mp": [long(pre("ת"), "u"), "penult"],
      "2fp": [shortE(pre("ת"), true), "penult"],
      "3mp": [long(pre("י"), "u"), "penult"],
      "3fp": [shortE(pre("י"), true), "penult"],
    },
    imperative: {
      ms: [shortE(pre("ה"), false), "last"],
      fs: [long(pre("ה"), "i"), "penult"],
      mp: [long(pre("ה"), "u"), "penult"],
      fp: [shortE(pre("ה"), true), "penult"],
    },
  };
}

/**
 * Нифъаль (נִפְעַל). Прошедшее и настоящее: приставка נִ, немая шва под первой буквой, вторая с дагешем (бегадкефат):
 * נִכְתַּב, נִכְתָּב, נִכְתֶּבֶת. Будущее, инфинитив и повелительное: первая буква корня с дагешем и камацем, вторая с цере:
 * יִכָּתֵב, לְהִיכָּתֵב, הִיכָּתֵב (י после приставки это хирик в полном письме: ייכתב, תיכתב, ניכתב; в 1-м лице אֶכָּתֵב без י).
 * Подвижная шва второй буквы читается «е» после немой шва (נִכְתְּבָה «нихтева́») и без звука после гласной (תִּכָּתְבִי «тикатви́»);
 * у гортанной второй буквы вместо неё хатаф-патах (נִשְׁאֲרָה «нишара́»). Гортанная ח ע в конце корня меняет цере и сеголь на патах
 * (יִפָּתַח, נִפְתַּחַת). Ударение как в других бинъянах: -ти, -та, -ну безударные (нихта́вти), 3-е лицо ударное на конце
 * (нихтева́, нихтеву́), у ж.р. настоящего и форм на -на на предпоследнем слоге.
 */
function nifalSpecs(root: string): Specs {
  const [c1, c2, c3] = [...root] as [string, string, string];
  const guttural2 = "אהחע".includes(c2);
  const guttural3 = "חע".includes(c3);
  /** Подвижная шва под второй буквой: «е» после немой шва (прошедшее), без звука после гласной (будущее); у гортанной хатаф-патах. */
  const afterSilent: Vowel = guttural2 ? "H" : "W";
  const afterVowel: Vowel = guttural2 ? "H" : "V";
  /** Гласная второй буквы в «закрытой» основе: цере, у корней на ח ע патах. */
  const stem: Vowel = guttural3 ? "a" : "e";
  const prefixNun = u("נ", "i");
  /** Прошедшее и настоящее: נִ + первая с немой шва + вторая + остальное. */
  const base = (c2v: Vowel, rest: Unit[]): Unit[] => [prefixNun, u(c1, "S"), u(c2, c2v), ...rest];
  /** Первая буква корня после растворившейся נ: дагеш и камац (в 3-м лице будущего прошедшее твёрдое: икате́в). */
  const first = (): Unit => u(c1, "A", { forte: true });
  /** Основа будущего, инфинитива и повелительного. */
  const tail = (prefix: Unit[], kind: "e" | "V-i" | "V-u" | "on"): FormSpec => {
    const head = [...prefix, first()];
    switch (kind) {
      case "e":
        return [[...head, u(c2, stem), u(c3)], "last"];
      case "V-i":
        return [[...head, u(c2, afterVowel), u(c3, "i", { tail: "י" })], "last"];
      case "V-u":
        return [[...head, u(c2, afterVowel), u(c3, undefined, { mater: VAV_SHURUK })], "last"];
      case "on":
        return [[...head, u(c2, "a"), u(c3, "S"), u("נ", "A", { tail: "ה" })], "penult"];
    }
  };
  /** Приставка будущего: אֶ в 1-м лице без י, остальные с хириком и י (תיכתב, ייכתב, ניכתב). */
  const pre = (letter: string): Unit[] => [letter === "א" ? u("א", "E") : u(letter, "i", { tail: "י" })];
  const hi = (): Unit[] => [u("ה", "i", { tail: "י" })];
  /** 2fs прошедшего: у корня на ח ע перед ת стоит патах (נִפְתַּחַתְּ), ударение на предпоследнем слоге. */
  const past2fs: FormSpec = guttural3
    ? [base("a", [u(c3, "a"), u("ת", "S", { forte: true })]), "penult"]
    : [base("a", [u(c3, "S"), u("ת", "S")]), "last"];

  return {
    infinitive: tail([u("ל", "W"), ...hi()], "e"),
    present: {
      ms: [base("A", [u(c3)]), "last"],
      fs: [guttural3 ? base("a", [u(c3, "a"), u("ת")]) : base("E", [u(c3, "E"), u("ת")]), "penult"],
      mp: [base("A", [u(c3, "i", { tail: "י" }), u("ם")]), "last"],
      fp: [base("A", [u(c3, undefined, { mater: VAV_HOLAM }), u("ת")]), "last"],
    },
    // Прошедшее 3ms и настоящее ms звучат одинаково (нихта́в), различаются только огласовкой (патах, камац).
    past: {
      "1s": [base("a", [u(c3, "S"), u("ת", "i", { tail: "י" })]), "penult"],
      "2ms": [base("a", [u(c3, "S"), u("ת", "A")]), "penult"],
      "2fs": past2fs,
      "3ms": [base("a", [u(c3)]), "last"],
      "3fs": [base(afterSilent, [u(c3, "A", { tail: "ה" })]), "last"],
      "1p": [base("a", [u(c3, "S"), u("נ", undefined, { mater: VAV_SHURUK })]), "penult"],
      "2mp": [base("a", [u(c3, "S"), u("ת", "E"), u("ם")]), "last"],
      "2fp": [base("a", [u(c3, "S"), u("ת", "E"), u("ן")]), "last"],
      "3p": [base(afterSilent, [u(c3, undefined, { mater: VAV_SHURUK })]), "last"],
    },
    future: {
      "1s": tail(pre("א"), "e"),
      "2ms": tail(pre("ת"), "e"),
      "2fs": tail(pre("ת"), "V-i"),
      "3ms": tail(pre("י"), "e"),
      "3fs": tail(pre("ת"), "e"),
      "1p": tail(pre("נ"), "e"),
      "2mp": tail(pre("ת"), "V-u"),
      "2fp": tail(pre("ת"), "on"),
      "3mp": tail(pre("י"), "V-u"),
      "3fp": tail(pre("י"), "on"),
    },
    imperative: {
      ms: tail(hi(), "e"),
      fs: tail(hi(), "V-i"),
      mp: tail(hi(), "V-u"),
      fp: tail(hi(), "on"),
    },
  };
}

/** Хитпаэль: буква, которой заменяется приставка ת после первой ס ש צ ז корня (הִסְתַּדֵּר, הִצְטַלֵּם, הִזְדַּקֵּן). */
const SIBILANT_SWAP: Record<string, string> = { ס: "ת", ש: "ת", צ: "ט", ז: "ד" };

/**
 * Хитпаэль (הִתְפַּעֵל). Основа как у пиэль (вторая буква удвоена, те же окончания), перед ней приставка. Прошедшее 3ms и
 * повелительное ms совпадают (הִתְלַבֵּשׁ), как 3p и повелительное mp (הִתְלַבְּשׁוּ): различий в огласовках и звучании нет.
 * Вторая буква ר или гортанная не удваивается: у ר под первой буквой камац (הִתְקָרֵב), у א ה ח ע патах и хатаф-патах вместо шва
 * (הִתְרַחֲקוּ). У первой ס ש צ ז приставка ת стоит после неё и получает гласную первой буквы (הִסְתַּדֵּר).
 */
function hitpaelSpecs(root: string): Specs {
  const [c1, c2, c3] = [...root] as [string, string, string];
  const nun = c3 === "נ";
  const guttural2 = "אהחע".includes(c2);
  const resh2 = c2 === "ר";
  const c1v: Vowel = resh2 ? "A" : "a";
  const swap = SIBILANT_SWAP[c1];
  /** Вторая буква корня: удвоена, кроме ר и гортанных; подвижная шва у гортанной это хатаф-патах. */
  const C2 = (v: Vowel): Unit => u(c2, v === "V" && guttural2 ? "H" : v, guttural2 || resh2 ? {} : { forte: true });
  /** Приставка (без ת бинъяна) и начало корня: …ת + C1, а у сибилянтов C1 с немой шва и затем ת (ט, ד) с гласной C1. */
  const open = (pre: Unit[]): Unit[] => (swap ? [...pre, u(c1, "S"), u(swap, c1v)] : [...pre, u("ת", "S"), u(c1, c1v)]);
  const stem = (pre: Unit[], tail: "e" | "V-i" | "V-u" | "V-im" | "V-ot" | "E-et" | "en"): FormSpec => {
    const head = open(pre);
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
        // Книжные формы на -на; третья נ сливается с окончанием (תִּתְחַתֵּנָּה).
        return nun
          ? [[...head, C2("e"), u(c3, "A", { forte: true, tail: "ה" })], "penult"]
          : [[...head, C2("e"), u(c3, "S"), u("נ", "A", { tail: "ה" })], "penult"];
    }
  };
  /** Прошедшее: הִתְ + основа, гласная второй буквы и окончание. */
  const past = (c2v: Vowel, c3v: Vowel | undefined, c3extra: Partial<Unit>, ...ending: Unit[]): Unit[] => [
    ...open([u("ה", "i")]),
    C2(c2v),
    u(c3, c3v, c3extra),
    ...ending,
  ];
  const pre = (letter: string): Unit[] => [u(letter, letter === "א" ? "E" : "i")];
  const hi = (): Unit[] => [u("ה", "i")];

  return {
    infinitive: stem([u("ל", "W"), ...hi()], "e"),
    present: {
      ms: stem(pre("מ"), "e"),
      fs: stem(pre("מ"), "E-et"),
      mp: stem(pre("מ"), "V-im"),
      fp: stem(pre("מ"), "V-ot"),
    },
    // Ударение как в пиэль: -ти, -та, -ну безударные (хитлаба́шти), -тем, -тен и 3-е лицо ударные.
    past: {
      "1s": [past("a", "S", {}, u("ת", "i", { tail: "י" })), "penult"],
      "2ms": [past("a", "S", {}, u("ת", "A")), "penult"],
      "2fs": [past("a", "S", {}, u("ת", "S")), "last"],
      "3ms": [past("e", undefined, {}), "last"],
      "3fs": [past("V", "A", { tail: "ה" }), "last"],
      "1p": [nun ? past("a", undefined, { forte: true, mater: VAV_SHURUK }) : past("a", "S", {}, u("נ", undefined, { mater: VAV_SHURUK })), "penult"],
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
      ms: stem(hi(), "e"),
      fs: stem(hi(), "V-i"),
      mp: stem(hi(), "V-u"),
      fp: stem(hi(), "en"),
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

/** Все 27 форм глагола хифъиль с сильным корнем. Бросает ошибку, если корень генератору не подходит. */
export function conjugateHifil(root: string): ConjugatedVerb {
  const problems = hifilRootProblems(root);
  if (problems.length) throw new Error(problems.join("\n"));
  return conjugate("hifil", root, hifilSpecs(root));
}

/** Все формы глагола нифъаль с сильным корнем (до 27, повелительное строится всегда: у страдательных его убирает состав урока). */
export function conjugateNifal(root: string): ConjugatedVerb {
  const problems = nifalRootProblems(root);
  if (problems.length) throw new Error(problems.join("\n"));
  return conjugate("nifal", root, nifalSpecs(root));
}

/** Все 27 форм глагола хитпаэль с сильным корнем (повелительное строится всегда: лишнее убирает состав урока). */
export function conjugateHitpael(root: string): ConjugatedVerb {
  const problems = hitpaelRootProblems(root);
  if (problems.length) throw new Error(problems.join("\n"));
  return conjugate("hitpael", root, hitpaelSpecs(root));
}

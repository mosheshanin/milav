import { FREE_LESSONS_PER_TOPIC } from "@milav/shared";
import { stripStress } from "./rules";
import { conjugatePaal } from "./verbGen";

/**
 * Состав уроков глаголов пааль (сильные корни): корень, перевод и фраза-пример для каждого глагола.
 * Формы строит `conjugatePaal` (content/verbGen.ts); файлы уроков создаёт `npm run content:verbs` (tools/gen-verb-lessons.ts).
 */
export interface VerbSpec {
  /** Латинский ключ слова: id будет `paal-<урок>-<ключ>`. */
  key: string;
  root: string;
  /** Перевод инфинитива. */
  ru: string;
  /** Фраза-пример с глаголом в настоящем времени. `{ms}` и `{fs}` заменяются на форму (иврит и транскрипцию). */
  phrase: { he: string; translit: string; ru: string };
}

const p = (he: string, translit: string, ru: string) => ({ he, translit, ru });

export const PAAL_LESSONS: { title: string; verbs: VerbSpec[] }[] = [
  {
    title: "Первые глаголы",
    verbs: [
      { key: "write", root: "כתב", ru: "писать", phrase: p("אני {ms} מכתב", "ани {ms} михтав", "Я пишу письмо") },
      { key: "close", root: "סגר", ru: "закрывать", phrase: p("הוא {ms} דלת", "ху {ms} делет", "Он закрывает дверь") },
      { key: "break", root: "שבר", ru: "ломать", phrase: p("אני {ms} כוס", "ани {ms} кос", "Я разбиваю стакан") },
      { key: "keep", root: "שמר", ru: "хранить", phrase: p("הוא {ms} סוד", "ху {ms} сод", "Он хранит секрет") },
      { key: "remember", root: "זכר", ru: "помнить", phrase: p("אני {ms} שיר", "ани {ms} шир", "Я помню песню") },
      { key: "finish", root: "גמר", ru: "заканчивать", phrase: p("הוא {ms} עבודה", "ху {ms} авода", "Он заканчивает работу") },
      { key: "dance", root: "רקד", ru: "танцевать", phrase: p("היא {fs} יפה", "хи {fs} яфе", "Она красиво танцует") },
      { key: "count", root: "ספר", ru: "считать", phrase: p("אני {ms} כסף", "ани {ms} кесеф", "Я считаю деньги") },
      { key: "check", root: "בדק", ru: "проверять", phrase: p("הוא {ms} מכתב", "ху {ms} михтав", "Он проверяет письмо") },
      { key: "pour", root: "שפכ", ru: "выливать", phrase: p("אני {ms} מים", "ани {ms} маим", "Я выливаю воду") },
    ],
  },
  {
    title: "Действия руками",
    verbs: [
      { key: "meet", root: "פגש", ru: "встречать", phrase: p("אני {ms} חבר", "ани {ms} хавер", "Я встречаю друга") },
      { key: "catch", root: "תפס", ru: "ловить", phrase: p("הוא {ms} כדור", "ху {ms} кадур", "Он ловит мяч") },
      { key: "jump", root: "קפצ", ru: "прыгать", phrase: p("הוא {ms} גבוה", "ху {ms} гавоа", "Он высоко прыгает") },
      { key: "slice", root: "פרס", ru: "нарезать", phrase: p("אני {ms} לחם", "ани {ms} лехем", "Я нарезаю хлеб") },
      { key: "steal", root: "גנב", ru: "воровать", phrase: p("הוא {ms} כסף", "ху {ms} кесеф", "Он ворует деньги") },
      { key: "throw", root: "זרק", ru: "бросать", phrase: p("אני {ms} כדור", "ани {ms} кадур", "Я бросаю мяч") },
      { key: "rinse", root: "שטפ", ru: "споласкивать", phrase: p("היא {fs} כוס", "хи {fs} кос", "Она споласкивает стакан") },
      { key: "sew", root: "תפר", ru: "шить", phrase: p("היא {fs} שמלה", "хи {fs} симла", "Она шьёт платье") },
      { key: "ride", root: "רכב", ru: "ехать верхом", phrase: p("הוא {ms} על סוס", "ху {ms} аль сус", "Он едет верхом на лошади") },
      { key: "cut", root: "גזר", ru: "вырезать", phrase: p("אני {ms} נייר", "ани {ms} нейар", "Я вырезаю бумагу") },
    ],
  },
  {
    title: "Ещё десять глаголов",
    verbs: [
      { key: "tie", root: "קשר", ru: "завязывать", phrase: p("אני {ms} חבל", "ани {ms} хевел", "Я завязываю верёвку") },
      { key: "pick", root: "קטפ", ru: "срывать", phrase: p("הוא {ms} פרח", "ху {ms} перах", "Он срывает цветок") },
      { key: "chase", root: "רדפ", ru: "гнаться", phrase: p("הוא {ms} אחרי חתול", "ху {ms} ахарей хатуль", "Он гонится за котом") },
      { key: "whistle", root: "שרק", ru: "свистеть", phrase: p("הוא {ms} שיר", "ху {ms} шир", "Он насвистывает песню") },
      { key: "pull", root: "שלפ", ru: "вытаскивать", phrase: p("הוא {ms} חרב", "ху {ms} херев", "Он вытаскивает меч") },
      { key: "knock", root: "דפק", ru: "стучать", phrase: p("אני {ms} חזק", "ани {ms} хазак", "Я сильно стучу") },
      { key: "plant", root: "שתל", ru: "сажать", phrase: p("אני {ms} עץ", "ани {ms} ец", "Я сажаю дерево") },
      { key: "record", root: "רשמ", ru: "записывать", phrase: p("הוא {ms} מספר", "ху {ms} миспар", "Он записывает номер") },
      { key: "demand", root: "דרש", ru: "требовать", phrase: p("הוא {ms} תשובה", "ху {ms} тшува", "Он требует ответа") },
      { key: "suffer", root: "סבל", ru: "страдать", phrase: p("היא {fs} מאוד", "хи {fs} меод", "Она сильно страдает") },
    ],
  },
];

/** Объект урока в порядке полей, как в остальных файлах. */
export function buildPaalLesson(number: number): Record<string, unknown> {
  const spec = PAAL_LESSONS[number - 1];
  if (!spec) throw new Error(`урока paal-${number} нет в списке`);
  const id = `paal-${number}`;
  return {
    $schema: "../schema.json",
    id,
    topicId: "paal",
    section: "verbs",
    topic: "Пааль",
    number,
    free: number <= FREE_LESSONS_PER_TOPIC,
    title: spec.title,
    words: spec.verbs.map((v) => {
      const { infinitive, verb } = conjugatePaal(v.root);
      const fill = (text: string, field: "he" | "translit") =>
        text.replace(/\{(ms|fs)\}/g, (_, key: "ms" | "fs") => (field === "he" ? verb.present[key].he : stripStress(verb.present[key].translit)));
      return {
        id: `${id}-${v.key}`,
        he: infinitive.he,
        niqqud: infinitive.niqqud,
        translit: infinitive.translit,
        ru: v.ru,
        example: { he: fill(v.phrase.he, "he"), translit: fill(v.phrase.translit, "translit"), ru: v.phrase.ru },
        verb,
        reviewed: false,
      };
    }),
  };
}


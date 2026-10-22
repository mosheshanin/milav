// Женский вариант фразы глагола в настоящем времени: «אני כותב מכתב» → «אני כותבת מכתב» (docs/CONTENT.md,
// «Фразы от первого лица»). Им пользуются генераторы уроков глаголов (content/verbLessons.ts, verbWeak.ts), чтобы новые
// уроки сразу получали пометку speaker и женский вариант.
import type { Phrase, PhraseText } from "@milav/shared";
import { stripStress, wordAfterAni } from "./rules";

interface Form {
  he: string;
  niqqud: string;
  translit: string;
}

/**
 * Если фраза сказана от первого лица мужской формой настоящего времени (`ms`), возвращает её с `speaker: "m"` и женским
 * вариантом, где эта форма заменена на `fs`. Перевод обычно тот же: русское настоящее время рода не различает. Если женская форма
 * пишется так же, как мужская (רוצה, עושה), у варианта есть огласовки этого слова, чтобы озвучка прочла его по-женски.
 * `ruFemale`: перевод для женщины, если он другой («Я согласна»). Иначе фраза возвращается как есть.
 */
export function withFemaleVariant(example: Phrase, ms: Form, fs: Form, ruFemale?: string): Phrase {
  if (wordAfterAni(example.he) !== ms.he) return example;
  const he = example.he.split(" ");
  const index = he.indexOf(ms.he, he.indexOf("אני"));
  const translit = example.translit.split(" ");
  const msTranslit = stripStress(ms.translit);
  const fsTranslit = stripStress(fs.translit);
  // Транскрипция идёт слово в слово с ивритом; если нет, заменяем первое вхождение мужской формы.
  const at = translit.length === he.length && translit[index] === msTranslit ? index : translit.indexOf(msTranslit);
  if (at < 0) throw new Error(`фраза «${example.he}»: в транскрипции «${example.translit}» нет формы ${msTranslit}`);
  const femaleHe = he.map((part, i) => (i === index ? fs.he : part));
  const female: PhraseText = {
    he: femaleHe.join(" "),
    ...(fs.he === ms.he ? { niqqud: he.map((part, i) => (i === index ? fs.niqqud : part)).join(" ") } : {}),
    translit: translit.map((part, i) => (i === at ? fsTranslit : part)).join(" "),
    ru: ruFemale ?? example.ru,
  };
  return { he: example.he, translit: example.translit, ru: example.ru, speaker: "m", female };
}

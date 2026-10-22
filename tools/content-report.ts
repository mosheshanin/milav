// Отчёт по контенту. Запуск: npm run content:report [-- --list]
//   без флагов: сводка по темам (и по алфавиту), сколько слов и букв не проверил носитель, у каких нет картинки или озвучки,
//     нарушения формата;
//   --list: полный список слов и букв с огласовками, транскрипцией и фразами для носителя языка (непроверенные);
//   --no-image: слова и слова-примеры букв без картинки: id (по нему называется файл в ящике, docs/IMAGES.md), иврит, перевод.
// Код возврата 1, если есть нарушения схемы или правил набора. Нерешённые «reviewed», картинки и озвучка нарушением не считаются.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import type { Letter, Lesson, Word } from "@milav/shared";
import {
  ALPHABET_GROUPS,
  BINYANIM,
  SECTION_TITLES,
  VERB_FORM_LABELS,
  VERB_TENSES,
  VERB_TENSE_TITLES,
  verbForms,
} from "@milav/shared";
import { alphabetLessons, lessons } from "../content";
import { alphabetProblems, crossProblems, setProblems } from "../content/rules";
import { missingImages, type RawLesson } from "../content/inbox";
import { schemaProblems } from "../content/validate";

const { values } = parseArgs({ options: { list: { type: "boolean", default: false }, "no-image": { type: "boolean", default: false } } });
const publicDir = new URL("../apps/web/public", import.meta.url);

if (values["no-image"]) {
  const pending = missingImages([...alphabetLessons, ...lessons] as unknown as RawLesson[]);
  console.log(`Без картинки: ${pending.length}. Файл для ящика называется по id: <id>.png (docs/IMAGES.md)\n`);
  for (const t of pending) console.log(`${t.id}\t${t.he}\t${t.ru}${t.kind === "letter" ? "\t(слово-пример буквы)" : ""}`);
  process.exit(0);
}

const allWords = lessons.flatMap((l) => l.words.map((w) => ({ lesson: l, word: w })));
const unreviewed = allWords.filter(({ word }) => word.reviewed === false);
const noImage = allWords.filter(({ word }) => !word.image);
const noAudio = allWords.filter(({ word }) => !word.audio);
const fileMissing = (p: string | undefined): p is string => !!p && !existsSync(new URL(`.${p}`, publicDir.href + "/"));
const missingFiles = allWords.flatMap(({ word }) =>
  [word.image, word.audio].filter(fileMissing).map((p) => `${word.id}: нет файла ${p}`),
);

// Алфавит: у буквы две озвучки (название и слово-пример) и одна картинка (слова-примера).
const allLetters = alphabetLessons.flatMap((l) => l.letters.map((letter) => ({ lesson: l, letter })));
const unreviewedLetters = allLetters.filter(({ letter }) => letter.reviewed === false);
const lettersNoImage = allLetters.filter(({ letter }) => !letter.example.image);
const lettersNoAudio = allLetters.filter(({ letter }) => !letter.audio || !letter.example.audio);
const missingLetterFiles = allLetters.flatMap(({ letter }) =>
  [letter.audio, letter.example.audio, letter.example.image].filter(fileMissing).map((p) => `${letter.id}: нет файла ${p}`),
);

// Нарушения схемы по файлам: так видно, какой именно файл исправлять.
const lessonsDir = new URL("../content/lessons/", import.meta.url);
const schemaIssues = readdirSync(lessonsDir)
  .filter((f) => f.endsWith(".json"))
  .flatMap((f) => schemaProblems(JSON.parse(readFileSync(new URL(f, lessonsDir), "utf8"))).map((p) => `${f}: ${p}`));
const setIssues = [...setProblems(lessons), ...alphabetProblems(alphabetLessons), ...crossProblems(lessons, alphabetLessons)];

const GENDER = { m: "м.р.", f: "ж.р." } as const;
const describeWord = (w: Word): string => {
  const parts = [`${w.niqqud ?? w.he} [${w.translit}] — ${w.ru}`];
  if (w.gender) parts[0] += ` (${GENDER[w.gender]})`;
  if (w.forms) {
    parts.push(
      `формы: ж.р. ${w.forms.f.niqqud} [${w.forms.f.translit}], м.р. мн.ч. ${w.forms.mp.niqqud} [${w.forms.mp.translit}], ж.р. мн.ч. ${w.forms.fp.niqqud} [${w.forms.fp.translit}]`,
    );
  }
  if (w.verb) {
    parts.push(`бинъян: ${BINYANIM[w.verb.binyan].ru}, корень: ${[...w.verb.root].join("-")}`);
    // Формы по временам: носителю удобнее проверять строку целиком, чем 27 отдельных форм.
    const all = verbForms(w.verb);
    for (const tense of VERB_TENSES) {
      const items = all.filter((e) => e.tense === tense);
      if (!items.length) continue;
      parts.push(`${VERB_TENSE_TITLES[tense]}: ${items.map((e) => `${VERB_FORM_LABELS[tense][e.key]} ${e.form.niqqud} [${e.form.translit}]`).join("; ")}`);
    }
  }
  if (w.example) parts.push(`фраза: ${w.example.he} [${w.example.translit}] — ${w.example.ru}`);
  if (w.example?.female) parts.push(`фраза (говорит женщина): ${w.example.female.he} [${w.example.female.translit}] — ${w.example.female.ru}`);
  return parts.join("\n      ");
};
const describeLetter = (l: Letter): string =>
  `${l.he}: «${l.name.niqqud}» [${l.name.ru}], звук: ${l.sound}\n      слово-пример: ${l.example.niqqud} [${l.example.translit}] — ${l.example.ru}`;

console.log(
  `Контент Milav: уроков ${lessons.length}, слов ${allWords.length}; алфавит: уроков ${alphabetLessons.length} из ${ALPHABET_GROUPS.length}, букв ${allLetters.length} из 27\n`,
);

const topics = new Map<string, Lesson[]>();
for (const l of lessons) topics.set(l.topicId, [...(topics.get(l.topicId) ?? []), l]);
console.log("Темы:");
for (const [topicId, items] of topics) {
  const first = items[0]!;
  const words = items.flatMap((l) => l.words);
  const checked = words.filter((w) => w.reviewed !== false).length;
  console.log(
    `  ${SECTION_TITLES[first.section]} / ${first.topic} (${topicId}): уроков ${items.length}, бесплатных ${items.filter((l) => l.free).length}, слов ${words.length}, проверено носителем ${checked}`,
  );
}

if (alphabetLessons.length) {
  const checked = allLetters.length - unreviewedLetters.length;
  console.log(
    `  Алфавит (alphabet): уроков ${alphabetLessons.length}, букв ${allLetters.length}, проверено носителем ${checked}, без картинки слова-примера ${lettersNoImage.length}, без озвучки ${lettersNoAudio.length}`,
  );
}

console.log(`\nНе проверено носителем: слов ${unreviewed.length} из ${allWords.length}, букв ${unreviewedLetters.length} из ${allLetters.length}`);
console.log(`Без картинки: слов ${noImage.length}${noImage.length ? " (карточка покажет запасной вариант)" : ""}, букв ${lettersNoImage.length}`);
console.log(
  `Без озвучки: слов ${noAudio.length}, букв ${lettersNoAudio.length}${noAudio.length || lettersNoAudio.length ? " (нужен workflow «Озвучка слов», action publish)" : ""}`,
);

const problems = [...schemaIssues, ...setIssues, ...missingFiles, ...missingLetterFiles];
console.log(problems.length ? `\nНарушения (${problems.length}):\n- ${problems.join("\n- ")}` : "\nНарушений формата нет.");

if (values.list) {
  console.log("\nСлова и буквы для проверки носителем языка:");
  for (const lesson of alphabetLessons) {
    const pending = lesson.letters.filter((l) => l.reviewed === false);
    if (!pending.length) continue;
    console.log(`\n${lesson.id} «${lesson.title}» (Алфавит, урок ${lesson.number}): названия букв, звуки и слова-примеры`);
    pending.forEach((l, i) => console.log(`  ${i + 1}. ${describeLetter(l)}`));
  }
  for (const lesson of lessons) {
    const pending = lesson.words.filter((w) => w.reviewed === false);
    if (!pending.length) continue;
    console.log(`\n${lesson.id} «${lesson.title}» (${lesson.topic}, урок ${lesson.number}):`);
    pending.forEach((w, i) => console.log(`  ${i + 1}. ${describeWord(w)}`));
  }
} else if (unreviewed.length || unreviewedLetters.length) {
  console.log("\nСписок для носителя: npm run content:report -- --list");
}

if (problems.length) process.exit(1);

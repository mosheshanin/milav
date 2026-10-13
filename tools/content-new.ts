// Создаёт заготовку урока и обновляет реестр. Запуск (пример):
//   npm run content:new -- --topic-id animals --number 2 --title "Дикие животные" \
//     --keys wolf,fox,bear,deer,monkey,camel,giraffe,zebra,tiger,crocodile
// Для новой темы нужны ещё --section (nouns, verbs или adjectives) и --topic (название темы на экране);
// у существующей темы они берутся из её первого урока.
// Урок алфавита: --topic-id alphabet --number N --title "Название" (буквы урока заданы ALPHABET_GROUPS, --keys не нужен).
import { existsSync, writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { ALPHABET_GROUPS, ALPHABET_SECTION, ALPHABET_TOPIC_ID, type Section } from "@milav/shared";
import { alphabetLessons, lessons } from "../content";
import {
  alphabetTemplateProblems,
  buildAlphabetTemplate,
  buildLessonTemplate,
  templateProblems,
  type NewLessonOptions,
} from "../content/template";
import { renderRegistry } from "../content/registryGen";

const { values } = parseArgs({
  options: {
    "topic-id": { type: "string" },
    number: { type: "string" },
    section: { type: "string" },
    topic: { type: "string" },
    title: { type: "string" },
    keys: { type: "string" },
  },
});

const topicId = values["topic-id"] ?? "";

if (topicId === ALPHABET_TOPIC_ID || values.section === ALPHABET_SECTION) {
  const number = Number(values.number);
  const title = values.title ?? "";
  const problems = [...alphabetTemplateProblems(number, title)];
  if (topicId !== ALPHABET_TOPIC_ID) problems.push(`для алфавита нужен --topic-id ${ALPHABET_TOPIC_ID}`);
  const id = `alphabet-${number}`;
  if (!problems.length && alphabetLessons.some((l) => l.id === id)) problems.push(`урок ${id} уже есть`);
  const next = Math.max(0, ...alphabetLessons.map((l) => l.number)) + 1;
  if (!problems.length && number !== next) problems.push(`следующий урок алфавита должен иметь номер ${next}`);
  if (problems.length) {
    console.error("Урок не создан:\n- " + problems.join("\n- "));
    process.exit(1);
  }
  writeFileSync(new URL(`../content/lessons/${id}.json`, import.meta.url), JSON.stringify(buildAlphabetTemplate(number, title), null, 2) + "\n");
  writeFileSync(new URL("../content/registry.ts", import.meta.url), renderRegistry(new URL("../content/lessons/", import.meta.url)));
  console.log(`Создано: content/lessons/${id}.json (буквы: ${ALPHABET_GROUPS[number - 1]!.join(" ")}, бесплатный), реестр обновлён.`);
  console.log("Дальше: заполнить название буквы на иврите (he, niqqud), звук и слово-пример (he, niqqud, translit, ru),");
  console.log("проверить `npm run validate:content`, озвучить через workflow «Озвучка слов» (docs/AUDIO.md).");
  console.log("Пока поля пустые, проверка контента красная: так задумано.");
  process.exit(0);
}

const existing = lessons.find((l) => l.topicId === topicId);
const options: NewLessonOptions = {
  topicId,
  number: Number(values.number),
  section: (values.section ?? existing?.section ?? "") as Section,
  topic: values.topic ?? existing?.topic ?? "",
  title: values.title ?? "",
  keys: (values.keys ?? "").split(",").map((k) => k.trim()).filter(Boolean),
};

const problems = templateProblems(options);
const id = `${topicId}-${options.number}`;
if (!problems.length && lessons.some((l) => l.id === id)) problems.push(`урок ${id} уже есть`);
if (!problems.length) {
  const sameTopic = lessons.filter((l) => l.topicId === topicId);
  if (existing && (options.topic !== existing.topic || options.section !== existing.section)) {
    problems.push(`у темы ${topicId} уже заданы название «${existing.topic}» и раздел ${existing.section}`);
  }
  if (sameTopic.length && options.number !== Math.max(...sameTopic.map((l) => l.number)) + 1) {
    problems.push(`следующий урок темы ${topicId} должен иметь номер ${Math.max(...sameTopic.map((l) => l.number)) + 1}`);
  }
  if (!sameTopic.length && options.number !== 1) problems.push("первый урок новой темы имеет номер 1");
}
if (problems.length) {
  console.error("Урок не создан:\n- " + problems.join("\n- "));
  process.exit(1);
}

const file = new URL(`../content/lessons/${id}.json`, import.meta.url);
if (existsSync(file)) {
  console.error(`Файл content/lessons/${id}.json уже есть, не перезаписываю.`);
  process.exit(1);
}
writeFileSync(file, JSON.stringify(buildLessonTemplate(options), null, 2) + "\n");
writeFileSync(new URL("../content/registry.ts", import.meta.url), renderRegistry(new URL("../content/lessons/", import.meta.url)));

console.log(`Создано: content/lessons/${id}.json (бесплатный: ${options.number <= 3 ? "да" : "нет"}), реестр обновлён.`);
console.log("Дальше: заполнить пустые поля (he, niqqud, translit, ru, пример), добавить image при наличии,");
console.log("проверить `npm run validate:content`, озвучить через workflow «Озвучка слов» (docs/AUDIO.md).");
console.log("Пока поля пустые, проверка контента красная: так задумано.");

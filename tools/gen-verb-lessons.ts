// Создаёт файлы уроков глаголов с сильными корнями по спискам из content/verbLessons.ts: формы строит content/verbGen.ts.
//
//   npm run content:verbs                              создать все недостающие уроки (paal-1 … paal-4, piel-1 … piel-3 и т.д.)
//   npm run content:verbs -- --binyan piel             только тема «Пиэль»
//   npm run content:verbs -- --binyan piel --lesson 2  только урок piel-2 (без --binyan --lesson относится к пааль)
//   npm run content:verbs -- --topic weak              уроки «Слабые корни» (weak-1 … weak-6): формы набраны вручную, content/verbWeak.ts и verbWeak2.ts
//   npm run content:verbs -- --dry-run                 только проверить генерацию, ничего не записывать
//
// Существующий файл урока НЕ перезаписывается: после проверки носителем формы правят в самих файлах, а генератор
// для этого урока больше не запускают (docs/CONTENT.md, «Генератор форм»). Поэтому `--force` нет: чтобы пересоздать
// урок, файл удаляют руками. После создания обновляется реестр уроков.
import { existsSync, writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { isBinyan, type Binyan } from "@milav/shared";
import { writeContentIndex } from "../content/writeIndex";
import { VERB_TOPICS, buildVerbLesson } from "../content/verbLessons";
import { WEAK_LESSONS, buildWeakLesson } from "../content/verbWeak";

const { values } = parseArgs({ options: { topic: { type: "string" }, binyan: { type: "string" }, lesson: { type: "string" }, "dry-run": { type: "boolean" } } });

if (values.topic !== undefined && values.topic !== "weak") {
  console.error("--topic: допустимо только weak");
  process.exit(1);
}

const known = Object.keys(VERB_TOPICS) as Binyan[];
if (values.binyan !== undefined && !(isBinyan(values.binyan) && known.includes(values.binyan))) {
  console.error(`--binyan: допустимы ${known.join(", ")}`);
  process.exit(1);
}
// --lesson без --binyan относится к пааль, как было до появления других тем.
const weak = values.topic === "weak";
const binyans: Binyan[] = weak ? [] : values.binyan ? [values.binyan as Binyan] : values.lesson ? ["paal"] : known;

// Единый список «тема, номер урока»: бинъяны строит генератор форм, тема weak берёт готовые таблицы.
const jobs: { id: string; build: () => Record<string, unknown> }[] = [];
for (const binyan of binyans) {
  const total = VERB_TOPICS[binyan]!.lessons.length;
  const numbers = values.lesson ? [Number(values.lesson)] : Array.from({ length: total }, (_, i) => i + 1);
  for (const number of numbers) jobs.push({ id: `${binyan}-${number}`, build: () => buildVerbLesson(binyan, number) });
}
if (weak) {
  const numbers = values.lesson ? [Number(values.lesson)] : WEAK_LESSONS.map((_, i) => i + 1);
  for (const number of numbers) jobs.push({ id: `weak-${number}`, build: () => buildWeakLesson(number) });
}

let created = 0;
{
  for (const { id, build } of jobs) {
    const file = new URL(`../content/lessons/${id}.json`, import.meta.url);
    const lesson = build();
    if (existsSync(file)) {
      console.log(`${id}: файл уже есть, не трогаю`);
      continue;
    }
    if (values["dry-run"]) {
      console.log(`${id}: проверка прошла, ${(lesson.words as unknown[]).length} глаголов (без записи)`);
      continue;
    }
    writeFileSync(file, JSON.stringify(lesson, null, 2) + "\n");
    created++;
    console.log(`${id}: создан content/lessons/${id}.json`);
  }
}
if (!values["dry-run"] && created > 0) {
  writeContentIndex();
  console.log("Реестр уроков обновлён.");
}

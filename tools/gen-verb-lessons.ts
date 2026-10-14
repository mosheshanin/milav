// Создаёт файлы уроков глаголов пааль (сильные корни) по списку из content/verbLessons.ts: формы строит content/verbGen.ts.
//
//   npm run content:verbs                    создать недостающие уроки paal-1 … paal-3
//   npm run content:verbs -- --lesson 2      только урок 2
//   npm run content:verbs -- --dry-run       только проверить генерацию, ничего не записывать
//
// Существующий файл урока НЕ перезаписывается: после проверки носителем формы правят в самих файлах, а генератор
// для этого урока больше не запускают (docs/CONTENT.md, «Генератор форм»). Поэтому `--force` нет: чтобы пересоздать
// урок, файл удаляют руками. После создания обновляется реестр уроков.
import { existsSync, writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { renderRegistry } from "../content/registryGen";
import { PAAL_LESSONS, buildPaalLesson } from "../content/verbLessons";

const { values } = parseArgs({ options: { lesson: { type: "string" }, "dry-run": { type: "boolean" } } });
const numbers = values.lesson ? [Number(values.lesson)] : PAAL_LESSONS.map((_, i) => i + 1);
for (const number of numbers) {
  const file = new URL(`../content/lessons/paal-${number}.json`, import.meta.url);
  const lesson = buildPaalLesson(number);
  if (existsSync(file)) {
    console.log(`paal-${number}: файл уже есть, не трогаю`);
    continue;
  }
  if (values["dry-run"]) {
    console.log(`paal-${number}: проверка прошла, 10 глаголов по 27 форм (без записи)`);
    continue;
  }
  writeFileSync(file, JSON.stringify(lesson, null, 2) + "\n");
  console.log(`paal-${number}: создан content/lessons/paal-${number}.json`);
}
if (!values["dry-run"]) {
  writeFileSync(new URL("../content/registry.ts", import.meta.url), renderRegistry(new URL("../content/lessons/", import.meta.url)));
  console.log("Реестр уроков обновлён.");
}

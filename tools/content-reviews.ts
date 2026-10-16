// Перенос отзывов проверяющего в уроки. Запуск: npm run content:reviews -- <выгрузка.json> [--dry]
//
// Выгрузка: текст кнопки «Скопировать для Claude» в панели («Контент»), ответ GET /api/review/export или вывод
//   npx wrangler d1 execute milav --remote --json --command "SELECT r.*, u.first_name FROM content_reviews r LEFT JOIN users u ON u.id = r.reviewer"
// Что делает (подробно в content/reviewImport.ts и docs/ADMIN.md, «Перенос правок в уроки»): применяет исправления,
// ставит `reviewed: { by, at }`, пропускает устаревшие отзывы, конфликты и замечания без исправлений.
// --dry: только показать, что будет сделано, файлы не менять.
// После переноса: npm run content:index, npm run check, переозвучка исправленных слов (команда в конце вывода).
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import type { AnyLesson } from "@milav/shared";
import { importReviews, parseReviewExport } from "../content/reviewImport";

const { values, positionals } = parseArgs({ allowPositionals: true, options: { dry: { type: "boolean", default: false } } });
const file = positionals[0];
if (!file) {
  console.error("Укажите файл выгрузки: npm run content:reviews -- reviews.json [--dry]");
  process.exit(2);
}

const lessonsDir = new URL("../content/lessons/", import.meta.url);
const files = new Map<string, string>();
const lessons: AnyLesson[] = [];
for (const name of readdirSync(lessonsDir).filter((f) => f.endsWith(".json")).sort()) {
  const lesson = JSON.parse(readFileSync(new URL(name, lessonsDir), "utf8")) as AnyLesson;
  files.set(lesson.id, name);
  lessons.push(lesson);
}

const reviews = parseReviewExport(JSON.parse(readFileSync(file, "utf8")));
const outcome = importReviews(lessons, reviews);

console.log(`Отзывов в выгрузке: ${reviews.length}, слов: ${new Set(reviews.map((r) => r.itemId)).size}`);
console.log(`\nПеренесено: ${outcome.applied.length}`);
for (const a of outcome.applied) {
  console.log(`  ${a.id}: ${a.fixes.length ? `исправлено ${a.fixes.join(", ")}` : "верно"} (${a.by}, ${a.at})`);
  for (const c of a.comments) console.log(`      комментарий ${c}`);
}
if (outcome.skipped.length) {
  console.log(`\nПропущено: ${outcome.skipped.length}`);
  for (const s of outcome.skipped) {
    console.log(`  ${s.id}: ${s.reason}`);
    for (const c of s.comments ?? []) console.log(`      комментарий ${c}`);
  }
}

if (values.dry) {
  console.log("\n--dry: файлы не изменены.");
} else {
  for (const lesson of outcome.changed) {
    writeFileSync(new URL(files.get(lesson.id)!, lessonsDir), `${JSON.stringify(lesson, null, 2)}\n`);
  }
  console.log(`\nИзменено уроков: ${outcome.changed.length}${outcome.changed.length ? ` (${outcome.changed.map((l) => l.id).join(", ")})` : ""}`);
}

if (outcome.applied.length) {
  console.log("\nДальше: npm run content:index && npm run check");
  if (outcome.revoice.length) {
    console.log(`Переозвучить (исправлены огласовки или фраза): ${outcome.revoice.length}`);
    console.log(`  GitHub Actions → «Озвучка слов»: action publish, force, only = ${outcome.revoice.join(",")} (docs/AUDIO.md)`);
  }
}

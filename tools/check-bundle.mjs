// Проверка собранного приложения (apps/web/dist): в его файлах не должно быть слов уроков.
// Слова приложение получает по API с проверкой доступа (GET /api/lessons/:id), в файлах приложения только манифест.
// Если кто-то импортирует в приложение `@milav/content` целиком, сюда попадут все уроки, в том числе платные,
// и эта проверка остановит сборку (её запускает `npm run build`, а значит и `npm run check`, CI и Cloudflare).
// Запуск вручную: node tools/check-bundle.mjs
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";

const dist = new URL("../apps/web/dist/", import.meta.url);
const lessonsDir = new URL("../content/lessons/", import.meta.url);

if (!existsSync(dist)) {
  console.error("check-bundle: нет apps/web/dist, сначала соберите приложение");
  process.exit(1);
}

/** Текстовые файлы сборки (скрипты, стили, страницы, данные). Картинки, шрифты и озвучку не читаем. */
function textFiles(dir, prefix = "") {
  const out = [];
  for (const name of readdirSync(dir)) {
    const url = new URL(name, dir);
    if (statSync(url).isDirectory()) out.push(...textFiles(new URL(`${name}/`, dir), `${prefix}${name}/`));
    else if (/\.(js|mjs|css|html|json|map|txt)$/.test(name)) out.push({ path: `${prefix}${name}`, text: readFileSync(url, "utf8") });
  }
  return out;
}

// Приметы слов: id слова (например animals-1-tsipor) и написание с огласовками. И то и другое встречается только в уроках.
// Алфавит бесплатный, а формы букв нужны распознаванию рукописного ввода, поэтому его буквы не проверяем.
const markers = [];
for (const file of readdirSync(lessonsDir).filter((f) => f.endsWith(".json"))) {
  const lesson = JSON.parse(readFileSync(new URL(file, lessonsDir), "utf8"));
  if (lesson.section === "alphabet") continue;
  for (const word of lesson.words ?? []) {
    markers.push({ lesson: lesson.id, what: `id ${word.id}`, needle: `"${word.id}"` });
    // Короткие написания (עַל, אֵם) встречаются в служебных текстах приложения (נִפְעַל), поэтому их не берём: утечку урока всё равно выдаёт id слова.
    if (word.niqqud && word.niqqud.length >= 5) markers.push({ lesson: lesson.id, what: `слово ${word.niqqud}`, needle: word.niqqud });
  }
}

const files = textFiles(dist);
const leaks = [];
for (const file of files) {
  for (const marker of markers) {
    if (file.text.includes(marker.needle)) leaks.push(`${file.path}: ${marker.lesson}, ${marker.what}`);
  }
}

if (leaks.length > 0) {
  console.error(`check-bundle: в сборке приложения есть слова уроков (${leaks.length}). Приложение должно брать уроки`);
  console.error("из `@milav/content/manifest` и по API, а не из `@milav/content` (docs/CONTENT.md, «Манифест и выдача уроков»).");
  for (const leak of leaks.slice(0, 20)) console.error(`  ${leak}`);
  process.exit(1);
}
console.log(`check-bundle: слов уроков в сборке нет (файлов ${files.length}, примет ${markers.length})`);

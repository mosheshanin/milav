// Картинки слов из «почтового ящика». Запуск: npm run images:inbox [-- --dry-run]
//   Владелец кладёт файлы <id слова или буквы>.png|jpg|webp|svg в content/inbox/images/ (через GitHub, docs/IMAGES.md).
//   Скрипт: растровые файлы уменьшает до IMAGE_MAX_SIDE и сохраняет как webp, svg переносит как есть, кладёт результат
//   в apps/web/public/words, прописывает `image` в уроке (и в примерах букв с тем же словом), убирает файл из ящика и
//   удаляет прежнюю картинку, если ей больше никто не пользуется.
//   Для растровых файлов нужен пакет sharp: `npm install --no-save sharp` (в GitHub Actions это делает workflow).
// Код возврата 1, если часть файлов отклонена; принятые при этом всё равно обработаны.
import { existsSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { writeContentIndex } from "../content/writeIndex";
import {
  IMAGE_MAX_SIDE,
  INBOX_MAX_KB,
  SVG_MAX_KB,
  applyImage,
  imagePath,
  imageUses,
  planInbox,
  targetsOf,
  type RawLesson,
} from "../content/inbox";

const { values } = parseArgs({ options: { "dry-run": { type: "boolean", default: false } } });
const dry = values["dry-run"];
const inboxDir = new URL("../content/inbox/images/", import.meta.url);
const lessonsDir = new URL("../content/lessons/", import.meta.url);
const publicDir = new URL("../apps/web/public", import.meta.url);

/** В GitHub Actions причина видна в аннотациях запуска. */
function annotate(message: string): void {
  if (process.env.GITHUB_ACTIONS) console.log(`::error title=Картинки::${message.replace(/\r?\n/g, " ")}`);
}

const lessonFiles = readdirSync(lessonsDir).filter((f) => f.endsWith(".json"));
const raw = lessonFiles.map((file) => ({ file, data: JSON.parse(readFileSync(new URL(file, lessonsDir), "utf8")) as RawLesson }));
const all = raw.map((r) => r.data);

const files = existsSync(inboxDir) ? readdirSync(inboxDir) : [];
const plan = planInbox(files, targetsOf(all));
const problems = [...plan.problems];
let done = 0;

type Sharp = (input: Buffer) => {
  rotate: () => ReturnType<Sharp>;
  resize: (o: { width: number; height: number; fit: "inside"; withoutEnlargement: true }) => ReturnType<Sharp>;
  webp: (o: { quality: number }) => ReturnType<Sharp>;
  toBuffer: () => Promise<Buffer>;
};
let sharp: Sharp | undefined;

for (const { file, ext, target } of plan.accepted) {
  const source = new URL(file, inboxDir);
  const bytes = readFileSync(source);
  const kb = bytes.length / 1024;
  if (kb > INBOX_MAX_KB) {
    problems.push(`${file}: файл ${Math.round(kb)} КБ, больше ${INBOX_MAX_KB} КБ`);
    continue;
  }
  let output: Buffer;
  let outExt: string;
  if (ext === "svg") {
    if (kb > SVG_MAX_KB) {
      problems.push(`${file}: svg ${Math.round(kb)} КБ, больше ${SVG_MAX_KB} КБ (сохраните как png)`);
      continue;
    }
    if (!/<svg[\s>]/i.test(bytes.toString("utf8"))) {
      problems.push(`${file}: это не svg`);
      continue;
    }
    output = bytes;
    outExt = "svg";
  } else {
    try {
      sharp ??= (await import("sharp")).default as unknown as Sharp;
    } catch {
      problems.push(`${file}: для png, jpg и webp нужен пакет sharp (npm install --no-save sharp)`);
      continue;
    }
    try {
      output = await sharp(bytes).rotate().resize({ width: IMAGE_MAX_SIDE, height: IMAGE_MAX_SIDE, fit: "inside", withoutEnlargement: true }).webp({ quality: 85 }).toBuffer();
    } catch (e) {
      problems.push(`${file}: не удалось прочитать картинку (${(e as Error).message})`);
      continue;
    }
    outExt = "webp";
  }

  const path = imagePath(target, outExt);
  const old = target.image;
  console.log(`${dry ? "[dry] " : ""}${file} → ${path}${old && old !== path ? ` (вместо ${old})` : ""}, ${Math.round(output.length / 1024)} КБ`);
  if (dry) {
    done++;
    continue;
  }
  writeFileSync(new URL(`.${path}`, `${publicDir.href}/`), output);
  applyImage(all, target, path);
  rmSync(source);
  // Прежний файл удаляется, если он другой и им больше никто не пользуется.
  if (old && old !== path && imageUses(all, old) === 0) rmSync(new URL(`.${old}`, `${publicDir.href}/`), { force: true });
  done++;
}

if (!dry) {
  for (const { file, data } of raw) writeFileSync(new URL(file, lessonsDir), JSON.stringify(data, null, 2) + "\n");
  // У изменённых уроков новая версия: манифест приложения пересобирается, иначе тест манифеста остановит выкладку.
  writeContentIndex();
}

console.log(`Готово: обработано ${done}, отклонено ${problems.length}.`);
if (problems.length) {
  for (const p of problems) {
    console.log(`- ${p}`);
    annotate(p);
  }
  process.exit(1);
}

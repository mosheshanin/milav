// Озвучка слов официальным Google Cloud Text-to-Speech (голоса he-IL). Файлы создаются один раз и лежат в репозитории.
//
// Нужен ключ API: переменная окружения GOOGLE_TTS_API_KEY (в GitHub: Settings → Secrets → Actions).
//
//   node tools/generate-audio.mjs --voices                      список доступных голосов he-IL
//   node tools/generate-audio.mjs --review --voice he-IL-Wavenet-A
//        для прослушивания: по каждому слову два файла, без огласовок и с огласовками, в каталог audio-review/
//   node tools/generate-audio.mjs --voice he-IL-Wavenet-A --text niqqud --update-content
//        боевая озвучка: apps/web/public/audio/<id>.mp3 и поле "audio" в JSON урока
//
// Другие параметры: --only id1,id2   --force (перезаписать готовые)   --rate 0.9   --dry-run (только показать, что будет сделано)
import { mkdirSync, existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const option = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : fallback;
};

const API = "https://texttospeech.googleapis.com/v1";
const KEY = process.env.GOOGLE_TTS_API_KEY;
const voice = option("voice", "he-IL-Wavenet-A");
const rate = Number(option("rate", "0.9"));
const only = option("only", "")?.split(",").filter(Boolean);
const outDir = option("out", "apps/web/public/audio");
const reviewDir = option("review-dir", "audio-review");
const dry = flag("dry-run");

const lessonsDir = new URL("../content/lessons/", import.meta.url);
const lessonFiles = readdirSync(lessonsDir).filter((f) => f.endsWith(".json"));
const lessons = lessonFiles.map((file) => ({ file, data: JSON.parse(readFileSync(new URL(file, lessonsDir), "utf8")) }));

/** В GitHub Actions причина видна в аннотациях запуска (без доступа к полному логу). Ключ в сообщения не попадает. */
function annotate(message) {
  if (process.env.GITHUB_ACTIONS) console.log(`::error title=Озвучка::${message.replace(/\r?\n/g, " ")}`);
}

async function call(path, init) {
  let response;
  try {
    response = await fetch(`${API}${path}${path.includes("?") ? "&" : "?"}key=${KEY}`, init);
  } catch {
    const message = "Нет связи с texttospeech.googleapis.com (проверьте интернет или запускайте через GitHub Actions)";
    annotate(message);
    throw new Error(message);
  }
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = `Google TTS ${response.status}: ${body.error?.message ?? "ошибка"}`;
    annotate(message);
    throw new Error(message);
  }
  return body;
}

async function listVoices() {
  const body = await call("/voices?languageCode=he-IL");
  return (body.voices ?? []).map((v) => `${v.name}\t${v.ssmlGender}`);
}

async function synthesize(text) {
  const body = await call("/text:synthesize", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      input: { text },
      voice: { languageCode: "he-IL", name: voice },
      audioConfig: { audioEncoding: "MP3", speakingRate: rate },
    }),
  });
  return Buffer.from(body.audioContent, "base64");
}

/** Что и в какой файл озвучивать. */
function jobs() {
  const list = [];
  for (const { file, data } of lessons) {
    for (const word of data.words) {
      if (only?.length && !only.includes(word.id)) continue;
      list.push({ file, data, word });
    }
  }
  return list;
}

if (!dry && !KEY) {
  const message = "Не задан GOOGLE_TTS_API_KEY. Ключ создаётся в Google Cloud Console (см. docs/AUDIO.md).";
  annotate(`${message} В GitHub секрет должен быть в Settings → Secrets and variables → Actions, под именем GOOGLE_TTS_API_KEY.`);
  console.error(message);
  process.exit(1);
}

if (flag("voices")) {
  console.log((await listVoices()).join("\n"));
  process.exit(0);
}

if (!dry) {
  const available = (await listVoices()).map((line) => line.split("\t")[0]);
  if (!available.includes(voice)) {
    console.error(`Голоса ${voice} нет. Доступные для he-IL:\n${available.join("\n")}`);
    process.exit(1);
  }
}

let made = 0;
let skipped = 0;

if (flag("review")) {
  // Для прослушивания: оба варианта текста, чтобы выбрать лучший на слух.
  for (const variant of ["plain", "niqqud"]) {
    const dir = `${reviewDir}/${voice}/${variant}`;
    mkdirSync(dir, { recursive: true });
    for (const { word } of jobs()) {
      const text = variant === "niqqud" ? (word.niqqud ?? word.he) : word.he;
      const target = `${dir}/${word.id}.mp3`;
      console.log(`${dry ? "[dry] " : ""}${target}  «${text}»`);
      if (!dry) writeFileSync(target, await synthesize(text));
      made++;
    }
  }
} else {
  const variant = option("text", "niqqud");
  if (!["plain", "niqqud"].includes(variant)) {
    console.error('--text: "plain" или "niqqud"');
    process.exit(1);
  }
  mkdirSync(outDir, { recursive: true });
  const touched = new Set();
  for (const { file, data, word } of jobs()) {
    const target = `${outDir}/${word.id}.mp3`;
    const text = variant === "niqqud" ? (word.niqqud ?? word.he) : word.he;
    if (existsSync(target) && !flag("force")) {
      skipped++;
    } else {
      console.log(`${dry ? "[dry] " : ""}${target}  «${text}»`);
      if (!dry) writeFileSync(target, await synthesize(text));
      made++;
    }
    if (flag("update-content") && word.audio !== `/audio/${word.id}.mp3`) {
      word.audio = `/audio/${word.id}.mp3`;
      touched.add(file);
    }
  }
  if (!dry) {
    for (const { file, data } of lessons) {
      if (touched.has(file)) writeFileSync(new URL(file, lessonsDir), JSON.stringify(data, null, 2) + "\n");
    }
  }
}
console.log(`Готово: создано ${made}, пропущено готовых ${skipped}.`);

// Озвучка слов, форм прилагательных и глаголов, фраз-примеров, названий букв и слов-примеров к буквам официальным Google Cloud
// Text-to-Speech (голоса he-IL). Файлы создаются один раз и лежат в репозитории.
//
// Нужен ключ API: переменная окружения GOOGLE_TTS_API_KEY (в GitHub: Settings → Secrets → Actions).
//
//   node tools/generate-audio.mjs --voices                      список доступных голосов he-IL
//   node tools/generate-audio.mjs --review --voice he-IL-Wavenet-A
//        для прослушивания: по каждому слову два файла, без огласовок и с огласовками, в каталог audio-review/
//   node tools/generate-audio.mjs --voice he-IL-Wavenet-A --male-voice he-IL-Wavenet-B --text niqqud --update-content
//        боевая озвучка: apps/web/public/audio/<id>.mp3 и поле "audio" в JSON урока. Мужские фразы от первого лица
//        (speaker m, файлы <id>-phrase-m.mp3) озвучивает --male-voice, всё остальное --voice (docs/AUDIO.md).
//
// Другие параметры: --only id1,id2   --kinds word,form,phrase,letter,example   --force (перезаписать готовые)   --rate 0.9   --dry-run (только показать, что будет сделано)
import { mkdirSync, existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { ALL_KINDS, buildJobs } from "./audio-jobs.mjs";

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const option = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : fallback;
};

const API = "https://texttospeech.googleapis.com/v1";
const KEY = process.env.GOOGLE_TTS_API_KEY;
const voice = option("voice", "he-IL-Wavenet-A");
/** Мужской голос для мужских фраз от первого лица («אני הולך»): задание с voice "male" (tools/audio-jobs.mjs). */
const maleVoice = option("male-voice", "he-IL-Wavenet-B");
const voiceOf = (job) => (job.voice === "male" ? maleVoice : voice);
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

/**
 * В синтезатор гереш (U+05F3, ג׳ ז׳ צ׳) уходит обычным апострофом: в ивритских текстах для речи его пишут именно так,
 * и голос произносит дж, ж, ч. Если на слух звук не тот, переозвучить слово точечно (--only <id> --force), см. docs/AUDIO.md.
 */
const forSpeech = (text) => text.replaceAll("\u05F3", "'");

async function synthesize(text, name = voice) {
  const body = await call("/text:synthesize", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      input: { text: forSpeech(text) },
      voice: { languageCode: "he-IL", name },
      audioConfig: { audioEncoding: "MP3", speakingRate: rate },
    }),
  });
  return Buffer.from(body.audioContent, "base64");
}

/**
 * Что и в какой файл озвучивать, описано в tools/audio-jobs.mjs (виды озвучки word, form, phrase, letter, example;
 * у глагола form это до 27 форм). `--only` принимает id слов и букв: озвучиваются все виды озвучки этих элементов.
 * `--kinds word,form,...` ограничивает виды (по умолчанию все).
 */
const kinds = option("kinds", ALL_KINDS.join(",")).split(",").filter(Boolean);
for (const k of kinds) {
  if (!ALL_KINDS.includes(k)) {
    console.error(`--kinds: неизвестный вид «${k}», допустимо: ${ALL_KINDS.join(", ")}`);
    process.exit(1);
  }
}

const jobs = () => buildJobs(lessons, { kinds, only });

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
  for (const name of new Set([voice, maleVoice])) {
    if (!available.includes(name)) {
      console.error(`Голоса ${name} нет. Доступные для he-IL:\n${available.join("\n")}`);
      process.exit(1);
    }
  }
}

let made = 0;
let skipped = 0;

if (flag("review")) {
  // Для прослушивания: оба варианта текста, чтобы выбрать лучший на слух (только основные формы слов).
  for (const variant of ["plain", "niqqud"]) {
    const dir = `${reviewDir}/${voice}/${variant}`;
    mkdirSync(dir, { recursive: true });
    for (const job of jobs().filter((j) => j.kind === "word")) {
      const text = variant === "niqqud" ? job.niqqud : job.plain;
      const target = `${dir}/${job.name}.mp3`;
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
  for (const job of jobs()) {
    const target = `${outDir}/${job.name}.mp3`;
    const text = variant === "niqqud" ? job.niqqud : job.plain;
    if (existsSync(target) && !flag("force")) {
      skipped++;
    } else {
      console.log(`${dry ? "[dry] " : ""}${target}  «${text}»  ${voiceOf(job)}`);
      if (!dry) writeFileSync(target, await synthesize(text, voiceOf(job)));
      made++;
    }
    // Поле audio записывается, когда файл есть (создан сейчас или раньше).
    const path = `/audio/${job.name}.mp3`;
    if (flag("update-content") && (dry || existsSync(target)) && job.has !== path) {
      job.set(path);
      touched.add(job.file);
    }
  }
  if (!dry) {
    for (const { file, data } of lessons) {
      if (touched.has(file)) writeFileSync(new URL(file, lessonsDir), JSON.stringify(data, null, 2) + "\n");
    }
  }
}
console.log(`Готово: создано ${made}, пропущено готовых ${skipped}.`);

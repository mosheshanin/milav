// Группы сквозных тестов для параллельного прогона в CI (24.11.2026): каждая группа идёт на своей машине GitHub со своим
// Worker и своей локальной базой, группы идут одновременно. Полный прогон по одному шёл 42 минуты, группами около 8–10.
// Группы подобраны по времени (в скобках примерно, CI): чтобы ни одна не задерживала остальные.
//
// Запуск: node tools/e2e-group.mjs <группа> [папка скриншотов]   (Worker уже должен отвечать на localhost:8787)
//         node tools/e2e-group.mjs --list                        (все группы JSON-массивом, для матрицы CI)
// Группа `changed`: только уроки из переменной LESSONS (через запятую) и вёрстка этих уроков; её CI берёт, когда
// изменились только уроки.
import { spawnSync } from "node:child_process";

/** Шаг: название, скрипт, переменные окружения. Папка скриншотов шага: <папка>/<shots>. */
const lesson = (id) => ({ name: `урок ${id}`, script: "e2e-lesson.mjs", env: id ? { E2E_LESSON: id } : {}, shots: id || "animals-1" });
const alphabet = (id) => ({ name: `алфавит ${id}`, script: "e2e-alphabet.mjs", env: { E2E_ALPHABET: id }, shots: id });
const step = (name, script, shots = script.replace(/^e2e-|\.mjs$/g, "")) => ({ name, script, env: {}, shots });

export const GROUPS = {
  // Уроки разного вида: обычный с картинками, прилагательные с формами, без картинок (~6 мин).
  "lessons-a": [lesson(""), lesson("colors-1"), lesson("family-2")],
  // Глаголы пааль, пиэль, хифъиль (~7 мин).
  "lessons-b": [lesson("paal-1"), lesson("piel-1"), lesson("hifil-1")],
  // Глаголы нифъаль, хитпаэль, слабые корни пааль (~7 мин).
  "lessons-c": [lesson("nifal-1"), lesson("hitpael-1"), lesson("weak-1")],
  // Слабые корни хифъиль; алфавит 1–3 (в 2 буквы ו и י, в 3 конечные ך ם), звуки с гереш, общая викторина (~5 мин).
  "lessons-d": [
    lesson("weak-4"),
    alphabet("alphabet-1"),
    alphabet("alphabet-2"),
    alphabet("alphabet-3"),
    step("алфавит alphabet-6 (звуки дж, ж, ч)", "e2e-geresh.mjs", "alphabet-6"),
    step("общая викторина алфавита", "e2e-alphabet-all.mjs", "alphabet-all"),
  ],
  // Вёрстка на 360 px: все уроки, все слова на каждом этапе, вкладки времён глаголов (~6 мин).
  overflow: [step("вёрстка 360 px, все уроки", "e2e-overflow.mjs")],
  // Алфавит 4–5 (конечные ן ף ץ) и функции: шаблоны букв, панель, проверка слов, напоминания, геймификация, повторение,
  // тренажёр чисел (~4 мин).
  features: [
    alphabet("alphabet-4"),
    alphabet("alphabet-5"),
    step("запись шаблонов букв", "e2e-record.mjs", "record"),
    step("панель администратора", "e2e-admin.mjs"),
    step("проверка слов", "e2e-review.mjs"),
    step("напоминания", "e2e-reminders.mjs"),
    step("геймификация", "e2e-gamification.mjs"),
    step("повторение слов", "e2e-repeat.mjs"),
    step("тренажёр «Числа на слух»", "e2e-numbers.mjs"),
  ],
};

function changedGroup() {
  const ids = (process.env.LESSONS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (ids.length === 0) throw new Error("Группа changed: пустая переменная LESSONS");
  return [
    ...ids.map(lesson),
    { name: `вёрстка 360 px: ${ids.join(", ")}`, script: "e2e-overflow.mjs", env: { E2E_LESSON: ids.join(",") }, shots: "overflow" },
  ];
}

const [arg, shotsRoot = "e2e-shots"] = process.argv.slice(2);
if (arg === "--list") {
  console.log(JSON.stringify(Object.keys(GROUPS)));
  process.exit(0);
}
const steps = arg === "changed" ? changedGroup() : GROUPS[arg];
if (!steps) {
  console.error(`Нет группы «${arg}». Есть: ${Object.keys(GROUPS).join(", ")}, changed`);
  process.exit(2);
}

const ci = !!process.env.GITHUB_ACTIONS;
const results = [];
for (const s of steps) {
  const started = Date.now();
  if (ci) console.log(`::group::${s.name}`);
  else console.log(`\n=== ${s.name}`);
  const run = spawnSync(process.execPath, [new URL(s.script, import.meta.url).pathname, `${shotsRoot}/${s.shots}`], {
    stdio: "inherit",
    env: { ...process.env, ...s.env },
  });
  if (ci) console.log("::endgroup::");
  const seconds = Math.round((Date.now() - started) / 1000);
  const ok = run.status === 0;
  results.push({ name: s.name, ok, seconds });
  // Упавший шаг видно сразу и в списке аннотаций GitHub, не раскрывая свёрнутый вывод.
  if (!ok) console.log(ci ? `::error::Сквозной тест «${s.name}» упал (код ${run.status ?? run.signal})` : `FAIL шаг «${s.name}»`);
}

console.log("\nИтог группы:");
for (const r of results) console.log(`${r.ok ? "ok  " : "FAIL"} ${String(r.seconds).padStart(4)} с  ${r.name}`);
process.exit(results.every((r) => r.ok) ? 0 : 1);

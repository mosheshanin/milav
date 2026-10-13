// Шаблоны букв владельца: выгрузка из D1, сборка ownTemplates.json, оценка и подбор порогов.
// Запуск (из корня репозитория): npx vite-node tools/own-templates.ts <команда> [аргументы]
//
//   import <файл.json>   рисунки из ответа D1 (строки таблицы letter_templates) -> data/handwriting/own-strokes.json
//   build                data/handwriting/own-strokes.json -> packages/shared/src/handwriting/ownTemplates.json
//   report [fonts]       оценка с текущими параметрами: по буквам, путаницы, обман; «fonts» без шаблонов владельца
//   sweep                перебор maxDistance и slack: принято верных / принято чужих
//
// Подробности и порядок работы: docs/ROADMAP.md (п. 12), docs/DEPLOY.md (раздел «Шаблоны букв»).
import { readFileSync, writeFileSync } from "node:fs";
import {
  HEBREW_LETTERS,
  LETTER_NAMES,
  RECOGNIZER,
  TEMPLATE_VARIANTS_PER_LETTER,
  buildOwnTemplates,
  drawingsFromRows,
  evaluateDrawings,
  loadBaseTemplates,
  sortDrawings,
  withRecognizer,
  type EvaluationMode,
  type EvaluationReport,
  type RecordedDrawing,
} from "@milav/shared";

const STROKES_FILE = new URL("../data/handwriting/own-strokes.json", import.meta.url);
const TEMPLATES_FILE = new URL("../packages/shared/src/handwriting/ownTemplates.json", import.meta.url);

const pct = (v: number) => `${(v * 100).toFixed(1)}%`;
const num = (v: number) => (Number.isFinite(v) ? v.toFixed(3) : "—");
const name = (letter: string) => `${letter} ${LETTER_NAMES[letter] ?? ""}`.trim();

function readDrawings(): RecordedDrawing[] {
  return JSON.parse(readFileSync(STROKES_FILE, "utf8")) as RecordedDrawing[];
}

function importRows(file: string): void {
  const drawings = drawingsFromRows(JSON.parse(readFileSync(file, "utf8")));
  const sorted = sortDrawings(drawings);
  writeFileSync(STROKES_FILE, JSON.stringify(sorted));
  console.log(`Рисунков: ${sorted.length} (пропущено ${drawings.length - sorted.length}). Файл: data/handwriting/own-strokes.json`);
  coverage(sorted);
}

function coverage(drawings: RecordedDrawing[]): void {
  const counts = new Map<string, number>();
  for (const d of drawings) counts.set(d.letter, (counts.get(d.letter) ?? 0) + 1);
  const missing = HEBREW_LETTERS.filter((l) => (counts.get(l) ?? 0) < TEMPLATE_VARIANTS_PER_LETTER);
  if (missing.length) {
    console.log(`Не хватает вариантов у: ${missing.map((l) => `${l} ${counts.get(l) ?? 0}/${TEMPLATE_VARIANTS_PER_LETTER}`).join(", ")}`);
  } else {
    console.log(`Записаны все ${HEBREW_LETTERS.length} форм по ${TEMPLATE_VARIANTS_PER_LETTER} вариантов.`);
  }
}

function build(): void {
  const drawings = readDrawings();
  const templates = buildOwnTemplates(drawings);
  writeFileSync(TEMPLATES_FILE, JSON.stringify(templates));
  console.log(`Шаблонов владельца: ${templates.length} из ${drawings.length} рисунков. Файл: ${TEMPLATES_FILE.pathname}`);
  coverage(drawings);
}

function printReport(r: EvaluationReport, mode: EvaluationMode): void {
  console.log(
    `Режим: ${mode === "fonts" ? "только шрифты" : "шрифты + остальные рисунки владельца (без самого рисунка)"}. ` +
      `Параметры: maxDistance=${RECOGNIZER.maxDistance}, slack=${RECOGNIZER.slack}, aspectWeight=${RECOGNIZER.aspectWeight}, heightWeight=${RECOGNIZER.heightWeight}`,
  );
  console.log(`Рисунков: ${r.drawings}. Верные приняты: ${r.accepted} (${pct(r.acceptRate)}). Чужие приняты: ${pct(r.falseAcceptRate)} пар.\n`);
  console.log("форма            принято  среднее  наибольшее  ближайшая чужая");
  for (const l of r.letters) {
    const wrong = l.nearestWrong ? `${l.nearestWrong.letter} ${num(l.nearestWrong.distance)}` : "—";
    const rejected = l.rejectedSlots.length ? `  отклонены варианты: ${l.rejectedSlots.map((s) => s + 1).join(", ")}` : "";
    console.log(
      `${name(l.letter).padEnd(16)} ${`${l.accepted}/${l.drawings}`.padEnd(8)} ${num(l.meanDistance).padEnd(8)} ${num(l.maxDistance).padEnd(11)} ${wrong}${rejected}`,
    );
  }
  const show = (title: string, pairs: EvaluationReport["confusions"]) => {
    console.log(`\n${title}`);
    if (!pairs.length) console.log("  нет");
    for (const p of pairs.slice(0, 12)) console.log(`  ${p.drawn} → ${p.other}: ${p.count}`);
  };
  show("Рисунок больше похож на другую букву (X → Y: сколько раз):", r.confusions);
  show("Рисунок принят как другая буква (X → Y: сколько раз):", r.falseAccepts);
}

async function report(mode: EvaluationMode): Promise<void> {
  const fonts = await loadBaseTemplates();
  printReport(evaluateDrawings(readDrawings(), fonts, mode), mode);
}

async function sweep(): Promise<void> {
  const fonts = await loadBaseTemplates();
  const drawings = readDrawings();
  console.log("maxDistance  slack  верные приняты  чужие приняты");
  for (const maxDistance of [0.08, 0.1, 0.12, 0.14, 0.16, 0.18, 0.2, 0.24]) {
    for (const slack of [1.0, 1.05, 1.1, 1.2]) {
      const r = withRecognizer({ maxDistance, slack }, () => evaluateDrawings(drawings, fonts, "leave-one-out"));
      console.log(`${String(maxDistance).padEnd(12)} ${String(slack).padEnd(6)} ${pct(r.acceptRate).padEnd(15)} ${pct(r.falseAcceptRate)}`);
    }
  }
}

const [command, arg] = process.argv.slice(2);
switch (command) {
  case "import":
    if (!arg) throw new Error("Укажите файл с ответом D1: import <файл.json>");
    importRows(arg);
    break;
  case "build":
    build();
    break;
  case "report":
    await report(arg === "fonts" ? "fonts" : "leave-one-out");
    break;
  case "sweep":
    await sweep();
    break;
  default:
    console.log("Команды: import <файл.json> | build | report [fonts] | sweep");
}

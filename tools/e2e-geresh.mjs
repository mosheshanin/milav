// Сквозная проверка урока со звуками дж, ж, ч (alphabet-6: ג׳ ז׳ צ׳) в настоящем браузере: два этапа («слушай» и «печатай»
// с клавишей гереш), викторина из 9 вопросов, прерывание на 3-й ошибке, защита от подделки. Размер экрана телефона.
// Нужен запущенный локальный Worker со свежей сборкой фронтенда (как для tools/e2e-alphabet.mjs):
//   npm run build && npx wrangler d1 migrations apply milav-db --local --env local && npm run dev:api
// Запуск: node tools/e2e-geresh.mjs [каталог для скриншотов]
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync } from "node:fs";
import { chromium } from "playwright-core";

const BASE = process.env.BASE ?? "http://localhost:8787";
const SHOTS = process.argv[2] ?? "e2e-shots";
mkdirSync(SHOTS, { recursive: true });

const lesson = JSON.parse(readFileSync(new URL("../content/lessons/alphabet-6.json", import.meta.url), "utf8"));
const letters = lesson.letters;
const heByName = new Map(letters.map((l) => [l.name.ru, l.he]));
const GERESH = "׳";

function findChromium() {
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH ?? "/opt/pw-browsers";
  for (const dir of readdirSync(root)) {
    const exe = `${root}/${dir}/chrome-linux/chrome`;
    if (dir.startsWith("chromium-") && existsSync(exe)) return exe;
  }
  throw new Error("Chromium не найден");
}

function sql(command) {
  execFileSync("npx", ["wrangler", "d1", "execute", "milav-db", "--local", "--env", "local", "--command", command], { stdio: "ignore" });
}

function query(command) {
  return JSON.parse(
    execFileSync("npx", ["wrangler", "d1", "execute", "milav-db", "--local", "--env", "local", "--json", "--command", command], {
      encoding: "utf8",
    }),
  )[0].results;
}

const failures = [];
function check(condition, text) {
  console.log(`${condition ? "ok  " : "FAIL"} ${text}`);
  if (!condition) failures.push(text);
}

const browser = await chromium.launch({ executablePath: findChromium(), args: ["--no-sandbox"] });

async function dismissFoundSheet(page) {
  try {
    await page.waitForSelector('[data-testid="my-path"]', { timeout: 15000 });
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(150);
    if (await page.locator('[data-testid="celebration"]').count()) {
      await page.click('[data-testid="celebration-close"]');
      await page.waitForSelector('[data-testid="celebration"]', { state: "detached" });
    }
  } catch {
    // Главной нет: закрывать нечего.
  }
}

async function openPage(userId) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const page = await context.newPage();
  await page.addInitScript(() => {
    window.speechSynthesis.speak = (u) => setTimeout(() => u.onend?.(new Event("end")), 20);
  });
  page.on("pageerror", (e) => failures.push(`pageerror: ${e.message}`));
  page.on("console", (msg) => {
    if (/content security policy/i.test(msg.text())) failures.push(`CSP: ${msg.text().slice(0, 200)}`);
  });
  await page.goto(`${BASE}/?dev=${userId}`);
  await dismissFoundSheet(page);
  return page;
}

const shot = (page, name) => page.screenshot({ path: `${SHOTS}/${name}.png` });
const pressKey = (page, letter) => page.locator('[data-testid="keyboard"] button').filter({ hasText: letter }).click();
/** Форма с гереш набирается двумя нажатиями: буква, затем клавиша ׳. */
async function pressForm(page, he) {
  await pressKey(page, [...he][0]);
  await page.click('[data-testid="key-geresh"]');
}

function resetUser(id) {
  sql(
    `INSERT OR IGNORE INTO users (id, first_name) VALUES (${id}, 'Тестер'); DELETE FROM word_progress WHERE user_id=${id}; DELETE FROM user_stats WHERE user_id=${id}; DELETE FROM user_badges WHERE user_id=${id}; DELETE FROM quiz_attempts WHERE user_id=${id}; DELETE FROM lesson_passed WHERE user_id=${id}; DELETE FROM quiz_sessions WHERE user_id=${id};`,
  );
}
const seedSql = (id) =>
  `INSERT INTO word_progress (user_id, word_id, lesson_id, stage_listen, stage_speak, stage_write, stage_type, completed_at) VALUES ${letters
    .map((l) => `(${id}, '${l.id}', '${lesson.id}', 1, 0, 0, 1, datetime('now'))`)
    .join(",")};`;

// ---------- Сценарий А: новичок проходит урок и сдаёт викторину ----------
const A = 2201;
resetUser(A);
let page = await openPage(A);
await page.waitForSelector(`[data-testid="lesson-${lesson.id}"]`);
check((await page.textContent(`[data-testid="lesson-${lesson.id}"]`)).includes("Звуки дж, ж, ч"), "на главной есть урок «Звуки дж, ж, ч»");
check((await page.textContent(`[data-testid="lesson-${lesson.id}"]`)).includes(`ג${GERESH}`), "в строке урока видны формы с гереш");
await shot(page, "01-home");
await page.click(`[data-testid="lesson-${lesson.id}"]`);
await page.waitForSelector('[data-testid="letter-he"]');
await shot(page, "02-letter-card");
check((await page.textContent('[data-testid="letter-he"]')) === letters[0].he, "на карточке первая форма с гереш");
check((await page.textContent('[data-testid="letter-name"]')) === letters[0].name.ru, "на карточке русское название");
check((await page.textContent('[data-testid="letter-sound"]')).includes("дж"), "на карточке звук «дж»");
check((await page.locator('[data-testid="tab-speak"]').count()) === 0, "нет этапа «Говори»");
check((await page.locator('[data-testid="tab-write"]').count()) === 0, "нет этапа «Пиши»: у этих звуков нет шаблонов рукописного ввода");
check((await page.locator('[role="tab"]').count()) === 2, "два этапа");

for (let i = 0; i < letters.length; i++) {
  const l = letters[i];
  await page.waitForFunction((he) => document.querySelector('[data-testid="letter-he"]')?.textContent === he, l.he);
  await page.click('[data-testid="listen"]');
  await page.waitForFunction(() => !document.querySelector('[data-testid="listen-next"]').disabled);
  await page.click('[data-testid="listen-next"]');
  await page.waitForSelector('[data-testid="keyboard"]');
  check((await page.locator('[data-testid="key-geresh"]').count()) === 1, `${l.he}: на клавиатуре есть клавиша гереш`);
  if (i === 0) await shot(page, "03-type");
  // Одна буква без гереш не принимается.
  await pressKey(page, [...l.he][0]);
  await pressKey(page, [...l.he][0]);
  await page.waitForSelector('[role="alert"]');
  check((await page.locator('[data-testid="type-done"]').count()) === 0, `${l.he}: две буквы вместо буквы и гереш не принимаются`);
  await page.click('button[aria-label="Стереть букву"]');
  await page.click('button[aria-label="Стереть букву"]');
  await pressForm(page, l.he);
  await page.waitForSelector('[data-testid="type-done"]');
  check((await page.textContent('[data-testid="typed"]')) === l.he, `${l.he}: набрано "${l.he}"`);
  await page.click('[data-testid="type-done"]');
  await page.waitForSelector('[data-testid="word-complete"]');
  check((await page.textContent('[data-testid="points"]')) === String(i + 1), `${l.he}: пройдена по двум этапам, очков ${i + 1}`);
  if (i === 0) await shot(page, "04-letter-complete");
  if (i < letters.length - 1) await page.click('[data-testid="next-word"]');
}

await page.click('[data-testid="to-quiz"]');
await page.waitForSelector('[data-testid="quiz-progress"]');
const types = [];
for (let q = 0; q < 9; q++) {
  await page.waitForFunction((n) => document.querySelector('[data-testid="quiz-progress"]')?.textContent.includes(`Вопрос ${n} из 9`), q + 1);
  types.push((await page.textContent("main h2")).trim());
  if (await page.locator('[data-testid="option"]').count()) {
    check((await page.locator('[data-testid="option"]').count()) === 3, `вопрос ${q + 1}: три варианта`);
    if (q === 0) await shot(page, "05-quiz-hear");
    await page.locator('[data-testid="option"][data-correct="true"]').click();
    await page.click('[data-testid="quiz-next"]');
  } else {
    const he = heByName.get((await page.textContent('[data-testid="prompt"]')).trim());
    if (q === 6) await shot(page, "06-quiz-type");
    await pressForm(page, he);
    await page.waitForSelector('[data-testid="quiz-feedback"]');
    await page.click('[data-testid="quiz-next"]');
  }
}
check(new Set(types).size === 3, `в викторине три типа вопросов (${[...new Set(types)].join("; ")})`);
await page.waitForSelector('[data-testid="quiz-result"]');
const resultText = (await page.textContent('[data-testid="quiz-result"]')).trim();
await shot(page, "07-result");
check(resultText === "9 из 9", `итог ${resultText}, ожидалось 9 из 9`);
await page.waitForSelector('[data-testid="quiz-saved"]');
{
  const rows = query(`SELECT correct, total, passed FROM quiz_attempts WHERE user_id=${A}`);
  check(rows.length === 1 && rows[0].correct === 9 && rows[0].total === 9 && rows[0].passed === 1, `в базе одна сданная попытка (${JSON.stringify(rows)})`);
}
await page.context().close();

// ---------- Сценарий Б: третья ошибка прерывает викторину ----------
const B = 2202;
resetUser(B);
sql(seedSql(B));
page = await openPage(B);
await page.waitForSelector(`[data-testid="lesson-${lesson.id}"]`);
await page.click(`[data-testid="lesson-${lesson.id}"]`);
await page.waitForSelector('[data-testid="letter-he"]');
await page.click('[data-testid="to-quiz"], [data-testid="open-quiz"]');
await page.waitForSelector('[data-testid="quiz-progress"]');
for (let q = 0; q < 3; q++) {
  await page.waitForFunction((n) => document.querySelector('[data-testid="quiz-progress"]')?.textContent.includes(`Вопрос ${n} `), q + 1);
  await page.locator('[data-testid="option"][data-correct="false"]').first().click();
  await page.click('[data-testid="quiz-next"]');
}
await page.waitForSelector('[data-testid="quiz-aborted"]');
await shot(page, "08-aborted");
check((await page.textContent('[data-testid="quiz-aborted"]')).includes("Ошибок больше 2"), "на 3-й ошибке викторина прервана: «Ошибок больше 2»");
check(query(`SELECT COUNT(*) AS n FROM quiz_attempts WHERE user_id=${B}`)[0].n === 0, "прерванная викторина ничего не сохранила");
await page.context().close();

// ---------- Сценарий В: подделать этапы запросами нельзя ----------
const C = 2203;
resetUser(C);
{
  const context = await browser.newContext();
  const headers = { Authorization: `dev ${C}:Tester`, "Content-Type": "application/json" };
  const call = async (path, data) => {
    const res = await context.request.post(`${BASE}${path}`, { headers, data });
    return { status: res.status(), body: await res.json().catch(() => ({})) };
  };
  const l = letters[0];
  check((await call("/api/quiz/start", { lessonId: lesson.id })).status === 409, "викторину нельзя начать, пока формы не пройдены");
  check((await call("/api/progress/stage", { wordId: l.id, stage: "write", strokes: [[[{ x: 1, y: 1 }]]] })).status === 400, "этап «пиши» для этих форм не принимается");
  check((await call("/api/progress/stage", { wordId: l.id, stage: "type" })).status === 400, "«печатай» без набора не принимается");
  check((await call("/api/progress/stage", { wordId: l.id, stage: "type", typed: "ג" })).status === 422, "«печатай» без гереш не принимается");
  check((await call("/api/progress/stage", { wordId: l.id, stage: "type", typed: letters[1].he })).status === 422, "«печатай» с чужой формой не принимается");
  check((await call("/api/progress/stage", { wordId: l.id, stage: "type", typed: l.he })).status === 200, "«печатай» с верной формой принимается");
  await context.close();
}

await browser.close();
console.log(failures.length ? `\nПровалено проверок: ${failures.length}\n${failures.join("\n")}` : "\nВсе проверки пройдены");
process.exit(failures.length ? 1 : 0);

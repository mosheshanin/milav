// Сквозная проверка алфавита в настоящем браузере: урок из букв (слушай, пиши, печатай), викторина алфавита,
// прерывание на 5-й ошибке и защита от подделки запросами. Размер экрана телефона.
// Нужен запущенный локальный Worker со свежей сборкой фронтенда (как для tools/e2e-lesson.mjs):
//   npm run build && npx wrangler d1 migrations apply milav-db --local --env local && npm run dev:api
// Запуск: node tools/e2e-alphabet.mjs [каталог для скриншотов]
// Урок берётся из E2E_ALPHABET (по умолчанию alphabet-1): так же проверяются уроки с конечными формами.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync } from "node:fs";
import { chromium } from "playwright-core";

const BASE = process.env.BASE ?? "http://localhost:8787";
const SHOTS = process.argv[2] ?? "e2e-shots";
mkdirSync(SHOTS, { recursive: true });

const LESSON_ID = process.env.E2E_ALPHABET ?? "alphabet-1";
if (!/^alphabet-[1-5]$/.test(LESSON_ID)) throw new Error(`E2E_ALPHABET: недопустимый урок «${LESSON_ID}»`);
const lesson = JSON.parse(readFileSync(new URL(`../content/lessons/${LESSON_ID}.json`, import.meta.url), "utf8"));
const letters = lesson.letters;
const heByName = new Map(letters.map((l) => [l.name.ru, l.he]));
const templates = JSON.parse(
  readFileSync(new URL("../packages/shared/src/handwriting/baseTemplates.json", import.meta.url), "utf8"),
).filter((t) => t.source === "font:heebo");

function findChromium() {
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH ?? "/opt/pw-browsers";
  for (const dir of readdirSync(root)) {
    const exe = `${root}/${dir}/chrome-linux/chrome`;
    if (dir.startsWith("chromium-") && existsSync(exe)) return exe;
  }
  throw new Error("Chromium не найден");
}

function sql(command) {
  execFileSync("npx", ["wrangler", "d1", "execute", "milav-db", "--local", "--env", "local", "--command", command], {
    stdio: "ignore",
  });
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

async function openPage(userId) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const page = await context.newPage();
  await page.addInitScript(() => {
    // В безголовом Chromium нет голосов: имитируем окончание речи.
    window.speechSynthesis.speak = (u) => setTimeout(() => u.onend?.(new Event("end")), 20);
  });
  page.on("pageerror", (e) => failures.push(`pageerror: ${e.message}`));
  page.on("console", (msg) => {
    if (/content security policy/i.test(msg.text())) failures.push(`CSP: ${msg.text().slice(0, 200)}`);
  });
  await page.goto(`${BASE}/?dev=${userId}`);
  return page;
}

const shot = (page, name) => page.screenshot({ path: `${SHOTS}/${name}.png` });

/** Рисует букву по шаблону из шрифта: точки облака как короткие штрихи. */
async function drawLetter(page, letter) {
  const t = templates.find((x) => x.letter === letter);
  if (!t) throw new Error(`нет шаблона ${letter}`);
  const box = await page.locator('[data-testid="draw-canvas"]').boundingBox();
  const lineHeight = 0.45 * 220;
  const h = t.heightRatio * lineHeight;
  const scale = t.aspect <= 1 ? h : h * t.aspect;
  const cx = box.x + box.width / 2;
  const cy = box.y + 0.62 * 220 - h / 2;
  for (let i = 0; i < t.points.length; i += 4) {
    const x = cx + t.points[i] * scale;
    const y = cy + t.points[i + 1] * scale;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + 1.5, y);
    await page.mouse.up();
  }
}

/** Пишет одну букву; пробует до `tries` раз. Возвращает число лишних проверок. */
async function writeLetter(page, letter, tries = 3) {
  const slot = page.locator('[data-testid="write-slots"] [data-slot]').first();
  let misses = 0;
  for (let attempt = 0; attempt < tries; attempt++) {
    await drawLetter(page, letter);
    await page.locator('[data-testid="check"]').click();
    await page.waitForTimeout(80);
    if ((await slot.getAttribute("data-slot")) !== "pending") break;
    misses++;
  }
  return misses;
}

const pressKey = (page, letter) => page.locator('[data-testid="keyboard"] button').filter({ hasText: letter }).click();

function resetUser(id) {
  sql(
    `INSERT OR IGNORE INTO users (id, first_name) VALUES (${id}, 'Тестер'); DELETE FROM word_progress WHERE user_id=${id}; DELETE FROM quiz_attempts WHERE user_id=${id}; DELETE FROM lesson_passed WHERE user_id=${id}; DELETE FROM quiz_sessions WHERE user_id=${id};`,
  );
}
const seedAll = (id) => letters.map((l) => `(${id}, '${l.id}', '${lesson.id}', 1, 0, 1, 1, datetime('now'))`).join(",");
const seedSql = (id) =>
  `INSERT INTO word_progress (user_id, word_id, lesson_id, stage_listen, stage_speak, stage_write, stage_type, completed_at) VALUES ${seedAll(id)};`;

// ---------- Сценарий А: новичок проходит урок алфавита и сдаёт викторину ----------
const A = 2101;
resetUser(A);
let page = await openPage(A);
await page.waitForSelector(`[data-testid="lesson-${lesson.id}"]`);
await shot(page, "01-home");
check(await page.locator('[data-testid="alphabet-section"]').isVisible(), "на главной есть раздел «Алфавит»");
{
  const order = await page.$$eval("main h2", (els) => els.map((e) => e.textContent));
  check(order[0] === "Алфавит", `«Алфавит» стоит первым на главной (разделы: ${order.join(", ")})`);
}
check((await page.textContent('[data-testid="points"]')) === "0", "на старте 0 очков");
check((await page.textContent('[data-testid="continue"]')) === "Начать", "новичку предложено «Начать»");
check((await page.textContent('[data-testid="continue-place"]')).includes(`Буква 1 из ${letters.length}`), "место старта: первая буква урока алфавита");

await page.click('[data-testid="continue"]');
await page.waitForSelector('[data-testid="letter-he"]');
await shot(page, "02-letter-card");
check((await page.textContent('[data-testid="letter-he"]')) === letters[0].he, "на карточке первая буква");
check((await page.textContent('[data-testid="letter-name"]')) === letters[0].name.ru, "на карточке русское название буквы");
check((await page.textContent('[data-testid="letter-sound"]')).includes(letters[0].sound), "на карточке звук");
check((await page.locator('[data-testid="letter-example"]').textContent()).includes(letters[0].example.he), "на карточке слово-пример");
check((await page.locator('[data-testid="tab-speak"]').count()) === 0, "у буквы нет этапа «Говори»");
check((await page.locator('[role="tab"]').count()) === 3, "у буквы три этапа");

let misses = 0;
for (let i = 0; i < letters.length; i++) {
  const l = letters[i];
  await page.waitForFunction((he) => document.querySelector('[data-testid="letter-he"]')?.textContent === he, l.he);
  check(await page.locator('[data-testid="listen-next"]').isDisabled(), `${l.he}: «Дальше» заблокировано, пока не послушал название`);
  await page.click('[data-testid="listen"]');
  await page.waitForFunction(() => !document.querySelector('[data-testid="listen-next"]').disabled);
  await page.click('[data-testid="listen-next"]');
  // Сразу «пиши», без «говори».
  await page.waitForSelector('[data-testid="draw-canvas"]');
  if (i === 0) await shot(page, "03-write");
  misses += await writeLetter(page, l.he);
  await page.click('[data-testid="write-done"]');
  await page.waitForSelector('[data-testid="keyboard"]');
  if (i === 0) await shot(page, "04-type");
  await pressKey(page, l.he);
  await page.click('[data-testid="type-done"]');
  await page.waitForSelector('[data-testid="word-complete"]');
  if (i === 0) await shot(page, "05-letter-complete");
  check((await page.textContent('[data-testid="points"]')) === String(i + 1), `${l.he}: пройдена по трём этапам, очков ${i + 1}`);
  if (i < letters.length - 1) await page.click('[data-testid="next-word"]');
}
console.log(`     лишних проверок письма: ${misses}`);
await shot(page, "06-all-done");

// Неверная буква при наборе не принимается ни экраном, ни сервером (проверено ниже запросом).
await page.click('[data-testid="to-quiz"]');
await page.waitForSelector('[data-testid="quiz-progress"]');
const types = [];
for (let q = 0; q < 20; q++) {
  await page.waitForFunction((n) => document.querySelector('[data-testid="quiz-progress"]')?.textContent.includes(`Вопрос ${n} `), q + 1);
  const title = (await page.textContent("main h2")).trim();
  types.push(title);
  if (await page.locator('[data-testid="option"]').count()) {
    await page.locator('[data-testid="option"][data-correct="true"]').click();
    if (q === 0) await shot(page, "07-quiz-hear");
    if (q === 5) await shot(page, "08-quiz-name");
    await page.click('[data-testid="quiz-next"]');
  } else if (await page.locator('[data-testid="draw-canvas"]').count()) {
    const he = heByName.get((await page.textContent('[data-testid="prompt"]')).trim());
    await writeLetter(page, he, 2);
    if (q === 10) await shot(page, "09-quiz-write");
    await page.click('[data-testid="write-done"]');
  } else {
    const he = heByName.get((await page.textContent('[data-testid="prompt"]')).trim());
    if (q === 15) await shot(page, "10-quiz-type");
    await pressKey(page, he);
    await page.waitForSelector('[data-testid="quiz-feedback"]');
    await page.click('[data-testid="quiz-next"]');
  }
}
check(new Set(types).size === 4, `в викторине четыре типа вопросов (${[...new Set(types)].join("; ")})`);
await page.waitForSelector('[data-testid="quiz-result"]');
const resultText = (await page.textContent('[data-testid="quiz-result"]')).trim();
console.log(`     итог викторины: ${resultText}`);
await shot(page, "11-result");
check(/^(1[6-9]|20) из 20$/.test(resultText), "итог 16+ из 20");
await page.waitForSelector('[data-testid="quiz-saved"]');
check((await page.textContent('[data-testid="quiz-saved"]')).includes("Новый сданный урок"), "урок алфавита сдан, засчитан в статус");
{
  const rows = query(`SELECT correct, total, passed FROM quiz_attempts WHERE user_id=${A}`);
  check(rows.length === 1 && `${rows[0].correct} из ${rows[0].total}` === resultText && rows[0].passed === 1, `в базе одна попытка с тем же итогом (${JSON.stringify(rows)})`);
}
await page.click('[data-testid="quiz-home"]');
await page.waitForSelector(`[data-testid="lesson-${lesson.id}"]`);
await page.waitForTimeout(500);
await shot(page, "12-home-after");
check((await page.textContent(`[data-testid="lesson-${lesson.id}"]`)).includes("Сдан"), "на главной урок алфавита помечен «Сдан»");
check((await page.textContent('[data-testid="points"]')) === String(letters.length), `очков по числу букв: ${letters.length}`);
await page.context().close();

// ---------- Сценарий Б: пятая ошибка прерывает викторину алфавита ----------
const B = 2102;
resetUser(B);
sql(seedSql(B));
page = await openPage(B);
await page.waitForSelector(`[data-testid="lesson-${lesson.id}"]`);
await page.click(`[data-testid="lesson-${lesson.id}"]`);
await page.waitForSelector('[data-testid="letter-he"]');
await page.click('[data-testid="to-quiz"], [data-testid="open-quiz"]');
await page.waitForSelector('[data-testid="quiz-progress"]');
for (let q = 0; q < 5; q++) {
  await page.waitForFunction((n) => document.querySelector('[data-testid="quiz-progress"]')?.textContent.includes(`Вопрос ${n} `), q + 1);
  await page.locator('[data-testid="option"][data-correct="false"]').first().click();
  // После 5-й ошибки «Дальше» ведёт на экран «Викторина прервана».
  await page.click('[data-testid="quiz-next"]');
}
await page.waitForSelector('[data-testid="quiz-aborted"]');
await shot(page, "13-aborted");
check((await page.textContent('[data-testid="quiz-aborted"]')).includes("Ошибок больше 4"), "на 5-й ошибке викторина прервана: «Ошибок больше 4»");
check(query(`SELECT COUNT(*) AS n FROM quiz_attempts WHERE user_id=${B}`)[0].n === 0, "прерванная викторина ничего не сохранила");
await page.context().close();

// ---------- Сценарий В: подделать этапы и результат запросами нельзя ----------
const C = 2103;
resetUser(C);
{
  const context = await browser.newContext();
  const headers = { Authorization: `dev ${C}:Tester`, "Content-Type": "application/json" };
  const call = async (path, data) => {
    const res = await context.request.post(`${BASE}${path}`, { headers, data });
    return { status: res.status(), body: await res.json().catch(() => ({})) };
  };
  const l = letters[0];
  check((await call("/api/quiz/start", { lessonId: lesson.id })).status === 409, "викторину нельзя начать, пока буквы не пройдены");
  check((await call("/api/progress/stage", { wordId: l.id, stage: "speak" })).status === 400, "этап «говори» для буквы отметить нельзя");
  check((await call("/api/progress/stage", { wordId: l.id, stage: "type" })).status === 400, "«печатай» без буквы не принимается");
  check((await call("/api/progress/stage", { wordId: l.id, stage: "type", typed: letters[1].he })).status === 422, "«печатай» с чужой буквой не принимается");
  check((await call("/api/progress/stage", { wordId: l.id, stage: "write" })).status === 400, "«пиши» без штрихов не принимается");
  check((await call("/api/progress/stage", { wordId: l.id, stage: "write", strokes: [[[{ x: 1, y: 1 }]]] })).status === 422, "«пиши» с точкой вместо буквы не принимается");
  check((await call("/api/progress/stage", { wordId: l.id, stage: "listen" })).status === 200, "«слушай» отмечается");
  check(query(`SELECT COUNT(*) AS n FROM word_progress WHERE user_id=${C} AND completed_at IS NOT NULL`)[0].n === 0, "буква без трёх этапов не засчитана");
  await context.close();
}

await browser.close();
console.log(failures.length ? `\nПровалено проверок: ${failures.length}\n${failures.join("\n")}` : "\nВсе проверки пройдены");
process.exit(failures.length ? 1 : 0);

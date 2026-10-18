// Сквозная проверка общей викторины по всем буквам алфавита и автоперехода в викторине, в настоящем браузере
// (размер экрана телефона). Нужен запущенный локальный Worker со свежей сборкой (как для tools/e2e-alphabet.mjs):
//   npm run build && npx wrangler d1 migrations apply milav-db --local --env local && npm run dev:api
// Запуск: node tools/e2e-alphabet-all.mjs [каталог для скриншотов]
//
// Что проверяется:
//  - на главной в «Алфавите» есть карточка общей викторины: закрыта, пока выучены не все 27 букв (уроки 1–5, звуки
//    дж, ж, ч не нужны), потом открывается;
//  - викторина из 28 вопросов четырёх типов, все 27 букв спрашиваются;
//  - автопереход: верный ответ сам ведёт к следующему вопросу через 2 секунды (выбор, письмо), после ошибки автоперехода
//    нет, кнопка «Дальше» остаётся;
//  - итог: «сдана», но это не урок: сданные уроки и статус не растут, на главной карточка «Сдана».
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync } from "node:fs";
import { chromium } from "playwright-core";
import { revealLesson } from "./e2e-home.mjs";

const BASE = process.env.BASE ?? "http://localhost:8787";
const SHOTS = process.argv[2] ?? "e2e-shots";
mkdirSync(SHOTS, { recursive: true });

const lessons = [1, 2, 3, 4, 5].map((n) => JSON.parse(readFileSync(new URL(`../content/lessons/alphabet-${n}.json`, import.meta.url), "utf8")));
const letters = lessons.flatMap((l) => l.letters.map((x) => ({ ...x, lessonId: l.id })));
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
  execFileSync("npx", ["wrangler", "d1", "execute", "milav-db", "--local", "--env", "local", "--command", command], { stdio: "ignore" });
}
function query(command) {
  return JSON.parse(
    execFileSync("npx", ["wrangler", "d1", "execute", "milav-db", "--local", "--env", "local", "--json", "--command", command], { encoding: "utf8" }),
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
/** Снимок раздела «Алфавит» целиком: карточка общей викторины стоит в его конце, ниже первого экрана. */
const shotAlphabet = (page, name) => page.locator('[data-testid="alphabet-section"]').screenshot({ path: `${SHOTS}/${name}.png` });

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

async function writeLetter(page, letter, tries = 3) {
  const slot = page.locator('[data-testid="write-slots"] [data-slot]').first();
  for (let attempt = 0; attempt < tries; attempt++) {
    await drawLetter(page, letter);
    await page.locator('[data-testid="check"]').click();
    await page.waitForTimeout(80);
    if ((await slot.getAttribute("data-slot")) !== "pending") break;
  }
}

const pressKey = (page, letter) => page.locator('[data-testid="keyboard"] button').filter({ hasText: letter }).click();

function resetUser(id) {
  sql(
    `INSERT OR IGNORE INTO users (id, first_name) VALUES (${id}, 'Тестер'); DELETE FROM word_progress WHERE user_id=${id}; DELETE FROM user_stats WHERE user_id=${id}; DELETE FROM user_badges WHERE user_id=${id}; DELETE FROM quiz_attempts WHERE user_id=${id}; DELETE FROM lesson_passed WHERE user_id=${id}; DELETE FROM quiz_sessions WHERE user_id=${id};`,
  );
}
const seed = (id, list) =>
  sql(
    `INSERT INTO word_progress (user_id, word_id, lesson_id, stage_listen, stage_speak, stage_write, stage_type, completed_at) VALUES ${list
      .map((l) => `(${id}, '${l.id}', '${l.lessonId}', 1, 0, 1, 1, datetime('now'))`)
      .join(",")};`,
  );

/** Номер вопроса из подписи «Вопрос N из M». */
const questionNumber = async (page) => {
  const text = (await page.textContent('[data-testid="quiz-progress"]')) ?? "";
  return Number(/Вопрос (\d+) из/.exec(text)?.[1] ?? 0);
};

check(heByName.size === letters.length, `названия 27 букв уникальны (${heByName.size})`);

const U = 2201;
resetUser(U);

// ---------- Закрыта, пока выучены не все буквы ----------
seed(U, letters.slice(0, -1));
let page = await openPage(U);
await revealLesson(page, "alphabet-1");
const card = page.locator('[data-testid="general-quiz"]');
await card.waitFor();
await shotAlphabet(page, "01-home-locked");
check((await card.getAttribute("data-unlocked")) === "false", "общая викторина закрыта, пока выучены не все буквы");
check(await card.isDisabled(), "закрытая карточка не нажимается");
check((await card.textContent()).includes("Букв: 26 из 27"), "на карточке видно, сколько букв выучено: 26 из 27");
check((await card.textContent()).includes("28 вопросов"), "на карточке 28 вопросов");
await page.context().close();

// ---------- Открывается, когда выучена последняя буква ----------
seed(U, letters.slice(-1));
page = await openPage(U);
await revealLesson(page, "alphabet-1");
await page.locator('[data-testid="general-quiz"]').waitFor();
check((await page.locator('[data-testid="general-quiz"]').getAttribute("data-unlocked")) === "true", "после последней буквы общая викторина открыта");
check((await page.locator('[data-testid="general-quiz"]').textContent()).includes("Викторина открыта"), "на карточке «Викторина открыта»");
await shotAlphabet(page, "02-home-unlocked");
await page.click('[data-testid="general-quiz"]');
await page.waitForSelector('[data-testid="quiz-progress"]');
check((await page.textContent('[data-testid="quiz-progress"]')).includes("из 28"), "в викторине 28 вопросов");
check((await page.textContent("header")).includes("Все буквы"), "в шапке название «Все буквы»");

// ---------- Прохождение: одна ошибка в начале, автопереход на верных ответах ----------
const types = new Set();
const asked = new Set();
let autoChecks = 0;
let wrongNoAuto = false;
for (let q = 1; q <= 28; q++) {
  await page.waitForFunction((n) => document.querySelector('[data-testid="quiz-progress"]')?.textContent.includes(`Вопрос ${n} `), q);
  types.add((await page.textContent("main h2")).trim());
  if (await page.locator('[data-testid="option"]').count()) {
    if (q === 1) {
      // Ошибка: автоперехода нет, верный ответ остаётся на экране, пока не нажмут «Дальше».
      await page.locator('[data-testid="option"][data-correct="false"]').first().click();
      await page.waitForSelector('[data-testid="quiz-feedback"]');
      await shot(page, "03-wrong-answer");
      check((await page.locator('[data-testid="quiz-next"]').getAttribute("data-auto-next")) === null, "после ошибки кнопка «Дальше» без автоперехода");
      await page.waitForTimeout(3000);
      wrongNoAuto = (await questionNumber(page)) === 1 && (await page.locator('[data-testid="quiz-feedback"]').count()) === 1;
      check(wrongNoAuto, "после ошибки через 3 секунды всё ещё первый вопрос с разбором");
      await page.click('[data-testid="quiz-next"]');
    } else if (q === 2) {
      // Верный ответ: «Дальше» заливается и сама переводит на следующий вопрос примерно через 2 секунды.
      await page.locator('[data-testid="option"][data-correct="true"]').click();
      await page.waitForSelector('[data-testid="quiz-next"][data-auto-next="running"]');
      await shot(page, "04-auto-next-running");
      const started = Date.now();
      await page.waitForFunction(() => document.querySelector('[data-testid="quiz-progress"]')?.textContent.includes("Вопрос 3 "), null, { timeout: 6000 });
      const took = Date.now() - started;
      check(took >= 1000 && took <= 4500, `верный ответ сам перешёл к следующему вопросу (${took} мс)`);
      autoChecks++;
    } else {
      await page.locator('[data-testid="option"][data-correct="true"]').click();
      await page.click('[data-testid="quiz-next"]');
    }
    const prompt = await page.locator('[data-testid="prompt"]').count();
    void prompt;
  } else if (await page.locator('[data-testid="draw-canvas"]').count()) {
    const he = heByName.get((await page.textContent('[data-testid="prompt"]')).trim());
    asked.add(he);
    await writeLetter(page, he, 2);
    if (autoChecks === 1) {
      // Письмо: после верно написанной буквы «Дальше» тоже сама срабатывает.
      await page.waitForSelector('[data-testid="write-done"][data-auto-next="running"]');
      const before = q;
      await page.waitForFunction((n) => !document.querySelector('[data-testid="quiz-progress"]')?.textContent.includes(`Вопрос ${n} `), before, { timeout: 6000 });
      check(true, "после верно написанной буквы «Дальше» сама перешла к следующему вопросу");
      autoChecks++;
    } else {
      await page.click('[data-testid="write-done"]');
    }
  } else {
    const he = heByName.get((await page.textContent('[data-testid="prompt"]')).trim());
    asked.add(he);
    await pressKey(page, he);
    await page.waitForSelector('[data-testid="quiz-feedback"]');
    await page.click('[data-testid="quiz-next"]');
  }
}
check(types.size === 4, `в викторине четыре типа вопросов (${[...types].join("; ")})`);
check(autoChecks === 2, "проверены автопереходы на выборе и на письме");

await page.waitForSelector('[data-testid="quiz-result"]');
const resultText = (await page.textContent('[data-testid="quiz-result"]')).trim();
await shot(page, "05-result");
check(resultText === "27 из 28", `итог 27 из 28 (одна ошибка), получено «${resultText}»`);
const saved = (await page.textContent('[data-testid="quiz-saved"]')).trim();
check(saved.includes("в статус она не добавляется"), "в итоге сказано, что в статус она не добавляется");
check(!saved.includes("Новый сданный урок"), "это не «новый сданный урок»");
check((await page.locator('[data-testid="celebration"]').count()) === 0, "листа поздравления нет: статус и бейджи не менялись");
{
  const attempts = query(`SELECT correct, total, passed FROM quiz_attempts WHERE user_id=${U} AND lesson_id='alphabet-all'`);
  check(attempts.length === 1 && attempts[0].correct === 27 && attempts[0].total === 28 && attempts[0].passed === 1, `в базе одна успешная попытка (${JSON.stringify(attempts)})`);
  check(query(`SELECT COUNT(*) AS n FROM lesson_passed WHERE user_id=${U}`)[0].n === 0, "в сданные уроки общая викторина не попала");
  const stats = query(`SELECT passed_lessons, alphabet_lessons FROM user_stats WHERE user_id=${U}`)[0];
  check(stats.passed_lessons === 0 && stats.alphabet_lessons === 0, `сданных уроков по-прежнему 0 (${JSON.stringify(stats)})`);
}

// ---------- Главная после викторины ----------
await page.click('[data-testid="quiz-home"]');
await revealLesson(page, "alphabet-1");
await page.locator('[data-testid="general-quiz"]').waitFor();
await page.waitForTimeout(400);
await shotAlphabet(page, "06-home-passed");
check((await page.locator('[data-testid="general-quiz"]').textContent()).includes("Сдана"), "на главной общая викторина помечена «Сдана»");
await page.context().close();

await browser.close();
console.log(failures.length ? `\nПровалено проверок: ${failures.length}\n${failures.join("\n")}` : "\nВсе проверки пройдены");
process.exit(failures.length ? 1 : 0);

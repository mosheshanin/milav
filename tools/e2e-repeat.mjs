// Сквозная проверка повторения слов (задача 10, docs/SPEC.md «Повторение») в браузере на размере телефона:
// карточка «Повторение» на главной, подход из 10 слов (выбор, набор, «Не помню»), итог, «Мои слова», выключатель в панели.
// Нужен запущенный локальный Worker со свежей сборкой (как для tools/e2e-lesson.mjs, см. docs/DEPLOY.md).
// Запуск: node tools/e2e-repeat.mjs [каталог для скриншотов]
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync } from "node:fs";
import { chromium } from "playwright-core";

const BASE = process.env.BASE ?? "http://localhost:8787";
const SHOTS = process.argv[2] ?? "e2e-shots/repeat";
mkdirSync(SHOTS, { recursive: true });

const lesson = JSON.parse(readFileSync(new URL("../content/lessons/animals-1.json", import.meta.url), "utf8"));
const verbLesson = JSON.parse(readFileSync(new URL("../content/lessons/paal-1.json", import.meta.url), "utf8"));
const byRu = new Map([...lesson.words, ...verbLesson.words].map((w) => [w.ru, w]));

function findChromium() {
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH ?? "/opt/pw-browsers";
  for (const dir of readdirSync(root)) {
    const exe = `${root}/${dir}/chrome-linux/chrome`;
    if (dir.startsWith("chromium-") && existsSync(exe)) return exe;
  }
  throw new Error("Chromium не найден");
}

const sqlArgs = (command) => ["wrangler", "d1", "execute", "milav-db", "--local", "--env", "local", "--command", command];
const sql = (command) => execFileSync("npx", sqlArgs(command), { stdio: "ignore" });
function sqlRow(command) {
  const out = execFileSync("npx", [...sqlArgs(command), "--json"], { encoding: "utf8" });
  return JSON.parse(out)[0]?.results?.[0] ?? null;
}

const failures = [];
function check(condition, text) {
  console.log(`${condition ? "ok  " : "FAIL"} ${text}`);
  if (!condition) failures.push(text);
}

const OWNER = 1001;
const STUDENT = 3301;
const VERB_STUDENT = 3302;
const dev = (id) => ({ authorization: `dev ${id}:Tester` });

async function setRepeat(value) {
  const res = await fetch(`${BASE}/api/admin/config`, {
    method: "PUT",
    headers: { ...dev(OWNER), "Content-Type": "application/json" },
    body: JSON.stringify({ key: "repeat", value }),
  });
  if (!res.ok) throw new Error(`не удалось переключить повторение: ${res.status}`);
}

/** Чистый ученик, у которого все слова урока выучены 1 октября: все 10 пора повторить. */
const seed = (userId, l) =>
  sql(
    `DELETE FROM repeat_state WHERE user_id = ${userId}; DELETE FROM word_progress WHERE user_id = ${userId};` +
      ` DELETE FROM user_stats WHERE user_id = ${userId}; DELETE FROM user_badges WHERE user_id = ${userId};` +
      ` INSERT OR IGNORE INTO users (id, first_name) VALUES (${userId}, 'Tester');` +
      l.words
        .map(
          (w) =>
            ` INSERT INTO word_progress (user_id, word_id, lesson_id, stage_listen, stage_speak, stage_write, stage_type, completed_at)` +
            ` VALUES (${userId}, '${w.id}', '${l.id}', 1, 1, 1, 1, '2026-10-01 08:00:00');`,
        )
        .join(""),
  );
await setRepeat("all");
seed(VERB_STUDENT, verbLesson);
seed(STUDENT, lesson);

const browser = await chromium.launch({ executablePath: findChromium(), args: ["--no-sandbox"] });

async function openPage(id, colorScheme = "light") {
  const context = await browser.newContext({ viewport: { width: 360, height: 780 }, deviceScaleFactor: 2, colorScheme });
  const page = await context.newPage();
  page.on("pageerror", (e) => failures.push(`pageerror: ${e.message}`));
  page.on("console", (msg) => {
    if (/content security policy/i.test(msg.text())) failures.push(`CSP: ${msg.text().slice(0, 200)}`);
  });
  await page.goto(`${BASE}/?dev=${id}`);
  return page;
}

const shot = (page, name) => page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });
const noOverflow = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
const text = (page, id) => page.locator(`[data-testid="${id}"]`).first().innerText();

/** Закрывает праздничный лист, если он открыт (бейджи задним числом за засеянные слова, цель дня). */
async function closeCelebration(page) {
  await page.waitForTimeout(700);
  const close = page.locator('[data-testid="celebration-close"]');
  if (await close.count()) {
    await close.first().click();
    await page.waitForSelector('[data-testid="celebration"]', { state: "detached" });
    return true;
  }
  return false;
}

// ---------- Главная: карточка «Повторение» ----------
const page = await openPage(STUDENT);
await page.waitForSelector('[data-testid="home-repeat"]');
await closeCelebration(page);
check((await text(page, "home-repeat-line")) === "Пора повторить: 10 слов", "на главной «Пора повторить: 10 слов»");
await shot(page, "01-home");
check(await noOverflow(page), "главная без горизонтальной прокрутки");

// ---------- Подход ----------
await page.click('[data-testid="home-repeat-start"]');
const types = [];
let typedOk = false;
let wrong = 0;
for (let i = 0; i < 10; i++) {
  await page.waitForSelector('[data-testid="repeat-question"]');
  const type = await page.locator('[data-testid="repeat-question"]').getAttribute("data-type");
  types.push(type);
  if (i === 0) await shot(page, `02-question-${type}`);
  if (type === "type") {
    const ru = (await text(page, "repeat-prompt")).trim();
    const word = byRu.get(ru);
    if (!typedOk && word) {
      for (const ch of [...word.he]) await page.locator(`[data-testid="keyboard"] button:text-is("${ch}")`).first().click();
      await page.waitForSelector('[data-testid="repeat-check"]:not([disabled])');
      await shot(page, "03-typed");
      await page.click('[data-testid="repeat-check"]');
      typedOk = true;
    } else {
      await page.click('[data-testid="repeat-give-up"]');
    }
  } else if (i === 1) {
    // Одна ошибка нарочно.
    await page.locator('[data-testid="repeat-option"][data-correct="false"]').first().click();
  } else {
    await page.locator('[data-testid="repeat-option"][data-correct="true"]').click();
  }
  await page.waitForSelector('[data-testid="repeat-feedback"]');
  const correct = (await page.locator('[data-testid="repeat-feedback"]').getAttribute("data-correct")) === "true";
  if (!correct) wrong++;
  if (type !== "type" && i === 1) {
    check(!correct, "неверный выбор: «Не вспомнили»");
    await shot(page, "04-wrong");
  }
  if (type === "type" && typedOk && i === types.indexOf("type")) check(correct, "набранное слово принято");
  check(await noOverflow(page), `вопрос ${i + 1} (${type}) без горизонтальной прокрутки`);
  await page.click('[data-testid="repeat-next"]');
}
check(new Set(types).size === 4, `в подходе все 4 вида упражнений (${types.join(", ")})`);
check(typedOk, "слово набрано на клавиатуре и проверено");

await page.waitForSelector('[data-testid="repeat-result"]');
// Праздничный лист (цель дня 5 слов выполнена повторением): закрываем.
await shot(page, "05-celebration");
check(await closeCelebration(page), "в конце подхода поздравление (цель дня)");
check((await text(page, "repeat-score")) === `${10 - wrong} из 10`, `итог ${10 - wrong} из 10`);
check((await page.locator('[data-testid="repeat-forgotten"]').count()) === 1, "список забытых слов");
await shot(page, "06-result");

const state = sqlRow(`SELECT COUNT(*) AS n, SUM(box = 1) AS up, SUM(box = 0) AS down FROM repeat_state WHERE user_id = ${STUDENT}`);
check(state?.n === 10 && state.up === 10 - wrong && state.down === wrong, `в базе 10 слов: ${10 - wrong} во второй коробке, ${wrong} в первой`);
const stats = sqlRow(`SELECT words_done, repeats_done, goal_words FROM user_stats WHERE user_id = ${STUDENT}`);
check(stats?.repeats_done === 10 - wrong, "счётчик вспомненных слов");
check(stats?.goal_words === 10, "повторённые слова засчитаны в цель дня");

// ---------- «Ещё раз»: забытые слова по кругу, без записи ----------
await page.click('[data-testid="repeat-drill"]');
let drillSteps = 0;
let drillWrongDone = false;
while (drillSteps < 40) {
  await page.waitForSelector('[data-testid="repeat-question"], [data-testid="drill-done"]');
  if (await page.locator('[data-testid="drill-done"]').count()) break;
  drillSteps++;
  const type = await page.locator('[data-testid="repeat-question"]').getAttribute("data-type");
  if (!drillWrongDone) {
    // Первый ответ нарочно неверный: слово должно вернуться в конец очереди.
    if (type === "type") await page.click('[data-testid="repeat-give-up"]');
    else await page.locator('[data-testid="repeat-option"][data-correct="false"]').first().click();
    drillWrongDone = true;
    await shot(page, "06b-drill");
  } else if (type === "type") {
    const word = byRu.get((await text(page, "repeat-prompt")).trim());
    for (const ch of [...word.he]) await page.locator(`[data-testid="keyboard"] button:text-is("${ch}")`).first().click();
    await page.click('[data-testid="repeat-check"]');
  } else {
    await page.locator('[data-testid="repeat-option"][data-correct="true"]').click();
  }
  await page.waitForSelector('[data-testid="repeat-feedback"]');
  await page.click('[data-testid="repeat-next"]');
}
check((await page.locator('[data-testid="drill-done"]').count()) === 1, "«Ещё раз» закончился: все забытые вспомнили");
check(drillSteps === wrong + 1, `«Ещё раз»: неверно отвеченное слово спрошено снова (${drillSteps} вопросов на ${wrong} слов)`);
const afterDrill = sqlRow(`SELECT SUM(box = 0) AS down FROM repeat_state WHERE user_id = ${STUDENT}`);
const statsDrill = sqlRow(`SELECT repeats_done, goal_words FROM user_stats WHERE user_id = ${STUDENT}`);
check(afterDrill?.down === wrong && statsDrill?.repeats_done === stats?.repeats_done && statsDrill?.goal_words === stats?.goal_words, "«Ещё раз» ничего не записал");

// ---------- «Мои слова» ----------
await page.click('[data-testid="repeat-words"]');
await page.waitForSelector('[data-testid="words-list"]');
check((await page.locator('[data-testid="words-row"]').count()) === 10, "в «Моих словах» 10 слов");
check((await page.locator('[data-testid="words-repeat"]').count()) === 0, "повторять сегодня больше нечего");
await shot(page, "07-words");
check(await noOverflow(page), "«Мои слова» без горизонтальной прокрутки");
await page.click('[data-testid="words-filter-strong"]');
check((await page.locator('[data-testid="words-row"]').count()) === 0, "прочных слов пока нет");
await page.context().close();

// Тёмная тема.
{
  const dark = await openPage(STUDENT, "dark");
  await dark.waitForSelector('[data-testid="home-repeat"]');
  await closeCelebration(dark);
  check((await text(dark, "home-repeat-line")) === "Всё повторено. Следующие слова завтра.", "после подхода: «Следующие слова завтра»");
  await dark.click('[data-testid="home-repeat-words"]');
  await dark.waitForSelector('[data-testid="words-list"]');
  await shot(dark, "08-words-dark");
  await dark.context().close();
}

// ---------- Глаголы: формы в подходе ----------
{
  const vp = await openPage(VERB_STUDENT);
  await vp.waitForSelector('[data-testid="home-repeat"]');
  await closeCelebration(vp);
  await vp.click('[data-testid="home-repeat-start"]');
  const verbTypes = [];
  let formShot = false;
  for (let i = 0; i < 10; i++) {
    await vp.waitForSelector('[data-testid="repeat-question"]');
    const type = await vp.locator('[data-testid="repeat-question"]').getAttribute("data-type");
    verbTypes.push(type);
    if (type.startsWith("form-") && !formShot) {
      await shot(vp, `09-${type}`);
      formShot = true;
    }
    if (type === "type") {
      const word = byRu.get((await text(vp, "repeat-prompt")).trim());
      for (const ch of [...word.he]) await vp.locator(`[data-testid="keyboard"] button:text-is("${ch}")`).first().click();
      await vp.click('[data-testid="repeat-check"]');
    } else {
      await vp.locator('[data-testid="repeat-option"][data-correct="true"]').first().click();
    }
    await vp.waitForSelector('[data-testid="repeat-feedback"]');
    check((await vp.locator('[data-testid="repeat-feedback"]').getAttribute("data-correct")) === "true", `глагол ${i + 1} (${type}): верный ответ принят`);
    if (type.startsWith("form-") && formShot && verbTypes.filter((t) => t.startsWith("form-")).length === 1) await shot(vp, "10-form-feedback");
    check(await noOverflow(vp), `глагол ${i + 1} (${type}) без горизонтальной прокрутки`);
    await vp.click('[data-testid="repeat-next"]');
  }
  check(verbTypes.some((t) => t.startsWith("form-")), `глаголы спрашиваются и формами (${verbTypes.join(", ")})`);
  const vs = sqlRow(`SELECT COUNT(*) AS n, SUM(box = 1) AS up FROM repeat_state WHERE user_id = ${VERB_STUDENT}`);
  check(vs?.n === 10 && vs.up === 10, "все 10 глаголов во второй коробке");
  await vp.context().close();
}

// ---------- Выключатель в панели ----------
await setRepeat("off");
{
  const off = await openPage(STUDENT);
  await off.waitForSelector('[data-testid="home-lessons"]');
  await closeCelebration(off);
  check((await off.locator('[data-testid="home-repeat"]').count()) === 0, "выключено в панели: карточки нет");
  check((await off.request.get(`${BASE}/api/repeat/session`, { headers: dev(STUDENT) })).status() === 403, "выключено в панели: подход недоступен (403)");
  await off.context().close();
}
await setRepeat("all");

await browser.close();
if (failures.length) {
  console.error(`\nОшибок: ${failures.length}`);
  for (const f of failures) console.error(` - ${f}`);
  process.exit(1);
}
console.log("\nПовторение: всё в порядке");

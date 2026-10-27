// Сквозная проверка тренажёра «Числа на слух» (docs/SPEC.md, «Тренажёр «Числа на слух»») в браузере на размере телефона:
// выключатель в панели (team, all, off), строка входа в разделе «Числа и время», все уровни, ошибка и разбор, повтор ошибок
// с верными ответами, задание «сказать вслух» (без Workers AI: «проверка недоступна» и «Пропустить»), 360 px, тёмная тема.
// Файлов озвучки чисел в локальной среде нет (их делает workflow «Озвучка слов»), поэтому здесь проверяется запасной путь:
// число читает голос устройства (подмена speechSynthesis); сам проигрыш кусками проверяется на телефоне (docs/QA-PHONE.md).
// Нужен запущенный локальный Worker со свежей сборкой (как для tools/e2e-lesson.mjs, см. docs/DEPLOY.md).
// Запуск: node tools/e2e-numbers.mjs [каталог для скриншотов]
import { existsSync, mkdirSync, readdirSync } from "node:fs";
import { chromium } from "playwright-core";

const BASE = process.env.BASE ?? "http://localhost:8787";
const SHOTS = process.argv[2] ?? "e2e-shots/numbers";
mkdirSync(SHOTS, { recursive: true });

function findChromium() {
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH ?? "/opt/pw-browsers";
  for (const dir of readdirSync(root)) {
    for (const sub of ["chrome-linux", "chrome-linux64"]) {
      const exe = `${root}/${dir}/${sub}/chrome`;
      if (dir.startsWith("chromium-") && existsSync(exe)) return exe;
    }
  }
  throw new Error("Chromium не найден");
}

const failures = [];
function check(condition, text) {
  console.log(`${condition ? "ok  " : "FAIL"} ${text}`);
  if (!condition) failures.push(text);
}

const OWNER = 1001;
const STUDENT = 3401;
const dev = (id) => ({ authorization: `dev ${id}:Tester` });

async function setMode(value) {
  const res = await fetch(`${BASE}/api/admin/config`, {
    method: "PUT",
    headers: { ...dev(OWNER), "Content-Type": "application/json" },
    body: JSON.stringify({ key: "numbersTrainer", value }),
  });
  if (!res.ok) throw new Error(`не удалось переключить тренажёр чисел: ${res.status}`);
}

const browser = await chromium.launch({
  executablePath: findChromium(),
  args: ["--no-sandbox", "--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"],
});

async function openPage(id, { colorScheme = "light", speech = false } = {}) {
  const context = await browser.newContext({ viewport: { width: 360, height: 780 }, deviceScaleFactor: 2, colorScheme, permissions: ["microphone"] });
  const page = await context.newPage();
  await page.addInitScript((speechOn) => {
    // В безголовом Chromium нет голосов: имитируем окончание речи и запоминаем, что «прочитали».
    window.__spoken = [];
    window.speechSynthesis.speak = (u) => {
      window.__spoken.push(u.text);
      setTimeout(() => u.onend?.(new Event("end")), 20);
    };
    try {
      localStorage.setItem("milav:numbers-speech", speechOn ? "1" : "0");
    } catch {
      // Без хранилища по умолчанию включено.
    }
  }, speech);
  page.on("pageerror", (e) => failures.push(`pageerror: ${e.message}`));
  page.on("console", (msg) => {
    if (/content security policy/i.test(msg.text())) failures.push(`CSP: ${msg.text().slice(0, 200)}`);
  });
  await page.goto(`${BASE}/?dev=${id}`);
  await page.waitForSelector('[data-testid="home-lessons"]');
  await closeCelebration(page);
  return page;
}

const shot = (page, name) => page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });
const noOverflow = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
const text = (page, id) => page.locator(`[data-testid="${id}"]`).first().innerText();
const has = async (page, id) => (await page.locator(`[data-testid="${id}"]`).count()) > 0;

/** Закрывает праздничный лист, если он есть. */
async function closeCelebration(page) {
  await page.waitForTimeout(700);
  const close = page.locator('[data-testid="celebration-close"]');
  if (await close.count()) {
    await close.first().click();
    await page.waitForSelector('[data-testid="celebration"]', { state: "detached" });
  }
}

/** Раскрывает раздел «Числа и время» на главной. */
async function openNumbersSection(page) {
  await page.click('[data-testid="fold-section-numbers"]');
  await page.waitForSelector('[data-testid="section-numbers"] a, [data-testid="section-numbers"] button >> nth=1');
}

async function openTrainer(page) {
  await openNumbersSection(page);
  await page.click('[data-testid="numbers-trainer"]');
  await page.waitForSelector('[data-testid="numbers-levels"]');
}

/** Набирает ответ на клавиатуре цифр: «1,250», «47 ₪», «054-123-4567», «3:35». */
async function typeAnswer(page, answer) {
  for (const ch of answer.replace(/[^0-9:]/g, "")) await page.click(`[data-testid="${ch === ":" ? "num-key-colon" : `num-key-${ch}`}"]`);
}

// ---------- Выключатель: team ----------
await setMode("team");
{
  const student = await openPage(STUDENT);
  await openNumbersSection(student);
  check(!(await has(student, "numbers-trainer")), "team: ученику строки «Числа на слух» нет");
  check((await student.request.post(`${BASE}/api/numbers/speech?scene=number&value=5`, { headers: dev(STUDENT), data: "x" })).status() === 403, "team: ученику проверка речи недоступна (403)");
  await student.context().close();

  const owner = await openPage(OWNER);
  await openNumbersSection(owner);
  check(await has(owner, "numbers-trainer"), "team: у команды строка «Числа на слух» есть");
  await owner.context().close();
}

// ---------- Для всех ----------
await setMode("all");
const page = await openPage(STUDENT);
await openNumbersSection(page);
await shot(page, "01-home-section");
check(await has(page, "numbers-trainer"), "all: у ученика строка «Числа на слух» есть");
check(await noOverflow(page), "раздел на главной без горизонтальной прокрутки");
await page.click('[data-testid="numbers-trainer"]');
await page.waitForSelector('[data-testid="numbers-levels"]');
await shot(page, "02-levels");
check((await page.locator('[data-testid^="numbers-level-"]').count()) === 8, "в списке 8 уровней");
check(await noOverflow(page), "список уровней без горизонтальной прокрутки");
check(!(await page.locator('[data-testid="numbers-speech-toggle"]').isChecked()), "«Говорить вслух» выключено (как запомнено на устройстве)");

// ---------- Подход: все ответы нарочно неверные, потом повтор ошибок с верными ----------
const WRONG = { time: "1:01", phone: "1" };
async function playRound(levelId, { wrongOnly = true } = {}) {
  await page.click(`[data-testid="numbers-level-${levelId}"]`);
  const answers = [];
  for (let i = 0; i < 10; i++) {
    await page.waitForSelector('[data-testid="numbers-task"]');
    const scene = await page.locator('[data-testid="numbers-task"]').getAttribute("data-scene");
    const mode = await page.locator('[data-testid="numbers-task"]').getAttribute("data-mode");
    check(mode === "hear", `${levelId} ${i + 1}: без микрофона задание на слух`);
    if (i === 0) {
      await shot(page, `03-${levelId}-task`);
      // Кнопка «Послушать» читает число (запасной путь: голос устройства).
      await page.click('[data-testid="numbers-listen"]');
      await page.waitForFunction(() => window.__spoken.length > 0);
      check((await page.evaluate(() => window.__spoken.at(-1))).length > 0, `${levelId}: «Послушать» читает число`);
      await page.click('[data-testid="numbers-listen-slow"]');
      await page.waitForFunction(() => window.__spoken.length > 1);
    }
    check((await page.locator('[data-testid="num-submit"]').isDisabled()), `${levelId} ${i + 1}: пока ничего не набрано «Проверить» недоступна`);
    check((await page.locator('[data-testid="num-key-colon"]').count()) === (scene === "time" ? 1 : 0), `${levelId} ${i + 1}: двоеточие только у времени`);
    await typeAnswer(page, WRONG[scene] ?? "9999");
    if (i === 0) await shot(page, `04-${levelId}-typed`);
    await page.click('[data-testid="num-submit"]');
    await page.waitForSelector('[data-testid="numbers-feedback"]');
    check((await page.locator('[data-testid="numbers-feedback"]').getAttribute("data-ok")) === "false", `${levelId} ${i + 1}: неверный ответ распознан`);
    answers.push(await text(page, "numbers-answer"));
    if (i === 0) {
      await shot(page, `05-${levelId}-wrong`);
      check((await text(page, "numbers-he")).length > 0, `${levelId}: в разборе иврит с огласовками`);
    }
    check(await noOverflow(page), `${levelId} ${i + 1}: без горизонтальной прокрутки`);
    await page.click('[data-testid="numbers-next"]');
  }
  await page.waitForSelector('[data-testid="numbers-result"]');
  check((await text(page, "numbers-score")) === "0 из 10", `${levelId}: итог «0 из 10»`);
  check((await page.locator('[data-testid="numbers-mistake"]').count()) === 10, `${levelId}: 10 заданий в разборе`);
  await shot(page, `06-${levelId}-result`);
  check(await noOverflow(page), `${levelId}: итог без горизонтальной прокрутки`);

  // Повтор ошибок: те же задания в том же порядке, теперь с верными ответами.
  await page.click('[data-testid="numbers-retry"]');
  for (let i = 0; i < 10; i++) {
    await page.waitForSelector('[data-testid="numbers-task"]');
    await typeAnswer(page, answers[i]);
    await page.click('[data-testid="num-submit"]');
    await page.waitForSelector('[data-testid="numbers-feedback"]');
    check((await page.locator('[data-testid="numbers-feedback"]').getAttribute("data-ok")) === "true", `${levelId} повтор ${i + 1}: «${answers[i]}» принято`);
    if (i === 0) await shot(page, `07-${levelId}-right`);
    await page.click('[data-testid="numbers-next"]');
  }
  await page.waitForSelector('[data-testid="numbers-result"]');
  check((await text(page, "numbers-score")) === "10 из 10", `${levelId}: после повтора «10 из 10»`);
  check((await page.locator('[data-testid="numbers-retry"]').count()) === 0, `${levelId}: ошибок нет, повторять нечего`);
  await page.click('[data-testid="numbers-levels-back"]');
  await page.waitForSelector('[data-testid="numbers-levels"]');
}
for (const level of ["basic", "tens", "hundreds", "thousands", "price", "time", "phone", "life"]) await playRound(level);

// «Назад» из списка уровней ведёт на главную, ничего не сохранено.
await page.click('button[aria-label="Назад"]');
await page.waitForSelector('[data-testid="home-lessons"]');
const saved = await page.request.get(`${BASE}/api/me`, { headers: dev(STUDENT) });
check(saved.ok(), "приложение отвечает после тренажёра");
await page.context().close();

// ---------- «Сказать вслух»: без Workers AI проверка недоступна ----------
{
  const sp = await openPage(STUDENT, { speech: true });
  await openTrainer(sp);
  check(await sp.locator('[data-testid="numbers-speech-toggle"]').isChecked(), "«Говорить вслух» включено");
  await sp.click('[data-testid="numbers-level-hundreds"]');
  const modes = [];
  for (let i = 0; i < 3; i++) {
    await sp.waitForSelector('[data-testid="numbers-task"]');
    modes.push(await sp.locator('[data-testid="numbers-task"]').getAttribute("data-mode"));
    if (modes[i] === "say") break;
    await typeAnswer(sp, "9999");
    await sp.click('[data-testid="num-submit"]');
    await sp.waitForSelector('[data-testid="numbers-feedback"]');
    await sp.click('[data-testid="numbers-next"]');
  }
  check(modes.join() === "hear,hear,say", `3-е задание «сказать вслух» (${modes.join(", ")})`);
  check(/\d/.test(await text(sp, "numbers-digits")), "цифры для называния показаны крупно");
  await shot(sp, "08-say");
  check(await noOverflow(sp), "задание «сказать вслух» без горизонтальной прокрутки");
  await sp.click('[data-testid="speak-start"]');
  await sp.waitForSelector('[data-testid="speak-skip"]', { timeout: 9000 });
  check((await sp.textContent("body")).includes("Проверка произношения сейчас недоступна"), "без Workers AI: «проверка недоступна»");
  await shot(sp, "09-say-unavailable");
  await sp.click('[data-testid="speak-skip"]');
  await sp.waitForSelector('[data-testid="numbers-feedback"]');
  check((await sp.locator('[data-testid="numbers-feedback"]').getAttribute("data-ok")) === "false", "пропущенное «вслух» считается ошибкой");
  check((await text(sp, "numbers-feedback")).includes("Пропущено"), "в разборе «Пропущено»");
  await shot(sp, "10-say-skipped");
  await sp.context().close();
}

// ---------- Тёмная тема ----------
{
  const dark = await openPage(STUDENT, { colorScheme: "dark" });
  await openTrainer(dark);
  await shot(dark, "11-levels-dark");
  await dark.click('[data-testid="numbers-level-price"]');
  await dark.waitForSelector('[data-testid="numbers-task"]');
  await typeAnswer(dark, "12");
  await shot(dark, "12-task-dark");
  await dark.click('[data-testid="num-submit"]');
  await dark.waitForSelector('[data-testid="numbers-feedback"]');
  await shot(dark, "13-feedback-dark");
  await dark.context().close();
}

// ---------- Выключено ----------
await setMode("off");
{
  const off = await openPage(OWNER);
  await openNumbersSection(off);
  check(!(await has(off, "numbers-trainer")), "off: строки нет даже у команды");
  check((await off.request.post(`${BASE}/api/numbers/speech?scene=number&value=5`, { headers: dev(OWNER), data: "x" })).status() === 403, "off: проверка речи недоступна (403)");
  await off.context().close();
}
await setMode("team");
await browser.close();

if (failures.length) {
  console.error(`\nПровалено проверок: ${failures.length}`);
  for (const f of failures) console.error(` - ${f}`);
  process.exit(1);
}
console.log("\nТренажёр «Числа на слух»: всё в порядке");

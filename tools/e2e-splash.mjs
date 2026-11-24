// Сквозная проверка заставки при запуске (docs/SPEC.md, «Заставка при запуске») в браузере на размере телефона:
// автотестам заставка не показывается сама; ?splash=full — 5 слайдов (смена сама и нажатием, цифры из манифеста,
// 360 px без прокрутки вбок, раскрытие приложения, отметка «видели»); «Пропустить»; ?splash=short — только логотип,
// уходит сам; ошибок скриптов и нарушений CSP нет.
// Нужен запущенный локальный Worker со свежей сборкой (как для tools/e2e-lesson.mjs, см. docs/DEPLOY.md).
// Запуск: node tools/e2e-splash.mjs [каталог для скриншотов]
import { existsSync, mkdirSync, readFileSync, readdirSync } from "node:fs";
import { chromium } from "playwright-core";

const BASE = process.env.BASE ?? "http://localhost:8787";
const SHOTS = process.argv[2] ?? "e2e-shots/splash";
mkdirSync(SHOTS, { recursive: true });
const USER = 3501;

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

// Цифры последнего слайда считаются по манифесту: слова без алфавита и все уроки.
const manifest = JSON.parse(readFileSync(new URL("../content/manifest.json", import.meta.url), "utf8"));
const words = manifest.lessons.filter((l) => l.section !== "alphabet").reduce((s, l) => s + l.count, 0);
const lessons = manifest.lessons.length;

const browser = await chromium.launch({ executablePath: findChromium(), args: ["--no-sandbox"] });

async function openPage(query) {
  const context = await browser.newContext({ viewport: { width: 360, height: 740 }, deviceScaleFactor: 2 });
  const page = await context.newPage();
  page.on("pageerror", (e) => failures.push(`pageerror: ${e.message}`));
  page.on("console", (msg) => {
    if (/content security policy/i.test(msg.text())) failures.push(`CSP: ${msg.text().slice(0, 200)}`);
  });
  await page.goto(`${BASE}/?dev=${USER}${query}`);
  return page;
}

const splash = '[data-testid="splash"]';
const slideIndex = (page) => page.locator(splash).getAttribute("data-s");
const noOverflow = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
const shot = (page, name) => page.screenshot({ path: `${SHOTS}/${name}.png` });
const seen = (page) => page.evaluate(() => localStorage.getItem("milav:splash-seen"));

// ---------- Без параметра автотестам заставка не мешает ----------
{
  const page = await openPage("");
  await page.waitForSelector('[data-testid="home-lessons"]');
  check((await page.locator(splash).count()) === 0, "без ?splash автотесту заставка не показывается");
  await page.context().close();
}

// ---------- Полная заставка ----------
{
  const page = await openPage("&splash=full");
  await page.waitForSelector(splash);
  check((await page.locator(splash).getAttribute("data-mode")) === "full", "?splash=full: полная заставка");
  check((await page.locator(`${splash} .splash-dots i`).count()) === 5, "5 точек слайдов");
  check(await page.evaluate(() => document.documentElement.classList.contains("splash-on")), "под заставкой страница не прокручивается (splash-on)");
  check((await seen(page)) === "1", "отметка «заставку видели» поставлена сразу");
  await page.waitForTimeout(1600);
  await shot(page, "1-logo");
  check(await noOverflow(page), "слайд 1: нет прокрутки вбок на 360 px");

  // Смена сама: первый слайд держится 4,2 с.
  await page.waitForFunction((sel) => document.querySelector(sel)?.getAttribute("data-s") === "1", splash, { timeout: 6000 });
  check(true, "слайд 2 открылся сам");
  await page.waitForTimeout(1600);
  await shot(page, "2-ways");
  check(await noOverflow(page), "слайд 2: нет прокрутки вбок");

  // Дальше нажатием на экран.
  for (const [i, name] of [[2, "3-word"], [3, "4-chess"], [4, "5-final"]]) {
    await page.locator(splash).click({ position: { x: 180, y: 120 } });
    check((await slideIndex(page)) === String(i), `нажатие: слайд ${i + 1}`);
    await page.waitForTimeout(2300);
    await shot(page, name);
    check(await noOverflow(page), `слайд ${i + 1}: нет прокрутки вбок`);
  }
  const finalText = await page.locator(`${splash} .splash-slide.is-on`).innerText();
  check(finalText.includes(String(words)) && finalText.includes(String(lessons)), `последний слайд: ${words} слов и ${lessons} уроков по манифесту`);
  check(finalText.includes("все бесплатно") && finalText.includes("Начать"), "последний слайд: «все бесплатно» и «Начать»");

  // Нажатие на последнем слайде открывает приложение.
  await page.locator(splash).click({ position: { x: 180, y: 120 } });
  await page.waitForSelector(splash, { state: "detached", timeout: 3000 });
  check(true, "после последнего слайда заставка уходит");
  check(!(await page.evaluate(() => document.documentElement.classList.contains("splash-on"))), "прокрутка страницы снова работает");
  await page.waitForSelector('[data-testid="home-lessons"]');
  check(true, "под заставкой загрузилась главная");
  await page.context().close();
}

// ---------- «Пропустить» ----------
{
  const page = await openPage("&splash=full");
  await page.waitForSelector(splash);
  await page.waitForTimeout(500);
  await page.click('[data-testid="splash-skip"]');
  await page.waitForSelector(splash, { state: "detached", timeout: 2000 });
  check(true, "«Пропустить» сразу открывает приложение");
  await page.context().close();
}

// ---------- Короткая заставка ----------
{
  const page = await openPage("&splash=short");
  await page.waitForSelector(splash);
  check((await page.locator(splash).getAttribute("data-mode")) === "short", "?splash=short: короткая заставка");
  check((await page.locator(`${splash} .splash-slide`).count()) === 1, "короткая: один слайд (логотип)");
  check((await page.locator(`${splash} .splash-dots`).count()) === 0, "короткая: без точек");
  await page.waitForTimeout(1500);
  await shot(page, "short");
  await page.waitForSelector(splash, { state: "detached", timeout: 3000 });
  check(true, "короткая заставка уходит сама примерно через 2,5 с");
  await page.context().close();
}

// ---------- «Уменьшить движение» ----------
{
  const context = await browser.newContext({ viewport: { width: 360, height: 740 }, reducedMotion: "reduce" });
  const page = await context.newPage();
  page.on("pageerror", (e) => failures.push(`pageerror: ${e.message}`));
  await page.goto(`${BASE}/?dev=${USER}&splash=full`);
  await page.waitForSelector(splash);
  await page.waitForTimeout(300);
  const visible = await page.locator(`${splash} .splash-slide.is-on .splash-logo`).evaluate((el) => getComputedStyle(el).opacity);
  check(visible === "1", "«уменьшить движение»: логотип виден сразу, без анимации");
  await page.click('[data-testid="splash-skip"]');
  await page.waitForSelector(splash, { state: "detached", timeout: 2000 });
  check(true, "«уменьшить движение»: «Пропустить» работает");
  await context.close();
}

await browser.close();
if (failures.length) {
  console.error(`\nПРОВАЛ: ${failures.length}`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log("\nЗаставка: все проверки пройдены");

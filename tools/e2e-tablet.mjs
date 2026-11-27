// Сквозная проверка на iPad (27.11.2026, вопрос 152): окно мини-приложения выше видимой части экрана.
// Telegram может показать только верх приложения, а низ оставить за краем (на iPad так и было: кнопки под холстом
// «Пиши» не видны, докрутить нельзя). Здесь вместо настоящего скрипта Telegram подставляется имитация, у которой
// видимая часть на HIDDEN px ниже окна, и проверяется:
//   - приложение знает спрятанную высоту (`--app-hidden-bottom`);
//   - на этапе «Пиши» холст и кнопки «Стереть» и «Проверить» сами оказываются в видимой части, буква пишется;
//   - до низа страницы можно докрутить так, что он попадает в видимую часть;
//   - пока на экране холст, свайп вниз Telegram выключен, на главной снова включён (вопрос 151);
//   - на iPad вертикально без спрятанной части всё помещается и нет прокрутки вбок.
// Нужен запущенный локальный Worker со свежей сборкой фронтенда (как для tools/e2e-lesson.mjs).
// Запуск: node tools/e2e-tablet.mjs [каталог для скриншотов]
import { existsSync, mkdirSync, readFileSync, readdirSync } from "node:fs";
import { chromium } from "playwright-core";
import { revealLesson } from "./e2e-home.mjs";
import { sql } from "./e2e-db.mjs";

const BASE = process.env.BASE ?? "http://localhost:8787";
const SHOTS = process.argv[2] ?? "e2e-shots/tablet";
mkdirSync(SHOTS, { recursive: true });
const USER = 2501;
const LESSON = "animals-1";
const HIDDEN = 260;

const lesson = JSON.parse(readFileSync(new URL(`../content/lessons/${LESSON}.json`, import.meta.url), "utf8"));
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

const failures = [];
function check(condition, text) {
  console.log(`${condition ? "ok  " : "FAIL"} ${text}`);
  if (!condition) failures.push(text);
}

/** Имитация Telegram WebApp: видимая часть окна на `hidden` px ниже окна, вызовы свайпа запоминаются. */
const fakeTelegram = (hidden) => `
  window.__swipes = [];
  window.Telegram = { WebApp: {
    initData: "", initDataUnsafe: {}, version: "8.0", platform: "ios", colorScheme: "light",
    get viewportStableHeight() { return window.innerHeight - ${hidden}; },
    ready() {}, expand() {},
    isVersionAtLeast: () => true,
    disableVerticalSwipes() { window.__swipes.push("off"); },
    enableVerticalSwipes() { window.__swipes.push("on"); },
    onEvent() {}, offEvent() {},
    BackButton: { show() {}, hide() {}, onClick() {}, offClick() {} },
  } };
`;

const browser = await chromium.launch({ executablePath: findChromium(), args: ["--no-sandbox"] });

async function openPage(viewport, hidden) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 2, hasTouch: true });
  const page = await context.newPage();
  // Скрипт Telegram (index.html) отдаём своей имитацией: тот же адрес, поэтому CSP не мешает.
  await page.route("https://telegram.org/js/telegram-web-app.js", (route) =>
    route.fulfill({ contentType: "text/javascript", body: fakeTelegram(hidden) }),
  );
  page.on("pageerror", (e) => failures.push(`pageerror: ${e.message}`));
  await page.goto(`${BASE}/?dev=${USER}&splash=off`);
  await revealLesson(page, LESSON);
  // Лист «Мы нашли ваши достижения» (прогресс записан в базу напрямую): закрываем.
  await page.waitForLoadState("networkidle");
  if (await page.locator('[data-testid="celebration"]').count()) {
    await page.click('[data-testid="celebration-close"]');
    await page.waitForSelector('[data-testid="celebration"]', { state: "detached" });
  }
  return page;
}

async function openWrite(page) {
  await page.click(`[data-testid="lesson-${LESSON}"]`);
  await page.waitForSelector('[data-testid="word-he"]');
  // Урок открывается сразу на «Пиши» («слушай» и «говори» пройдены). Лишний клик по вкладке прокрутил бы страницу
  // к ней (так кликает Playwright) и сбил бы проверку прокрутки приложения.
  if ((await page.getAttribute('[data-testid="tab-write"]', "aria-selected")) !== "true") await page.click('[data-testid="tab-write"]');
  await page.waitForSelector('[data-testid="draw-canvas"]');
  await page.waitForSelector('[data-testid="check"]');
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(300);
}

/** Рисует букву по шаблону из шрифта (как в tools/e2e-lesson.mjs). */
async function drawLetter(page, letter) {
  const t = templates.find((x) => x.letter === letter);
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

const bottomOf = (page, selector) => page.locator(selector).first().evaluate((el) => el.getBoundingClientRect().bottom);
const topOf = (page, selector) => page.locator(selector).first().evaluate((el) => el.getBoundingClientRect().top);

// У слов урока «слушай» и «говори» уже пройдены: этап «пиши» открыт сразу.
sql(`INSERT OR IGNORE INTO users (id, first_name) VALUES (${USER}, 'Планшет');`);
sql(`DELETE FROM word_progress WHERE user_id = ${USER};`);
sql(
  `INSERT INTO word_progress (user_id, word_id, lesson_id, stage_listen, stage_speak, stage_write, stage_type, completed_at) VALUES ${lesson.words
    .map((w) => `(${USER}, '${w.id}', '${LESSON}', 1, 1, 0, 0, NULL)`)
    .join(",")};`,
);

try {
  // iPad горизонтально, низ окна (HIDDEN px) за краем экрана.
  {
    const viewport = { width: 1180, height: 820 };
    const visible = viewport.height - HIDDEN;
    const page = await openPage(viewport, HIDDEN);
    const hidden = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--app-hidden-bottom").trim());
    check(hidden === `${HIDDEN}px`, `приложение знает спрятанную высоту окна (${hidden}, ждём ${HIDDEN}px)`);

    await openWrite(page);
    await page.screenshot({ path: `${SHOTS}/01-ipad-landscape-write.png` });
    const checkBottom = await bottomOf(page, '[data-testid="check"]');
    const canvasTop = await topOf(page, '[data-testid="draw-canvas"]');
    const headerBottom = await bottomOf(page, "header");
    check(checkBottom <= visible, `кнопка «Проверить» в видимой части (низ ${Math.round(checkBottom)} ≤ ${visible})`);
    check(canvasTop >= headerBottom, `холст не прячется под шапкой (верх ${Math.round(canvasTop)} ≥ ${Math.round(headerBottom)})`);
    check((await page.evaluate(() => window.__swipes.at(-1))) === "off", "на холсте свайп вниз Telegram выключен");

    const first = [...lesson.words[0].he][0];
    await drawLetter(page, first);
    await page.click('[data-testid="check"]');
    await page.waitForSelector('[data-testid="write-slots"] [data-slot="ok"]');
    await page.waitForTimeout(200);
    check((await bottomOf(page, '[data-testid="check"]')) <= visible, "после первой буквы кнопки по-прежнему в видимой части");
    check((await bottomOf(page, '[role="status"]')) <= visible, "ответ «Верно!» в видимой части");
    await page.screenshot({ path: `${SHOTS}/02-ipad-landscape-letter.png` });

    // Докрутка до самого низа: последний элемент страницы над краем видимой части.
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await page.waitForTimeout(150);
    const mainBottom = await bottomOf(page, "main");
    check(mainBottom <= visible, `низ страницы докручивается в видимую часть (${Math.round(mainBottom)} ≤ ${visible})`);
    await page.screenshot({ path: `${SHOTS}/03-ipad-landscape-bottom.png` });

    await page.click('header button[aria-label="Назад"]');
    await page.waitForSelector(`[data-testid="lesson-${LESSON}"]`);
    check((await page.evaluate(() => window.__swipes.at(-1))) === "on", "на главной свайп вниз Telegram снова включён");
    await page.context().close();
  }

  // iPad вертикально, всё окно видно: кнопки на месте без прокрутки, прокрутки вбок нет.
  {
    const viewport = { width: 820, height: 1180 };
    const page = await openPage(viewport, 0);
    await openWrite(page);
    await page.screenshot({ path: `${SHOTS}/04-ipad-portrait-write.png` });
    check((await page.evaluate(() => window.scrollY)) === 0, "на iPad вертикально экран «Пиши» не прокручивается сам");
    check((await bottomOf(page, '[data-testid="check"]')) <= viewport.height, "на iPad вертикально кнопка «Проверить» видна");
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    check(overflow <= 0, "на iPad нет прокрутки вбок");
    await page.context().close();
  }
} finally {
  await browser.close();
  sql(`DELETE FROM word_progress WHERE user_id = ${USER};`);
}

if (failures.length) {
  console.error(`\nПровалено: ${failures.length}`);
  for (const f of failures) console.error(` - ${f}`);
  process.exit(1);
}
console.log("\nВсе проверки на iPad пройдены");

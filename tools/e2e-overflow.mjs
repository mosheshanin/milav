// Сквозная проверка вёрстки: на экране телефона шириной 360 px нигде не должно быть горизонтальной прокрутки.
// Проходит главную (все разделы и темы развёрнуты) и каждый урок: каждое слово или букву на каждом этапе,
// у глаголов ещё и каждую вкладку времени. Длинные слова и формы (כחלחלות, מפוספסים) раньше вылезали за край.
// Нужен запущенный локальный Worker со свежей сборкой фронтенда (как для tools/e2e-lesson.mjs).
// Запуск: node tools/e2e-overflow.mjs [каталог для скриншотов]. Только один урок: E2E_LESSON=colors-3.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { chromium } from "playwright-core";
import { revealLesson } from "./e2e-home.mjs";

const BASE = process.env.BASE ?? "http://localhost:8787";
const SHOTS = process.argv[2] ?? "e2e-shots/overflow";
mkdirSync(SHOTS, { recursive: true });
const WIDTH = 360;
const USER = 2401;

const lessonsDir = new URL("../content/lessons/", import.meta.url);
const only = process.env.E2E_LESSON;
const lessons = readdirSync(lessonsDir)
  .filter((f) => f.endsWith(".json"))
  .map((f) => JSON.parse(readFileSync(new URL(f, lessonsDir), "utf8")))
  .filter((l) => l.free && (!only || l.id === only))
  .sort((a, b) => (a.section === "alphabet" ? -1 : 0) - (b.section === "alphabet" ? -1 : 0) || a.id.localeCompare(b.id));
if (lessons.length === 0) throw new Error(`Нет уроков для проверки${only ? ` (E2E_LESSON=${only})` : ""}`);
const itemsOf = (l) => l.words ?? l.letters;

function findChromium() {
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH ?? "/opt/pw-browsers";
  for (const dir of readdirSync(root)) {
    const exe = `${root}/${dir}/chrome-linux/chrome`;
    if (dir.startsWith("chromium-") && existsSync(exe)) return exe;
  }
  throw new Error("Chromium не найден");
}

// Все слова и буквы пройдены: открыты все этапы, по ним можно ходить в любом порядке.
const rows = lessons.flatMap((l) => itemsOf(l).map((w) => `(${USER}, '${w.id}', '${l.id}', 1, 1, 1, 1, datetime('now'))`));
const seedFile = `${SHOTS}/seed.sql`;
writeFileSync(
  seedFile,
  `INSERT OR IGNORE INTO users (id, first_name) VALUES (${USER}, 'Вёрстка');\n` +
    `DELETE FROM word_progress WHERE user_id=${USER};\n` +
    `INSERT INTO word_progress (user_id, word_id, lesson_id, stage_listen, stage_speak, stage_write, stage_type, completed_at) VALUES ${rows.join(",")};\n`,
);
execFileSync("npx", ["wrangler", "d1", "execute", "milav-db", "--local", "--env", "local", "--file", seedFile], { stdio: "ignore" });

const failures = [];
let checks = 0;

const browser = await chromium.launch({ executablePath: findChromium(), args: ["--no-sandbox"] });
const context = await browser.newContext({ viewport: { width: WIDTH, height: 740 }, deviceScaleFactor: 2 });
// Все разделы и темы главной развёрнуты.
const openKeys = [...new Set(lessons.flatMap((l) => [`section:${l.section}`, `topic:${l.topicId}`]))];
await context.addInitScript((keys) => {
  try {
    localStorage.setItem("milav:home-open", JSON.stringify(keys));
  } catch {
    // Хранилище недоступно: главная откроется свёрнутой, revealLesson развернёт нужное.
  }
  window.speechSynthesis.speak = (u) => setTimeout(() => u.onend?.(new Event("end")), 10);
}, openKeys);
const page = await context.newPage();
page.on("pageerror", (e) => failures.push(`pageerror: ${e.message}`));

/** Проверяет горизонтальную прокрутку; при провале называет самые глубокие элементы за правым краем и сохраняет снимок. */
async function checkNoOverflow(where) {
  checks++;
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  const result = await page.evaluate(() => {
    const W = window.innerWidth;
    const overflow = document.documentElement.scrollWidth > W;
    if (!overflow) return null;
    const culprits = [];
    for (const el of document.querySelectorAll("body *")) {
      const r = el.getBoundingClientRect();
      if (r.width && r.right > W + 0.5 && ![...el.children].some((c) => c.getBoundingClientRect().right > W + 0.5)) {
        culprits.push(`${el.tagName.toLowerCase()}${el.dataset.testid ? `[${el.dataset.testid}]` : ""} «${(el.textContent ?? "").trim().slice(0, 24)}» до ${Math.round(r.right)} px`);
      }
    }
    return { width: document.documentElement.scrollWidth, culprits: culprits.slice(0, 4) };
  });
  if (result) {
    const name = where.replace(/[^\p{L}\p{N}-]+/gu, "_");
    await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });
    failures.push(`${where}: ширина ${result.width} px при экране ${WIDTH} px; за краем: ${result.culprits.join("; ")}`);
  }
}

async function dismissFoundSheet() {
  await page.waitForSelector('[data-testid="my-path"]');
  await page.waitForLoadState("networkidle");
  if (await page.locator('[data-testid="celebration"]').count()) {
    await page.click('[data-testid="celebration-close"]');
    await page.waitForSelector('[data-testid="celebration"]', { state: "detached" });
  }
}

await page.goto(`${BASE}/?dev=${USER}`);
await dismissFoundSheet();
await checkNoOverflow("главная, всё развёрнуто");

for (const lesson of lessons) {
  await revealLesson(page, lesson.id);
  await page.click(`[data-testid="lesson-${lesson.id}"]`);
  const letters = lesson.section === "alphabet";
  const heSelector = letters ? '[data-testid="letter-he"]' : '[data-testid="word-he"]';
  await page.waitForSelector(heSelector);
  const items = itemsOf(lesson);
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    await page.click(`[data-testid="dot-${i}"]`);
    await page.waitForFunction(([sel, he]) => document.querySelector(sel)?.textContent?.trim() === he, [heSelector, item.he]);
    for (const stage of ["listen", "speak", "write", "type"]) {
      const tab = page.locator(`[data-testid="tab-${stage}"]`);
      if ((await tab.count()) === 0 || (await tab.isDisabled())) continue;
      await tab.click();
      await checkNoOverflow(`${lesson.id} ${item.he} ${stage}`);
      // Таблица форм глагола видна на полной карточке: проверяем каждую вкладку времени.
      if (stage === "listen" && item.verb) {
        for (const vt of await page.locator('[data-testid^="verb-tab-"]').all()) {
          await vt.click();
          await checkNoOverflow(`${lesson.id} ${item.he} ${await vt.getAttribute("data-testid")}`);
        }
      }
    }
  }
  console.log(`${lesson.id}: проверено`);
  await page.getByRole("button", { name: "Назад" }).click();
  await page.waitForSelector('[data-testid="my-path"]');
}

await browser.close();
console.log(`\nПроверок: ${checks}`);
console.log(failures.length ? `Провалено: ${failures.length}\n${failures.join("\n")}` : "Горизонтальной прокрутки нет нигде");
process.exit(failures.length ? 1 : 0);

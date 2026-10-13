// Сквозная проверка экрана записи шаблонов букв (только владелец) в настоящем браузере на размере телефона.
// Нужен запущенный локальный Worker со свежей сборкой (как для tools/e2e-lesson.mjs, см. docs/DEPLOY.md).
// В env.local записывающий это тестовый пользователь 1001 (TEMPLATE_RECORDER_IDS в wrangler.jsonc).
// Запуск: node tools/e2e-record.mjs [каталог для скриншотов]
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync } from "node:fs";
import { chromium } from "playwright-core";

const BASE = process.env.BASE ?? "http://localhost:8787";
const SHOTS = process.argv[2] ?? "e2e-shots";
mkdirSync(SHOTS, { recursive: true });

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

const failures = [];
function check(condition, text) {
  console.log(`${condition ? "ok  " : "FAIL"} ${text}`);
  if (!condition) failures.push(text);
}

const browser = await chromium.launch({ executablePath: findChromium(), args: ["--no-sandbox"] });

async function openPage(query) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const page = await context.newPage();
  page.on("pageerror", (e) => failures.push(`pageerror: ${e.message}`));
  page.on("console", (msg) => {
    if (/content security policy/i.test(msg.text())) failures.push(`CSP: ${msg.text().slice(0, 200)}`);
  });
  page.on("dialog", (d) => void d.accept());
  await page.goto(`${BASE}/?${query}`);
  return page;
}

const shot = (page, name) => page.screenshot({ path: `${SHOTS}/${name}.png` });

/** Рисует форму по шаблону из шрифта: точки облака как короткие штрихи (в сумме не больше 24 штрихов). */
async function drawLetter(page, letter, jitter = 0) {
  const t = templates.find((x) => x.letter === letter);
  if (!t) throw new Error(`нет шаблона ${letter}`);
  const box = await page.locator('[data-testid="draw-canvas"]').boundingBox();
  const lineHeight = 0.45 * 220;
  const h = t.heightRatio * lineHeight;
  const scale = t.aspect <= 1 ? h : h * t.aspect;
  const cx = box.x + box.width / 2;
  const cy = box.y + 0.62 * 220 - h / 2;
  for (let i = 0; i < t.points.length; i += 4) {
    const x = cx + t.points[i] * scale + jitter;
    const y = cy + t.points[i + 1] * scale;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + 1.5, y);
    await page.mouse.up();
  }
}

const summary = async (page) => (await page.locator('[data-testid="record-summary"]').textContent())?.trim();
const message = async (page) => (await page.locator('[data-testid="record-message"]').textContent())?.trim() ?? "";

sql("DELETE FROM letter_templates;");

// ---------- Чужой пользователь ----------
{
  const page = await openPage("dev=1002&record");
  await page.waitForSelector('[data-testid="my-id"]');
  check((await page.locator('[data-testid="my-id"]').textContent()) === "1002", "не владельцу показывается «Нет доступа» и его id");
  check((await page.locator("body").textContent()).includes("TEMPLATE_RECORDER_IDS"), "на экране подсказка про секрет TEMPLATE_RECORDER_IDS");
  await shot(page, "r1-forbidden");
  const res = await page.request.get(`${BASE}/api/templates`, { headers: { authorization: "dev 1002:Tester" } });
  check(res.status() === 403, "API шаблонов отвечает чужому 403");
  const noAuth = await page.request.get(`${BASE}/api/templates`);
  check(noAuth.status() === 401, "API шаблонов без входа отвечает 401");
  await page.context().close();
}

// ---------- Обычный запуск владельца не открывает запись ----------
{
  const page = await openPage("dev=1001");
  await page.waitForSelector('[data-testid="lesson-animals-1"]');
  check((await page.locator('[data-testid="record-summary"]').count()) === 0, "без параметра запуска открывается главная, а не запись");
  await page.context().close();
}

// ---------- Владелец записывает ----------
const page = await openPage("dev=1001&record");
await page.waitForSelector('[data-testid="record-summary"]');
check((await summary(page)) === "Записано 0 из 135", "в начале записано 0 из 135");
check((await page.locator('[data-testid^="letter-"][data-status]').count()) === 27, "в сетке 27 форм");
await shot(page, "r2-grid");

// Первая форма: «Начать с «א»».
await page.locator('[data-testid="record-next"]').click();
check((await page.locator('[data-testid="record-letter"]').textContent()) === "א", "кнопка «Начать» открывает первую форму, алеф");

// Пять вариантов подряд: после каждого сохранения выбирается следующий свободный.
for (let n = 0; n < 5; n++) {
  await drawLetter(page, "א", n * 2);
  await page.locator('[data-testid="record-save"]').click();
  await page.waitForSelector(`[data-testid="slot-${n}"][data-state="done"]`);
}
check((await page.locator('[data-testid^="slot-"][data-state="done"]').count()) === 5, "записаны все 5 вариантов алефа");
check((await page.locator('[data-testid="record-next-letter"]').count()) === 1, "когда форма готова, есть «Следующая буква»");
await shot(page, "r3-letter-done");

// Рисунок, похожий на другую букву, сохраняется, но с предупреждением.
await page.locator('[data-testid="record-next-letter"]').click();
check((await page.locator('[data-testid="record-letter"]').textContent()) === "ב", "«Следующая буква» открывает бет");
await drawLetter(page, "ר");
await page.locator('[data-testid="record-save"]').click();
await page.waitForSelector('[data-testid="slot-0"][data-state="warn"]');
check((await message(page)).includes("больше похож"), "неверно нарисованная форма сохранена с предупреждением");
await shot(page, "r4-warning");

// Нарисовать этот же вариант заново: заменяется, предупреждение уходит.
await drawLetter(page, "ב");
await page.locator('[data-testid="record-save"]').click();
await page.waitForSelector('[data-testid="slot-0"][data-state="done"]');
check((await page.locator('[data-testid^="slot-"][data-state="done"]').count()) === 1, "повторная запись заменяет вариант, а не добавляет второй");

// Удаление варианта.
await page.locator('[data-testid="slot-0"]').click();
await page.getByRole("button", { name: "Удалить этот вариант" }).click();
await page.waitForSelector('[data-testid="slot-0"][data-state="empty"]');
check((await page.locator('[data-testid^="slot-"][data-state="done"]').count()) === 0, "удаление очищает вариант");

// Назад к сетке: счётчики верны. Потом перезагрузка: данные берутся с сервера, экран записи сохраняется.
await page.getByRole("button", { name: "Назад" }).click();
check((await summary(page)) === "Записано 5 из 135", "в сетке записано 5 из 135");
check((await page.locator('[data-testid="letter-א"]').getAttribute("data-status")) === "done", "алеф отмечен готовым");
await page.reload();
await page.waitForSelector('[data-testid="record-summary"]');
check((await summary(page)) === "Записано 5 из 135", "после перезагрузки данные на месте и экран записи тот же");
await shot(page, "r5-reload");

// «Назад» из сетки ведёт на главную.
await page.getByRole("button", { name: "Назад" }).click();
await page.waitForSelector('[data-testid="lesson-animals-1"]');
check(true, "стрелка назад в сетке ведёт на главную");

// Рисунки лежат в базе (приёмник), номера и форма верны.
const rows = execFileSync(
  "npx",
  ["wrangler", "d1", "execute", "milav-db", "--local", "--env", "local", "--json", "--command", "SELECT letter, COUNT(*) AS n FROM letter_templates GROUP BY letter"],
  { encoding: "utf8" },
);
check(JSON.parse(rows)[0].results.length === 1 && JSON.parse(rows)[0].results[0].n === 5, "в таблице letter_templates 5 рисунков одной формы");

await browser.close();
sql("DELETE FROM letter_templates;");

if (failures.length) {
  console.error(`\nПровалено: ${failures.length}`);
  for (const f of failures) console.error(` - ${f}`);
  process.exit(1);
}
console.log("\nВсе проверки записи пройдены");

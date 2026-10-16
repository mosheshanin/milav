// Сквозная проверка раздела «Контент» (проверка слов носителем, docs/ADMIN.md, этап 3) в браузере на размере телефона.
// Нужен запущенный локальный Worker со свежей сборкой (как для tools/e2e-admin.mjs, см. docs/DEPLOY.md).
// В env.local владелец это тестовый пользователь 1001, ученик 1002, проверяющего (1003) тест добавляет сам.
// Запуск: node tools/e2e-review.mjs [каталог для скриншотов]
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync } from "node:fs";
import { chromium } from "playwright-core";

const BASE = process.env.BASE ?? "http://localhost:8787";
const SHOTS = process.argv[2] ?? "e2e-shots/review";
mkdirSync(SHOTS, { recursive: true });

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

const OWNER = 1001;
const STUDENT = 1002;
const REVIEWER = 1003;
const dev = (id) => ({ authorization: `dev ${id}:Tester` });
const CAT = "animals-1-cat";
const DOG = "animals-1-dog";
const VERB = "paal-1-write";
const ALEF = "alphabet-1-alef";

const reset = () => sql("DELETE FROM content_reviews; DELETE FROM staff; DELETE FROM admin_log;");
reset();

const browser = await chromium.launch({ executablePath: findChromium(), args: ["--no-sandbox"] });
const dialogs = [];

async function openPage(id, { clipboard = false } = {}) {
  const context = await browser.newContext({ viewport: { width: 360, height: 780 }, deviceScaleFactor: 2 });
  if (clipboard) await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: BASE });
  const page = await context.newPage();
  page.on("pageerror", (e) => failures.push(`pageerror: ${e.message}`));
  page.on("console", (msg) => {
    if (/content security policy/i.test(msg.text())) failures.push(`CSP: ${msg.text().slice(0, 200)}`);
  });
  page.on("dialog", (d) => {
    dialogs.push(d.message());
    void d.accept();
  });
  await page.goto(`${BASE}/?dev=${id}`);
  return page;
}

const shot = (page, name) => page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });
const noOverflow = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
const text = async (page, id) => ((await page.locator(`[data-testid="${id}"]`).first().textContent()) ?? "").trim();
const scriptUrls = (page) => page.evaluate(() => performance.getEntriesByType("resource").map((e) => e.name).filter((n) => n.endsWith(".js")));
const status = (page, id) => page.locator(`[data-testid="review-item-${id}"]`).getAttribute("data-status");

async function openSettings(page) {
  await page.waitForSelector('[data-testid="open-settings"]');
  await page.locator('[data-testid="open-settings"]').first().click();
  await page.waitForSelector('[data-testid="settings"]');
}

async function search(page, query) {
  await page.fill('[data-testid="review-search"]', query);
}

async function openItem(page, id) {
  await page.click(`[data-testid="review-item-${id}"]`);
  await page.waitForSelector(`[data-testid="review-card"][data-item="${id}"]`);
}

const back = (page) => page.click('header button[aria-label="Назад"]');

// ---------- Ученик: ни пункта, ни кода, ни ответа API ----------
{
  const page = await openPage(STUDENT);
  await openSettings(page);
  check((await page.locator('[data-testid="open-review"]').count()) === 0, "у ученика нет пункта «Проверка слов»");
  check(!(await scriptUrls(page)).some((u) => /\/(Content|Review)-/.test(u)), "код проверки ученику не загружается");
  for (const path of ["/api/review/items", `/api/review/items/${CAT}`, "/api/review/export"]) {
    check((await page.request.get(`${BASE}${path}`, { headers: dev(STUDENT) })).status() === 403, `ученику ${path} отвечает 403`);
  }
  await page.context().close();
}

// Владелец добавляет проверяющего (как в разделе «Команда»).
{
  const page = await openPage(OWNER);
  const res = await page.request.put(`${BASE}/api/admin/team`, { headers: { ...dev(OWNER), "content-type": "application/json" }, data: { userId: REVIEWER, role: "reviewer" } });
  check(res.status() === 200, "владелец добавил проверяющего");
  await page.context().close();
}

// ---------- Проверяющий ----------
const rev = await openPage(REVIEWER);
await openSettings(rev);
check((await rev.locator('[data-testid="open-admin"]').count()) === 0, "у проверяющего нет «Панели администратора»");
check((await rev.locator('[data-testid="open-review"]').count()) === 1, "у проверяющего есть «Проверка слов»");
await rev.click('[data-testid="open-review"]');
await rev.waitForSelector('[data-testid="review-list"]');
check((await scriptUrls(rev)).some((u) => /\/Review-/.test(u)), "код проверки подгружается отдельным файлом");
check((await rev.locator('[data-testid="review-export"]').count()) === 0, "у проверяющего нет выгрузки для переноса");
check((await rev.locator('[data-testid="review-filter-new"]').getAttribute("aria-checked")) === "true", "по умолчанию показаны непроверенные");
check((await rev.request.get(`${BASE}/api/review/export`, { headers: dev(REVIEWER) })).status() === 403, "выгрузка проверяющему закрыта (403)");
check((await rev.request.get(`${BASE}/api/admin/overview`, { headers: dev(REVIEWER) })).status() === 403, "остальная панель проверяющему закрыта (403)");
check(await noOverflow(rev), "список без горизонтальной прокрутки на 360 px");
await shot(rev, "r1-list");

// Исправление перевода у слова, переход к следующему.
await search(rev, "animals-1");
await openItem(rev, CAT);
check((await rev.locator('[data-testid="review-listen"]').count()) === 1, "в карточке есть кнопка «послушать»");
check((await rev.locator('[data-testid="review-ok"]').isEnabled()) && !(await rev.locator('[data-testid="review-fix"]').isEnabled()), "без правок доступно только «Всё верно»");
await rev.click('[data-testid="review-edit-ru"]');
await rev.fill('[data-testid="review-input-ru"]', "кошка");
check(!(await rev.locator('[data-testid="review-ok"]').isEnabled()), "с исправлением «Всё верно» недоступно");
check((await text(rev, "review-fix")).includes("(1)"), "на кнопке число исправлений");
await rev.fill('[data-testid="review-comment"]', "Лучше «кошка»: в фразе речь о ней");
check(await noOverflow(rev), "карточка слова без горизонтальной прокрутки");
await shot(rev, "r2-card-fix");
await rev.click('[data-testid="review-fix"]');
await rev.waitForSelector(`[data-testid="review-card"][data-item="${DOG}"]`);
check((await text(rev, "review-notice")).includes("замечания сохранены"), "после сохранения сообщение и следующее слово");

// Следующее слово: «верно».
await rev.click('[data-testid="review-ok"]');
await rev.waitForSelector(`[data-testid="review-card"]:not([data-item="${DOG}"])`);
await back(rev);
await rev.waitForSelector('[data-testid="review-list"]');
await rev.click('[data-testid="review-filter-all"]');
check((await status(rev, CAT)) === "fix", "у исправленного слова состояние «Замечания»");
check((await status(rev, DOG)) === "ok", "у проверенного слова состояние «Ждёт переноса»");
check((await text(rev, "review-progress")).includes("Ждут переноса в уроки: 2"), "счётчик «ждут переноса»");

// Свой отзыв виден в карточке; отозвать его.
await openItem(rev, DOG);
check((await text(rev, "review-history")).includes("Вы"), "мой отзыв в списке отзывов");
dialogs.length = 0;
await rev.click('[data-testid="review-withdraw"]');
await rev.waitForSelector('[data-testid="review-list"]');
check(dialogs.some((d) => d.includes("Отозвать")), "отзыв назад спрашивает подтверждение");
check((await status(rev, DOG)) === "new", "отозванное слово снова «Не проверено»");
await openItem(rev, DOG);
await rev.click('[data-testid="review-ok"]');
await rev.waitForSelector(`[data-testid="review-card"]:not([data-item="${DOG}"])`);
await back(rev);
await rev.waitForSelector('[data-testid="review-list"]');

// Глагол: формы по временам свёрнуты, исправление формы раскрывает группу.
await search(rev, VERB);
await openItem(rev, VERB);
check((await rev.locator('[data-testid="review-group-Прошедшее"] details').count()) === 1, "формы прошедшего времени свёрнуты в группу");
await rev.click('[data-testid="review-group-Прошедшее"] summary');
await rev.click('[data-testid="review-edit-verb.past.3ms.translit"]');
check(await rev.locator('[data-testid="review-input-verb.past.3ms.translit"]').isVisible(), "поле формы глагола можно исправить");
check(await noOverflow(rev), "карточка глагола без горизонтальной прокрутки");
await shot(rev, "r3-verb");
await back(rev);
await rev.waitForSelector('[data-testid="review-list"]');

// Буква: название и слово-пример.
await search(rev, ALEF);
await openItem(rev, ALEF);
check((await rev.locator('[data-testid="review-field-name.ru"]').count()) === 1, "у буквы можно исправить название");
check((await rev.locator('[data-testid="review-listen-example"]').count()) === 1, "у буквы послушать слово-пример");
check(await noOverflow(rev), "карточка буквы без горизонтальной прокрутки");
await rev.evaluate(() => document.documentElement.setAttribute("data-theme", "dark"));
await shot(rev, "r4-letter-dark");
await back(rev);
await rev.waitForSelector('[data-testid="review-list"]');

// После перезагрузки проверяющий остаётся на экране проверки.
await rev.reload();
await rev.waitForSelector('[data-testid="review-screen"]');
check(true, "после перезагрузки экран проверки сохраняется");
await rev.context().close();

// ---------- Владелец: раздел «Контент», выгрузка, журнал ----------
const owner = await openPage(OWNER, { clipboard: true });
await openSettings(owner);
await owner.click('[data-testid="open-admin"]');
await owner.waitForSelector('[data-testid="admin-menu"]');
check((await owner.locator('[data-testid^="admin-open-"]').count()) === 7, "в меню панели 7 разделов (добавился «Контент»)");
await owner.click('[data-testid="admin-open-content"]');
await owner.waitForSelector('[data-testid="review-list"]');
await owner.click('[data-testid="review-export-prepare"]');
await owner.waitForSelector('[data-testid="review-export-copy"]');
await owner.click('[data-testid="review-export-copy"]');
await owner.waitForFunction(() => document.querySelector('[data-testid="review-export-copy"]')?.textContent.includes("Скопировано"));
const copied = JSON.parse(await owner.evaluate(() => navigator.clipboard.readText()));
check(copied.items?.length === 2, "в выгрузке 2 отзыва");
const catReview = copied.items?.find((i) => i.itemId === CAT);
check(catReview?.fixes?.ru === "кошка" && catReview?.verdict === "fix" && catReview?.reviewer === REVIEWER, "в выгрузке исправление перевода от проверяющего");
check(copied.items?.find((i) => i.itemId === DOG)?.verdict === "ok", "в выгрузке «верно»");
await shot(owner, "r5-owner-content");

// Карточка из панели: «назад» закрывает карточку, потом раздел.
await owner.click('[data-testid="review-filter-fix"]');
await openItem(owner, CAT);
check((await text(owner, "review-history")).includes("Перевод: кот → кошка"), "администратор видит исправление проверяющего");
await back(owner);
await owner.waitForSelector('[data-testid="review-list"]');
await back(owner);
await owner.waitForSelector('[data-testid="admin-menu"]');
check(true, "«назад» из карточки ведёт в список, из списка в меню панели");

await owner.click('[data-testid="admin-open-log"]');
await owner.waitForSelector('[data-testid="log-list"]');
const log = await text(owner, "log-list");
check(log.includes(`Проверка ${CAT}: замечания (исправлений: 1)`), "в журнале замечания проверяющего");
check(log.includes(`Отозвана проверка ${DOG}`), "в журнале отзыв назад");
await owner.context().close();

await browser.close();
reset();

if (failures.length > 0) {
  console.error(`\nОшибок: ${failures.length}`);
  for (const f of failures) console.error(` - ${f}`);
  process.exit(1);
}
console.log("\nПроверка слов: все проверки прошли");

// Сквозная проверка напоминаний (docs/REMINDERS.md, этап 1) в браузере на размере телефона: выключатель в панели,
// предложение после выученного слова, раздел «Напоминания» в «Настройках», тексты в панели администратора.
// Отправку в Telegram и кнопки в чате проверяют юнит-тесты (reminders.test.ts): локально токена бота нет.
// Нужен запущенный локальный Worker со свежей сборкой (как для tools/e2e-lesson.mjs, см. docs/DEPLOY.md).
// Запуск: node tools/e2e-reminders.mjs [каталог для скриншотов]
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync } from "node:fs";
import { chromium } from "playwright-core";
import { revealLesson } from "./e2e-home.mjs";

const BASE = process.env.BASE ?? "http://localhost:8787";
const SHOTS = process.argv[2] ?? "e2e-shots/reminders";
mkdirSync(SHOTS, { recursive: true });

const lesson = JSON.parse(readFileSync(new URL("../content/lessons/animals-1.json", import.meta.url), "utf8"));

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
/** Первая строка ответа SELECT как объект. */
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
const dev = (id) => ({ authorization: `dev ${id}:Tester` });
const STUDENT = 3201;
const STUDENT2 = 3202;

const reset = () =>
  sql(
    `DELETE FROM app_config; DELETE FROM reminders; DELETE FROM admin_log; DELETE FROM reminder_texts WHERE text LIKE 'E2E%';` +
      ` DELETE FROM word_progress WHERE user_id IN (${STUDENT}, ${STUDENT2}); DELETE FROM user_stats WHERE user_id IN (${STUDENT}, ${STUDENT2});`,
  );
/** Напоминания по умолчанию (локально «Выкл.»): через API, чтобы сбросить и память экземпляра Worker (до минуты). */
async function modeOff() {
  const res = await fetch(`${BASE}/api/admin/config`, {
    method: "PUT",
    headers: { ...dev(OWNER), "Content-Type": "application/json" },
    body: JSON.stringify({ key: "reminders", value: "off" }),
  });
  if (!res.ok) throw new Error(`не удалось выключить напоминания: ${res.status}`);
}

await modeOff();
reset();

const browser = await chromium.launch({ executablePath: findChromium(), args: ["--no-sandbox"] });
const dialogs = [];

async function openPage(id) {
  const context = await browser.newContext({ viewport: { width: 360, height: 780 }, deviceScaleFactor: 2 });
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
const checked = (page, id) => page.locator(`[data-testid="${id}"]`).getAttribute("aria-checked");

async function openSettings(page) {
  await page.waitForSelector('[data-testid="open-settings"]');
  await page.locator('[data-testid="open-settings"]').first().click();
  await page.waitForSelector('[data-testid="settings"]');
}

/** Слово урока пройдено на трёх этапах, остался «слушай»: следующий шаг ученика выучит слово. */
function seedAlmostDone(userId, wordIndex) {
  const word = lesson.words[wordIndex];
  sql(
    `INSERT OR REPLACE INTO word_progress (user_id, word_id, lesson_id, stage_listen, stage_speak, stage_write, stage_type, completed_at) ` +
      `VALUES (${userId}, '${word.id}', '${lesson.id}', 0, 1, 1, 1, NULL);`,
  );
}

/** Открывает урок и проходит «слушай» у первого непройденного слова. */
async function finishListen(page) {
  await revealLesson(page, lesson.id);
  await page.click(`[data-testid="lesson-${lesson.id}"]`);
  await page.waitForSelector('[data-testid="listen"]');
  await page.click('[data-testid="listen"]');
  await page.waitForFunction(() => !document.querySelector('[data-testid="listen-next"]')?.disabled);
  await page.click('[data-testid="listen-next"]');
}

// ---------- По умолчанию (локально) напоминания выключены ----------
{
  const page = await openPage(STUDENT);
  await openSettings(page);
  check((await page.locator('[data-testid="toggle-reminders"]').count()) === 0, "пока напоминания выключены в панели, в «Настройках» их нет");
  check((await page.request.put(`${BASE}/api/reminders`, { headers: dev(STUDENT), data: { enabled: true } })).status() === 403, "включить запросом нельзя (403)");
  await page.context().close();
}

// ---------- Владелец включает напоминания для всех ----------
const admin = await openPage(OWNER);
await openSettings(admin);
await admin.click('[data-testid="open-admin"]');
await admin.click('[data-testid="admin-open-config"]');
await admin.waitForSelector('[data-testid="config-reminders-all"]');
check((await checked(admin, "config-reminders-off")) === "true", "в панели виден выключатель «Напоминания от бота» (локально «Выкл.»)");
await admin.click('[data-testid="config-reminders-all"]');
await admin.waitForFunction(() => document.querySelector('[data-testid="config-reminders-all"]')?.getAttribute("aria-checked") === "true");
check(true, "напоминания включены для всех");

// ---------- Ученик: предложение после выученного слова, «Не сейчас» ----------
{
  const page = await openPage(STUDENT);
  await page.waitForSelector('[data-testid="open-settings"]');
  seedAlmostDone(STUDENT, 0);
  await finishListen(page);
  await page.waitForSelector('[data-testid="reminder-offer"]');
  check(true, "после выученного слова появляется предложение напоминать");
  check((await page.locator('[data-testid="reminder-offer"]').textContent()).includes("20:00"), "в предложении время 20:00 и что в шаббат не пишем");
  check(await noOverflow(page), "лист предложения без горизонтальной прокрутки на 360 px");
  await page.waitForTimeout(600); // лист выезжает снизу: снимок после анимации
  await shot(page, "r1-offer");
  await page.click('[data-testid="reminder-offer-later"]');
  await page.waitForSelector('[data-testid="reminder-offer"]', { state: "detached" });
  const row = sqlRow(`SELECT asked_count, enabled FROM reminders WHERE user_id = ${STUDENT}`);
  check(row?.asked_count === 1 && row?.enabled === 0, "«Не сейчас» запомнено: спросим не раньше чем через неделю");
  // Следующее слово в тот же день: предложение не повторяется.
  seedAlmostDone(STUDENT, 1);
  // Приложение заново (сохранённое место сбрасываем, иначе оно откроет урок): в новом открытии предложения нет.
  await page.evaluate(() => sessionStorage.clear());
  await page.reload();
  await finishListen(page);
  await page.waitForTimeout(800);
  check((await page.locator('[data-testid="reminder-offer"]').count()) === 0, "после «Не сейчас» предложение не повторяется");
  await page.context().close();
}

// ---------- Второй ученик: «Да», затем «Настройки» ----------
{
  const page = await openPage(STUDENT2);
  await page.waitForSelector('[data-testid="open-settings"]');
  seedAlmostDone(STUDENT2, 0);
  await finishListen(page);
  await page.waitForSelector('[data-testid="reminder-offer-yes"]');
  await page.click('[data-testid="reminder-offer-yes"]');
  await page.waitForSelector('[data-testid="reminder-offer-result"]');
  check((await page.locator('[data-testid="reminder-offer-result"]').textContent()).includes("Готово"), "«Да»: напоминания включены");
  const row = sqlRow(`SELECT enabled, minute, next_at FROM reminders WHERE user_id = ${STUDENT2}`);
  check(row?.enabled === 1 && row?.minute === 1200 && row?.next_at > 0, "в базе: включено, 20:00, следующее время рассчитано");
  await shot(page, "r2-offer-yes");
  await page.getByRole("button", { name: "Хорошо" }).click();

  await page.evaluate(() => sessionStorage.clear());
  await page.goto(`${BASE}/?dev=${STUDENT2}`);
  await openSettings(page);
  await page.waitForSelector('[data-testid="toggle-reminders"]');
  check(await page.locator('[data-testid="toggle-reminders"]').isChecked(), "в «Настройках» выключатель напоминаний включён");
  check((await checked(page, "reminder-time-1200")) === "true", "выбрано время 20:00");
  await page.click('[data-testid="reminder-time-480"]');
  await page.waitForFunction(() => document.querySelector('[data-testid="reminder-time-480"]')?.getAttribute("aria-checked") === "true");
  check(sqlRow(`SELECT minute FROM reminders WHERE user_id = ${STUDENT2}`)?.minute === 480, "время 8:00 сохранено");
  await page.fill('[data-testid="reminder-time-custom"]', "21:37");
  await page.waitForFunction(() => document.querySelector('[data-testid="reminder-time-1295"]')?.getAttribute("aria-checked") === "true");
  check(sqlRow(`SELECT minute FROM reminders WHERE user_id = ${STUDENT2}`)?.minute === 1295, "своё время 21:37 округлено до 21:35");
  check(await noOverflow(page), "«Настройки» с напоминаниями без горизонтальной прокрутки");
  await page.locator('[data-testid="toggle-reminders"]').scrollIntoViewIfNeeded();
  await shot(page, "r3-settings");
  await page.click('[data-testid="toggle-reminders"]');
  await page.waitForFunction(() => !document.querySelector('[data-testid="toggle-reminders"]')?.checked);
  check(sqlRow(`SELECT enabled, next_at FROM reminders WHERE user_id = ${STUDENT2}`)?.enabled === 0, "выключатель выключает напоминания");
  await page.click('[data-testid="toggle-reminders"]');
  await page.waitForSelector('[data-testid="reminders-message"]');
  check(sqlRow(`SELECT enabled FROM reminders WHERE user_id = ${STUDENT2}`)?.enabled === 1, "и снова включает");
  await page.context().close();
}

// ---------- Панель: тексты напоминаний ----------
await admin.click('header button[aria-label="Назад"]');
await admin.click('[data-testid="admin-open-reminders"]');
await admin.waitForSelector('[data-testid="reminder-kind-daily"]');
check((await admin.locator('[data-testid="reminder-kind-daily"] [data-testid^="reminder-"][data-testid$="-edit"]').count()) === 11, "11 ежедневных текстов из миграций (8 этапа 1 и 3 о повторении)");
check((await admin.locator('[data-testid="reminders-summary"]').textContent()).includes("1"), "видно, сколько учеников включили напоминания");
check(await noOverflow(admin), "раздел «Напоминания» без горизонтальной прокрутки");
await shot(admin, "r4-admin-texts");

await admin.click('[data-testid="reminder-add-daily"]');
await admin.fill('[data-testid="reminder-editor-text"]', "E2E привет, {name}");
await admin.click('[data-testid="reminder-editor-save"]');
check((await admin.locator('[data-testid="reminder-editor"] [role="alert"]').textContent()).includes("{name}"), "неизвестная подстановка: понятная ошибка до отправки");
await admin.fill('[data-testid="reminder-editor-text"]', "E2E привет, {имя}! Осталось {осталось_слов} сл.");
await admin.click('[data-testid="reminder-editor-save"]');
await admin.waitForSelector('[data-testid="reminders-admin-message"]');
const added = sqlRow("SELECT id FROM reminder_texts WHERE text LIKE 'E2E%'");
check(!!added?.id, "новый текст сохранён в базе");
await admin.click(`[data-testid="reminder-${added.id}-send"]`);
await admin.waitForFunction(() => document.querySelector('[data-testid="reminders-admin-message"]')?.textContent.includes("E2E привет, Tester"));
check(true, "«Прислать мне» подставляет данные администратора (локально без бота показывает текст)");
await admin.click(`[data-testid="reminder-${added.id}-toggle"]`);
await admin.waitForFunction((id) => document.querySelector(`[data-testid="reminder-${id}-toggle"]`)?.textContent.includes("Включить"), added.id);
check(sqlRow(`SELECT enabled FROM reminder_texts WHERE id = ${added.id}`)?.enabled === 0, "текст выключен");
await admin.click(`[data-testid="reminder-${added.id}-edit"]`);
await admin.fill('[data-testid="reminder-editor-text"]', "E2E изменённый текст");
await admin.click('[data-testid="reminder-editor-save"]');
await admin.waitForFunction((id) => document.querySelector(`[data-testid="reminder-${id}"]`)?.textContent.includes("E2E изменённый"), added.id);
check(true, "текст изменён");
dialogs.length = 0;
await admin.click(`[data-testid="reminder-${added.id}-delete"]`);
await admin.waitForFunction((id) => !document.querySelector(`[data-testid="reminder-${id}"]`), added.id);
check(dialogs.some((d) => d.includes("Удалить")), "удаление спрашивает подтверждение");

await admin.click('header button[aria-label="Назад"]');
await admin.click('[data-testid="admin-open-log"]');
await admin.waitForSelector('[data-testid="log-list"]');
const log = await admin.locator('[data-testid="log-list"]').textContent();
check(log.includes("Напоминания от бота: Выкл. → Все"), "в журнале включение напоминаний");
check(log.includes("Новый текст напоминания") && log.includes("Удалён текст напоминания"), "в журнале изменения текстов");
await admin.context().close();

await browser.close();
await modeOff();
reset();

if (failures.length > 0) {
  console.error(`\nОшибок: ${failures.length}`);
  for (const f of failures) console.error(` - ${f}`);
  process.exit(1);
}
console.log("\nНапоминания: все проверки прошли");

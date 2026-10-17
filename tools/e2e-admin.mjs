// Сквозная проверка панели администратора (docs/ADMIN.md, этап 1) в настоящем браузере на размере телефона.
// Нужен запущенный локальный Worker со свежей сборкой (как для tools/e2e-lesson.mjs, см. docs/DEPLOY.md).
// В env.local владелец это тестовый пользователь 1001 (TEMPLATE_RECORDER_IDS в wrangler.jsonc), ученик 1002.
// Запуск: node tools/e2e-admin.mjs [каталог для скриншотов]
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync } from "node:fs";
import { chromium } from "playwright-core";

const BASE = process.env.BASE ?? "http://localhost:8787";
const SHOTS = process.argv[2] ?? "e2e-shots/admin";
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
const HELPER = 1003;
const dev = (id) => ({ authorization: `dev ${id}:Tester` });

// Чистое состояние: настройки по умолчанию, пустая команда и журнал. В конце то же самое, чтобы не мешать другим тестам.
const reset = () => sql("DELETE FROM app_config; DELETE FROM staff; DELETE FROM admin_log; DELETE FROM daily_stats;");
reset();

const browser = await chromium.launch({ executablePath: findChromium(), args: ["--no-sandbox"] });
const dialogs = [];

async function openPage(id, width = 360) {
  const context = await browser.newContext({ viewport: { width, height: 780 }, deviceScaleFactor: 2 });
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
const text = async (page, id) => ((await page.locator(`[data-testid="${id}"]`).textContent()) ?? "").trim();

async function openSettings(page) {
  await page.waitForSelector('[data-testid="open-settings"]');
  await page.locator('[data-testid="open-settings"]').first().click();
  await page.waitForSelector('[data-testid="settings"]');
}

const scriptUrls = (page) => page.evaluate(() => performance.getEntriesByType("resource").map((e) => e.name).filter((n) => n.endsWith(".js")));

// ---------- Ученик: свой id виден, панели нет ----------
{
  const page = await openPage(STUDENT);
  await openSettings(page);
  check((await text(page, "my-telegram-id")) === `${STUDENT}`, "в «Настройках» виден свой Telegram id");
  check((await page.locator('[data-testid="open-admin"]').count()) === 0, "у ученика нет пункта «Панель администратора»");
  check((await page.locator('[data-testid="staff-role"]').count()) === 0, "у ученика нет строки о команде");
  check(!(await scriptUrls(page)).some((u) => /\/Admin-|\/Record-/.test(u)), "код панели и записи шаблонов ученику не загружается");
  check(await noOverflow(page), "«Настройки» без горизонтальной прокрутки на 360 px");
  await shot(page, "a1-student-settings");
  for (const path of ["/api/admin/overview", "/api/admin/config", "/api/admin/team", "/api/admin/log"]) {
    check((await page.request.get(`${BASE}${path}`, { headers: dev(STUDENT) })).status() === 403, `ученику ${path} отвечает 403`);
  }
  check((await page.request.get(`${BASE}/api/admin/overview`)).status() === 401, "без входа панель отвечает 401");
  await page.context().close();
}

// ---------- Владелец ----------
const page = await openPage(OWNER);
await openSettings(page);
check((await text(page, "staff-role")).includes("владелец"), "владелец видит, что он в команде");
await page.click('[data-testid="open-admin"]');
await page.waitForSelector('[data-testid="admin-menu"]');
check((await scriptUrls(page)).some((u) => /\/Admin-/.test(u)), "код панели подгружается отдельным файлом при входе в панель");
check((await page.locator('[data-testid^="admin-open-"]').count()) === 7, "в меню панели 7 разделов (обзор, настройки, напоминания, контент, команда, журнал, шаблоны)");
check(await noOverflow(page), "меню панели без горизонтальной прокрутки");
await shot(page, "a2-menu");

// Обзор.
await page.click('[data-testid="admin-open-overview"]');
await page.waitForSelector('[data-testid="overview-today"]');
check((await page.locator('[data-testid="overview-days"] tbody tr').count()) === 14, "в обзоре 14 прошедших дней");
check(/Открывали\s*[1-9]/.test(await text(page, "overview-today")), "сегодня открывали приложение (хотя бы владелец)");
check(await noOverflow(page), "обзор без горизонтальной прокрутки на 360 px");
await shot(page, "a3-overview");
// «Назад» из раздела ведёт в меню панели.
await page.click('header button[aria-label="Назад"]');
await page.waitForSelector('[data-testid="admin-menu"]');
check(true, "«назад» из раздела возвращает в меню панели");

// Настройки приложения: таблица лидеров «только команда».
await page.click('[data-testid="admin-open-config"]');
await page.waitForSelector('[data-testid="config-leaderboard-all"]');
check((await page.locator('[data-testid="config-leaderboard-all"]').getAttribute("aria-checked")) === "true", "по умолчанию таблица лидеров «Все» (как LEADERBOARD_ENABLED)");
check((await text(page, "config-leaderboard-meta")).includes("по умолчанию"), "подпись «значение по умолчанию»");
await page.click('[data-testid="config-leaderboard-team"]');
await page.waitForSelector('[data-testid="config-message"]');
check((await text(page, "config-message")).includes("Команда"), "сохранено: таблица лидеров только для команды");
const featureOf = async (id) => (await (await page.request.get(`${BASE}/api/me`, { headers: dev(id) })).json()).play.features.leaderboard;
check((await featureOf(STUDENT)) === false, "ученик таблицу больше не видит");
check((await featureOf(OWNER)) === true, "владелец (команда) таблицу видит");
check((await page.request.get(`${BASE}/api/leaderboard?board=week`, { headers: dev(STUDENT) })).status() === 404, "ученику /api/leaderboard 404");
await page.click('[data-testid="config-leaderboard-all"]');
await page.waitForFunction(() => document.querySelector('[data-testid="config-leaderboard-all"]')?.getAttribute("aria-checked") === "true");
check((await featureOf(STUDENT)) === true, "снова «Все»: ученик видит таблицу");
// Выключение для всех спрашивает подтверждение.
dialogs.length = 0;
await page.click('[data-testid="config-leaderboard-off"]');
await page.waitForFunction(() => document.querySelector('[data-testid="config-leaderboard-off"]')?.getAttribute("aria-checked") === "true");
check(dialogs.some((d) => d.includes("Выключить")), "выключение для всех спрашивает подтверждение");
await page.click('[data-testid="config-leaderboard-all"]');
await page.waitForFunction(() => document.querySelector('[data-testid="config-leaderboard-all"]')?.getAttribute("aria-checked") === "true");
// Цель дня для новых учеников.
await page.click('[data-testid="config-defaultDailyGoal-10"]');
await page.waitForFunction(() => document.querySelector('[data-testid="config-defaultDailyGoal-10"]')?.getAttribute("aria-checked") === "true");
const newcomer = await (await page.request.get(`${BASE}/api/me`, { headers: dev(1009) })).json();
check(newcomer.play.settings.dailyGoal === 10, "новый ученик получает цель дня 10");
await page.click('[data-testid="config-defaultDailyGoal-5"]');
await page.waitForFunction(() => document.querySelector('[data-testid="config-defaultDailyGoal-5"]')?.getAttribute("aria-checked") === "true");
check(await noOverflow(page), "настройки приложения без горизонтальной прокрутки");
await shot(page, "a4-config");
await page.click('header button[aria-label="Назад"]');

// Команда: добавить проверяющего, сделать администратором, убрать.
await page.click('[data-testid="admin-open-team"]');
await page.waitForSelector('[data-testid="team-list"]');
check((await page.locator(`[data-testid="member-${OWNER}"]`).textContent()).includes("Владелец"), "владелец в списке команды с пометкой");
check((await page.locator(`[data-testid="member-${OWNER}-remove"]`).count()) === 0, "владельца убрать нельзя (кнопки нет)");
await page.fill('[data-testid="team-id"]', "abc");
await page.click('[data-testid="team-add"]');
check((await text(page, "team-message")).includes("цифрами"), "неверный id: подсказка про цифры");
await page.fill('[data-testid="team-id"]', ` ${HELPER} `);
await page.click('[data-testid="team-add"]');
await page.waitForSelector(`[data-testid="member-${HELPER}"]`);
check((await page.locator(`[data-testid="member-${HELPER}"]`).textContent()).includes("Проверяющий"), "добавлен проверяющий по id");
const helperMe = await (await page.request.get(`${BASE}/api/me`, { headers: dev(HELPER) })).json();
check(helperMe.staff?.role === "reviewer", "/api/me сообщает проверяющему его роль");
check((await page.request.get(`${BASE}/api/admin/overview`, { headers: dev(HELPER) })).status() === 403, "проверяющему панель пока закрыта (403)");
dialogs.length = 0;
await page.click(`[data-testid="member-${HELPER}-role"]`);
await page.waitForFunction((id) => document.querySelector(`[data-testid="member-${id}"]`)?.textContent.includes("Администратор"), HELPER);
check(dialogs.some((d) => d.includes("администратором")), "назначение администратором спрашивает подтверждение");
check((await page.request.get(`${BASE}/api/admin/overview`, { headers: dev(HELPER) })).status() === 200, "новому администратору панель открыта");
check(await noOverflow(page), "команда без горизонтальной прокрутки");
await shot(page, "a5-team");

// Новый администратор видит пункт в «Настройках», но не может изменить владельца и себя.
{
  const other = await openPage(HELPER);
  await openSettings(other);
  check((await other.locator('[data-testid="open-admin"]').count()) === 1, "администратор видит «Панель администратора»");
  await other.click('[data-testid="open-admin"]');
  await other.click('[data-testid="admin-open-team"]');
  await other.waitForSelector('[data-testid="team-list"]');
  check((await other.locator(`[data-testid="member-${HELPER}-remove"]`).count()) === 0, "себя убрать нельзя (кнопки нет)");
  const res = await other.request.delete(`${BASE}/api/admin/team?userId=${OWNER}`, { headers: dev(HELPER) });
  check(res.status() === 409, "владельца нельзя убрать даже запросом (409)");
  await other.context().close();
}

dialogs.length = 0;
await page.click(`[data-testid="member-${HELPER}-remove"]`);
await page.waitForFunction((id) => !document.querySelector(`[data-testid="member-${id}"]`), HELPER);
check(dialogs.some((d) => d.includes("Убрать")), "удаление из команды спрашивает подтверждение");
check((await page.request.get(`${BASE}/api/admin/overview`, { headers: dev(HELPER) })).status() === 403, "убранному панель снова закрыта");
await page.click('header button[aria-label="Назад"]');

// Журнал.
await page.click('[data-testid="admin-open-log"]');
await page.waitForSelector('[data-testid="log-list"]');
const log = await text(page, "log-list");
check(log.includes("Таблица лидеров: Все → Команда"), "в журнале изменение таблицы лидеров");
check(log.includes(`Добавлен в команду: id ${HELPER}, проверяющий`), "в журнале добавление в команду");
check(log.includes(`Убран из команды: id ${HELPER}`), "в журнале удаление из команды");
check(await noOverflow(page), "журнал без горизонтальной прокрутки");
await shot(page, "a6-log");
await page.click('header button[aria-label="Назад"]');

// Шаблоны букв открываются из панели, «назад» возвращает в панель.
await page.click('[data-testid="admin-open-record"]');
await page.waitForSelector('[data-testid="record-summary"]');
check(true, "«Шаблоны букв» открывают экран записи");
await page.click('header button[aria-label="Назад"]');
await page.waitForSelector('[data-testid="admin-menu"]');
check(true, "«назад» с записи шаблонов ведёт в панель");

// После перезагрузки панель остаётся открытой.
await page.reload();
await page.waitForSelector('[data-testid="admin-menu"]');
check(true, "после перезагрузки остаёмся в панели");

// Тёмная тема: обзор читается.
await page.evaluate(() => document.documentElement.setAttribute("data-theme", "dark"));
await page.click('[data-testid="admin-open-overview"]');
await page.waitForSelector('[data-testid="overview-today"]');
await shot(page, "a7-overview-dark");

// Ученик, у которого сохранён экран панели (например, роль сняли), видит «Нет доступа», а не пустую панель.
{
  const student = await openPage(STUDENT);
  await student.evaluate(() => sessionStorage.setItem("milav:screen", JSON.stringify({ name: "admin" })));
  await student.reload();
  await student.waitForSelector('[data-testid="my-id"]');
  check((await student.locator("body").textContent()).includes("Нет доступа"), "ученику на экране панели «Нет доступа»");
  await student.context().close();
}

// Викторина до изучения слов: кнопка только у администратора (решение владельца 17.10).
{
  const LESSON = "colors-1";
  for (const id of [OWNER, STUDENT]) sql(`DELETE FROM word_progress WHERE user_id = ${id} AND lesson_id = '${LESSON}';`);
  const openLesson = async (p) => {
    await p.evaluate((l) => sessionStorage.setItem("milav:screen", JSON.stringify({ name: "study", lessonId: l })), LESSON);
    await p.reload();
    await p.waitForSelector('[data-testid="quiz-locked"]');
  };
  const student = await openPage(STUDENT);
  await openLesson(student);
  check((await student.locator('[data-testid="open-quiz-admin"]').count()) === 0, "у ученика нет кнопки викторины до изучения слов");
  check((await student.request.post(`${BASE}/api/quiz/start`, { headers: dev(STUDENT), data: { lessonId: LESSON } })).status() === 409, "ученику сервер не даёт начать викторину (409)");
  await student.context().close();

  const owner = await openPage(OWNER);
  await openLesson(owner);
  await shot(owner, "a8-quiz-admin-button");
  await owner.click('[data-testid="open-quiz-admin"]');
  await owner.waitForSelector('[data-testid="option"], [data-testid="prompt"]');
  check(true, "администратор открыл викторину до изучения слов");
  await owner.context().close();
}

await browser.close();
reset();

if (failures.length > 0) {
  console.error(`\nОшибок: ${failures.length}`);
  for (const f of failures) console.error(` - ${f}`);
  process.exit(1);
}
console.log("\nПанель администратора: все проверки прошли");

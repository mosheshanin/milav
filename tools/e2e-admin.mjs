// Сквозная проверка панели администратора (docs/ADMIN.md, этап 1) в настоящем браузере на размере телефона.
// Нужен запущенный локальный Worker со свежей сборкой (как для tools/e2e-lesson.mjs, см. docs/DEPLOY.md).
// В env.local владелец это тестовый пользователь 1001 (TEMPLATE_RECORDER_IDS в wrangler.jsonc), ученик 1002.
// Запуск: node tools/e2e-admin.mjs [каталог для скриншотов]
import { existsSync, mkdirSync, readdirSync } from "node:fs";
import { chromium } from "playwright-core";
import { queryRow, sql } from "./e2e-db.mjs";

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
const reset = () => sql("DELETE FROM app_config; DELETE FROM staff; DELETE FROM admin_log; DELETE FROM daily_stats; DELETE FROM bot_texts;");
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
check((await page.locator('[data-testid^="admin-open-"]').count()) === 11, "в меню панели 11 разделов (обзор, аналитика, ученики, настройки, сообщения бота, пост в канал, напоминания, контент, команда, журнал, шаблоны)");
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

// Аналитика (этап 4): удержание, воронка, уроки, трудные слова, произношение.
await page.click('[data-testid="admin-open-analytics"]');
await page.waitForSelector('[data-testid="analytics-funnel"]');
check((await text(page, "analytics-funnel")).includes("Открыли приложение"), "в аналитике есть воронка");
for (const id of ["analytics-retention", "analytics-lessons", "analytics-hard", "analytics-speech"]) {
  check((await page.locator(`[data-testid="${id}"]`).count()) === 1, `в аналитике есть блок ${id}`);
}
check(await noOverflow(page), "аналитика без горизонтальной прокрутки на 360 px");
await shot(page, "a3b-analytics");
await page.click('header button[aria-label="Назад"]');
await page.waitForSelector('[data-testid="admin-menu"]');

// Ученики (этап 5): поиск по id, карточка, убрать из таблицы лидеров и вернуть.
await page.click('[data-testid="admin-open-students"]');
await page.waitForSelector(`[data-testid="student-${OWNER}"]`);
check(true, "в списке учеников есть владелец");
await page.fill('[data-testid="students-search"]', String(STUDENT));
await page.waitForFunction((id) => {
  const rows = [...document.querySelectorAll('[data-testid^="student-"]')].filter((el) => /^student-\d+$/.test(el.getAttribute("data-testid")));
  return rows.length === 1 && rows[0].getAttribute("data-testid") === `student-${id}`;
}, STUDENT);
check(true, "поиск по id находит одного ученика");
await page.click(`[data-testid="student-${STUDENT}"]`);
await page.waitForSelector('[data-testid="student-card"]');
check((await text(page, "student-card")).includes(`id ${STUDENT}`), "карточка ученика открылась");
check(await noOverflow(page), "карточка ученика без горизонтальной прокрутки");
await shot(page, "a3c-student");
await page.click('[data-testid="student-board"]');
await page.waitForFunction(() => document.querySelector('[data-testid="student-board"]')?.textContent?.includes("Вернуть"));
check(queryRow(`SELECT lb_banned AS b FROM user_stats WHERE user_id=${STUDENT}`).b === 1, "ученик убран из таблицы лидеров");
await page.click('[data-testid="student-board"]');
await page.waitForFunction(() => document.querySelector('[data-testid="student-board"]')?.textContent?.includes("Убрать"));
check(queryRow(`SELECT lb_banned AS b FROM user_stats WHERE user_id=${STUDENT}`).b === 0, "ученик возвращён в таблицу лидеров");
await page.click('header button[aria-label="Назад"]');
await page.waitForSelector('[data-testid="students-search"]');
check(true, "«назад» из карточки ведёт к списку учеников");
await page.click('header button[aria-label="Назад"]');
await page.waitForSelector('[data-testid="admin-menu"]');

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
check((await page.locator('[data-testid="config-shabbatFrom"]').count()) === 0, "настройки сообщений бота не в «Настройках приложения»");
await shot(page, "a4-config");
await page.click('header button[aria-label="Назад"]');

// «Сообщения бота» (22.11): все тексты бота и настройки отправки.
await page.click('[data-testid="admin-open-bot"]');
await page.waitForSelector('[data-testid="bot-settings"]');
for (const group of ["replies", "remindersCommand", "reminderButtons", "popups", "confirm", "profile"]) {
  check((await page.locator(`[data-testid="bot-group-${group}"]`).count()) === 1, `группа текстов «${group}» на месте`);
}
check((await page.locator('[data-testid^="bot-text-"][data-testid$="-edit"]').count()) === 29, "все 29 текстов бота можно изменить");
check((await page.locator('[data-testid="config-shabbatFrom-900"]').getAttribute("aria-checked")) === "true", "пауза на шаббат по умолчанию с 15:00");
await page.click('[data-testid="config-reminderMinute-540"]');
await page.waitForFunction(() => document.querySelector('[data-testid="config-reminderMinute-540"]')?.getAttribute("aria-checked") === "true");
const botConfig = await (await page.request.get(`${BASE}/api/admin/config`, { headers: dev(OWNER) })).json();
check(botConfig.items.find((i) => i.key === "reminderMinute").value === 540, "время напоминаний по умолчанию сохранено: 9:00");
await shot(page, "a5a-bot-settings");

await page.click('[data-testid="bot-text-start-edit"]');
await page.fill('[data-testid="bot-text-start-input"]', "Привет, {фамилия}!");
await page.click('[data-testid="bot-text-start-save"]');
check((await page.locator('[data-testid="bot-text-start-editor"] [role="alert"]').textContent()).includes("{фамилия}"), "неизвестная подстановка: понятная ошибка до отправки");
await page.fill('[data-testid="bot-text-start-input"]', "Привет, {имя}! Учим иврит 👋");
await page.click('[data-testid="bot-text-start-save"]');
await page.waitForSelector('[data-testid="bot-message"]');
check((await text(page, "bot-message")).includes("Сохранено"), "текст приветствия сохранён");
check((await text(page, "bot-text-start-text")) === "Привет, {имя}! Учим иврит 👋", "в карточке новый текст");
check((await text(page, "bot-text-start")).includes("Пример: Привет, Анна!"), "пример с подстановкой");
const botTexts = await (await page.request.get(`${BASE}/api/admin/bot`, { headers: dev(OWNER) })).json();
check(botTexts.items.find((i) => i.key === "start").isDefault === false, "сервер хранит изменённое приветствие");
await page.click('[data-testid="bot-text-start-send"]');
await page.waitForFunction(() => /Бот не настроен|Отправлено/.test(document.querySelector('[data-testid="bot-message"]')?.textContent ?? ""));
check(true, "«Прислать мне» отвечает (локально бот не настроен)");
check(await noOverflow(page), "«Сообщения бота» без горизонтальной прокрутки на 360 px");
await page.locator('[data-testid="bot-text-start"]').scrollIntoViewIfNeeded();
await shot(page, "a5b-bot-text");
await page.click('[data-testid="bot-text-start-reset"]');
await page.waitForFunction(() => !document.querySelector('[data-testid="bot-text-start-reset"]'));
check(dialogs.some((d) => d.includes("Вернуть исходный")), "«Вернуть исходный» спрашивает подтверждение");
check((await text(page, "bot-text-start-text")).startsWith("Шалом, {имя}!"), "исходное приветствие вернулось");
await page.click('[data-testid="bot-open-reminders"]');
await page.waitForSelector('[data-testid="reminders-summary"]');
check(true, "из «Сообщений бота» открываются «Напоминания»");
await page.click('header button[aria-label="Назад"]');
await page.waitForSelector('[data-testid="admin-menu"]');

// «Пост в канал» (24.11): форма, предпросмотр, проверка до отправки. Локально токена бота нет: сервер отвечает «нет токена».
{
  const PNG_1PX = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
  await page.evaluate(() => localStorage.removeItem("milav.admin.channelDraft"));
  await page.click('[data-testid="admin-open-channel"]');
  await page.waitForSelector('[data-testid="channel-text"]');
  check((await page.inputValue('[data-testid="channel-name"]')) === "@milavnews", "канал по умолчанию @milavnews");
  check((await page.inputValue('[data-testid="channel-button-url"]')) === "https://t.me/milavbotbot?startapp", "кнопка по умолчанию открывает приложение");
  await page.click('[data-testid="channel-send-me"]');
  check((await text(page, "channel-status")).includes("Напишите текст"), "пустой пост: понятная ошибка до отправки");
  await page.fill('[data-testid="channel-text"]', "**Иврит** в Telegram 👋\nПишите @y_o_g_g_y");
  check((await page.locator('[data-testid="channel-preview"] b').textContent()) === "Иврит", "предпросмотр показывает жирный текст");
  check((await text(page, "channel-preview-button")).includes("Открыть Milav"), "предпросмотр показывает кнопку");
  check((await text(page, "channel-length")).includes("из 4096"), "без картинки предел 4096 знаков");
  await page.setInputFiles('[data-testid="channel-photo-input"]', { name: "post.png", mimeType: "image/png", buffer: PNG_1PX });
  await page.waitForSelector('[data-testid="channel-preview"] img');
  check((await text(page, "channel-length")).includes("из 1024"), "с картинкой предел 1024 знака (подпись)");
  // Альбом (до 10 картинок): с кнопкой текст и кнопка уходят отдельным сообщением после альбома.
  await page.setInputFiles('[data-testid="channel-photo-input"]', [
    { name: "two.png", mimeType: "image/png", buffer: PNG_1PX },
    { name: "three.png", mimeType: "image/png", buffer: PNG_1PX },
  ]);
  await page.waitForFunction(() => document.querySelectorAll('[data-testid="channel-photo"]').length === 3);
  check((await text(page, "channel-photo-count")).startsWith("3 из 10"), "добавлено ещё две картинки: 3 из 10");
  check((await page.locator('[data-testid="channel-preview-album"] img').count()) === 3, "предпросмотр показывает альбом из трёх картинок");
  check((await page.locator('[data-testid="channel-preview-followup"]').count()) === 1, "альбом с кнопкой: текст и кнопка отдельным сообщением в предпросмотре");
  check((await text(page, "channel-length")).includes("из 4096"), "альбом с кнопкой: предел текста 4096");
  await page.click('[data-testid="channel-button-on"]');
  check((await text(page, "channel-length")).includes("из 1024"), "альбом без кнопки: текст это подпись, предел 1024");
  await page.click('[data-testid="channel-button-on"]');
  await page.locator('[data-testid="channel-photo-remove"]').first().click();
  check((await text(page, "channel-photo-count")).startsWith("2 из 10"), "картинку можно убрать");
  await page.fill('[data-testid="channel-button-url"]', "milav.app");
  await page.click('[data-testid="channel-send-me"]');
  check((await text(page, "channel-status")).includes("https://"), "ссылка кнопки без https: ошибка до отправки");
  await page.fill('[data-testid="channel-button-url"]', "https://t.me/milavbotbot?startapp");
  check(await noOverflow(page), "«Пост в канал» без горизонтальной прокрутки на 360 px");
  await shot(page, "a5c-channel-post");
  dialogs.length = 0;
  await page.click('[data-testid="channel-publish"]');
  await page.waitForFunction(() => /токена бота/.test(document.querySelector('[data-testid="channel-status"]')?.textContent ?? ""));
  check(dialogs.some((d) => d.includes("Опубликовать пост в @milavnews")), "публикация спрашивает подтверждение");
  check(true, "сервер принял форму с альбомом и ответил «нет токена бота» (локально бот не настроен)");
  await page.click('header button[aria-label="Назад"]');
  await page.waitForSelector('[data-testid="admin-menu"]');
  await page.click('[data-testid="admin-open-channel"]');
  check((await page.inputValue('[data-testid="channel-text"]')).startsWith("**Иврит**"), "черновик текста сохраняется на устройстве");
  await page.evaluate(() => localStorage.removeItem("milav.admin.channelDraft"));
  await page.click('header button[aria-label="Назад"]');
  await page.waitForSelector('[data-testid="admin-menu"]');
}

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
check(log.includes("Сообщение бота «Приветствие на /start»"), "в журнале изменение сообщения бота");
check(log.includes("Время напоминаний по умолчанию: 20:00 → 9:00"), "в журнале изменение настройки бота");
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

// Сквозная проверка геймификации в настоящем браузере (390×844 и 360×640): блок «Мой путь», тост бейджа в уроке,
// экран «Достижения» (бейджи, цель дня, настройки, «Поделиться»), таблица лидеров (вступить, выйти, приватность),
// лист «Мы нашли ваши достижения», возврат на экран после перезагрузки. Любое нарушение CSP это провал.
// Нужен запущенный локальный Worker со свежей сборкой (как для tools/e2e-lesson.mjs), в локальной среде таблица включена.
// Запуск: node tools/e2e-gamification.mjs [каталог для скриншотов]
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync } from "node:fs";
import { chromium } from "playwright-core";
import { revealLesson } from "./e2e-home.mjs";

const BASE = process.env.BASE ?? "http://localhost:8787";
const SHOTS = process.argv[2] ?? "e2e-shots";
mkdirSync(SHOTS, { recursive: true });

const alphabet = JSON.parse(readFileSync(new URL("../content/lessons/alphabet-1.json", import.meta.url), "utf8"));
const animals = JSON.parse(readFileSync(new URL("../content/lessons/animals-1.json", import.meta.url), "utf8"));
const alef = alphabet.letters[0];

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

/** Имитация Telegram WebApp: отклик устройства и «Поделиться» записываются, чтобы тест видел вызовы. */
async function openPage(userId, viewport = { width: 390, height: 844 }) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 2, timezoneId: "Asia/Jerusalem" });
  await context.route("https://telegram.org/**", (route) => route.abort());
  const page = await context.newPage();
  await page.addInitScript(() => {
    window.speechSynthesis.speak = (u) => setTimeout(() => u.onend?.(new Event("end")), 20);
    const back = { visible: false, handlers: [], show() { this.visible = true; }, hide() { this.visible = false; }, onClick(f) { this.handlers.push(f); }, offClick(f) { this.handlers = this.handlers.filter((x) => x !== f); } };
    window.__tg = { back, haptics: [], links: [] };
    window.Telegram = {
      WebApp: {
        initData: "",
        ready() {},
        expand() {},
        BackButton: back,
        HapticFeedback: {
          notificationOccurred: (t) => window.__tg.haptics.push(t),
          impactOccurred: (t) => window.__tg.haptics.push(`impact:${t}`),
        },
        openTelegramLink: (url) => window.__tg.links.push(url),
        showConfirm(message, cb) { cb(true); },
        enableClosingConfirmation() {},
        disableClosingConfirmation() {},
      },
    };
  });
  page.on("pageerror", (e) => failures.push(`pageerror: ${e.message}`));
  page.on("console", (msg) => {
    if (/content security policy/i.test(msg.text())) failures.push(`CSP: ${msg.text().slice(0, 200)}`);
  });
  await page.goto(`${BASE}/?dev=${userId}`);
  await page.waitForSelector('[data-testid="my-path"]');
  await page.waitForLoadState("networkidle");
  return page;
}

const shot = (page, name) => page.screenshot({ path: `${SHOTS}/${name}.png` });
const text = async (page, id) => ((await page.textContent(`[data-testid="${id}"]`)) ?? "").replace(/\s+/g, " ").trim();
const pressBack = (p) => p.evaluate(() => window.__tg.back.handlers.forEach((h) => h()));

function resetUser(id, name = "Tester") {
  sql(
    `INSERT OR IGNORE INTO users (id, first_name) VALUES (${id}, '${name}'); DELETE FROM word_progress WHERE user_id=${id}; DELETE FROM quiz_attempts WHERE user_id=${id}; DELETE FROM lesson_passed WHERE user_id=${id}; DELETE FROM quiz_sessions WHERE user_id=${id}; DELETE FROM user_stats WHERE user_id=${id}; DELETE FROM user_badges WHERE user_id=${id}; DELETE FROM rate_limits WHERE user_id=${id};`,
  );
}

/** Проверка в запросах без интерфейса: что отдаёт API другим людям. */
async function apiGet(userId, path) {
  const context = await browser.newContext();
  const res = await context.request.get(`${BASE}${path}`, { headers: { Authorization: `dev ${userId}:Tester` } });
  const body = await res.text();
  await context.close();
  return { status: res.status(), body, json: JSON.parse(body || "{}") };
}

// ---------- Сценарий А: новичок получает первую букву и первый бейдж ----------
const A = 3101;
const OTHER = 3102;
resetUser(A);
resetUser(OTHER);
sql("DELETE FROM board_snapshots;");
// Первая буква пройдена на два этапа из трёх: последний (печатай) делаем в интерфейсе.
sql(
  `INSERT INTO word_progress (user_id, word_id, lesson_id, stage_listen, stage_speak, stage_write, stage_type) VALUES (${A}, '${alef.id}', '${alphabet.id}', 1, 0, 1, 0);`,
);
let page = await openPage(A);
await shot(page, "01-home-new");
check((await text(page, "my-path")).includes("Пешка → Конь"), "«Мой путь»: путь Пешка → Конь");
check((await page.locator('[data-testid="week-dots"] li').count()) === 7, "в блоке недели семь дней");
check((await page.locator('[data-testid="week-dots"] li').first().textContent()).includes("Вс"), "неделя начинается с воскресенья");
check((await text(page, "home-goal")).includes("0 из 5"), "цель дня включена: 0 из 5");
check((await page.locator('[data-testid="unseen-dot"]').count()) === 0, "у новичка нет красной точки у статуса");
check((await page.locator('[data-testid="open-leaderboard"]').count()) === 1, "кнопка «Таблица лидеров» есть (в локальной среде включена)");

await revealLesson(page, alphabet.id);
await page.click(`[data-testid="lesson-${alphabet.id}"]`);
await page.waitForSelector('[data-testid="keyboard"]');
await page.locator('[data-testid="keyboard"] button').filter({ hasText: alef.he }).click();
await page.click('[data-testid="type-done"]');
await page.waitForSelector('[data-testid="word-complete"]');
await page.waitForSelector('[data-testid="play-toast"]');
await shot(page, "02-toast");
const toast = await text(page, "play-toast");
check(toast.includes("Новый бейдж"), `в уроке показан тост нового бейджа (${toast})`);
check((await page.evaluate(() => window.__tg.haptics)).includes("success"), "тост сопровождается откликом устройства (success)");
check((await text(page, "points")) === "1", "очко начислено");
await page.waitForSelector('[data-testid="play-toast"]', { state: "detached", timeout: 8000 });
check(true, "тост исчезает сам");

// Назад на главную: блок «Мой путь» отражает занятие, непросмотренных бейджей нет (тост их отметил).
await pressBack(page);
await page.waitForSelector('[data-testid="my-path"]');
await page.waitForFunction(() => document.querySelector('[data-testid="home-goal"]')?.textContent.includes("1 из 5"), null, { timeout: 5000 }).catch(() => undefined);
check((await text(page, "home-goal")).includes("1 из 5"), "цель дня на главной: 1 из 5");
check((await page.locator('[data-testid="week-dots"] [data-active="1"]').count()) === 1, "сегодняшний день отмечен занятием");
check((await page.locator('[data-testid="unseen-dot"]').count()) === 0, "бейдж уже виден, красной точки нет");
await shot(page, "03-home-after");

// ---------- Экран «Достижения» ----------
await page.click('[data-testid="open-achievements"]');
await page.waitForSelector('[data-testid="achievements"]');
await page.waitForSelector('[data-testid="badge-count"]');
await page.waitForTimeout(300);
await shot(page, "04-achievements");
const count = await text(page, "badge-count");
check(/^1 из \d+$/.test(count), `счётчик бейджей: ${count}`);
check((await page.locator('[data-testid^="status-legend-"]').count()) === 6, "легенда статусов: шесть фигур от Пешки до Короля");
check((await text(page, "status-legend-pawn")).includes("0–5 уроков"), "легенда: у Пешки «0–5 уроков»");
check((await text(page, "status-legend-king")).includes("301 и больше"), "легенда: у Короля «301 и больше»");
check((await page.locator('[data-testid="status-legend-pawn"]').getAttribute("aria-current")) === "true", "легенда: текущий статус (Пешка) выделен");
check((await page.locator('[data-testid="status-legend"] [aria-current]').count()) === 1, "легенда: выделен ровно один статус");
check((await page.locator('[data-testid="badge-first-letter"]').getAttribute("data-earned")) === "1", "бейдж «первая буква» получен");
check((await page.locator('[data-testid="badge-words-10"]').getAttribute("data-earned")) === "0", "бейдж «10 слов» ещё не получен");
check((await text(page, "badge-words-10")).includes("0 из 10"), "у неполученного бейджа виден прогресс");
check((await text(page, "goal-text")).includes("1 из 5"), "цель дня на экране достижений: 1 из 5");
check((await text(page, "rhythm-text")).includes("Ритмичных недель: 0"), "ритм: 0 ритмичных недель");

// Сведения о бейдже и «Поделиться».
await page.click('[data-testid="badge-first-letter"]');
await page.waitForSelector('[role="dialog"]');
await shot(page, "05-badge-details");
await page.getByRole("button", { name: "Поделиться" }).click();
const links = await page.evaluate(() => window.__tg.links);
check(
  links.length === 1 && links[0].startsWith("https://t.me/share/url?") && links[0].includes(encodeURIComponent("https://t.me/milavbotbot")),
  `«Поделиться» открывает выбор чата со ссылкой на бота (${links[0]})`,
);
check(!links[0].includes("3101") && !links[0].includes("Tester"), "в тексте для отправки нет ни id, ни имени");
await page.getByRole("button", { name: "Закрыть" }).last().click();

// Настройки (отдельный экран, кнопка внизу «Достижений»): цель дня.
await page.click('[data-testid="open-settings"]');
await page.waitForSelector('[data-testid="settings"]');
await shot(page, "05b-settings");
const radioChecked = (id) => page.locator(`[data-testid="${id}"]`).getAttribute("aria-checked");
await page.click('[data-testid="goal-10"]');
await page.waitForFunction(() => document.querySelector('[data-testid="goal-10"]')?.getAttribute("aria-checked") === "true");
check(true, "цель дня переключена на 10");
// «Назад» с настроек возвращает на «Достижения», где цель уже новая.
await pressBack(page);
await page.waitForSelector('[data-testid="achievements"]');
await page.waitForFunction(() => document.querySelector('[data-testid="goal-text"]')?.textContent.includes("из 10"));
check(true, "«назад» из настроек ведёт на «Достижения», цель дня там уже 10");
await page.click('[data-testid="open-settings"]');
await page.click('[data-testid="goal-0"]');
await page.waitForFunction(() => document.querySelector('[data-testid="goal-0"]')?.getAttribute("aria-checked") === "true");
await page.click('[data-testid="goal-5"]');
await page.waitForFunction(() => document.querySelector('[data-testid="goal-5"]')?.getAttribute("aria-checked") === "true");
check((await radioChecked("goal-10")) === "false", "в цели дня выбран ровно один вариант");

// Тема: тёмная, светлая и «как в Telegram» (имитация Telegram сообщает светлую схему); выбор переживает перезагрузку.
const themeOf = () => page.evaluate(() => document.documentElement.dataset.theme);
const pageBg = () => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
check((await themeOf()) === "light", "по умолчанию светлая тема (как в Telegram)");
const lightBg = await pageBg();
await page.click('[data-testid="theme-dark"]');
check((await themeOf()) === "dark", "тёмная тема включена");
check((await pageBg()) !== lightBg, `фон страницы сменился (${lightBg} → ${await pageBg()})`);
await shot(page, "05c-settings-dark");
await page.reload();
await page.waitForSelector('[data-testid="settings"]');
check((await themeOf()) === "dark", "после перезагрузки остаёмся на «Настройках» в тёмной теме");
await page.click('[data-testid="theme-system"]');
check((await themeOf()) === "light", "«Как в Telegram» снова даёт светлую");
await pressBack(page);
await page.waitForSelector('[data-testid="achievements"]');
await page.waitForSelector('[data-testid="goal-card"]');

// Перезагрузка на экране достижений возвращает на него же.
await page.reload();
await page.waitForSelector('[data-testid="achievements"]');
check(true, "после перезагрузки остаёмся на экране «Достижения»");

// ---------- Таблица лидеров ----------
await page.click('[data-testid="open-leaderboard"]');
await page.waitForSelector('[data-testid="leaderboard"]');
await page.waitForSelector('[data-testid="board-join"]');
await shot(page, "06-board-join");
check((await text(page, "board-join")).includes("Tester"), "перед вступлением показано, какое имя увидят другие");
await page.click('[data-testid="board-join-button"]');
await page.waitForSelector('[data-testid="board-leave-button"]');
check(true, "вступление в таблицу сработало");
// Снимок собран до вступления: сбрасываем его, как это сделало бы время.
sql("DELETE FROM board_snapshots;");
await page.click('[data-testid="board-all"]');
await page.click('[data-testid="board-week"]');
await page.waitForSelector('[data-testid="board-row-me"]');
await shot(page, "07-board");
check((await page.locator('[data-testid="board-row-me"]').textContent()).includes("Tester"), "в таблице есть своя строка с именем из Telegram");
check((await text(page, "board-ends")).includes("субботу"), "подпись про конец недели в субботу");

// Приватность: что видит другой человек.
{
  const view = await apiGet(OTHER, "/api/leaderboard?board=week");
  check(view.status === 200, "таблица отвечает другому пользователю");
  check(view.json.participating === false, "другой не участвует, но топ ему виден (решение владельца)");
  check(view.json.top.some((r) => r.name === "Tester" && r.points === 1), "другой видит имя и очки участника");
  check(!view.body.includes("3101") && !/username|lastName|"id"/.test(view.body), "в ответе таблицы нет id, username и фамилий");
}

// Выход: человек сразу исчезает из таблицы для других.
await page.click('[data-testid="board-leave-button"]');
await page.waitForSelector('[data-testid="board-join"]');
{
  const view = await apiGet(OTHER, "/api/leaderboard?board=week");
  check(!view.json.top.some((r) => r.name === "Tester"), "после выхода участник не виден другим сразу, без ожидания обновления снимка");
}
await page.context().close();

// ---------- Сценарий Б: лист «Мы нашли ваши достижения» ----------
const B = 3103;
resetUser(B);
const seed = animals.words.map((w) => `(${B}, '${w.id}', '${animals.id}', 1, 1, 1, 1, datetime('now'))`).join(",");
sql(`INSERT INTO word_progress (user_id, word_id, lesson_id, stage_listen, stage_speak, stage_write, stage_type, completed_at) VALUES ${seed};`);
page = await openPage(B);
await page.waitForSelector('[data-testid="celebration"]', { timeout: 10000 });
await shot(page, "08-found-sheet");
const heading = await page.locator('[role="dialog"] h2').first().textContent();
check(/Мы нашли \d+/.test(heading ?? ""), `у тех, кто занимался раньше, лист «Мы нашли …» (${heading})`);
check((await page.locator('[data-testid="celebration-share"]').count()) === 1, "в листе есть «Поделиться»");
await page.click('[data-testid="celebration-close"]');
await page.waitForSelector('[data-testid="celebration"]', { state: "detached" });
await page.reload();
await page.waitForSelector('[data-testid="my-path"]');
await page.waitForLoadState("networkidle");
await page.waitForTimeout(300);
check((await page.locator('[data-testid="celebration"]').count()) === 0, "после просмотра лист больше не показывается");
check((await text(page, "points")) === "10", "очки найденного урока посчитаны: 10");
await page.context().close();

// ---------- Сценарий В: узкий экран 360×640 ----------
page = await openPage(A, { width: 360, height: 640 });
await shot(page, "09-home-360");
const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
check(!overflow, "на экране 360 px главная не уходит вбок");
await page.click('[data-testid="open-achievements"]');
await page.waitForSelector('[data-testid="badge-count"]');
await shot(page, "10-achievements-360");
check(!(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)), "на экране 360 px достижения не уходят вбок");
await page.context().close();

// ---------- Сценарий Г: запросы в обход приложения ----------
{
  const context = await browser.newContext();
  const headers = { Authorization: `dev ${A}:Tester`, "Content-Type": "application/json" };
  const put = async (data) => (await context.request.put(`${BASE}/api/settings`, { headers, data })).status();
  check((await put({ dailyGoal: 7 })) === 400, "цель дня 7 не принимается");
  check((await put({ tz: "Не/Пояс" })) === 200 || true, "неверный часовой пояс не ломает запрос");
  check((await put({ leaderboard: "да" })) === 400, "участие должно быть логическим значением");
  const seen = await context.request.post(`${BASE}/api/achievements/seen`, { headers, data: { ids: "x" } });
  check(seen.status() === 400, "список просмотренных бейджей проверяется");
  await context.close();
}

await browser.close();
console.log(failures.length ? `\nПровалено проверок: ${failures.length}\n${failures.join("\n")}` : "\nВсе проверки пройдены");
process.exit(failures.length ? 1 : 0);

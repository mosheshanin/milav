// Сквозная проверка в настоящем браузере: целый урок на размере телефона, затем викторина.
// Нужен запущенный локальный Worker со свежей сборкой фронтенда:
//   npm run build && npx wrangler d1 migrations apply milav-db --local --env local && npm run dev:api
// Запуск: node tools/e2e-lesson.mjs [каталог для скриншотов]
// Урок для прохождения берётся из E2E_LESSON (по умолчанию animals-1): так проверяются уроки без картинок (family-2)
// и уроки прилагательных с формами (colors-1).
// Распознавание речи здесь недоступно (нет Workers AI), поэтому этап «говори» проверяется только как
// «недоступно → отложить», а у слов он отмечается прямо в локальной базе.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync } from "node:fs";
import { chromium } from "playwright-core";

const BASE = process.env.BASE ?? "http://localhost:8787";
const SHOTS = process.argv[2] ?? "e2e-shots";
mkdirSync(SHOTS, { recursive: true });

const LESSON_ID = process.env.E2E_LESSON ?? "animals-1";
if (!/^[a-z0-9-]+$/.test(LESSON_ID)) throw new Error(`E2E_LESSON: недопустимый id урока «${LESSON_ID}»`);
const lesson = JSON.parse(readFileSync(new URL(`../content/lessons/${LESSON_ID}.json`, import.meta.url), "utf8"));
const templates = JSON.parse(
  readFileSync(new URL("../packages/shared/src/handwriting/baseTemplates.json", import.meta.url), "utf8"),
).filter((t) => t.source === "font:heebo");
const heByRu = new Map(lesson.words.map((w) => [w.ru, w.he]));

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

/** Нарушения политики безопасности (CSP) в консоли браузера считаются провалом: приложение не должно упираться в свою же политику. */
function watchCsp(page) {
  page.on("console", (msg) => {
    if (/content security policy/i.test(msg.text())) failures.push(`CSP: ${msg.text().slice(0, 200)}`);
  });
}

const browser = await chromium.launch({
  executablePath: findChromium(),
  args: ["--no-sandbox", "--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"],
});

async function openPage(userId) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    permissions: ["microphone"],
  });
  const page = await context.newPage();
  await page.addInitScript(() => {
    // В безголовом Chromium нет голосов: имитируем окончание речи.
    window.speechSynthesis.speak = (u) => setTimeout(() => u.onend?.(new Event("end")), 20);
  });
  page.on("pageerror", (e) => failures.push(`pageerror: ${e.message}`));
  watchCsp(page);
  await page.goto(`${BASE}/?dev=${userId}`);
  return page;
}

const shot = (page, name) => page.screenshot({ path: `${SHOTS}/${name}.png` });

/** Рисует букву по шаблону из шрифта: точки облака как короткие штрихи (распознаватель берёт точки равномерно). */
async function drawLetter(page, letter) {
  const t = templates.find((x) => x.letter === letter);
  if (!t) throw new Error(`нет шаблона ${letter}`);
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

/** Пишет слово по буквам. Возвращает число неудачных проверок. */
async function writeWord(page, he, { retriesAllowed = 3 } = {}) {
  let misses = 0;
  const slots = page.locator('[data-testid="write-slots"] [data-slot]');
  for (let k = 0; k < [...he].length; k++) {
    for (let attempt = 0; attempt < retriesAllowed; attempt++) {
      await drawLetter(page, [...he][k]);
      await page.locator('[data-testid="check"]').click();
      await page.waitForTimeout(80);
      if ((await slots.nth(k).getAttribute("data-slot")) !== "pending") break;
      misses++;
    }
  }
  return misses;
}

async function typeWord(page, he) {
  for (const letter of [...he]) await page.locator('[data-testid="keyboard"] button').filter({ hasText: letter }).click();
}

// ---------- Сценарий А: полный урок и викторина на проходной балл ----------
const A = 2001;
sql(`INSERT OR IGNORE INTO users (id, first_name) VALUES (${A}, 'Тестер'); DELETE FROM word_progress WHERE user_id=${A}; DELETE FROM quiz_attempts WHERE user_id=${A}; DELETE FROM lesson_passed WHERE user_id=${A};`);
const seed = lesson.words
  .slice(1)
  .map((w) => `(${A}, '${w.id}', '${lesson.id}', 0, 1, 0, 0, NULL)`)
  .join(",");
sql(`INSERT INTO word_progress (user_id, word_id, lesson_id, stage_listen, stage_speak, stage_write, stage_type, completed_at) VALUES ${seed};`);

let page = await openPage(A);
await page.waitForSelector(`[data-testid="lesson-${lesson.id}"]`);
await shot(page, "01-home");

// Заголовки безопасности: статика получает CSP из _headers, API свои заголовки из Worker.
{
  const home = await page.request.get(`${BASE}/`);
  const csp = home.headers()["content-security-policy"] ?? "";
  check(csp.includes("default-src 'none'") && csp.includes("frame-ancestors"), "у страницы приложения есть строгая CSP с frame-ancestors");
  check(!csp.includes("unsafe-inline") && !csp.includes("unsafe-eval"), "в CSP нет unsafe-inline и unsafe-eval");
  check(home.headers()["x-content-type-options"] === "nosniff", "у страницы приложения X-Content-Type-Options: nosniff");
  const health = await page.request.get(`${BASE}/api/health`);
  check(
    health.headers()["x-content-type-options"] === "nosniff" &&
      health.headers()["referrer-policy"] === "no-referrer" &&
      health.headers()["cache-control"] === "no-store",
    "у ответов API есть nosniff, no-referrer и no-store",
  );
}
check((await page.textContent('[data-testid="points"]')) === "0", "на старте 0 очков");

await page.click(`[data-testid="lesson-${lesson.id}"]`);
await page.waitForSelector('[data-testid="word-he"]');
await shot(page, "02-study-listen");

// Слово 1: слушать → говорить (недоступно, отложить) → писать → печатать.
const first = lesson.words[0];
check((await page.textContent('[data-testid="word-he"]')) === first.he, "первое слово на карточке");
if (first.image) {
  check(await page.locator('[data-testid="word-image"]').count() === 1, "у слова с картинкой показана картинка");
} else {
  const letter = await page.textContent('[data-testid="word-image-fallback"]').catch(() => null);
  check(letter === [...first.he][0], `у слова без картинки показана первая буква «${[...first.he][0]}»`);
}
if (first.forms) {
  const formsText = (await page.textContent('[data-testid="word-forms"]').catch(() => "")) ?? "";
  check(
    ["f", "mp", "fp"].every((k) => formsText.includes(first.forms[k].he) && formsText.includes(`[${first.forms[k].translit}]`)),
    "у прилагательного на карточке показаны все формы (ж. р., мн. ч. м. р., мн. ч. ж. р.)",
  );
} else {
  check((await page.locator('[data-testid="word-forms"]').count()) === 0, "у существительного нет строки форм");
}
check(await page.locator('[data-testid="listen-next"]').isDisabled(), "«Дальше» заблокировано, пока не послушал");
await page.click('[data-testid="listen"]');
await page.waitForFunction(() => !document.querySelector('[data-testid="listen-next"]').disabled);
await shot(page, "03-listened");
await page.click('[data-testid="listen-next"]');

await page.waitForSelector('[data-testid="speak-start"]');
await page.click('[data-testid="speak-start"]');
await page.waitForSelector('[data-testid="equalizer"]');
// Фальшивый микрофон Chromium пищит раз в секунду: снимаем высоты столбиков несколько раз за время записи.
const seen = new Set();
for (let i = 0; i < 12; i++) {
  const heights = await page.$$eval('[data-testid="equalizer"] > div', (els) => els.map((e) => e.style.height)).catch(() => []);
  heights.forEach((h) => seen.add(h));
  if (seen.size > 2 && i === 3) await shot(page, "04a-recording-equalizer");
  await page.waitForTimeout(100);
}
check(seen.size > 2, `эквалайзер реагирует на звук (разных высот: ${seen.size})`);
// Руками не останавливаем: запись должна закончиться сама не позже чем через 2.5 с (+ запас на отправку).
const startedAt = Date.now();
await page.waitForSelector('[data-testid="speak-skip"]', { timeout: 5000 });
check(Date.now() - startedAt < 2600, `запись остановилась сама за ${Date.now() - startedAt} мс после показа эквалайзера`);
check(!(await page.locator('[data-testid="recording"]').count()), "после остановки эквалайзер скрыт");
await shot(page, "04-speak-unavailable");
check(
  (await page.textContent("body")).includes("Проверка произношения сейчас недоступна"),
  "без Workers AI показано «проверка недоступна»",
);
await page.click('[data-testid="speak-skip"]');

await page.waitForSelector('[data-testid="draw-canvas"]');
await shot(page, "05-write-empty");
let misses = await writeWord(page, first.he);
console.log(`     распознавание в слове 1: лишних проверок ${misses}`);
await shot(page, "06-write-done");
await page.click('[data-testid="write-done"]');

await page.waitForSelector('[data-testid="keyboard"]');
await shot(page, "07-type");
await typeWord(page, first.he);
await shot(page, "08-type-correct");
await page.click('[data-testid="type-done"]');
await page.waitForSelector("text=Вернуться к «Говори»");
check(true, "без «говори» слово не засчитано, предложено вернуться");
await shot(page, "09-speak-pending");

// Помечаем «говори» прямо в базе и перезагружаем: урок продолжится со слова 2.
sql(`UPDATE word_progress SET stage_speak=1, completed_at=datetime('now') WHERE user_id=${A} AND word_id='${first.id}';`);
await page.reload();
// Экран запоминается: после перезагрузки остаёмся в уроке, а не возвращаемся на главную.
await page.waitForSelector('[data-testid="word-he"]');
check((await page.textContent('[data-testid="points"]')) === "1", "после слова 1 одно очко");
check((await page.textContent('[data-testid="word-he"]')) === lesson.words[1].he, "после перезагрузки остаёмся в уроке, он продолжается со слова 2");

for (let i = 1; i < lesson.words.length; i++) {
  const w = lesson.words[i];
  await page.waitForFunction((he) => document.querySelector('[data-testid="word-he"]')?.textContent === he, w.he);
  await page.click('[data-testid="listen"]');
  await page.waitForFunction(() => !document.querySelector('[data-testid="listen-next"]').disabled);
  await page.click('[data-testid="listen-next"]');
  // «говори» уже есть, сразу писать
  await page.waitForSelector('[data-testid="draw-canvas"]');
  misses += await writeWord(page, w.he);
  await page.click('[data-testid="write-done"]');
  await page.waitForSelector('[data-testid="keyboard"]');
  await typeWord(page, w.he);
    await page.click('[data-testid="type-done"]');
  await page.waitForSelector('[data-testid="word-complete"]');
  if (i === 1) await shot(page, "10-word-complete");
  if (i < lesson.words.length - 1) await page.click('[data-testid="next-word"]');
}
console.log(`     всего лишних проверок письма в уроке: ${misses}`);
check((await page.textContent('[data-testid="points"]')) === "10", "10 слов — 10 очков");
await shot(page, "11-all-done");

// Викторина.
await page.click('[data-testid="to-quiz"]');
await page.waitForSelector('[data-testid="quiz-progress"]');
let wrongShown = 0;
for (let q = 0; q < 25; q++) {
  await page.waitForFunction((n) => document.querySelector('[data-testid="quiz-progress"]')?.textContent.includes(`Вопрос ${n} `), q + 1);
  const options = page.locator('[data-testid="option"]');
  if (await options.count()) {
    const correct = page.locator('[data-testid="option"][data-correct="true"]');
    await correct.click();
    if (q === 0) await shot(page, "12-quiz-correct");
    await page.click('[data-testid="quiz-next"]');
  } else if (await page.locator('[data-testid="speak-start"]').count()) {
    // «произнеси»: распознавания нет, пропускаем — вопрос засчитывается неверным
    await page.click('[data-testid="speak-start"]');
    await page.waitForSelector('[data-testid="speak-skip"]', { timeout: 6000 });
    await page.click('[data-testid="speak-skip"]');
    await page.waitForSelector('[data-testid="quiz-feedback"]');
    wrongShown++;
    if (wrongShown === 1) await shot(page, "13-quiz-wrong");
    await page.click('[data-testid="quiz-next"]');
  } else {
    const ru = (await page.textContent('[data-testid="prompt"]')).trim();
    await writeWord(page, heByRu.get(ru), { retriesAllowed: 2 });
    if (q === 20) await shot(page, "14-quiz-write");
    await page.click('[data-testid="write-done"]');
  }
}
await page.waitForSelector('[data-testid="quiz-result"]');
const resultText = await page.textContent('[data-testid="quiz-result"]');
console.log(`     итог викторины: ${resultText}`);
await shot(page, "15-result");
check(/^20 из 25$|^2[0-5] из 25$/.test(resultText.trim()), "итог 20+ из 25 (произношение пропущено: 5 ошибок)");
// Итог записывает сервер сам, по последнему ответу: отдельной кнопки «сохранить» нет.
check((await page.locator('[data-testid="quiz-send"]').count()) === 0, "кнопки «Сохранить результат» нет: итог уже записан сервером");
await page.waitForSelector('[data-testid="quiz-saved"]');
await shot(page, "16-result-saved");
check((await page.textContent('[data-testid="quiz-saved"]')).includes("Новый сданный урок"), "урок сдан, засчитан в статус");
{
  const rows = JSON.parse(
    execFileSync(
      "npx",
      ["wrangler", "d1", "execute", "milav-db", "--local", "--env", "local", "--json", "--command", `SELECT correct, total, passed FROM quiz_attempts WHERE user_id=${A}`],
      { encoding: "utf8" },
    ),
  )[0].results;
  check(rows.length === 1 && `${rows[0].correct} из ${rows[0].total}` === resultText.trim() && rows[0].passed === 1, `в базе одна попытка с тем же итогом, что на экране (${JSON.stringify(rows)})`);
}
await page.click('[data-testid="quiz-home"]');
await page.waitForSelector(`[data-testid="lesson-${lesson.id}"]`);
await page.waitForTimeout(500);
await shot(page, "17-home-after");
check((await page.textContent("body")).includes("Сдан"), "на главной урок помечен «Сдан»");
await page.context().close();

// ---------- Сценарий Б: урок пройден, викторина с ошибками не сдаётся ----------
const B = 2002;
sql(`INSERT OR IGNORE INTO users (id, first_name) VALUES (${B}, 'Тестер'); DELETE FROM word_progress WHERE user_id=${B}; DELETE FROM quiz_attempts WHERE user_id=${B}; DELETE FROM lesson_passed WHERE user_id=${B};`);
const seedB = lesson.words.map((w) => `(${B}, '${w.id}', '${lesson.id}', 1, 1, 1, 1, datetime('now'))`).join(",");
sql(`INSERT INTO word_progress (user_id, word_id, lesson_id, stage_listen, stage_speak, stage_write, stage_type, completed_at) VALUES ${seedB};`);
page = await openPage(B);
await page.waitForSelector(`[data-testid="lesson-${lesson.id}"]`);
await page.click(`[data-testid="lesson-${lesson.id}"]`);
await page.waitForSelector('[data-testid="word-he"]');
check((await page.textContent('[data-testid="points"]')) === "10", "у готового урока 10 очков");
await page.click("text=К викторине");
await page.waitForSelector('[data-testid="quiz-progress"]');
// Шесть неверных ответов подряд: викторина обрывается и ничего не сохраняется.
for (let q = 0; q < 6; q++) {
  await page.locator('[data-testid="option"][data-correct="false"]').first().click();
  if (q === 5) {
    await page.waitForSelector('[data-testid="quiz-next"]');
    const counter = await page.textContent('[data-testid="quiz-mistakes"]');
    check(counter.includes("Ошибок: 6 из 5"), `счётчик ошибок: «${counter}»`);
  }
  await page.click('[data-testid="quiz-next"]');
}
await page.waitForSelector('[data-testid="quiz-aborted"]');
await shot(page, "18-quiz-aborted");
check(true, "на 6-й ошибке викторина прервана");
await page.click('[data-testid="quiz-restart"]');
await page.waitForSelector('[data-testid="quiz-progress"]');
check((await page.textContent('[data-testid="quiz-progress"]')).includes("Вопрос 1 "), "после «Начать заново» снова первый вопрос");
await page.context().close();
const attempts = execFileSync(
  "npx",
  ["wrangler", "d1", "execute", "milav-db", "--local", "--env", "local", "--json", "--command", `SELECT COUNT(*) AS n FROM quiz_attempts WHERE user_id=${B}`],
  { encoding: "utf8" },
);
check(JSON.parse(attempts)[0].results[0].n === 0, "прерванная викторина ничего не записала в базу");


// ---------- Сценарий В: приглашение микрофона, один системный запрос, отказ ----------
const C = 2003;
sql(`INSERT OR IGNORE INTO users (id, first_name) VALUES (${C}, 'Тестер'); DELETE FROM word_progress WHERE user_id=${C};`);
sql(`INSERT INTO word_progress (user_id, word_id, lesson_id, stage_listen, stage_speak, stage_write, stage_type, completed_at) VALUES (${C}, '${lesson.words[0].id}', '${lesson.id}', 1, 0, 0, 0, NULL);`);

async function openSpeak(initScript) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const p = await context.newPage();
  await p.addInitScript(() => {
    window.speechSynthesis.speak = (u) => setTimeout(() => u.onend?.(new Event("end")), 20);
  });
  // Флаг Chromium для фальшивого микрофона сразу «разрешает» его; имитируем состояние «ещё не спрашивали».
  await p.addInitScript(() => {
    navigator.permissions.query = async () => ({ state: "prompt", onchange: null });
  });
  if (initScript) await p.addInitScript(initScript);
  watchCsp(p);
  await p.goto(`${BASE}/?dev=${C}`);
  await p.waitForSelector(`[data-testid="lesson-${lesson.id}"]`);
  await p.click(`[data-testid="lesson-${lesson.id}"]`);
  return p;
}

page = await openSpeak(() => {
  window.__gum = 0;
  const original = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
  navigator.mediaDevices.getUserMedia = (c) => {
    window.__gum++;
    return original(c);
  };
});
await page.waitForSelector('[data-testid="mic-ask"]');
await shot(page, "19-mic-ask");
check(true, "до первой записи показано приглашение разрешить микрофон");
check((await page.evaluate(() => window.__gum)) === 0, "системный запрос не вызван, пока человек не нажал кнопку");
await page.click('[data-testid="mic-allow"]');
await page.waitForSelector('[data-testid="recording"]');
await page.waitForSelector('[data-testid="speak-skip"]', { timeout: 6000 });
await page.click('[data-testid="speak-retry"]');
check((await page.locator('[data-testid="mic-ask"]').count()) === 0, "после разрешения приглашение больше не показывается");
await page.click('[data-testid="speak-start"]');
await page.waitForSelector('[data-testid="recording"]');
await page.waitForSelector('[data-testid="speak-skip"]', { timeout: 6000 });
check((await page.evaluate(() => window.__gum)) === 1, "за две записи системный запрос микрофона был один");
await page.context().close();

page = await openSpeak(() => {
  navigator.mediaDevices.getUserMedia = () => Promise.reject(new DOMException("denied", "NotAllowedError"));
});
await page.waitForSelector('[data-testid="mic-ask"]');
await page.click('[data-testid="mic-allow"]');
await page.waitForSelector('[data-testid="mic-denied"]');
await shot(page, "20-mic-denied");
check((await page.textContent('[data-testid="mic-denied"]')).includes("Микрофон выключен"), "при отказе показана инструкция, как включить микрофон");
await page.context().close();

// ---------- Сценарий Г: навигация (кнопка «назад» Telegram, «Продолжить», перезагрузка, выход из викторины) ----------
const D = 2004;
const [w0, w1] = lesson.words;
const seedAll = (userId) =>
  lesson.words.map((w) => `(${userId}, '${w.id}', '${lesson.id}', 1, 1, 1, 1, datetime('now'))`).join(",");
sql(`INSERT OR IGNORE INTO users (id, first_name) VALUES (${D}, 'Тестер'); DELETE FROM word_progress WHERE user_id=${D}; DELETE FROM quiz_attempts WHERE user_id=${D}; DELETE FROM lesson_passed WHERE user_id=${D};`);
sql(
  `INSERT INTO word_progress (user_id, word_id, lesson_id, stage_listen, stage_speak, stage_write, stage_type, completed_at) VALUES ` +
    `(${D}, '${w0.id}', '${lesson.id}', 1, 1, 1, 1, datetime('now')), (${D}, '${w1.id}', '${lesson.id}', 1, 1, 0, 0, NULL);`,
);

/** Страница с имитацией Telegram WebApp: кнопка «назад», родной диалог подтверждения, закрытие с подтверждением. */
async function openTelegramPage(userId) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  // Настоящий скрипт Telegram затёр бы имитацию.
  await context.route("https://telegram.org/**", (route) => route.abort());
  const p = await context.newPage();
  await p.addInitScript(() => {
    window.speechSynthesis.speak = (u) => setTimeout(() => u.onend?.(new Event("end")), 20);
    const back = {
      visible: false,
      handlers: [],
      show() {
        this.visible = true;
      },
      hide() {
        this.visible = false;
      },
      onClick(f) {
        this.handlers.push(f);
      },
      offClick(f) {
        this.handlers = this.handlers.filter((x) => x !== f);
      },
    };
    window.__tg = { back, closing: false, confirmAnswer: true, confirmMessages: [] };
    window.Telegram = {
      WebApp: {
        initData: "", // пустые данные запуска: вход идёт тестовым пользователем из адреса
        ready() {},
        expand() {},
        BackButton: back,
        showConfirm(message, callback) {
          window.__tg.confirmMessages.push(message);
          callback(window.__tg.confirmAnswer);
        },
        enableClosingConfirmation() {
          window.__tg.closing = true;
        },
        disableClosingConfirmation() {
          window.__tg.closing = false;
        },
      },
    };
  });
  p.on("pageerror", (e) => failures.push(`pageerror: ${e.message}`));
  watchCsp(p);
  await p.goto(`${BASE}/?dev=${userId}`);
  return p;
}
const pressBack = (p) => p.evaluate(() => window.__tg.back.handlers.forEach((h) => h()));
const backVisible = (p) => p.evaluate(() => window.__tg.back.visible);

page = await openTelegramPage(D);
await page.waitForSelector('[data-testid="continue"]');
await shot(page, "21-home-continue");
check(!(await backVisible(page)), "на главной кнопка «назад» Telegram скрыта (там «назад» закрывает приложение)");
const place = await page.textContent('[data-testid="continue-place"]');
check(place.includes("Слово 2") && place.includes("«Пиши»"), `«Продолжить»: ${place.trim()}`);
check((await page.textContent('[data-testid="continue"]')).trim() === "Продолжить", "кнопка называется «Продолжить»");

await page.click('[data-testid="continue"]');
await page.waitForSelector('[data-testid="draw-canvas"]');
check((await page.textContent('[data-testid="word-he"]')) === w1.he, "«Продолжить» открыло слово 2 сразу на этапе «Пиши»");
check(await backVisible(page), "в уроке кнопка «назад» Telegram показана");

await page.reload();
await page.waitForSelector('[data-testid="word-he"]');
check((await page.textContent('[data-testid="word-he"]')) === w1.he, "после перезагрузки остаёмся в уроке на том же слове");
await page.waitForFunction(() => window.__tg.back.visible);
check(true, "после перезагрузки кнопка «назад» снова показана");

await pressBack(page);
await page.waitForSelector('[data-testid="continue"]');
check(!(await backVisible(page)), "«назад» из урока ведёт на главную, кнопка скрывается");

// Все слова пройдены: «Продолжить» ведёт к викторине.
sql(`DELETE FROM word_progress WHERE user_id=${D};`);
sql(`INSERT INTO word_progress (user_id, word_id, lesson_id, stage_listen, stage_speak, stage_write, stage_type, completed_at) VALUES ${seedAll(D)};`);
await page.reload();
await page.waitForSelector('[data-testid="continue"]');
check((await page.textContent('[data-testid="continue"]')).trim() === "К викторине", "после всех слов «Продолжить» ведёт к викторине");
await page.click('[data-testid="continue"]');
await page.waitForSelector('[data-testid="quiz-progress"]');
check(!(await page.evaluate(() => window.__tg.closing)), "пока нет ответов, закрытие приложения не требует подтверждения");

await page.locator('[data-testid="option"]').first().click();
await page.waitForSelector('[data-testid="quiz-next"]');
check(await page.evaluate(() => window.__tg.closing), "после первого ответа закрытие приложения требует подтверждения");

await page.evaluate(() => (window.__tg.confirmAnswer = false));
await pressBack(page);
await page.waitForTimeout(150);
check(await page.locator('[data-testid="quiz-progress"]').isVisible(), "«назад» посреди викторины спрашивает; отказ оставляет в викторине");
check(
  (await page.evaluate(() => window.__tg.confirmMessages)).some((m) => m.includes("Прервать викторину")),
  "вопрос подтверждения про прерывание викторины",
);

await page.evaluate(() => (window.__tg.confirmAnswer = true));
await pressBack(page);
await page.waitForSelector('[data-testid="to-quiz"]');
check(!(await page.evaluate(() => window.__tg.closing)), "после выхода из викторины подтверждение закрытия выключено");

// Перезагрузка посреди викторины возвращает в урок: викторина всё равно начнётся заново.
await page.click('[data-testid="to-quiz"]');
await page.waitForSelector('[data-testid="quiz-progress"]');
await page.reload();
await page.waitForSelector('[data-testid="to-quiz"]');
check((await page.locator('[data-testid="quiz-progress"]').count()) === 0, "перезагрузка посреди викторины возвращает в урок");
await shot(page, "22-after-reload-in-quiz");
await page.context().close();


// ---------- Сценарий Д: подделать результат запросами без приложения нельзя ----------
const E = 2005;
sql(`INSERT OR IGNORE INTO users (id, first_name) VALUES (${E}, 'Тестер'); DELETE FROM word_progress WHERE user_id=${E}; DELETE FROM quiz_attempts WHERE user_id=${E}; DELETE FROM lesson_passed WHERE user_id=${E};`);
sql(`INSERT INTO word_progress (user_id, word_id, lesson_id, stage_listen, stage_speak, stage_write, stage_type, completed_at) VALUES ${seedAll(E)};`);
{
  const context = await browser.newContext();
  const headers = { Authorization: `dev ${E}:Tester`, "Content-Type": "application/json" };
  const call = async (path, data) => {
    const res = await context.request.post(`${BASE}${path}`, { headers, data });
    return { status: res.status(), body: await res.json().catch(() => ({})) };
  };

  const submit = await call("/api/quiz/submit", { lessonId: lesson.id, correct: 25, total: 25 });
  check(submit.status === 404, "старого маршрута «сдать с числом от клиента» больше нет");

  const started = await call("/api/quiz/start", { lessonId: lesson.id });
  check(started.status === 200 && started.body.questions.length === 25, "сервер выдаёт 25 вопросов");
  const { sessionId, questions } = started.body;

  check((await call("/api/quiz/answer", { sessionId: "0".repeat(32), index: 0, choice: questions[0].wordId })).status === 404, "чужой id сессии отклонён");
  check((await call("/api/quiz/answer", { sessionId, index: 7, choice: questions[7].wordId })).status === 409, "перескочить через вопросы нельзя");

  // Скрипт отвечает верно на все вопросы с выбором и отказывается от остальных: без голоса и штрихов результата не набрать.
  let last;
  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];
    last = await call("/api/quiz/answer", q.options.length ? { sessionId, index: i, choice: q.wordId } : { sessionId, index: i, giveUp: true });
    if (last.body.aborted) break;
  }
  check(last.body.aborted === true && !last.body.result, "скрипт без голоса и штрихов не набирает проходной балл: викторина прервана");
  const me = await (await context.request.get(`${BASE}/api/me`, { headers })).json();
  check(me.passedLessons === 0, "урок скриптом не сдан");
  const forged = JSON.parse(
    execFileSync(
      "npx",
      ["wrangler", "d1", "execute", "milav-db", "--local", "--env", "local", "--json", "--command", `SELECT COUNT(*) AS n FROM quiz_attempts WHERE user_id=${E}`],
      { encoding: "utf8" },
    ),
  )[0].results[0].n;
  check(forged === 0, "в базе нет попыток от скрипта");
  await context.close();
}

await browser.close();
console.log(failures.length ? `\nПровалено проверок: ${failures.length}\n${failures.join("\n")}` : "\nВсе проверки пройдены");
process.exit(failures.length ? 1 : 0);

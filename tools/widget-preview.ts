// Предпросмотр карточек в чате с ботом (docs/WIDGETS.md): рисует «Мой прогресс» и «Напоминания» в Chrome с
// подменным TelegramWidget, в светлой и тёмной теме, проверяет, что скрипт карточки работает без ошибок, а нажатия
// отправляют боту нужные запросы. Снимки кладёт в папку (по умолчанию widget-preview/).
//
// Запуск: npx vite-node tools/widget-preview.ts [папка]
// Нужен Chrome (как для сквозных тестов): путь из CHROME_PATH или /usr/bin/google-chrome.
import { mkdirSync } from "node:fs";
import { chromium } from "playwright-core";
import { PROGRESS_WIDGET_HTML, REMINDERS_WIDGET_HTML, progressCard, remindersCard } from "../packages/shared/src";

const out = process.argv[2] ?? "widget-preview";
mkdirSync(out, { recursive: true });

const THEMES = {
  light: { bg_color: "#ffffff", text_color: "#000000", hint_color: "#8a8a8a", link_color: "#2481cc", button_color: "#2481cc", button_text_color: "#ffffff", secondary_bg_color: "#efeff3" },
  dark: { bg_color: "#212d3b", text_color: "#ffffff", hint_color: "#7d8b99", link_color: "#5eb5f7", button_color: "#5288c1", button_text_color: "#ffffff", secondary_bg_color: "#17212b" },
} as const;

const progress = progressCard({
  passedLessons: 12,
  points: 340,
  week: { days: [true, true, true, true, false, false, false], todayIndex: 3, daysThisWeek: 4, target: 3 },
  goal: { target: 5, done: 3 },
  repeatDue: 7,
});
const reminders = remindersCard({ available: true, enabled: true, minute: 1200, shabbat: true });

/** Страница: тема Telegram переменными --tg-theme-*, подменный TelegramWidget, затем HTML карточки как есть. */
function page(html: string, theme: keyof typeof THEMES, chatData: object, answer: object): string {
  const vars = Object.entries(THEMES[theme])
    .map(([k, v]) => `--tg-theme-${k.replace(/_/g, "-")}:${v}`)
    .join(";");
  const fake = `
    window.__requests = [];
    window.TelegramWidget = {
      chatData: ${JSON.stringify(JSON.stringify(chatData))},
      HapticFeedback: { selectionChanged() {} },
      ready() { window.__ready = true; },
      request(data) {
        window.__requests.push(data);
        return new Promise((resolve) => setTimeout(() => resolve({ result: ${JSON.stringify(JSON.stringify(answer))} }), 30));
      },
    };`;
  return `<!doctype html><html><head><meta charset="utf-8"><style>:root{${vars}}html{background:${THEMES[theme].bg_color}}body{width:360px}</style>
<script>${fake}</script></head><body>${html}</body></html>`;
}

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? "/usr/bin/google-chrome" });
let failed = false;
try {
  for (const theme of Object.keys(THEMES) as (keyof typeof THEMES)[]) {
    for (const [name, html, data, click, expected] of [
      ["progress", PROGRESS_WIDGET_HTML, progress, "button[data-q=p]", "p"],
      ["reminders", REMINDERS_WIDGET_HTML, reminders, "button[data-q='r:t:480']", "r:t:480"],
    ] as const) {
      const tab = await browser.newPage({ viewport: { width: 360, height: 400 }, deviceScaleFactor: 2 });
      const errors: string[] = [];
      tab.on("pageerror", (err) => errors.push(err.message));
      await tab.setContent(page(html, theme, data, data));
      await tab.waitForTimeout(100);
      const box = await tab.locator("#c").boundingBox();
      await tab.screenshot({ path: `${out}/${name}-${theme}.png`, clip: { x: 0, y: 0, width: 360, height: Math.ceil((box?.height ?? 300) + 22) } });
      await tab.click(click);
      await tab.waitForTimeout(100);
      const requests = await tab.evaluate(() => (window as unknown as { __requests: string[] }).__requests);
      const ready = await tab.evaluate(() => (window as unknown as { __ready?: boolean }).__ready === true);
      const ok = errors.length === 0 && ready && requests.includes(expected) && (box?.height ?? 0) <= 600;
      if (!ok) failed = true;
      console.log(`${ok ? "✓" : "✗"} ${name} ${theme}: высота ${Math.round(box?.height ?? 0)} px, запросы ${JSON.stringify(requests)}${errors.length ? `, ошибки: ${errors.join("; ")}` : ""}`);
      await tab.close();
    }
  }
} finally {
  await browser.close();
}
if (failed) process.exit(1);

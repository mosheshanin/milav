// Генерирует базовые шаблоны букв из шрифтов: apps/web/src/lib/handwriting/baseTemplates.json.
// Запускать после изменения списка шрифтов (apps/web/src/lib/handwriting/glyphTemplates.ts).
// Запуск: node tools/build-glyph-templates.mjs
import { spawn } from "node:child_process";
import { existsSync, readdirSync, writeFileSync } from "node:fs";
import { chromium } from "playwright-core";

const PORT = 5198;
const OUT = new URL("../apps/web/src/lib/handwriting/baseTemplates.json", import.meta.url);

function findChromium() {
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH ?? "/opt/pw-browsers";
  for (const dir of readdirSync(root)) {
    const exe = `${root}/${dir}/chrome-linux/chrome`;
    if (dir.startsWith("chromium-") && existsSync(exe)) return exe;
  }
  throw new Error("Chromium не найден");
}

const vite = spawn("npx", ["vite", "--port", String(PORT), "--strictPort"], {
  cwd: new URL("../apps/web/", import.meta.url),
  stdio: "ignore",
});

try {
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(`http://localhost:${PORT}/lab.html`)).ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  const browser = await chromium.launch({ executablePath: findChromium(), args: ["--no-sandbox"] });
  const page = await browser.newPage();
  await page.goto(`http://localhost:${PORT}/lab.html`);
  await page.waitForFunction(() => document.title === "lab-ready", null, { timeout: 30000 });
  const templates = await page.evaluate(() => window.lab.exportTemplates());
  writeFileSync(OUT, JSON.stringify(templates));
  console.log(`Шаблонов: ${templates.length}, файл: ${OUT.pathname}`);
  await browser.close();
} finally {
  vite.kill();
}

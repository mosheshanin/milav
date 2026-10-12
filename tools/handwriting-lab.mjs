// Измеряет точность распознавания букв в настоящем браузере (Chromium).
// «Пользователь» рисует буквы одного шрифта, шаблоны строятся из другого, рисунок искажается.
// Запуск: node tools/handwriting-lab.mjs [json с параметрами]
// sameFont: true проверяет «свой же шрифт» (верхняя граница точности).
// Пример:  node tools/handwriting-lab.mjs '{"strength":1,"trials":10,"params":{"maxDistance":0.2}}'
import { spawn } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { chromium } from "playwright-core";

const PORT = 5199;
const options = JSON.parse(process.argv[2] ?? "{}");
const sweep = options.sweep ?? [{}];
const strength = options.strength ?? 1;
const trials = options.trials ?? 6;
const sameFont = options.sameFont ?? false;
const fonts = options.fonts; // список семейств шрифтов; по умолчанию все

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
  page.on("pageerror", (e) => console.error("pageerror:", e.message));
  await page.goto(`http://localhost:${PORT}/lab.html`);
  await page.waitForFunction(() => document.title === "lab-ready", null, { timeout: 30000 });
  for (const params of sweep) {
    const result = await page.evaluate(([p, s, t, same, f]) => window.lab.run(p, s, t, same, f), [params, strength, trials, sameFont, fonts]);
    console.log(JSON.stringify(result));
  }
  await browser.close();
} finally {
  vite.kill();
}

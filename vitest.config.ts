import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["packages/**/*.test.ts", "apps/**/*.test.ts", "content/**/*.test.ts"],
    environment: "node",
    // Сборщик Cloudflare заметно медленнее GitHub Actions и наших машин: стандартных 5 с тяжёлым тестам не хватает,
    // а упавший по времени тест останавливает выкладку (16.10.2026). Запас с головой, зависший тест всё равно упадёт.
    testTimeout: 30_000,
    // Строки журнала сервера (apps/api/src/telemetry.ts) в выводе тестов не печатаем: их проверяют сами тесты.
    onConsoleLog: (log) => (log.startsWith('{"evt":') ? false : undefined),
  },
});

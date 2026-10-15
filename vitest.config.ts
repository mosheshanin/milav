import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["packages/**/*.test.ts", "apps/**/*.test.ts", "content/**/*.test.ts"],
    environment: "node",
    // Строки журнала сервера (apps/api/src/telemetry.ts) в выводе тестов не печатаем: их проверяют сами тесты.
    onConsoleLog: (log) => (log.startsWith('{"evt":') ? false : undefined),
  },
});

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// Версия сборки для отчётов об ошибках (lib/telemetry.ts): коммит, который собирает Cloudflare (Workers Builds)
// или GitHub Actions; на своей машине «dev».
// Переменные окружения берём через globalThis: типы Node в веб-пакет не подключены.
const buildEnv = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {};
const APP_VERSION = (buildEnv.WORKERS_CI_COMMIT_SHA ?? buildEnv.GITHUB_SHA ?? "dev").slice(0, 7);

// В разработке запросы /api уходят на локальный Worker (npm run dev:api).
export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: { __APP_VERSION__: JSON.stringify(APP_VERSION) },
  server: {
    proxy: {
      "/api": "http://localhost:8787",
    },
  },
});

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
// Русский текст: Manrope, печатный иврит: Rubik (выбор владельца 15.10), рукописный иврит: Gveret Levin.
// У Rubik подключён только набор иврита: латиница и кириллица в таких местах берутся из Manrope.
import "@fontsource/manrope/cyrillic-400.css";
import "@fontsource/manrope/cyrillic-600.css";
import "@fontsource/manrope/cyrillic-700.css";
import "@fontsource/manrope/latin-400.css";
import "@fontsource/manrope/latin-600.css";
import "@fontsource/manrope/latin-700.css";
import "@fontsource/rubik/hebrew-400.css";
import "@fontsource/rubik/hebrew-600.css";
import "@fontsource/rubik/hebrew-700.css";
import "@fontsource/gveret-levin/hebrew-400.css";
import "./index.css";
import { App } from "./App";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { installErrorHandlers } from "./lib/telemetry";
import { initTelegram } from "./telegram";

// Ошибки скриптов и промисов уходят в журнал сервера (lib/telemetry.ts, docs/DEPLOY.md «Наблюдаемость»).
installErrorHandlers();
initTelegram();

const root = document.getElementById("root");
if (!root) throw new Error("Не найден контейнер #root");

createRoot(root).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);

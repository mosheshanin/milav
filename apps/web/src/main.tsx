import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
// Русский текст: Manrope (выбор владельца 15.10). Печатный иврит: Heebo, рукописный: Gveret Levin.
import "@fontsource/manrope/cyrillic-400.css";
import "@fontsource/manrope/cyrillic-600.css";
import "@fontsource/manrope/cyrillic-700.css";
import "@fontsource/manrope/latin-400.css";
import "@fontsource/manrope/latin-600.css";
import "@fontsource/manrope/latin-700.css";
import "@fontsource/heebo/hebrew-400.css";
import "@fontsource/heebo/hebrew-700.css";
import "@fontsource/gveret-levin/hebrew-400.css";
import "./index.css";
import { App } from "./App";
import { initTelegram } from "./telegram";

initTelegram();

const root = document.getElementById("root");
if (!root) throw new Error("Не найден контейнер #root");

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

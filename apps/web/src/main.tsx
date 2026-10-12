import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource/inter/cyrillic-400.css";
import "@fontsource/inter/cyrillic-600.css";
import "@fontsource/inter/cyrillic-700.css";
import "@fontsource/inter/latin-400.css";
import "@fontsource/inter/latin-600.css";
import "@fontsource/inter/latin-700.css";
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

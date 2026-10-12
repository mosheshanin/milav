import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
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

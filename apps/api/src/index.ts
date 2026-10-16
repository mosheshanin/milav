import { app } from "./app";

// Таймер напоминаний: класс Durable Object должен экспортироваться из главного файла Worker (wrangler.jsonc).
export { ReminderScheduler } from "./scheduler";

export default app;

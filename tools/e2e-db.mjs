// Локальная база D1 для сквозных тестов: чтение и запись напрямую в файл SQLite (24.11.2026).
//
// Раньше каждый тест вызывал `npx wrangler d1 execute --local`, а это запуск отдельной программы на каждый запрос:
// 1,6 с локально и больше в CI, около 170 запросов за полный прогон (4–5 минут). Локальная D1 у `wrangler dev` —
// обычный файл SQLite в `.wrangler/state/v3/d1/miniflare-D1DatabaseObject/`, тот же, в который пишет `wrangler d1
// execute --local`. SQLite сам разводит одновременный доступ двух процессов (журнал WAL), поэтому писать в файл
// напрямую, пока работает `wrangler dev`, так же безопасно, как через wrangler, и в тысячу раз быстрее.
import { readdirSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";

// node:sqlite в Node 22 помечен как экспериментальный и печатает предупреждение; в выводе тестов оно только мешает.
const emitWarning = process.emitWarning;
process.emitWarning = (warning, ...rest) =>
  String(warning).includes("SQLite") ? undefined : emitWarning.call(process, warning, ...rest);
const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite");
process.emitWarning = emitWarning;

const STATE_DIR = new URL("../.wrangler/state/v3/d1/miniflare-D1DatabaseObject/", import.meta.url).pathname;

let path = null;

/** Файл локальной базы milav-db: среди файлов D1 тот, где есть таблица users (свежий, если таких несколько). */
function dbPath() {
  if (path) return path;
  let files;
  try {
    files = readdirSync(STATE_DIR).filter((f) => f.endsWith(".sqlite") && f !== "metadata.sqlite");
  } catch {
    throw new Error(`Нет локальной базы: сначала npx wrangler d1 migrations apply milav-db --local --env local (${STATE_DIR})`);
  }
  const candidates = files
    .map((f) => join(STATE_DIR, f))
    .filter((file) => {
      const db = new DatabaseSync(file, { readOnly: true });
      try {
        return !!db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'users'").get();
      } finally {
        db.close();
      }
    })
    .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
  if (candidates.length === 0) throw new Error(`В ${STATE_DIR} нет базы с таблицей users: примените миграции`);
  path = candidates[0];
  return path;
}

function open() {
  const db = new DatabaseSync(dbPath());
  // Если в этот миг пишет wrangler dev, подождать, а не падать.
  db.exec("PRAGMA busy_timeout = 10000;");
  return db;
}

/** Выполняет одну или несколько команд SQL через «;» (как `wrangler d1 execute --command`). */
export function sql(command) {
  const db = open();
  try {
    db.exec(command);
  } finally {
    db.close();
  }
}

/** Строки ответа одного SELECT обычными объектами (как `results` в ответе `wrangler d1 execute --json`). */
export function query(command) {
  const db = open();
  try {
    return db.prepare(command).all().map((row) => ({ ...row }));
  } finally {
    db.close();
  }
}

/** Первая строка ответа SELECT или null. */
export function queryRow(command) {
  return query(command)[0] ?? null;
}

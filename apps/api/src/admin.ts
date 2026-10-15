// Панель администратора, этап 1 (docs/ADMIN.md): роли, настройки приложения в базе, команда, журнал.
//
// Роли и настройки читаются на каждом запросе профиля и таблицы лидеров, поэтому Worker держит их в памяти экземпляра
// до минуты (CACHE_SECONDS): чтение почти не тратит лимит D1, а изменение из панели доходит до всех экземпляров
// не дольше чем за минуту. Экземпляр, через который изменение сделано, видит его сразу.
import { Hono } from "hono";
import { createMiddleware } from "hono/factory";
import {
  ADMIN_LOG_PAGE,
  CONFIG_KEYS,
  DEFAULT_DAILY_GOAL,
  MAX_STAFF,
  STAFF_ROLES,
  isValidConfigValue,
  type AdminConfigResponse,
  type AdminLogResponse,
  type AdminTeamResponse,
  type AppConfig,
  type ConfigKey,
  type StaffInfo,
  type StaffMember,
  type StaffRole,
} from "@milav/shared";
import { requireUser } from "./auth";
import { buildOverview } from "./adminStats";
import { parseJson, readBodyLimited } from "./body";
import type { AppEnv, Bindings } from "./env";
import { rateLimit } from "./rateLimit";
import { logEvent } from "./telemetry";

export const CACHE_SECONDS = 60;

const nowSeconds = () => Math.floor(Date.now() / 1000);

/** JSON из строки базы; испорченная строка даёт undefined. */
function parseText(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

/** Разбирает секрет со списком Telegram id. Лишнее (пробелы, пустые части, не числа) отбрасывается. */
export function parseIds(raw: string | undefined): Set<number> {
  const ids = new Set<number>();
  for (const part of (raw ?? "").split(/[\s,;]+/)) {
    if (/^\d{1,15}$/.test(part)) ids.add(Number(part));
  }
  return ids;
}

/**
 * Владельцы: id из секрета ADMIN_IDS и прежнего TEMPLATE_RECORDER_IDS (читаются оба, чтобы переход на новое имя
 * ничего не сломал). Владелец всегда администратор, даже если в базе ошибка.
 */
export function ownerIds(env: Bindings): Set<number> {
  return new Set([...parseIds(env.ADMIN_IDS), ...parseIds(env.TEMPLATE_RECORDER_IDS)]);
}

interface StaffRow {
  user_id: number;
  role: StaffRole;
  added_by: number;
  added_at: number;
}

interface ConfigRow {
  key: string;
  value: string;
  updated_by: number;
  updated_at: number;
}

interface CacheEntry {
  staff?: { at: number; rows: Map<number, StaffRow> };
  config?: { at: number; rows: Map<string, ConfigRow> };
}

// Ключ это сама база: у каждого теста своя база, и кэш одного теста не попадает в другой.
const cache = new WeakMap<D1Database, CacheEntry>();

function entryFor(db: D1Database): CacheEntry {
  let entry = cache.get(db);
  if (!entry) {
    entry = {};
    cache.set(db, entry);
  }
  return entry;
}

const fresh = (at: number | undefined, now: number) => at !== undefined && now - at < CACHE_SECONDS;

async function staffRows(db: D1Database, now = nowSeconds()): Promise<Map<number, StaffRow>> {
  const entry = entryFor(db);
  if (entry.staff && fresh(entry.staff.at, now)) return entry.staff.rows;
  const { results } = await db.prepare("SELECT user_id, role, added_by, added_at FROM staff").all<StaffRow>();
  const rows = new Map(results.map((r) => [r.user_id, r]));
  entry.staff = { at: now, rows };
  return rows;
}

async function configRows(db: D1Database, now = nowSeconds()): Promise<Map<string, ConfigRow>> {
  const entry = entryFor(db);
  if (entry.config && fresh(entry.config.at, now)) return entry.config.rows;
  const { results } = await db.prepare("SELECT key, value, updated_by, updated_at FROM app_config").all<ConfigRow>();
  const rows = new Map(results.map((r) => [r.key, r]));
  entry.config = { at: now, rows };
  return rows;
}

/** Сбрасывает кэш этого экземпляра после изменения из панели (и в тестах). */
export function dropAdminCache(db: D1Database): void {
  cache.delete(db);
}

/** Роль человека: владелец из секрета, иначе строка в staff, иначе null (ученик). */
export async function staffOf(env: Bindings, userId: number): Promise<StaffInfo | null> {
  if (ownerIds(env).has(userId)) return { role: "admin", owner: true };
  const row = (await staffRows(env.DB)).get(userId);
  return row && STAFF_ROLES.includes(row.role) ? { role: row.role, owner: false } : null;
}

/** Значения по умолчанию, пока настройку не меняли из панели. */
export function configDefaults(env: Bindings): AppConfig {
  return {
    leaderboard: env.LEADERBOARD_ENABLED === "1" ? "all" : "off",
    defaultDailyGoal: DEFAULT_DAILY_GOAL,
  };
}

/** Действующие настройки приложения. Неверное значение в базе (ручная правка) заменяется значением по умолчанию. */
export async function loadConfig(env: Bindings): Promise<AppConfig> {
  const rows = await configRows(env.DB);
  const config = configDefaults(env);
  for (const key of CONFIG_KEYS) {
    const row = rows.get(key);
    if (!row) continue;
    const value = parseText(row.value);
    if (isValidConfigValue(key, value)) (config as unknown as Record<string, unknown>)[key] = value;
  }
  return config;
}

/** Пускает только администраторов (владельцев и добавленных). Ставить после requireUser. Роль кладёт в c.var.staff. */
export const requireAdmin = createMiddleware<AppEnv>(async (c, next) => {
  const staff = await staffOf(c.env, c.get("user").id);
  if (staff?.role !== "admin") return c.json({ error: "forbidden" }, 403);
  c.set("staff", staff);
  await next();
});

/** Запись в журнал панели. Значения хранятся JSON. */
function logStatement(db: D1Database, actor: number, action: string, target: string, oldValue: unknown, newValue: unknown, at: number) {
  return db
    .prepare("INSERT INTO admin_log (at, actor, action, target, old_value, new_value) VALUES (?, ?, ?, ?, ?, ?)")
    .bind(
      at,
      actor,
      action,
      target,
      oldValue === undefined ? null : JSON.stringify(oldValue),
      newValue === undefined ? null : JSON.stringify(newValue),
    );
}

async function readJson<T>(request: Request): Promise<T | null> {
  const bytes = await readBodyLimited(request, 4 * 1024);
  return bytes ? parseJson<T>(bytes) : null;
}

/** Telegram id из тела или адреса: целое положительное число до 15 цифр. */
function parseUserId(value: unknown): number | null {
  if (typeof value === "number" && Number.isSafeInteger(value) && value > 0 && value < 1e15) return value;
  if (typeof value === "string" && /^\d{1,15}$/.test(value) && Number(value) > 0) return Number(value);
  return null;
}

export const adminRoutes = new Hono<AppEnv>();

adminRoutes.use("/api/admin/*", requireUser, requireAdmin, rateLimit("admin"));

// «Обзор»: сегодня, 7 дней и прошлые 7 дней, последние 14 дней по отдельности (adminStats.ts).
adminRoutes.get("/api/admin/overview", async (c) => c.json(await buildOverview(c.env.DB, Date.now())));

// Настройки приложения: действующие значения и кто их последним менял.
adminRoutes.get("/api/admin/config", async (c) => {
  const rows = await configRows(c.env.DB);
  const config = await loadConfig(c.env);
  const body: AdminConfigResponse = {
    items: CONFIG_KEYS.map((key) => {
      const row = rows.get(key);
      return {
        key,
        value: config[key],
        isDefault: !row,
        updatedAt: row?.updated_at ?? null,
        updatedBy: row?.updated_by ?? null,
      };
    }),
  };
  return c.json(body);
});

// Изменить настройку: { key, value }. Изменение пишется в журнал; то же значение ничего не меняет.
adminRoutes.put("/api/admin/config", async (c) => {
  const body = await readJson<{ key?: unknown; value?: unknown }>(c.req.raw);
  if (!(CONFIG_KEYS as unknown[]).includes(body?.key)) return c.json({ error: "bad_key" }, 400);
  const key = body!.key as ConfigKey;
  const value = body!.value;
  if (!isValidConfigValue(key, value)) return c.json({ error: "bad_value" }, 400);

  const actor = c.get("user").id;
  const old = (await loadConfig(c.env))[key];
  if (old === value) return c.json({ ok: true, changed: false });

  const now = nowSeconds();
  await c.env.DB.batch([
    c.env.DB
      .prepare(
        `INSERT INTO app_config (key, value, updated_by, updated_at) VALUES (?1, ?2, ?3, ?4)
         ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_by = excluded.updated_by, updated_at = excluded.updated_at`,
      )
      .bind(key, JSON.stringify(value), actor, now),
    logStatement(c.env.DB, actor, "config.set", key, old, value, now),
  ]);
  dropAdminCache(c.env.DB);
  logEvent("admin_config", { uid: actor, key, value: String(value) });
  return c.json({ ok: true, changed: true });
});

// Команда: владельцы из секрета и добавленные в панели, с именами из Telegram (если человек уже открывал приложение).
adminRoutes.get("/api/admin/team", async (c) => {
  const owners = [...ownerIds(c.env)];
  const rows = [...(await staffRows(c.env.DB)).values()].filter((r) => !owners.includes(r.user_id));
  const ids = [...owners, ...rows.map((r) => r.user_id)];
  const names = new Map<number, string>();
  if (ids.length > 0) {
    const { results } = await c.env.DB
      .prepare(`SELECT id, first_name FROM users WHERE id IN (${ids.map(() => "?").join(", ")})`)
      .bind(...ids)
      .all<{ id: number; first_name: string }>();
    for (const r of results) names.set(r.id, r.first_name);
  }
  const members: StaffMember[] = [
    ...owners.map((id) => ({ userId: id, role: "admin" as const, name: names.get(id) ?? null, owner: true, addedBy: null, addedAt: null })),
    ...rows
      .sort((a, b) => a.added_at - b.added_at)
      .map((r) => ({ userId: r.user_id, role: r.role, name: names.get(r.user_id) ?? null, owner: false, addedBy: r.added_by, addedAt: r.added_at })),
  ];
  const body: AdminTeamResponse = { members };
  return c.json(body);
});

/** Общие проверки перед изменением роли: владельца и себя менять нельзя. */
function teamTargetError(env: Bindings, actor: number, userId: number): "owner_locked" | "self" | null {
  if (ownerIds(env).has(userId)) return "owner_locked";
  if (userId === actor) return "self";
  return null;
}

// Добавить человека в команду или поменять ему роль: { userId, role }.
adminRoutes.put("/api/admin/team", async (c) => {
  const body = await readJson<{ userId?: unknown; role?: unknown }>(c.req.raw);
  const userId = parseUserId(body?.userId);
  if (!userId) return c.json({ error: "bad_user_id" }, 400);
  if (!STAFF_ROLES.includes(body?.role as StaffRole)) return c.json({ error: "bad_role" }, 400);
  const role = body!.role as StaffRole;
  const actor = c.get("user").id;
  const blocked = teamTargetError(c.env, actor, userId);
  if (blocked) return c.json({ error: blocked }, 409);

  // Читаем мимо кэша: решение о записи принимаем по базе.
  dropAdminCache(c.env.DB);
  const rows = await staffRows(c.env.DB);
  const old = rows.get(userId);
  if (old?.role === role) return c.json({ ok: true, changed: false });
  if (!old && rows.size >= MAX_STAFF) return c.json({ error: "too_many" }, 409);

  const now = nowSeconds();
  await c.env.DB.batch([
    c.env.DB
      .prepare(
        `INSERT INTO staff (user_id, role, added_by, added_at) VALUES (?1, ?2, ?3, ?4)
         ON CONFLICT (user_id) DO UPDATE SET role = excluded.role`,
      )
      .bind(userId, role, actor, now),
    logStatement(c.env.DB, actor, old ? "staff.change" : "staff.add", String(userId), old?.role, role, now),
  ]);
  dropAdminCache(c.env.DB);
  logEvent("admin_staff", { uid: actor, target: userId, role, was: old?.role ?? "none" });
  return c.json({ ok: true, changed: true });
});

// Убрать человека из команды: ?userId=<id>.
adminRoutes.delete("/api/admin/team", async (c) => {
  const userId = parseUserId(c.req.query("userId"));
  if (!userId) return c.json({ error: "bad_user_id" }, 400);
  const actor = c.get("user").id;
  const blocked = teamTargetError(c.env, actor, userId);
  if (blocked) return c.json({ error: blocked }, 409);

  dropAdminCache(c.env.DB);
  const old = (await staffRows(c.env.DB)).get(userId);
  if (!old) return c.json({ error: "not_found" }, 404);
  const now = nowSeconds();
  await c.env.DB.batch([
    c.env.DB.prepare("DELETE FROM staff WHERE user_id = ?").bind(userId),
    logStatement(c.env.DB, actor, "staff.remove", String(userId), old.role, undefined, now),
  ]);
  dropAdminCache(c.env.DB);
  logEvent("admin_staff", { uid: actor, target: userId, role: "none", was: old.role });
  return c.json({ ok: true });
});

// Журнал: последние записи, страницами по ADMIN_LOG_PAGE (?before=<id> для более старых).
adminRoutes.get("/api/admin/log", async (c) => {
  const beforeText = c.req.query("before");
  const before = beforeText !== undefined && /^\d{1,15}$/.test(beforeText) ? Number(beforeText) : null;
  const { results } = await c.env.DB
    .prepare(
      `SELECT l.id, l.at, l.actor, l.action, l.target, l.old_value, l.new_value, u.first_name
       FROM admin_log l LEFT JOIN users u ON u.id = l.actor
       WHERE (?1 IS NULL OR l.id < ?1) ORDER BY l.id DESC LIMIT ?2`,
    )
    .bind(before, ADMIN_LOG_PAGE + 1)
    .all<{
      id: number;
      at: number;
      actor: number;
      action: string;
      target: string | null;
      old_value: string | null;
      new_value: string | null;
      first_name: string | null;
    }>();
  const page = results.slice(0, ADMIN_LOG_PAGE);
  const value = (text: string | null) => (text === null ? null : (parseText(text) ?? null));
  const body: AdminLogResponse = {
    entries: page.map((r) => ({
      id: r.id,
      at: r.at,
      actor: r.actor,
      actorName: r.first_name,
      action: r.action,
      target: r.target,
      oldValue: value(r.old_value),
      newValue: value(r.new_value),
    })),
    nextBefore: results.length > ADMIN_LOG_PAGE ? page[page.length - 1]!.id : null,
  };
  return c.json(body);
});

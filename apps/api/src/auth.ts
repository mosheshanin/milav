import { createMiddleware } from "hono/factory";
import type { AppEnv } from "./env";

export interface AuthUser {
  id: number;
  firstName: string;
  lastName?: string;
  username?: string;
  languageCode?: string;
}

const encoder = new TextEncoder();

async function hmacSha256(key: ArrayBuffer | Uint8Array, data: string): Promise<ArrayBuffer> {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    key,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return crypto.subtle.sign("HMAC", cryptoKey, encoder.encode(data));
}

function toHex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export interface ValidateOptions {
  /** Текущее время в секундах (для тестов). */
  now?: number;
  /** Максимальный возраст подписи, секунд. По умолчанию сутки. */
  maxAgeSeconds?: number;
}

/**
 * Проверяет подпись initData из Telegram WebApp
 * (https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app).
 * Возвращает пользователя или null, если подпись неверна или устарела.
 */
export async function validateInitData(
  initData: string,
  botToken: string,
  options: ValidateOptions = {},
): Promise<AuthUser | null> {
  if (!initData || !botToken) return null;

  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) return null;
  params.delete("hash");

  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");

  const secretKey = await hmacSha256(encoder.encode("WebAppData"), botToken);
  const expected = toHex(await hmacSha256(secretKey, dataCheckString));
  if (!timingSafeEqual(expected, hash.toLowerCase())) return null;

  const now = options.now ?? Math.floor(Date.now() / 1000);
  const maxAge = options.maxAgeSeconds ?? 24 * 60 * 60;
  const authDate = Number(params.get("auth_date"));
  if (!Number.isFinite(authDate) || authDate <= 0) return null;
  if (now - authDate > maxAge) return null;
  if (authDate - now > 60) return null; // подпись «из будущего»

  const rawUser = params.get("user");
  if (!rawUser) return null;
  try {
    const u = JSON.parse(rawUser) as Record<string, unknown>;
    if (typeof u.id !== "number" || typeof u.first_name !== "string") return null;
    return {
      id: u.id,
      firstName: u.first_name,
      lastName: typeof u.last_name === "string" ? u.last_name : undefined,
      username: typeof u.username === "string" ? u.username : undefined,
      languageCode: typeof u.language_code === "string" ? u.language_code : undefined,
    };
  } catch {
    return null;
  }
}

/** Тестовый вход для локальной разработки: заголовок `Authorization: dev <id>:<имя>`. */
export function parseDevUser(value: string): AuthUser | null {
  const match = /^(\d{1,15}):(.{1,64})$/.exec(value.trim());
  if (!match) return null;
  return { id: Number(match[1]), firstName: match[2] as string };
}

/**
 * Требует авторизацию. Боевой вход: `Authorization: tma <initData>`.
 * Тестовый вход (`dev`) работает только если в окружении явно включён ALLOW_DEV_AUTH.
 */
export const requireUser = createMiddleware<AppEnv>(async (c, next) => {
  const header = c.req.header("Authorization") ?? "";
  const space = header.indexOf(" ");
  const scheme = space === -1 ? header : header.slice(0, space);
  const value = space === -1 ? "" : header.slice(space + 1);

  let user: AuthUser | null = null;
  if (scheme === "tma") {
    if (!c.env.BOT_TOKEN) return c.json({ error: "bot_token_missing" }, 503);
    user = await validateInitData(value, c.env.BOT_TOKEN);
  } else if (scheme === "dev" && c.env.ALLOW_DEV_AUTH === "true") {
    user = parseDevUser(value);
  }

  if (!user) return c.json({ error: "unauthorized" }, 401);
  c.set("user", user);
  await next();
});

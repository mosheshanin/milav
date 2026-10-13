// Защита от случайного ослабления политики безопасности (apps/web/public/_headers).
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const read = (relative: string) => readFileSync(fileURLToPath(new URL(relative, import.meta.url)), "utf8");
const headersFile = read("../../web/public/_headers");

/** Значение заголовка из правила `/*` (первое найденное). */
function header(name: string): string | undefined {
  const line = headersFile.split("\n").find((l) => l.trim().toLowerCase().startsWith(`${name.toLowerCase()}:`));
  return line?.slice(line.indexOf(":") + 1).trim();
}

/** Разбирает CSP на директивы: имя → список источников. */
function directives(csp: string): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const part of csp.split(";")) {
    const [name, ...sources] = part.trim().split(/\s+/);
    if (name) map.set(name, sources);
  }
  return map;
}

describe("_headers: политика безопасности статики", () => {
  const csp = directives(header("Content-Security-Policy") ?? "");

  it("правило относится ко всем путям", () => {
    expect(headersFile.split("\n").some((l) => l.trim() === "/*")).toBe(true);
  });

  it("по умолчанию всё запрещено, объекты и базовый адрес закрыты", () => {
    expect(csp.get("default-src")).toEqual(["'none'"]);
    expect(csp.get("object-src")).toEqual(["'none'"]);
    expect(csp.get("base-uri")).toEqual(["'none'"]);
    expect(csp.get("form-action")).toEqual(["'none'"]);
  });

  it("скрипты только свои и Telegram, без inline и eval", () => {
    expect(csp.get("script-src")).toEqual(["'self'", "https://telegram.org"]);
    for (const [name, sources] of csp) {
      expect(sources, name).not.toContain("'unsafe-eval'");
      expect(sources, name).not.toContain("*");
    }
    expect(csp.get("script-src")).not.toContain("'unsafe-inline'");
  });

  it("встраивать приложение можно только в Telegram", () => {
    const ancestors = csp.get("frame-ancestors") ?? [];
    expect(ancestors.length).toBeGreaterThan(0);
    for (const source of ancestors) expect(source).toMatch(/^https:\/\/(\*\.)?(web\.)?telegram\.org$/);
  });

  it("все внешние скрипты из index.html разрешены политикой", () => {
    const html = read("../../web/index.html");
    const hosts = [...html.matchAll(/<script[^>]+src="(https?:\/\/[^"]+)"/g)].map((m) => new URL(m[1]!).origin);
    expect(hosts.length).toBeGreaterThan(0);
    for (const origin of hosts) expect(csp.get("script-src")).toContain(origin);
  });

  it("в index.html нет inline-скриптов (их заблокирует политика)", () => {
    const html = read("../../web/index.html");
    const inline = [...html.matchAll(/<script(?![^>]*\ssrc=)[^>]*>([\s\S]*?)<\/script>/g)].filter((m) => m[1]!.trim());
    expect(inline).toEqual([]);
  });

  it("остальные защитные заголовки на месте", () => {
    expect(header("X-Content-Type-Options")).toBe("nosniff");
    expect(header("Referrer-Policy")).toBe("no-referrer");
    expect(header("Permissions-Policy")).toContain("microphone=(self)");
  });
});

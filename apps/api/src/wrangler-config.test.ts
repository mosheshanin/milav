// Защита от выкладки с тестовым входом: ALLOW_DEV_AUTH пускает в приложение без подписи Telegram,
// поэтому он допустим только в окружении env.local (локальная разработка и сквозной тест).
// Если переменная окажется на верхнем уровне или в другом окружении (например, staging),
// любой сможет войти под чужим номером. Этот тест должен падать в таком случае.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const CONFIG_PATH = fileURLToPath(new URL("../../../wrangler.jsonc", import.meta.url));

/** Убирает комментарии и висячие запятые из JSONC, не трогая содержимое строк. */
export function stripJsonc(text: string): string {
  let out = "";
  let i = 0;
  while (i < text.length) {
    const ch = text[i]!;
    const next = text[i + 1];
    if (ch === '"') {
      let j = i + 1;
      while (j < text.length && text[j] !== '"') j += text[j] === "\\" ? 2 : 1;
      out += text.slice(i, j + 1);
      i = j + 1;
    } else if (ch === "/" && next === "/") {
      while (i < text.length && text[i] !== "\n") i++;
    } else if (ch === "/" && next === "*") {
      const end = text.indexOf("*/", i + 2);
      i = end === -1 ? text.length : end + 2;
    } else if (ch === ",") {
      let j = i + 1;
      while (j < text.length && /\s/.test(text[j]!)) j++;
      if (text[j] !== "}" && text[j] !== "]") out += ch;
      i++;
    } else {
      out += ch;
      i++;
    }
  }
  return out;
}

/** Все пути (через точку), по которым в объекте встречается ключ. */
function findKeyPaths(value: unknown, key: string, path: string[] = []): string[] {
  if (value === null || typeof value !== "object") return [];
  const found: string[] = [];
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    const here = [...path, k];
    if (k === key) found.push(here.join("."));
    found.push(...findKeyPaths(v, key, here));
  }
  return found;
}

const config = JSON.parse(stripJsonc(readFileSync(CONFIG_PATH, "utf8"))) as Record<string, any>;

describe("wrangler.jsonc: тестовый вход", () => {
  it("ALLOW_DEV_AUTH есть только в env.local.vars", () => {
    expect(findKeyPaths(config, "ALLOW_DEV_AUTH")).toEqual(["env.local.vars.ALLOW_DEV_AUTH"]);
  });

  it("на верхнем уровне нет vars с тестовым входом", () => {
    expect(config.vars?.ALLOW_DEV_AUTH).toBeUndefined();
  });

  it("в env.local тестовый вход включён (иначе сквозной тест не сможет войти)", () => {
    expect(config.env?.local?.vars?.ALLOW_DEV_AUTH).toBe("true");
  });

  it("ни одно окружение, кроме local, не включает тестовый вход", () => {
    for (const [name, env] of Object.entries<Record<string, any>>(config.env ?? {})) {
      if (name === "local") continue;
      expect(env.vars?.ALLOW_DEV_AUTH, `env.${name}`).toBeUndefined();
    }
  });
});

describe("wrangler.jsonc: запись шаблонов букв", () => {
  // Список тех, кто может записывать шаблоны, в продакшене секрет Cloudflare. В файле он допустим только в env.local:
  // иначе настоящий id владельца попал бы в репозиторий, а значение из файла перекрыло бы секрет.
  it("TEMPLATE_RECORDER_IDS есть только в env.local.vars", () => {
    expect(findKeyPaths(config, "TEMPLATE_RECORDER_IDS")).toEqual(["env.local.vars.TEMPLATE_RECORDER_IDS"]);
  });

  it("в env.local записывающий это тестовый пользователь 1001 (сквозной тест входит под ним)", () => {
    expect(config.env?.local?.vars?.TEMPLATE_RECORDER_IDS).toBe("1001");
  });
});

describe("wrangler.jsonc: таблица лидеров", () => {
  // Таблица включена владельцем 14.10.2026. Выключить в продакшене значит поменять "1" на "0" здесь и в wrangler.jsonc
  // одним коммитом. Локально она включена, чтобы её проверял сквозной тест.
  it("в продакшене и в env.local включена", () => {
    expect(config.vars?.LEADERBOARD_ENABLED).toBe("1");
    expect(config.env?.local?.vars?.LEADERBOARD_ENABLED).toBe("1");
  });

  it("переменная задана только на верхнем уровне и в env.local", () => {
    expect(findKeyPaths(config, "LEADERBOARD_ENABLED").sort()).toEqual(["env.local.vars.LEADERBOARD_ENABLED", "vars.LEADERBOARD_ENABLED"]);
  });
});

describe("wrangler.jsonc: база для миграций при деплое", () => {
  // Команда деплоя из docs/DEPLOY.md: wrangler d1 migrations apply milav-db --remote
  it("боевая база называется milav-db и миграции лежат в migrations/", () => {
    const db = config.d1_databases?.find((d: any) => d.binding === "DB");
    expect(db?.database_name).toBe("milav-db");
    expect(db?.migrations_dir).toBe("migrations");
  });
});

describe("stripJsonc", () => {
  it("убирает комментарии и висячие запятые, строки не трогает", () => {
    const text = `{
      // комментарий
      "url": "https://example.com/a//b", /* блок */
      "list": [1, 2,],
    }`;
    expect(JSON.parse(stripJsonc(text))).toEqual({ url: "https://example.com/a//b", list: [1, 2] });
  });
});

describe("wrangler.jsonc: журналы", () => {
  // Без observability ошибки сервера и отчёты приложения никуда не сохраняются (ROADMAP п. 9, docs/DEPLOY.md).
  it("Workers Logs включены в продакшене", () => {
    expect(config.observability?.enabled).toBe(true);
    expect(config.observability?.head_sampling_rate).toBeGreaterThan(0);
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  BOT_COMMANDS,
  BOT_DESCRIPTION,
  BOT_WEBHOOK_PATH,
  FALLBACK_TEXT,
  HELP_TEXT,
  commandOf,
  ensureBotSetup,
  ensureBotSetupOnce,
  isTelegramWebhook,
  replyTo,
  resetBotSetupForTests,
  webhookSecret,
  webhookUrl,
  type FetchLike,
} from "./bot";
import { TOKEN, api, ctx, resetHarness } from "./test-utils/harness";

beforeEach(() => {
  resetHarness();
  resetBotSetupForTests();
});
afterEach(() => vi.restoreAllMocks());

const ORIGIN = "https://milav.example.workers.dev";

function privateMessage(text: string, extra: Record<string, unknown> = {}) {
  return { update_id: 1, message: { text, chat: { id: 42, type: "private" }, from: { id: 42, first_name: "Аня" }, ...extra } };
}

async function webhook(body: unknown, secret?: string | null) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const s = secret === undefined ? await webhookSecret(TOKEN) : secret;
  if (s !== null) headers["X-Telegram-Bot-Api-Secret-Token"] = s;
  return api(BOT_WEBHOOK_PATH, { method: "POST", headers, body: typeof body === "string" ? body : JSON.stringify(body) });
}

describe("команды", () => {
  it("распознаёт /start, /help, с параметром и с именем бота", () => {
    expect(commandOf("/start")).toBe("start");
    expect(commandOf("/start record")).toBe("start");
    expect(commandOf("/Start@milavbotbot")).toBe("start");
    expect(commandOf("  /help  ")).toBe("help");
    expect(commandOf("привет")).toBeNull();
    expect(commandOf("/")).toBeNull();
    expect(commandOf(undefined)).toBeNull();
  });
});

describe("ответы бота", () => {
  const APP = `${ORIGIN}/`;

  it("на /start приветствует по имени и даёт кнопку приложения", () => {
    const reply = replyTo(privateMessage("/start"), APP)!;
    expect(reply.method).toBe("sendMessage");
    expect(reply.chat_id).toBe(42);
    expect(reply.text).toContain("Шалом, Аня!");
    expect(reply.reply_markup.inline_keyboard[0]![0]!.web_app.url).toBe(APP);
  });

  it("на /help объясняет, как заниматься; на прочий текст предлагает приложение", () => {
    expect(replyTo(privateMessage("/help"), APP)!.text).toBe(HELP_TEXT);
    expect(replyTo(privateMessage("шалом!"), APP)!.text).toBe(FALLBACK_TEXT);
    expect(replyTo(privateMessage("/unknown"), APP)!.text).toBe(FALLBACK_TEXT);
  });

  it("без имени приветствие без запятой; управляющие символы в имени убираются", () => {
    expect(replyTo({ message: { text: "/start", chat: { id: 1, type: "private" }, from: { id: 1 } } }, APP)!.text).toMatch(
      /^Шалом! /,
    );
    const odd = replyTo(privateMessage("/start", { from: { id: 1, first_name: "А\nня" } }), APP)!;
    expect(odd.text.startsWith("Шалом, Аня!")).toBe(true);
  });

  it("молчит в группах и каналах, на сообщения ботов и на обновления без сообщения", () => {
    expect(replyTo(privateMessage("/start", { chat: { id: -5, type: "group" } }), APP)).toBeNull();
    expect(replyTo(privateMessage("/start", { chat: { id: -5, type: "supergroup" } }), APP)).toBeNull();
    expect(replyTo(privateMessage("/start", { from: { id: 9, is_bot: true } }), APP)).toBeNull();
    expect(replyTo({ update_id: 3 }, APP)).toBeNull();
    expect(replyTo({ message: { text: "/start" } }, APP)).toBeNull();
  });
});

describe("вебхук", () => {
  it("без секрета и с чужим секретом 401", async () => {
    expect((await webhook(privateMessage("/start"), null)).status).toBe(401);
    expect((await webhook(privateMessage("/start"), "x".repeat(64))).status).toBe(401);
  });

  it("без токена бота 401 (секрет не из чего вывести)", async () => {
    const res = await api(
      BOT_WEBHOOK_PATH,
      { method: "POST", headers: { "X-Telegram-Bot-Api-Secret-Token": await webhookSecret(TOKEN) }, body: "{}" },
      { DB: ctx.env.DB },
    );
    expect(res.status).toBe(401);
  });

  it("на /start отвечает sendMessage с кнопкой на адрес приложения", async () => {
    const res = await webhook(privateMessage("/start"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.method).toBe("sendMessage");
    expect(body.chat_id).toBe(42);
    expect(body.reply_markup.inline_keyboard[0][0].web_app.url).toBe("http://localhost/");
  });

  it("мусор, группа и слишком большое тело: 200 без ответа (Telegram не будет повторять)", async () => {
    for (const bad of ["не json", "null", "5", JSON.stringify(privateMessage("/start", { chat: { id: -1, type: "group" } }))]) {
      const res = await webhook(bad);
      expect(res.status).toBe(200);
      expect(await res.text()).toBe("");
    }
    const huge = await webhook(privateMessage("x".repeat(70 * 1024)));
    expect(huge.status).toBe(200);
    expect(await huge.text()).toBe("");
  });

  it("секрет сравнивается целиком и зависит от токена", async () => {
    const secret = await webhookSecret(TOKEN);
    expect(secret).toMatch(/^[0-9a-f]{64}$/);
    expect(await isTelegramWebhook(secret, TOKEN)).toBe(true);
    expect(await isTelegramWebhook(secret.slice(0, 63), TOKEN)).toBe(false);
    expect(await isTelegramWebhook(secret, "other:token")).toBe(false);
    expect(await webhookSecret("other:token")).not.toBe(secret);
  });
});

/** Поддельный Telegram: запоминает вызовы, отвечает по сценарию. */
function fakeTelegram(state: { url?: string; allowed?: string[]; description?: string; short?: string; fail?: string }) {
  const calls: { method: string; body: any }[] = [];
  const fetchFn: FetchLike = async (input, init) => {
    const method = input.split("/").pop()!;
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    calls.push({ method, body });
    if (state.fail === method) return new Response(JSON.stringify({ ok: false, description: "Bad Request: oops" }), { status: 400 });
    const results: Record<string, unknown> = {
      getWebhookInfo: { url: state.url ?? "", allowed_updates: state.allowed },
      setWebhook: true,
      setMyCommands: true,
      getMyDescription: { description: state.description ?? "" },
      setMyDescription: true,
      getMyShortDescription: { short_description: state.short ?? "" },
      setMyShortDescription: true,
    };
    return new Response(JSON.stringify({ ok: true, result: results[method] }), { status: 200 });
  };
  return { calls, fetchFn, methods: () => calls.map((c) => c.method) };
}

describe("самонастройка вебхука", () => {
  it("без вебхука регистрирует его с секретом, ставит команды и пустое описание", async () => {
    const tg = fakeTelegram({});
    expect(await ensureBotSetup({ BOT_TOKEN: TOKEN }, ORIGIN, tg.fetchFn)).toBe("set");
    const set = tg.calls.find((c) => c.method === "setWebhook")!;
    expect(set.body.url).toBe(await webhookUrl(ORIGIN, TOKEN));
    expect(set.body.url.startsWith(`${ORIGIN}${BOT_WEBHOOK_PATH}?v=`)).toBe(true);
    expect(set.body.secret_token).toBe(await webhookSecret(TOKEN));
    expect(set.body.allowed_updates).toEqual(["message", "callback_query"]);
    expect(tg.calls.find((c) => c.method === "setMyCommands")!.body.commands).toEqual(BOT_COMMANDS);
    expect(tg.calls.find((c) => c.method === "setMyDescription")!.body.description).toBe(BOT_DESCRIPTION);
    expect(tg.methods()).toContain("setMyShortDescription");
  });

  it("описание, заданное владельцем в BotFather, не трогает", async () => {
    const tg = fakeTelegram({ description: "Своё", short: "Своё" });
    expect(await ensureBotSetup({ BOT_TOKEN: TOKEN }, ORIGIN, tg.fetchFn)).toBe("set");
    expect(tg.methods()).not.toContain("setMyDescription");
    expect(tg.methods()).not.toContain("setMyShortDescription");
  });

  it("если вебхук уже наш, ничего не меняет (один запрос)", async () => {
    const tg = fakeTelegram({ url: await webhookUrl(ORIGIN, TOKEN), allowed: ["callback_query", "message"] });
    expect(await ensureBotSetup({ BOT_TOKEN: TOKEN }, ORIGIN, tg.fetchFn)).toBe("ok");
    expect(tg.methods()).toEqual(["getWebhookInfo"]);
  });

  it("наш вебхук со старым токеном или другим набором обновлений перерегистрирует", async () => {
    const old = fakeTelegram({ url: await webhookUrl(ORIGIN, "old:token"), allowed: ["message"] });
    expect(await ensureBotSetup({ BOT_TOKEN: TOKEN }, ORIGIN, old.fetchFn)).toBe("set");
    const narrow = fakeTelegram({ url: await webhookUrl(ORIGIN, TOKEN), allowed: ["callback_query"] });
    expect(await ensureBotSetup({ BOT_TOKEN: TOKEN }, ORIGIN, narrow.fetchFn)).toBe("set");
  });

  it("чужой вебхук не перезаписывает и пишет в журнал только хост", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const tg = fakeTelegram({ url: "https://old-server.example.com/hook/secret-path" });
    expect(await ensureBotSetup({ BOT_TOKEN: TOKEN }, ORIGIN, tg.fetchFn)).toBe("foreign");
    expect(tg.methods()).toEqual(["getWebhookInfo"]);
    const line = String(warn.mock.calls[0]?.[0]);
    expect(line).toContain("bot_webhook_foreign");
    expect(line).toContain("old-server.example.com");
    expect(line).not.toContain("secret-path");
  });

  it("ошибка Telegram не роняет запрос, а токен не попадает в журнал", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const tg = fakeTelegram({ fail: "setWebhook" });
    expect(await ensureBotSetup({ BOT_TOKEN: TOKEN }, ORIGIN, tg.fetchFn)).toBe("error");
    const line = String(error.mock.calls[0]?.[0]);
    expect(line).toContain("bot_setup_error");
    expect(line).not.toContain(TOKEN);
  });

  it("без токена ничего не делает; повторный запуск в том же экземпляре пропускается", async () => {
    const tg = fakeTelegram({});
    expect(await ensureBotSetup({}, ORIGIN, tg.fetchFn)).toBe("no-token");
    expect(tg.calls).toEqual([]);
    expect(ensureBotSetupOnce({ BOT_TOKEN: TOKEN }, ORIGIN, tg.fetchFn)).not.toBeNull();
    expect(ensureBotSetupOnce({ BOT_TOKEN: TOKEN }, ORIGIN, tg.fetchFn)).toBeNull();
  });
});

describe("самонастройка при входе", () => {
  it("запускается, когда приложение открывает владелец, и не запускается для остальных", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
      new Response(JSON.stringify({ ok: true, result: { url: "" } }), { status: 200 }),
    );
    await api("/api/me", { as: 5 }, { ...ctx.env, TEMPLATE_RECORDER_IDS: "7" });
    expect(fetchSpy).not.toHaveBeenCalled();
    await api("/api/me", { as: 7 }, { ...ctx.env, TEMPLATE_RECORDER_IDS: "7" });
    await vi.waitFor(() => expect(fetchSpy).toHaveBeenCalled());
    expect(String(fetchSpy.mock.calls[0]![0])).toMatch(/\/getWebhookInfo$/);
  });
});

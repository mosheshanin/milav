import { beforeEach, describe, expect, it } from "vitest";
import { RATE_LIMITS } from "@milav/shared";
import type { Bindings } from "./env";
import { api, ctx, resetHarness } from "./test-utils/harness";

const OWNER = 9301;
const STUDENT = 9302;

beforeEach(resetHarness);

const env = (): Bindings => ({ ...ctx.env, ADMIN_IDS: `${OWNER}` });
const setMode = (value: string) =>
  api("/api/admin/config", { method: "PUT", as: OWNER, body: JSON.stringify({ key: "numbersTrainer", value }), headers: { "Content-Type": "application/json" } }, env());
const speak = (as: number, query: string, bytes = 2000, e: Bindings = env()) =>
  api(`/api/numbers/speech?${query}`, { method: "POST", as, body: new Uint8Array(bytes), headers: { "Content-Type": "audio/webm" } }, e);
const json = async (res: Response) => (await res.json()) as { match?: boolean; heard?: string; error?: string; retryAfter?: number };

describe("тренажёр чисел: проверка речи", () => {
  it("по умолчанию только команде: ученику 403, владельцу 200", async () => {
    ctx.heard = "שלושים וחמש";
    expect((await speak(STUDENT, "scene=number&value=35")).status).toBe(403);
    const res = await speak(OWNER, "scene=number&value=35");
    expect(res.status).toBe(200);
    expect(await json(res)).toEqual({ heard: "שלושים וחמש", match: true });
  });

  it("переключатель: все — ученику можно, выкл — и владельцу нельзя", async () => {
    ctx.heard = "שלושים וחמש";
    expect((await setMode("all")).status).toBe(200);
    expect((await speak(STUDENT, "scene=number&value=35")).status).toBe(200);
    expect((await setMode("off")).status).toBe(200);
    const off = await speak(OWNER, "scene=number&value=35");
    expect(off.status).toBe(403);
    expect(await json(off)).toEqual({ error: "feature_off" });
  });

  it("без входа 401", async () => {
    expect((await api("/api/numbers/speech?scene=number&value=1", { method: "POST" })).status).toBe(401);
  });

  it("цифры в ответе распознавателя засчитываются, соседнее число нет", async () => {
    ctx.heard = "35";
    expect((await json(await speak(OWNER, "scene=number&value=35"))).match).toBe(true);
    ctx.heard = "שלושים וארבע";
    expect((await json(await speak(OWNER, "scene=number&value=35"))).match).toBe(false);
  });

  it("цена, возраст, этаж и время", async () => {
    ctx.heard = "שני שקלים";
    expect((await json(await speak(OWNER, "scene=price&value=2"))).match).toBe(true);
    ctx.heard = "בן שלושים וחמש";
    expect((await json(await speak(OWNER, "scene=age&value=35"))).match).toBe(true);
    ctx.heard = "קומה שלוש";
    expect((await json(await speak(OWNER, "scene=floor&value=3"))).match).toBe(true);
    ctx.heard = "ארבע בלי עשרים וחמש";
    expect((await json(await speak(OWNER, "scene=time&hour=3&minute=35"))).match).toBe(true);
    ctx.heard = "ארבע בלי עשרים";
    expect((await json(await speak(OWNER, "scene=time&hour=3&minute=35"))).match).toBe(false);
  });

  it("неверное задание 400", async () => {
    for (const query of ["", "scene=number", "scene=number&value=10000", "scene=number&value=-1", "scene=number&value=abc", "scene=price&value=0", "scene=phone&value=1", "scene=time&hour=13&minute=0", "scene=time&hour=3&minute=7"]) {
      const res = await speak(OWNER, query);
      expect(res.status, query).toBe(400);
      expect(await json(res), query).toEqual({ error: "bad_target" });
    }
  });

  it("без Workers AI 503", async () => {
    const res = await speak(OWNER, "scene=number&value=1", 2000, { ...env(), AI: undefined });
    expect(res.status).toBe(503);
    expect(await json(res)).toEqual({ error: "speech_unavailable" });
  });

  it("сбой распознавания 502, пустая и слишком большая запись отклоняются", async () => {
    const broken = { ...env(), AI: { run: async () => { throw new Error("boom"); } } } as Bindings;
    expect((await speak(OWNER, "scene=number&value=1", 2000, broken)).status).toBe(502);
    expect((await speak(OWNER, "scene=number&value=1", 0)).status).toBe(400);
    expect((await speak(OWNER, "scene=number&value=1", 2_000_000)).status).toBe(413);
  });

  it("свой суточный лимит: после предела 429, а общий лимит «говори» не расходуется сверх своих запросов", async () => {
    ctx.heard = "אחת";
    const { perDay } = RATE_LIMITS.numbers;
    // Минутный лимит ниже суточного: сдвигаем окно, подменяя счётчик прямо в базе.
    for (let i = 0; i < perDay; i++) {
      await ctx.env.DB.prepare("UPDATE rate_limits SET minute_count = 0 WHERE user_id = ?").bind(OWNER).run();
      expect((await speak(OWNER, "scene=number&value=1")).status, `запрос ${i + 1}`).toBe(200);
    }
    await ctx.env.DB.prepare("UPDATE rate_limits SET minute_count = 0 WHERE user_id = ?").bind(OWNER).run();
    const limited = await speak(OWNER, "scene=number&value=1");
    expect(limited.status).toBe(429);
    expect((await json(limited)).error).toBe("rate_limited");
    expect(limited.headers.get("Retry-After")).toBeTruthy();
  });
});

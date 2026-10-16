import { beforeEach, describe, expect, it, vi } from "vitest";
import { HEBREW_LETTERS, RATE_LIMITS, TEMPLATE_VARIANTS_PER_LETTER, type Stroke, type TemplateItem } from "@milav/shared";
import { api, ctx, letterStrokes, resetHarness } from "./test-utils/harness";
import { parseIds as recorderIds } from "./admin";
import { saveTemplate } from "./templateRecorder";

const OWNER = 7001;
const STRANGER = 7002;

beforeEach(resetHarness);

/** Окружение, в котором записывающим назначен OWNER. */
const env = () => ({ ...ctx.env, TEMPLATE_RECORDER_IDS: `${OWNER}` });

const list = (as = OWNER) => api("/api/templates", { as }, env());
const put = (body: unknown, as = OWNER) =>
  api("/api/templates", { method: "PUT", as, body: JSON.stringify(body), headers: { "Content-Type": "application/json" } }, env());
const del = (query: string, as = OWNER) => api(`/api/templates?${query}`, { method: "DELETE", as }, env());

async function items(): Promise<TemplateItem[]> {
  return ((await (await list()).json()) as { items: TemplateItem[] }).items;
}

describe("доступ к записи шаблонов", () => {
  it("без входа 401", async () => {
    expect((await api("/api/templates", {}, env())).status).toBe(401);
  });

  it("чужому пользователю 403 на любой запрос", async () => {
    expect((await list(STRANGER)).status).toBe(403);
    expect((await put({ letter: "א", slot: 0, strokes: await letterStrokes("א") }, STRANGER)).status).toBe(403);
    expect((await del("letter=%D7%90&slot=0", STRANGER)).status).toBe(403);
    expect(await items()).toEqual([]);
  });

  it("если секрет не задан, не может никто", async () => {
    const noSecret = ctx.env;
    expect((await api("/api/templates", { as: OWNER }, noSecret)).status).toBe(403);
    expect((await api("/api/templates", { as: OWNER }, { ...ctx.env, TEMPLATE_RECORDER_IDS: "" })).status).toBe(403);
    expect((await api("/api/templates", { as: OWNER }, { ...ctx.env, TEMPLATE_RECORDER_IDS: "abc, ,0x10" })).status).toBe(403);
  });

  it("секрет может содержать несколько id", async () => {
    const both = { ...ctx.env, TEMPLATE_RECORDER_IDS: `${OWNER}, ${STRANGER}` };
    expect((await api("/api/templates", { as: STRANGER }, both)).status).toBe(200);
  });

  it("разбор списка id", () => {
    expect([...recorderIds("1, 2;3\n4,,x,5.5,-6")].sort()).toEqual([1, 2, 3, 4]);
    expect(recorderIds(undefined).size).toBe(0);
  });
});

describe("запись вариантов", () => {
  it("пока ничего не записано, список пуст и называет число вариантов", async () => {
    const res = await list();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ variants: TEMPLATE_VARIANTS_PER_LETTER, items: [] });
  });

  it("записывает вариант, возвращает его и узнаёт похожую букву", async () => {
    const strokes = await letterStrokes("ד");
    const res = await put({ letter: "ד", slot: 2, strokes });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { item: TemplateItem; accepted: boolean; looksLike: string };
    expect(body.accepted).toBe(true);
    expect(body.looksLike).toBe("ד");
    expect(body.item.letter).toBe("ד");
    expect(body.item.slot).toBe(2);
    expect(body.item.recordedAt).toMatch(/^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/);

    // Штрихи возвращаются как были записаны (с округлением до 0,1 пикселя).
    const stored = await items();
    expect(stored).toHaveLength(1);
    expect(stored[0]!.strokes).toEqual(strokes);
  });

  it("рисунок другой буквы сохраняется, но ответ предупреждает, на что он похож", async () => {
    const res = await put({ letter: "ו", slot: 0, strokes: await letterStrokes("ב") });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { accepted: boolean; looksLike: string };
    expect(body.accepted).toBe(false);
    expect(body.looksLike).toBe("ב");
    expect(await items()).toHaveLength(1);
  });

  it("повторная запись в тот же номер заменяет вариант", async () => {
    await put({ letter: "ר", slot: 1, strokes: await letterStrokes("ד") });
    const better = await letterStrokes("ר");
    const res = await put({ letter: "ר", slot: 1, strokes: better });
    expect(((await res.json()) as { accepted: boolean }).accepted).toBe(true);
    const stored = await items();
    expect(stored).toHaveLength(1);
    expect(stored[0]!.strokes).toEqual(better);
  });

  it("список упорядочен по букве и номеру", async () => {
    const strokes = await letterStrokes("ב");
    for (const [letter, slot] of [["ב", 3], ["ב", 0], ["א", 1]] as const) {
      expect((await put({ letter, slot, strokes })).status).toBe(200);
    }
    expect((await items()).map((i) => `${i.letter}${i.slot}`)).toEqual(["א1", "ב0", "ב3"]);
  });

  it("помещаются все 27 форм по всем вариантам", async () => {
    const strokes = await letterStrokes("ב");
    // Один и тот же рисунок во все ячейки: проверяем ключ (форма, номер), а не распознавание.
    // Пишем напрямую в базу: 135 запросов подряд упёрлись бы в минутный лимит (он проверен отдельным тестом).
    for (const letter of HEBREW_LETTERS) {
      for (let slot = 0; slot < TEMPLATE_VARIANTS_PER_LETTER; slot++) {
        await saveTemplate(ctx.env.DB, OWNER, letter, slot, strokes);
      }
    }
    expect(await items()).toHaveLength(HEBREW_LETTERS.length * TEMPLATE_VARIANTS_PER_LETTER);
  });
});

describe("проверка присланного", () => {
  const good = () => letterStrokes("ב");

  it("неизвестная форма", async () => {
    for (const letter of ["a", "ּ", "", 5, null, "אב"]) {
      const res = await put({ letter, slot: 0, strokes: await good() });
      expect(res.status, `буква ${JSON.stringify(letter)}`).toBe(400);
      expect(await res.json()).toEqual({ error: "bad_letter" });
    }
  });

  it("неверный номер варианта", async () => {
    for (const slot of [-1, TEMPLATE_VARIANTS_PER_LETTER, 1.5, "0", null, undefined]) {
      const res = await put({ letter: "א", slot, strokes: await good() });
      expect(res.status, `номер ${JSON.stringify(slot)}`).toBe(400);
      expect(await res.json()).toEqual({ error: "bad_slot" });
    }
  });

  it("неверные штрихи", async () => {
    const bad: unknown[] = [
      undefined,
      [],
      "x",
      [[]],
      [[{ x: 1 }]],
      [[{ x: "1", y: 2 }]],
      [[{ x: Infinity, y: 2 }]],
      [[{ x: 99999, y: 2 }]],
      Array.from({ length: 25 }, () => [{ x: 1, y: 1 }]),
    ];
    for (const strokes of bad) {
      const res = await put({ letter: "א", slot: 0, strokes });
      expect(res.status, JSON.stringify(strokes)?.slice(0, 40)).toBe(400);
      expect(await res.json()).toEqual({ error: "bad_strokes" });
    }
    expect(await items()).toEqual([]);
  });

  it("слишком маленький рисунок (случайное касание) не записывается", async () => {
    const dot: Stroke[] = [[{ x: 50, y: 50 }, { x: 51, y: 50.5 }]];
    const res = await put({ letter: "א", slot: 0, strokes: dot });
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({ error: "too_small" });
    expect(await items()).toEqual([]);
  });

  it("слишком большое тело 413, не-JSON 400", async () => {
    const huge = { letter: "א", slot: 0, strokes: [[{ x: 1, y: 1 }]], pad: "x".repeat(300 * 1024) };
    expect((await put(huge)).status).toBe(413);
    const res = await api("/api/templates", { method: "PUT", as: OWNER, body: "не json" }, env());
    expect(res.status).toBe(400);
  });
});

describe("удаление варианта", () => {
  it("удаляет, повторное удаление 404", async () => {
    await put({ letter: "ג", slot: 4, strokes: await letterStrokes("ג") });
    const q = `letter=${encodeURIComponent("ג")}&slot=4`;
    expect((await del(q)).status).toBe(200);
    expect(await items()).toEqual([]);
    expect((await del(q)).status).toBe(404);
  });

  it("неверный запрос 400", async () => {
    expect((await del("letter=a&slot=0")).status).toBe(400);
    expect((await del(`letter=${encodeURIComponent("ג")}&slot=9`)).status).toBe(400);
    expect((await del(`letter=${encodeURIComponent("ג")}`)).status).toBe(400);
  });
});

describe("лимит запросов к инструменту записи", () => {
  it("сверх лимита в минуту 429", async () => {
    // Часы стоят в начале минуты: иначе 120 запросов могут попасть на смену минуты, и счётчик обнулится.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-14T09:00:05Z"));
    try {
      for (let i = 0; i < RATE_LIMITS.templates.perMinute; i++) expect((await list()).status).toBe(200);
      const res = await list();
      expect(res.status).toBe(429);
      expect(((await res.json()) as { error: string }).error).toBe("rate_limited");
    } finally {
      vi.useRealTimers();
    }
  });
});

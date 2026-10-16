// Проверка слов носителем (панель, этап 3): доступ, список, отзыв, отзыв на старую версию, выгрузка, журнал.
import { beforeEach, describe, expect, it } from "vitest";
import { allLessons } from "@milav/content";
import {
  RATE_LIMITS,
  isAlphabetLesson,
  reviewFields,
  reviewFingerprint,
  type AdminLogResponse,
  type ReviewExportResponse,
  type ReviewItemResponse,
  type ReviewListResponse,
} from "@milav/shared";
import type { Bindings } from "./env";
import { api, auth, ctx, letter, resetHarness, word } from "./test-utils/harness";

const OWNER = 9101;
const ADMIN = 9102;
const REVIEWER = 9103;
const REVIEWER2 = 9105;
const STUDENT = 9104;

beforeEach(resetHarness);

const env = (): Bindings => ({ ...ctx.env, ADMIN_IDS: `${OWNER}` });
const call = (path: string, as: number, init: RequestInit = {}) => api(path, { ...init, as }, env());
const send = (method: string, path: string, as: number, body: unknown) =>
  call(path, as, { method, body: JSON.stringify(body), headers: { "Content-Type": "application/json" } });
const getJson = async <T>(path: string, as = OWNER) => {
  const res = await call(path, as);
  expect(res.status).toBe(200);
  return (await res.json()) as T;
};

async function addStaff(userId: number, role: "admin" | "reviewer") {
  expect((await send("PUT", "/api/admin/team", OWNER, { userId, role })).status).toBe(200);
}

const item = (id: string, as = REVIEWER) => getJson<ReviewItemResponse>(`/api/review/items/${id}`, as);
const list = (as = REVIEWER) => getJson<ReviewListResponse>("/api/review/items", as);
const review = (id: string, as: number, body: Record<string, unknown>) => send("PUT", `/api/review/items/${id}`, as, body);
const statusOf = async (id: string, as = REVIEWER) => (await list(as)).items.find((i) => i.id === id)!;

/** Глагол с формами: на нём проверяются длинные пути полей. */
const verbWord = allLessons.flatMap((l) => (isAlphabetLesson(l) ? [] : l.words)).find((w) => w.verb)!;

beforeEach(async () => {
  await addStaff(REVIEWER, "reviewer");
});

describe("доступ", () => {
  it("без входа 401, ученику 403, проверяющему и администраторам 200", async () => {
    expect((await api("/api/review/items", {}, env())).status).toBe(401);
    expect((await call("/api/review/items", STUDENT)).status).toBe(403);
    expect((await call(`/api/review/items/${word.id}`, STUDENT)).status).toBe(403);
    expect((await call("/api/review/items", REVIEWER)).status).toBe(200);
    expect((await call("/api/review/items", OWNER)).status).toBe(200);
    await addStaff(ADMIN, "admin");
    expect((await call("/api/review/items", ADMIN)).status).toBe(200);
  });

  it("выгрузка только администраторам; остальная панель проверяющему по-прежнему закрыта", async () => {
    expect((await call("/api/review/export", REVIEWER)).status).toBe(403);
    expect((await call("/api/review/export", OWNER)).status).toBe(200);
    expect((await call("/api/admin/overview", REVIEWER)).status).toBe(403);
  });

  it("неизвестное или странное слово: 404", async () => {
    expect((await call("/api/review/items/no-such-word", REVIEWER)).status).toBe(404);
    expect((await call("/api/review/items/..%2Fsecret", REVIEWER)).status).toBe(404);
    expect((await review("no-such-word", REVIEWER, { verdict: "ok", version: "x" })).status).toBe(404);
  });

  it("у проверки свой лимит запросов", () => {
    expect(RATE_LIMITS.review.perDay).toBeGreaterThanOrEqual(1000);
  });
});

describe("список", () => {
  it("все слова и буквы всех уроков, в том числе платных, по порядку уроков", async () => {
    const data = await list();
    const total = allLessons.reduce((n, l) => n + (isAlphabetLesson(l) ? l.letters.length : l.words.length), 0);
    expect(data.items).toHaveLength(total);
    expect(data.lessons.map((l) => l.id)).toEqual(allLessons.map((l) => l.id));
    expect(data.pending).toBe(0);
    const w = data.items.find((i) => i.id === word.id)!;
    expect(w).toMatchObject({ kind: "word", he: word.he, ru: word.ru, translit: word.translit, status: "new", mine: null, hasImage: !!word.image });
    const l = data.items.find((i) => i.id === letter.id)!;
    expect(l).toMatchObject({ kind: "letter", he: letter.he, ru: letter.name.ru, translit: letter.sound, status: "new" });
  });
});

describe("отзыв", () => {
  it("«верно»: состояние «ждёт переноса», мой отзыв виден, повтор ничего не меняет", async () => {
    const { version } = await item(word.id);
    expect(version).toBe(reviewFingerprint(word));
    const res = await review(word.id, REVIEWER, { verdict: "ok", version });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ changed: true });
    expect(await (await review(word.id, REVIEWER, { verdict: "ok", version })).json()).toMatchObject({ changed: false });
    expect(await statusOf(word.id)).toMatchObject({ status: "ok", mine: "ok" });
    // Другой член команды видит состояние, но «мой отзыв» у него пуст.
    expect(await statusOf(word.id, OWNER)).toMatchObject({ status: "ok", mine: null });
    expect((await list()).pending).toBe(1);
  });

  it("замечания по полям и комментарий; имя проверяющего в карточке; замечания главнее «верно»", async () => {
    await api("/api/me", { headers: auth(REVIEWER, "Ави") }, env());
    const { version } = await item(word.id);
    await addStaff(REVIEWER2, "reviewer");
    expect((await review(word.id, REVIEWER2, { verdict: "ok", version })).status).toBe(200);
    const res = await review(word.id, REVIEWER, {
      verdict: "fix",
      version,
      fixes: { translit: "  хату́ль!  ", "example.ru": "Это чёрный котик" },
      comment: "Ударение на последний слог",
    });
    expect(res.status).toBe(200);
    expect((await statusOf(word.id)).status).toBe("fix");
    const data = await item(word.id);
    const mine = data.reviews.find((r) => r.mine)!;
    expect(mine).toMatchObject({
      reviewer: REVIEWER,
      reviewerName: "Ави",
      verdict: "fix",
      fixes: { translit: "хату́ль!", "example.ru": "Это чёрный котик" },
      comment: "Ударение на последний слог",
      current: true,
    });
    expect(data.reviews).toHaveLength(2);
  });

  it("неверные отзывы не сохраняются", async () => {
    const { version } = await item(word.id);
    const bad = async (body: Record<string, unknown>, error: string) => {
      const res = await review(word.id, REVIEWER, { version, ...body });
      expect(res.status, JSON.stringify(body)).toBe(400);
      expect(await res.json()).toEqual({ error });
    };
    await bad({ verdict: "maybe" }, "bad_verdict");
    await bad({ verdict: "fix" }, "empty_fix");
    await bad({ verdict: "fix", comment: "   " }, "empty_fix");
    await bad({ verdict: "ok", fixes: { ru: "кошка" } }, "fixes_with_ok");
    await bad({ verdict: "fix", fixes: { audio: "/x.mp3" } }, "bad_field");
    await bad({ verdict: "fix", fixes: { id: "x" } }, "bad_field");
    await bad({ verdict: "fix", fixes: { ru: word.ru } }, "same_value");
    await bad({ verdict: "fix", fixes: { ru: "" } }, "bad_value");
    await bad({ verdict: "fix", fixes: { ru: "две\nстроки" } }, "bad_value");
    await bad({ verdict: "fix", fixes: { ru: 5 } }, "bad_value");
    await bad({ verdict: "fix", fixes: { ru: "я".repeat(201) } }, "too_long");
    await bad({ verdict: "fix", comment: "я".repeat(1001) }, "too_long");
    if (word.gender) await bad({ verdict: "fix", fixes: { gender: "n" } }, "bad_value");
    expect((await send("PUT", `/api/review/items/${word.id}`, REVIEWER, "x")).status).toBe(400);
    expect((await statusOf(word.id)).status).toBe("new");
  });

  it("отзыв на устаревшую версию слова: 409 stale", async () => {
    const res = await review(word.id, REVIEWER, { verdict: "ok", version: "00000000000000" });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "stale" });
  });

  it("глагол: исправить форму по её пути; буква: название и пример", async () => {
    const v = await item(verbWord.id);
    const field = reviewFields(verbWord).find((f) => f.path.startsWith("verb.past.") && f.path.endsWith(".he"))!;
    expect((await review(verbWord.id, REVIEWER, { verdict: "fix", version: v.version, fixes: { [field.path]: `${field.value}ה` } })).status).toBe(200);
    const l = await item(letter.id);
    expect((await review(letter.id, REVIEWER, { verdict: "fix", version: l.version, fixes: { "name.ru": "алэф" } })).status).toBe(200);
    expect((await statusOf(letter.id)).status).toBe("fix");
  });

  it("отозвать свой отзыв; чужой отозвать нельзя", async () => {
    const { version } = await item(word.id);
    await review(word.id, REVIEWER, { verdict: "ok", version });
    expect((await call(`/api/review/items/${word.id}`, OWNER, { method: "DELETE" })).status).toBe(404);
    expect((await call(`/api/review/items/${word.id}`, REVIEWER, { method: "DELETE" })).status).toBe(200);
    expect((await statusOf(word.id)).status).toBe("new");
    expect((await call(`/api/review/items/${word.id}`, REVIEWER, { method: "DELETE" })).status).toBe(404);
  });

  it("каждый отзыв и отзыв назад пишутся в журнал со старым и новым значением", async () => {
    const { version } = await item(word.id);
    await review(word.id, REVIEWER, { verdict: "ok", version });
    await review(word.id, REVIEWER, { verdict: "fix", version, comment: "Проверить фразу" });
    await call(`/api/review/items/${word.id}`, REVIEWER, { method: "DELETE" });
    const log = await getJson<AdminLogResponse>("/api/admin/log");
    const entries = log.entries.filter((e) => e.target === word.id);
    expect(entries.map((e) => e.action)).toEqual(["review.remove", "review.set", "review.set"]);
    expect(entries[1]).toMatchObject({
      actor: REVIEWER,
      oldValue: { verdict: "ok", fixes: {}, comment: "" },
      newValue: { verdict: "fix", fixes: {}, comment: "Проверить фразу" },
    });
  });
});

describe("выгрузка для переноса", () => {
  it("только отзывы на текущие версии слов, с датой по Иерусалиму", async () => {
    await api("/api/me", { headers: auth(REVIEWER, "Ави") }, env());
    const { version } = await item(word.id);
    await review(word.id, REVIEWER, { verdict: "fix", version, fixes: { ru: "кошка" } });
    // Отзыв на версию, которой больше нет (правки уже перенесены): в выгрузку не попадает.
    await env().DB.prepare(
      "INSERT INTO content_reviews (item_id, reviewer, lesson_id, version, verdict, fixes, comment, updated_at) VALUES (?, ?, ?, 'old', 'ok', '{}', '', 0)",
    )
      .bind(letter.id, REVIEWER, "alphabet-1")
      .run();
    const data = await getJson<ReviewExportResponse>("/api/review/export");
    expect(data.items).toHaveLength(1);
    expect(data.items[0]).toMatchObject({
      itemId: word.id,
      lessonId: allLessons.find((l) => !isAlphabetLesson(l) && l.words.some((w) => w.id === word.id))!.id,
      version,
      reviewer: REVIEWER,
      reviewerName: "Ави",
      verdict: "fix",
      fixes: { ru: "кошка" },
    });
    expect(data.items[0]!.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    // Старый отзыв в списке слова виден как история и на состояние не влияет.
    expect((await statusOf(letter.id)).status).toBe("new");
    const l = await item(letter.id);
    expect(l.reviews).toMatchObject([{ current: false }]);
  });
});

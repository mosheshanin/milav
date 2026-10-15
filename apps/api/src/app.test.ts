import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { wordLetters, type Stroke } from "@milav/shared";
import { app } from "./app";
import {
  api,
  auth,
  completeLesson,
  completeWord,
  ctx,
  lesson,
  playQuiz,
  post,
  resetHarness,
  speak,
  stageBody,
  startQuiz,
  word,
} from "./test-utils/harness";

beforeEach(resetHarness);

describe("авторизация", () => {
  it("без заголовка 401", async () => {
    expect((await api("/api/me")).status).toBe(401);
  });

  it("с неверной подписью 401", async () => {
    const res = await api("/api/me", { headers: { Authorization: "tma hash=bad&auth_date=1" } });
    expect(res.status).toBe(401);
  });

  it("если токен бота не настроен, отвечает 503 с понятной причиной", async () => {
    const res = await api("/api/me", { as: 1 }, { DB: ctx.env.DB });
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "bot_token_missing" });
  });

  it("тестовый вход (dev) выключен по умолчанию и работает только с ALLOW_DEV_AUTH", async () => {
    const headers = { Authorization: "dev 5:Dev" };
    expect((await api("/api/me", { headers })).status).toBe(401);
    expect((await api("/api/me", { headers }, { ...ctx.env, ALLOW_DEV_AUTH: "true" })).status).toBe(200);
  });
});

describe("/api/me", () => {
  it("создаёт пользователя; у новичка 0 очков и статус Пешка", async () => {
    const res = await api("/api/me", { as: 100 });
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.user.id).toBe(100);
    expect(body.points).toBe(0);
    expect(body.passedLessons).toBe(0);
    expect(body.status.name).toBe("Пешка");
  });
});

describe("этапы изучения слова", () => {
  it("этапы отмечаются, слово считается выученным только после всех четырёх", async () => {
    let res = await post("/api/progress/stage", 1, { wordId: word.id, stage: "listen" });
    let body = (await res.json()) as any;
    expect(body.progress).toMatchObject({ listen: true, speak: false, write: false, type: false, completed: false });
    expect(body.points).toBe(0);

    await post("/api/progress/stage", 1, await stageBody(word, "write"));
    res = await post("/api/progress/stage", 1, await stageBody(word, "type"));
    body = (await res.json()) as any;
    expect(body.progress.completed).toBe(false);
    expect(body.pointsAwarded).toBe(0);

    res = await speak(1, word.id);
    body = (await res.json()) as any;
    expect(body.match).toBe(true);
    expect(body.progress.completed).toBe(true);
    expect(body.pointsAwarded).toBe(1);
    expect(body.points).toBe(1);
  });

  it("повторная отметка этапов не даёт очки второй раз", async () => {
    await completeWord(1, word.id);
    const again = (await (await post("/api/progress/stage", 1, { wordId: word.id, stage: "listen" })).json()) as any;
    expect(again.pointsAwarded).toBe(0);
    expect(again.points).toBe(1);
    const me = (await (await api("/api/me", { as: 1 })).json()) as any;
    expect(me.points).toBe(1);
  });

  it("этап «говори» нельзя отметить напрямую, только проверкой речи", async () => {
    const res = await post("/api/progress/stage", 1, { wordId: word.id, stage: "speak" });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "speak_requires_speech_check" });
  });

  it("неизвестное слово и неизвестный этап отклоняются", async () => {
    expect((await post("/api/progress/stage", 1, { wordId: "nope", stage: "listen" })).status).toBe(404);
    expect((await post("/api/progress/stage", 1, { wordId: word.id, stage: "fly" })).status).toBe(400);
    expect((await post("/api/progress/stage", 1, {})).status).toBe(400);
  });

  it("прогресс одного пользователя не виден другому", async () => {
    await completeWord(1, word.id);
    const mine = (await (await api(`/api/lessons/${lesson.id}/progress`, { as: 1 })).json()) as any;
    const other = (await (await api(`/api/lessons/${lesson.id}/progress`, { as: 2 })).json()) as any;
    expect(mine.words[0].completed).toBe(true);
    expect(other.words.every((w: any) => !w.listen && !w.completed)).toBe(true);
  });
});

describe("доказательства этапов «пиши» и «печатай»", () => {
  const stageProgress = async (as: number) =>
    ((await (await api(`/api/lessons/${lesson.id}/progress`, { as })).json()) as any).words[0];

  it("«печатай»: верное слово принимается, неверное и пустое нет, этап при отказе не отмечается", async () => {
    expect((await post("/api/progress/stage", 1, { wordId: word.id, stage: "type", typed: "כלב" })).status).toBe(422);
    expect(await (await post("/api/progress/stage", 1, { wordId: word.id, stage: "type", typed: "" })).json()).toEqual({
      error: "proof_required",
    });
    expect((await post("/api/progress/stage", 1, { wordId: word.id, stage: "type" })).status).toBe(400);
    expect((await post("/api/progress/stage", 1, { wordId: word.id, stage: "type", typed: 5 })).status).toBe(400);
    expect((await stageProgress(1)).type).toBe(false);

    expect((await post("/api/progress/stage", 1, await stageBody(word, "type"))).status).toBe(200);
    expect((await stageProgress(1)).type).toBe(true);
  });

  it("«печатай»: слово с огласовками тоже не подходит, нужны только буквы", async () => {
    const res = await post("/api/progress/stage", 1, { wordId: word.id, stage: "type", typed: word.niqqud ?? "x" });
    expect(res.status).toBe(422);
  });

  it("«пиши»: без штрихов этап не засчитывается (одного curl мало)", async () => {
    const res = await post("/api/progress/stage", 1, { wordId: word.id, stage: "write" });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "proof_required" });
    expect((await stageProgress(1)).write).toBe(false);
  });

  it("«пиши»: штрихи верных букв принимаются", async () => {
    const res = await post("/api/progress/stage", 1, await stageBody(word, "write"));
    expect(res.status).toBe(200);
    expect(((await res.json()) as any).progress.write).toBe(true);
  });

  it("«пиши»: штрихи другого слова отклоняются и называют неверные буквы", async () => {
    const other = lesson.words.find((w) => w.he !== word.he && wordLetters(w.he).length === wordLetters(word.he).length);
    expect(other).toBeDefined();
    const wrong = await stageBody(other!, "write");
    const res = await post("/api/progress/stage", 1, { wordId: word.id, stage: "write", strokes: wrong.strokes });
    expect(res.status).toBe(422);
    const body = (await res.json()) as any;
    expect(body.error).toBe("write_rejected");
    expect(body.failedLetters.length).toBeGreaterThan(0);
    expect((await stageProgress(1)).write).toBe(false);
  });

  it("«пиши»: каракули (прямая линия вместо каждой буквы) отклоняются", async () => {
    const scribble: Stroke[] = [[{ x: 100, y: 100 }, { x: 300, y: 100 }]];
    const strokes = wordLetters(word.he).map(() => scribble);
    expect((await post("/api/progress/stage", 1, { wordId: word.id, stage: "write", strokes })).status).toBe(422);
  });

  it("«пиши»: неверное число букв и неверная форма данных дают 400", async () => {
    const good = (await stageBody(word, "write")).strokes!;
    const send = (strokes: unknown) => post("/api/progress/stage", 1, { wordId: word.id, stage: "write", strokes });
    expect((await send(good.slice(1))).status).toBe(400);
    expect((await send("штрихи")).status).toBe(400);
    expect((await send(good.map(() => []))).status).toBe(400);
    expect((await send(good.map(() => [[{ x: "1", y: 2 }]]))).status).toBe(400);
    expect((await send(good.map(() => [[{ x: 1e9, y: 2 }]]))).status).toBe(400);
    expect((await send(good.map(() => [[{ x: null, y: 2 }]]))).status).toBe(400);
    expect((await stageProgress(1)).write).toBe(false);
  });

  it("«пиши»: слишком много штрихов или точек отклоняется", async () => {
    const good = (await stageBody(word, "write")).strokes!;
    const manyStrokes = good.map(() => Array.from({ length: 25 }, () => [{ x: 1, y: 1 }]));
    const manyPoints = good.map(() => [Array.from({ length: 3001 }, () => ({ x: 1, y: 1 }))]);
    for (const strokes of [manyStrokes, manyPoints]) {
      expect((await post("/api/progress/stage", 1, { wordId: word.id, stage: "write", strokes })).status).toBe(400);
    }
  });

  it("слишком большое тело запроса отклоняется", async () => {
    const huge = JSON.stringify({ wordId: word.id, stage: "write", strokes: "я".repeat(300_000) });
    const res = await api("/api/progress/stage", {
      method: "POST",
      as: 1,
      body: huge,
      headers: { "Content-Type": "application/json", "Content-Length": String(huge.length) },
    });
    expect(res.status).toBe(413);
  });

  it("отметить слово выученным без доказательств нельзя: очки не начисляются", async () => {
    await post("/api/progress/stage", 1, { wordId: word.id, stage: "listen" });
    await post("/api/progress/stage", 1, { wordId: word.id, stage: "write" });
    await post("/api/progress/stage", 1, { wordId: word.id, stage: "type" });
    ctx.heard = word.he;
    const spoken = (await (await speak(1, word.id)).json()) as any;
    expect(spoken.progress.completed).toBe(false);
    expect(((await (await api("/api/me", { as: 1 })).json()) as any).points).toBe(0);
  });
});

describe("проверка речи", () => {
  it("неверное слово не отмечает этап", async () => {
    ctx.heard = "כלב";
    const res = await speak(1, word.id);
    const body = (await res.json()) as any;
    expect(body.match).toBe(false);
    expect(body.progress).toBeUndefined();
    const progress = (await (await api(`/api/lessons/${lesson.id}/progress`, { as: 1 })).json()) as any;
    expect(progress.words[0].speak).toBe(false);
  });

  it("без Workers AI отвечает 503, пустую и слишком большую запись отклоняет", async () => {
    expect((await api(`/api/speech/check?wordId=${word.id}`, { method: "POST", as: 1, body: new Uint8Array(10) }, { ...ctx.env, AI: undefined })).status).toBe(503);
    expect((await speak(1, word.id, 0)).status).toBe(400);
    expect((await speak(1, word.id, 1_600_000)).status).toBe(413);
  });

  it("ошибка распознавателя превращается в 502", async () => {
    const broken = { ...ctx.env, AI: { run: async () => { throw new Error("boom"); } } };
    const res = await api(`/api/speech/check?wordId=${word.id}`, { method: "POST", as: 1, body: new Uint8Array(10) }, broken);
    expect(res.status).toBe(502);
  });
});

describe("лимиты запросов в API", () => {
  /** Подмена Workers AI, считающая вызовы: отклонённый по лимиту запрос не должен до неё доходить. */
  function countingAi() {
    const ai = { calls: 0, run: async () => ((ai.calls += 1), { text: word.he }) };
    return ai;
  }

  it("проверка речи: после 20 запросов в минуту отвечает 429 и не вызывает Whisper", async () => {
    const ai = countingAi();
    const limited = { ...ctx.env, AI: ai };
    const call = () =>
      api(`/api/speech/check?wordId=${word.id}`, {
        method: "POST",
        as: 50,
        body: new Uint8Array(2000),
        headers: { "Content-Type": "audio/webm" },
      }, limited);

    for (let i = 0; i < 20; i++) expect((await call()).status).toBe(200);
    const res = await call();
    expect(res.status).toBe(429);
    const body = (await res.json()) as { error: string; retryAfter: number };
    expect(body.error).toBe("rate_limited");
    expect(body.retryAfter).toBeGreaterThan(0);
    expect(body.retryAfter).toBeLessThanOrEqual(60);
    expect(res.headers.get("Retry-After")).toBe(String(body.retryAfter));
    expect(ai.calls).toBe(20);

    // Другой пользователь не страдает.
    const other = await api(`/api/speech/check?wordId=${word.id}`, {
      method: "POST",
      as: 51,
      body: new Uint8Array(2000),
      headers: { "Content-Type": "audio/webm" },
    }, limited);
    expect(other.status).toBe(200);
  });

  it("отметка этапов: 60 в минуту, 61-я получает 429", async () => {
    const send = () => post("/api/progress/stage", 52, { wordId: word.id, stage: "listen" });
    for (let i = 0; i < 60; i++) expect((await send()).status).toBe(200);
    expect((await send()).status).toBe(429);
  });

  it("начало викторины: 10 в минуту, 11-е получает 429", async () => {
    const send = () => post("/api/quiz/start", 53, { lessonId: lesson.id });
    for (let i = 0; i < 10; i++) expect((await send()).status).toBe(409);
    expect((await send()).status).toBe(429);
  });

  it("запросы без входа лимитами не считаются: сначала проверка входа", async () => {
    for (let i = 0; i < 70; i++) expect((await post("/api/progress/stage", 0, {})).status).toBe(401);
  });

  it("слишком большая запись, пришедшая потоком без Content-Length, отклоняется до чтения целиком", async () => {
    let sent = 0;
    const chunk = new Uint8Array(500_000);
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        sent += chunk.byteLength;
        controller.enqueue(chunk);
        if (sent >= 10_000_000) controller.close();
      },
    });
    const res = await app.request(
      `/api/speech/check?wordId=${word.id}`,
      { method: "POST", headers: { ...auth(54), "Content-Type": "audio/webm" }, body: stream, duplex: "half" } as RequestInit,
      ctx.env,
    );
    expect(res.status).toBe(413);
    // Чтение остановилось почти сразу, а не дошло до конца потока.
    expect(sent).toBeLessThan(5_000_000);
  });
});

describe("заголовки безопасности API", () => {
  it("есть на успешных ответах, ошибках входа и 404", async () => {
    const responses = [
      await api("/api/health"),
      await api("/api/me"),
      await api("/api/me", { as: 60 }),
      await api("/api/нет-такого"),
    ];
    expect(responses.map((r) => r.status)).toEqual([200, 401, 200, 404]);
    for (const res of responses) {
      expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
      expect(res.headers.get("Referrer-Policy")).toBe("no-referrer");
      expect(res.headers.get("Cache-Control")).toBe("no-store");
    }
  });
});

describe("наблюдаемость", () => {
  afterEach(() => vi.restoreAllMocks());

  /** Записи журнала, которые прошли через console.<level>, разобранные из JSON. */
  function captured(level: "log" | "warn" | "error") {
    const spy = vi.spyOn(console, level).mockImplementation(() => {});
    return () => spy.mock.calls.map((call) => JSON.parse(call[0] as string) as Record<string, unknown>);
  }

  const clientLog = (body: unknown, headers: Record<string, string> = {}, ip = "198.51.100.1") =>
    api("/api/client-log", {
      method: "POST",
      headers: { "Content-Type": "application/json", "CF-Connecting-IP": ip, ...headers },
      body: typeof body === "string" ? body : JSON.stringify(body),
    });

  it("/api/health проверяет базу", async () => {
    const res = await api("/api/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, service: "milav-api", db: "ok" });
  });

  it("/api/health отвечает 503, если база не отвечает", async () => {
    const errors = captured("error");
    const brokenDb = { prepare: () => ({ first: () => Promise.reject(new Error("D1_ERROR: daily limit exceeded")) }) };
    const res = await api("/api/health", {}, { ...ctx.env, DB: brokenDb as unknown as D1Database });
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ ok: false, db: "error" });
    expect(errors()[0]).toMatchObject({ evt: "health_db_error", message: "D1_ERROR: daily limit exceeded" });
  });

  it("принимает отчёт об ошибке без входа и с входом (тогда в записи id ученика)", async () => {
    const errors = captured("error");
    const report = { kind: "error", source: "error", message: "TypeError: x is undefined", platform: "ios" };
    expect((await clientLog(report)).status).toBe(204);
    expect((await clientLog(report, auth(77), "198.51.100.2")).status).toBe(204);
    const [anon, signed] = errors();
    expect(anon).toMatchObject({ evt: "client_error", message: "TypeError: x is undefined", platform: "ios" });
    expect(anon!.uid).toBeUndefined();
    expect(signed).toMatchObject({ evt: "client_error", uid: 77 });
  });

  it("принимает событие микрофона и отклоняет неизвестное, не-JSON и слишком большое тело", async () => {
    const logs = captured("log");
    expect((await clientLog({ kind: "event", name: "mic_problem", detail: "denied" }, {}, "198.51.100.3")).status).toBe(204);
    expect(logs()[0]).toMatchObject({ evt: "client_mic_problem", detail: "denied" });
    expect((await clientLog({ kind: "event", name: "free_points" }, {}, "198.51.100.3")).status).toBe(400);
    expect((await clientLog("не json", {}, "198.51.100.3")).status).toBe(400);
    const huge = { kind: "error", source: "error", message: "x", stack: "y".repeat(10_000) };
    expect((await clientLog(huge, {}, "198.51.100.3")).status).toBe(400);
  });

  it("ограничивает число отчётов с одного адреса", async () => {
    captured("log");
    const report = { kind: "event", name: "app_crash" };
    const statuses: number[] = [];
    for (let i = 0; i < 32; i++) statuses.push((await clientLog(report, {}, "203.0.113.9")).status);
    expect(statuses.filter((s) => s === 204)).toHaveLength(30);
    expect(statuses.slice(-2)).toEqual([429, 429]);
  });

  it("пишет запуск приложения, пройденное слово, начало и конец викторины", async () => {
    const logs = captured("log");
    await api("/api/me", { as: 81 });
    await completeLesson(81);
    const session = await startQuiz(81);
    await playQuiz(81, session);
    const events = logs();
    expect(events.find((e) => e.evt === "app_open")).toMatchObject({ uid: 81 });
    expect(events.filter((e) => e.evt === "word_done")).toHaveLength(lesson.words.length);
    expect(events.find((e) => e.evt === "quiz_start")).toMatchObject({ uid: 81, lesson: lesson.id, questions: 25 });
    expect(events.find((e) => e.evt === "quiz_end")).toMatchObject({ uid: 81, lesson: lesson.id, outcome: "passed", correct: 25 });
    // Что услышал распознаватель на этапе «говори»: по этим записям видно, какие слова Whisper слышит плохо.
    expect(events.some((e) => e.evt === "speech" && e.where === "study" && e.match === true)).toBe(true);
  });

  it("пишет отклонённый этап и превышение лимита как предупреждения", async () => {
    const warns = captured("warn");
    captured("log");
    await post("/api/progress/stage", 82, { wordId: word.id, stage: "type", typed: "неверно" });
    expect(warns()[0]).toMatchObject({ evt: "stage_rejected", uid: 82, item: word.id, stage: "type" });
  });

  it("необработанная ошибка сервера попадает в журнал с адресом", async () => {
    const errors = captured("error");
    const brokenDb = {
      prepare: () => {
        throw new Error("база сломалась");
      },
    };
    const res = await api("/api/me", { as: 83 }, { ...ctx.env, DB: brokenDb as unknown as D1Database });
    expect(res.status).toBe(500);
    expect(errors()[0]).toMatchObject({ evt: "server_error", method: "GET", path: "/api/me", message: "база сломалась" });
  });
});

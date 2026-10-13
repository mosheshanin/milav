import { beforeEach, describe, expect, it } from "vitest";
import { lessons } from "@milav/content";
import { CANVAS_LINE_HEIGHT, loadBaseTemplates, roundStrokes, wordLetters, type Stroke, type Word } from "@milav/shared";
import { app } from "./app";
import type { Bindings } from "./env";
import { createTestDb } from "./test-utils/d1";
import { signInitData } from "./test-utils/telegram";

const TOKEN = "123456:TEST-bot-token";
const lesson = lessons[0]!;
const word = lesson.words[0]!;

let env: Bindings;
let heardText = "";
const fakeAi = { run: async () => ({ text: heardText }) };

beforeEach(() => {
  heardText = word.he;
  env = { DB: createTestDb(), BOT_TOKEN: TOKEN, AI: fakeAi };
});

function auth(id: number, name = "Тест"): Record<string, string> {
  return { Authorization: `tma ${signInitData(TOKEN, { id, first_name: name })}` };
}

async function api(path: string, init: RequestInit & { as?: number } = {}, e: Bindings = env) {
  const { as, ...rest } = init;
  const headers = { ...(as ? auth(as) : {}), ...(rest.headers as Record<string, string> | undefined) };
  return app.request(path, { ...rest, headers }, e);
}

const post = (path: string, as: number, body: unknown) =>
  api(path, { method: "POST", as, body: JSON.stringify(body), headers: { "Content-Type": "application/json" } });

/**
 * Штрихи буквы по шаблону из шрифта: каждая вторая точка облака как короткий штрих (24 штриха на букву, ровно предел сервера). Более редкая выборка не узнаётся для נ и ס.
 * Распознаватель принимает такой рисунок, потому что он повторяет шаблон.
 */
async function letterStrokes(letter: string): Promise<Stroke[]> {
  const t = (await loadBaseTemplates()).find((x) => x.letter === letter);
  if (!t) throw new Error(`нет шаблона ${letter}`);
  const h = t.heightRatio * CANVAS_LINE_HEIGHT;
  const scale = t.aspect <= 1 ? h : h * t.aspect;
  const cx = 200;
  const cy = 0.62 * 220 - h / 2;
  return roundStrokes(
    t.points
      .filter((_, i) => i % 2 === 0)
      .map((p) => [
        { x: cx + p.x * scale, y: cy + p.y * scale },
        { x: cx + p.x * scale + 1.5, y: cy + p.y * scale },
      ]),
  );
}

/** Тело запроса с доказательством этапа: набранное слово или штрихи всех букв. */
async function stageBody(w: Word, stage: "listen" | "write" | "type") {
  if (stage === "type") return { wordId: w.id, stage, typed: wordLetters(w.he).join("") };
  if (stage === "write") return { wordId: w.id, stage, strokes: await Promise.all(wordLetters(w.he).map(letterStrokes)) };
  return { wordId: w.id, stage };
}

const speak = (as: number, wordId: string, mode = "study", bytes = 2000) =>
  api(`/api/speech/check?wordId=${wordId}&mode=${mode}`, {
    method: "POST",
    as,
    body: new Uint8Array(bytes),
    headers: { "Content-Type": "audio/webm" },
  });

/** Проходит все четыре этапа слова как пользователь `as`. */
async function completeWord(as: number, wordId: string) {
  const target = lesson.words.find((w) => w.id === wordId)!;
  for (const stage of ["listen", "write", "type"] as const) {
    expect((await post("/api/progress/stage", as, await stageBody(target, stage))).status).toBe(200);
  }
  heardText = lesson.words.find((w) => w.id === wordId)!.he;
  expect((await speak(as, wordId)).status).toBe(200);
}

describe("авторизация", () => {
  it("без заголовка 401", async () => {
    expect((await api("/api/me")).status).toBe(401);
  });

  it("с неверной подписью 401", async () => {
    const res = await api("/api/me", { headers: { Authorization: "tma hash=bad&auth_date=1" } });
    expect(res.status).toBe(401);
  });

  it("если токен бота не настроен, отвечает 503 с понятной причиной", async () => {
    const res = await api("/api/me", { as: 1 }, { DB: env.DB });
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "bot_token_missing" });
  });

  it("тестовый вход (dev) выключен по умолчанию и работает только с ALLOW_DEV_AUTH", async () => {
    const headers = { Authorization: "dev 5:Dev" };
    expect((await api("/api/me", { headers })).status).toBe(401);
    expect((await api("/api/me", { headers }, { ...env, ALLOW_DEV_AUTH: "true" })).status).toBe(200);
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
    heardText = word.he;
    const spoken = (await (await speak(1, word.id)).json()) as any;
    expect(spoken.progress.completed).toBe(false);
    expect(((await (await api("/api/me", { as: 1 })).json()) as any).points).toBe(0);
  });
});

describe("проверка речи", () => {
  it("неверное слово не отмечает этап", async () => {
    heardText = "כלב";
    const res = await speak(1, word.id);
    const body = (await res.json()) as any;
    expect(body.match).toBe(false);
    expect(body.progress).toBeUndefined();
    const progress = (await (await api(`/api/lessons/${lesson.id}/progress`, { as: 1 })).json()) as any;
    expect(progress.words[0].speak).toBe(false);
  });

  it("в режиме викторины результат возвращается, но этап не отмечается", async () => {
    const body = (await (await speak(1, word.id, "quiz")).json()) as any;
    expect(body.match).toBe(true);
    const progress = (await (await api(`/api/lessons/${lesson.id}/progress`, { as: 1 })).json()) as any;
    expect(progress.words[0].speak).toBe(false);
  });

  it("без Workers AI отвечает 503, пустую и слишком большую запись отклоняет", async () => {
    expect((await api(`/api/speech/check?wordId=${word.id}`, { method: "POST", as: 1, body: new Uint8Array(10) }, { ...env, AI: undefined })).status).toBe(503);
    expect((await speak(1, word.id, "study", 0)).status).toBe(400);
    expect((await speak(1, word.id, "study", 1_600_000)).status).toBe(413);
  });

  it("ошибка распознавателя превращается в 502", async () => {
    const broken = { ...env, AI: { run: async () => { throw new Error("boom"); } } };
    const res = await api(`/api/speech/check?wordId=${word.id}`, { method: "POST", as: 1, body: new Uint8Array(10) }, broken);
    expect(res.status).toBe(502);
  });
});

describe("викторина", () => {
  const submit = (as: number, correct: number, total = 25) =>
    post("/api/quiz/submit", as, { lessonId: lesson.id, correct, total });

  it("пока урок не пройден полностью, результат не принимается", async () => {
    await completeWord(1, word.id);
    const res = await submit(1, 25);
    expect(res.status).toBe(409);
  });

  it("20 из 25 сдают урок, 19 не сдают; повторная сдача не увеличивает счётчик", async () => {
    for (const w of lesson.words) await completeWord(1, w.id);
    const points = ((await (await api("/api/me", { as: 1 })).json()) as any).points;
    expect(points).toBe(lesson.words.length);

    let body = (await (await submit(1, 19)).json()) as any;
    expect(body).toMatchObject({ passed: false, mistakes: 6, passedLessons: 0 });

    body = (await (await submit(1, 20)).json()) as any;
    expect(body).toMatchObject({ passed: true, mistakes: 5, firstTimePassed: true, passedLessons: 1 });
    expect(body.status.name).toBe("Пешка");

    body = (await (await submit(1, 25)).json()) as any;
    expect(body).toMatchObject({ passed: true, mistakes: 0, firstTimePassed: false, passedLessons: 1 });

    const summary = (await (await api(`/api/lessons/${lesson.id}/progress`, { as: 1 })).json()) as any;
    expect(summary.quiz).toEqual({ passed: true, bestCorrect: 25 });
  });

  it("некорректные результаты отклоняются", async () => {
    for (const w of lesson.words) await completeWord(1, w.id);
    expect((await submit(1, 26)).status).toBe(400);
    expect((await submit(1, -1)).status).toBe(400);
    expect((await submit(1, 20, 24)).status).toBe(400);
    expect((await post("/api/quiz/submit", 1, { lessonId: "nope", correct: 20, total: 25 })).status).toBe(404);
  });
});

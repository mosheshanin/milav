import { beforeEach, describe, expect, it } from "vitest";
import {
  MAX_MISTAKES,
  QUIZ_SESSION_TTL_SECONDS,
  QUIZ_SIZE,
  wordLetters,
  type QuizAnswerResponse,
  type QuizQuestion,
  type QuizStartResponse,
} from "@milav/shared";
import {
  api,
  auth,
  completeLesson,
  completeWord,
  ctx,
  lesson,
  post,
  resetHarness,
  word,
  wordStrokes,
} from "./test-utils/harness";

beforeEach(resetHarness);

const wordOf = (q: QuizQuestion) => lesson.words.find((w) => w.id === q.wordId)!;

async function start(as: number): Promise<QuizStartResponse> {
  const res = await post("/api/quiz/start", as, { lessonId: lesson.id });
  expect(res.status).toBe(200);
  return (await res.json()) as QuizStartResponse;
}

const answerRaw = (as: number, sessionId: string, index: number, extra: Record<string, unknown> = {}) =>
  post("/api/quiz/answer", as, { sessionId, index, ...extra });

const speechRaw = (as: number, sessionId: string, index: number | string, bytes = 2000) =>
  api(`/api/quiz/speech?sessionId=${sessionId}&index=${index}`, {
    method: "POST",
    as,
    body: new Uint8Array(bytes),
    headers: { "Content-Type": "audio/webm" },
  });

/** Отвечает на вопрос `index`: верно или неверно (так, как это сделал бы честный ученик). */
async function play(as: number, session: QuizStartResponse, index: number, right: boolean): Promise<QuizAnswerResponse> {
  const q = session.questions[index]!;
  let res: Response;
  if (q.type === "speak") {
    if (right) {
      ctx.heard = wordOf(q).he;
      res = await speechRaw(as, session.sessionId, index);
    } else {
      res = await answerRaw(as, session.sessionId, index, { giveUp: true });
    }
  } else if (q.type === "write") {
    const strokes = right ? await wordStrokes(wordOf(q)) : wordLetters(wordOf(q).he).map(() => []);
    res = await answerRaw(as, session.sessionId, index, { strokes });
  } else {
    const choice = right ? q.wordId : q.options.find((id) => id !== q.wordId)!;
    res = await answerRaw(as, session.sessionId, index, { choice });
  }
  expect(res.status).toBe(200);
  return (await res.json()) as QuizAnswerResponse;
}

/** Проходит викторину; вопросы с номерами из `wrong` отвечает неверно. Останавливается, если викторина прервана. */
async function playAll(as: number, session: QuizStartResponse, wrong: number[] = []): Promise<QuizAnswerResponse[]> {
  const answers: QuizAnswerResponse[] = [];
  for (let i = 0; i < session.questions.length; i++) {
    const answer = await play(as, session, i, !wrong.includes(i));
    answers.push(answer);
    if (answer.aborted) break;
  }
  return answers;
}

const count = async (sql: string, ...params: unknown[]) =>
  (await ctx.env.DB.prepare(sql).bind(...params).first<{ n: number }>())!.n;

/** Индексы вопросов нужного типа. */
const indexesOf = (session: QuizStartResponse, type: QuizQuestion["type"]) =>
  session.questions.flatMap((q, i) => (q.type === type ? [i] : []));

describe("начало викторины", () => {
  it("пока урок не пройден полностью, викторина не начинается", async () => {
    await completeWord(1, word.id);
    const res = await post("/api/quiz/start", 1, { lessonId: lesson.id });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "lesson_not_completed" });
    expect(await count("SELECT COUNT(*) AS n FROM quiz_sessions")).toBe(0);
  });

  it("администратор начинает викторину до изучения слов, и сдача засчитывается; проверяющему нельзя", async () => {
    const ADMIN = 4401;
    const REVIEWER = 4402;
    const env = { ...ctx.env, ADMIN_IDS: String(ADMIN) };
    const start = (as: number) =>
      api("/api/quiz/start", { method: "POST", as, body: JSON.stringify({ lessonId: lesson.id }), headers: { "Content-Type": "application/json" } }, env);
    await api("/api/me", { as: REVIEWER }, env);
    await api(
      "/api/admin/team",
      { method: "PUT", as: ADMIN, body: JSON.stringify({ userId: REVIEWER, role: "reviewer" }), headers: { "Content-Type": "application/json" } },
      env,
    );
    expect((await start(REVIEWER)).status).toBe(409);
    const res = await start(ADMIN);
    expect(res.status).toBe(200);
    const session = (await res.json()) as QuizStartResponse;
    expect(session.questions).toHaveLength(25);
    let last: any;
    for (let i = 0; i < session.questions.length; i++) {
      const q = session.questions[i]!;
      const w = wordOf(q);
      const body = (extra: object) =>
        api("/api/quiz/answer", { method: "POST", as: ADMIN, body: JSON.stringify({ sessionId: session.sessionId, index: i, ...extra }), headers: { "Content-Type": "application/json" } }, env);
      if (q.type === "speak") {
        ctx.heard = w.he;
        last = await (await api(`/api/quiz/speech?sessionId=${session.sessionId}&index=${i}`, { method: "POST", as: ADMIN, body: new Uint8Array(2000), headers: { "Content-Type": "audio/webm" } }, env)).json();
      } else if (q.type === "write") last = await (await body({ strokes: await wordStrokes(w) })).json();
      else last = await (await body({ choice: q.wordId })).json();
    }
    expect(last.result.passed).toBe(true);
    expect(await count(`SELECT COUNT(*) AS n FROM lesson_passed WHERE user_id = ${ADMIN}`)).toBe(1);
  });

  it("плохие запросы: без входа, без урока, неизвестный урок", async () => {
    expect((await api("/api/quiz/start", { method: "POST" })).status).toBe(401);
    expect((await post("/api/quiz/start", 1, {})).status).toBe(400);
    expect((await post("/api/quiz/start", 1, { lessonId: 7 })).status).toBe(400);
    expect((await post("/api/quiz/start", 1, { lessonId: "nope" })).status).toBe(404);
  });

  it("выдаёт 25 вопросов по словам урока и id сессии", async () => {
    await completeLesson(1);
    const session = await start(1);
    expect(session.lessonId).toBe(lesson.id);
    expect(session.sessionId).toMatch(/^[0-9a-f]{32}$/);
    expect(session.questions.length).toBe(QUIZ_SIZE);
    const ids = new Set(lesson.words.map((w) => w.id));
    expect(session.questions.every((q) => ids.has(q.wordId))).toBe(true);
  });

  it("новая викторина заменяет прежнюю: старый id сессии больше не годится", async () => {
    await completeLesson(1);
    const first = await start(1);
    const second = await start(1);
    expect(second.sessionId).not.toBe(first.sessionId);
    const res = await answerRaw(1, first.sessionId, 0, { choice: first.questions[0]!.wordId });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "no_session" });
    expect(await count("SELECT COUNT(*) AS n FROM quiz_sessions")).toBe(1);
  });

  it("старый маршрут сдачи результата с числом от клиента удалён", async () => {
    await completeLesson(1);
    const res = await post("/api/quiz/submit", 1, { lessonId: lesson.id, correct: 25, total: 25 });
    expect(res.status).toBe(404);
    expect(((await (await api("/api/me", { as: 1 })).json()) as any).passedLessons).toBe(0);
  });
});

describe("прохождение викторины", () => {
  it("25 верных ответов сдают урок: итог считает сервер, всё записано", async () => {
    await completeLesson(1);
    const session = await start(1);
    const answers = await playAll(1, session);
    expect(answers.length).toBe(QUIZ_SIZE);
    expect(answers.slice(0, -1).every((a) => a.correct && a.final && !a.result)).toBe(true);

    const last = answers.at(-1)!;
    expect(last.result).toMatchObject({ passed: true, correct: 25, total: 25, mistakes: 0, firstTimePassed: true, passedLessons: 1 });
    expect(last.result!.status.name).toBe("Пешка");

    const summary = (await (await api(`/api/lessons/${lesson.id}/progress`, { as: 1 })).json()) as any;
    expect(summary.quiz).toEqual({ passed: true, bestCorrect: 25 });
    expect(((await (await api("/api/me", { as: 1 })).json()) as any).passedLessons).toBe(1);
    expect(await count("SELECT COUNT(*) AS n FROM quiz_attempts WHERE user_id = 1")).toBe(1);
  });

  it("20 из 25 сдают урок (пять ошибок допустимы), повторная сдача не увеличивает счётчик", async () => {
    await completeLesson(1);
    const first = await start(1);
    const speakIdx = indexesOf(first, "speak");
    expect(speakIdx.length).toBe(5);
    const answers = await playAll(1, first, speakIdx);
    expect(answers.at(-1)!.result).toMatchObject({ passed: true, correct: 20, mistakes: 5, firstTimePassed: true, passedLessons: 1 });

    const second = await start(1);
    const again = (await playAll(1, second)).at(-1)!;
    expect(again.result).toMatchObject({ passed: true, correct: 25, firstTimePassed: false, passedLessons: 1 });
    expect(await count("SELECT COUNT(*) AS n FROM quiz_attempts WHERE user_id = 1")).toBe(2);
    expect(await count("SELECT COUNT(*) AS n FROM lesson_passed WHERE user_id = 1")).toBe(1);
  });

  it("шестая ошибка прерывает викторину: ничего не сохраняется, дальше отвечать нельзя", async () => {
    await completeLesson(1);
    const session = await start(1);
    const wrong = [0, 1, 2, 3, 4, 5];
    const answers = await playAll(1, session, wrong);
    expect(answers.length).toBe(MAX_MISTAKES + 1);
    expect(answers.slice(0, -1).every((a) => !a.aborted)).toBe(true);
    expect(answers.at(-1)).toMatchObject({ correct: false, final: true, mistakes: 6, aborted: true });
    expect(answers.at(-1)!.result).toBeUndefined();

    expect(await count("SELECT COUNT(*) AS n FROM quiz_attempts")).toBe(0);
    expect(await count("SELECT COUNT(*) AS n FROM lesson_passed")).toBe(0);
    const res = await answerRaw(1, session.sessionId, 6, { choice: session.questions[6]!.options[0] });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "quiz_finished" });
  });

  it("19 из 25 не бывает: к этому моменту викторина уже прервана", async () => {
    // 6 ошибок это 19 верных из 25: прерывание срабатывает на самой 6-й ошибке, даже если она на последнем вопросе.
    await completeLesson(1);
    const session = await start(1);
    const answers = await playAll(1, session, [19, 20, 21, 22, 23, 24]);
    expect(answers.length).toBe(QUIZ_SIZE);
    expect(answers.at(-1)).toMatchObject({ aborted: true, mistakes: 6 });
    expect(answers.at(-1)!.result).toBeUndefined();
    expect(await count("SELECT COUNT(*) AS n FROM quiz_attempts")).toBe(0);
    expect(((await (await api("/api/me", { as: 1 })).json()) as any).passedLessons).toBe(0);
  });

  it("повтор последнего ответа (обрыв связи, двойное нажатие) возвращает тот же ответ и ничего не меняет", async () => {
    await completeLesson(1);
    const session = await start(1);
    const q = session.questions[0]!;
    const first = (await (await answerRaw(1, session.sessionId, 0, { choice: q.wordId })).json()) as QuizAnswerResponse;
    expect(first.correct).toBe(true);

    // Повтор с другим ответом не может ни исправить, ни испортить результат.
    const wrongChoice = q.options.find((id) => id !== q.wordId)!;
    const repeat = (await (await answerRaw(1, session.sessionId, 0, { choice: wrongChoice })).json()) as QuizAnswerResponse;
    expect(repeat).toEqual({ ...first, repeat: true });

    const next = await play(1, session, 1, true);
    expect(next.correctCount).toBe(2);
  });

  it("итог после обрыва связи на последнем вопросе повторяется, попытка записана один раз", async () => {
    await completeLesson(1);
    const session = await start(1);
    await playAll(1, session);
    const lastIndex = QUIZ_SIZE - 1;
    const repeat = (await (await answerRaw(1, session.sessionId, lastIndex, { choice: "x" })).json()) as QuizAnswerResponse;
    expect(repeat.repeat).toBe(true);
    expect(repeat.result).toMatchObject({ passed: true, correct: 25 });
    expect(await count("SELECT COUNT(*) AS n FROM quiz_attempts")).toBe(1);
  });
});

describe("проверка порядка и данных", () => {
  it("вопросы принимаются строго по порядку", async () => {
    await completeLesson(1);
    const session = await start(1);
    const q = session.questions[3]!;
    const res = await answerRaw(1, session.sessionId, 3, { choice: q.wordId });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "bad_index", expected: 0 });
    for (const index of [-1, 1.5, "0", null, 99]) {
      expect([404, 409]).toContain((await answerRaw(1, session.sessionId, index as number, { choice: q.wordId })).status);
    }
    expect(await count("SELECT next_index AS n FROM quiz_sessions")).toBe(0);
  });

  it("вариант вне списка и пустой ответ отклоняются без траты вопроса", async () => {
    await completeLesson(1);
    const session = await start(1);
    const q = session.questions[0]!;
    const outside = lesson.words.map((w) => w.id).find((id) => !q.options.includes(id))!;
    for (const body of [{ choice: outside }, {}, { choice: 5 }, { giveUp: true }, { strokes: [] }]) {
      expect((await answerRaw(1, session.sessionId, 0, body)).status).toBe(400);
    }
    const res = await play(1, session, 0, true);
    expect(res.correctCount).toBe(1);
  });

  it("без сессии и с чужим id сессии ответ не принимается", async () => {
    await completeLesson(1);
    await completeLesson(2);
    expect((await answerRaw(1, "0".repeat(32), 0, { choice: "x" })).status).toBe(404);

    const mine = await start(1);
    await start(2);
    // Пользователь 2 подставляет id сессии пользователя 1.
    const res = await answerRaw(2, mine.sessionId, 0, { choice: mine.questions[0]!.wordId });
    expect(res.status).toBe(404);
    expect(await count("SELECT correct AS n FROM quiz_sessions WHERE user_id = 1")).toBe(0);
  });

  it("через три часа сессия просрочена", async () => {
    await completeLesson(1);
    const session = await start(1);
    await ctx.env.DB.prepare("UPDATE quiz_sessions SET created_at = created_at - ? WHERE user_id = 1")
      .bind(QUIZ_SESSION_TTL_SECONDS + 5)
      .run();
    const res = await answerRaw(1, session.sessionId, 0, { choice: session.questions[0]!.wordId });
    expect(res.status).toBe(410);
    expect(await res.json()).toEqual({ error: "session_expired" });
  });

  it("параллельный перебор вариантов на один вопрос засчитывает не больше одного ответа", async () => {
    await completeLesson(1);
    const session = await start(1);
    const q = session.questions[0]!;
    const responses = await Promise.all(q.options.map((choice) => answerRaw(1, session.sessionId, 0, { choice })));
    const bodies = await Promise.all(responses.map((r) => r.json() as Promise<Record<string, unknown>>));
    const accepted = bodies.filter((b) => b.index === 0 && b.repeat !== true);
    expect(accepted.length).toBe(1);

    const row = (await ctx.env.DB.prepare("SELECT next_index, correct, mistakes FROM quiz_sessions").first()) as any;
    expect(row.next_index).toBe(1);
    expect(row.correct + row.mistakes).toBe(1);
    expect(await count("SELECT SUM(asked) AS n FROM question_stats")).toBe(1);
  });
});

describe("вопрос «произнеси»", () => {
  async function toSpeak() {
    await completeLesson(1);
    const session = await start(1);
    const index = indexesOf(session, "speak")[0]!;
    for (let i = 0; i < index; i++) await play(1, session, i, true);
    return { session, index, target: wordOf(session.questions[index]!) };
  }

  it("верное слово сразу засчитывается", async () => {
    const { session, index, target } = await toSpeak();
    ctx.heard = target.he;
    const body = (await (await speechRaw(1, session.sessionId, index)).json()) as QuizAnswerResponse;
    expect(body).toMatchObject({ correct: true, final: true, heard: target.he, index });
  });

  it("неверное слово: первая попытка не финальна, вторая засчитывается ошибкой", async () => {
    const { session, index } = await toSpeak();
    ctx.heard = "";
    const first = (await (await speechRaw(1, session.sessionId, index)).json()) as QuizAnswerResponse;
    expect(first).toMatchObject({ correct: false, final: false, attemptsLeft: 1, heard: "", mistakes: 0 });

    const second = (await (await speechRaw(1, session.sessionId, index)).json()) as QuizAnswerResponse;
    expect(second).toMatchObject({ correct: false, final: true, mistakes: 1 });
    expect(second.attemptsLeft).toBeUndefined();
  });

  it("вторая попытка может быть верной", async () => {
    const { session, index, target } = await toSpeak();
    ctx.heard = "";
    await speechRaw(1, session.sessionId, index);
    ctx.heard = target.he;
    const second = (await (await speechRaw(1, session.sessionId, index)).json()) as QuizAnswerResponse;
    expect(second).toMatchObject({ correct: true, final: true, mistakes: 0 });
  });

  it("после попыток счётчик сбрасывается для следующего вопроса «произнеси»", async () => {
    const { session, index } = await toSpeak();
    ctx.heard = "";
    await speechRaw(1, session.sessionId, index);
    await speechRaw(1, session.sessionId, index);
    const next = index + 1;
    expect(session.questions[next]!.type).toBe("speak");
    const body = (await (await speechRaw(1, session.sessionId, next)).json()) as QuizAnswerResponse;
    expect(body).toMatchObject({ final: false, attemptsLeft: 1 });
  });

  it("сбой распознавателя и недоступный ИИ не тратят попытку", async () => {
    const { session, index, target } = await toSpeak();
    const broken = { ...ctx.env, AI: { run: async () => { throw new Error("boom"); } } };
    const failed = await api(`/api/quiz/speech?sessionId=${session.sessionId}&index=${index}`, {
      method: "POST", as: 1, body: new Uint8Array(100),
    }, broken);
    expect(failed.status).toBe(502);
    const none = await api(`/api/quiz/speech?sessionId=${session.sessionId}&index=${index}`, {
      method: "POST", as: 1, body: new Uint8Array(100),
    }, { ...ctx.env, AI: undefined });
    expect(none.status).toBe(503);
    expect(await count("SELECT speak_attempts AS n FROM quiz_sessions")).toBe(0);

    ctx.heard = target.he;
    expect(((await (await speechRaw(1, session.sessionId, index)).json()) as QuizAnswerResponse).correct).toBe(true);
  });

  it("пустая и слишком большая запись, плохой номер и чужая сессия отклоняются", async () => {
    const { session, index } = await toSpeak();
    expect((await speechRaw(1, session.sessionId, index, 0)).status).toBe(400);
    expect((await speechRaw(1, session.sessionId, index, 1_600_000)).status).toBe(413);
    expect((await speechRaw(1, session.sessionId, "abc")).status).toBe(409);
    expect((await speechRaw(1, session.sessionId, 0)).status).toBe(409);
    expect((await speechRaw(1, "0".repeat(32), index)).status).toBe(404);
    expect(await count("SELECT speak_attempts AS n FROM quiz_sessions")).toBe(0);
  });

  it("запись голоса на вопрос не про произношение отклоняется", async () => {
    await completeLesson(1);
    const session = await start(1);
    expect(session.questions[0]!.type).not.toBe("speak");
    const res = await speechRaw(1, session.sessionId, 0);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "not_a_speech_question" });
  });

  it("отказ от вопроса «произнеси» засчитывается ошибкой, а вопросы с выбором отказом пропустить нельзя", async () => {
    await completeLesson(1);
    const session = await start(1);
    expect((await answerRaw(1, session.sessionId, 0, { giveUp: true })).status).toBe(400);
    const index = indexesOf(session, "speak")[0]!;
    for (let i = 0; i < index; i++) await play(1, session, i, true);
    const body = (await (await answerRaw(1, session.sessionId, index, { giveUp: true })).json()) as QuizAnswerResponse;
    expect(body).toMatchObject({ correct: false, final: true, mistakes: 1 });
  });

  it("по голосовому вопросу нельзя отвечать JSON-ом без записи", async () => {
    const { session, index, target } = await toSpeak();
    const res = await answerRaw(1, session.sessionId, index, { choice: target.id });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "speak_requires_recording" });
  });
});

describe("вопрос «напиши»", () => {
  async function toWrite() {
    await completeLesson(1);
    const session = await start(1);
    const index = indexesOf(session, "write")[0]!;
    for (let i = 0; i < index; i++) await play(1, session, i, true);
    return { session, index, target: wordOf(session.questions[index]!) };
  }

  it("штрихи верного слова принимаются", async () => {
    const { session, index, target } = await toWrite();
    const body = (await (await answerRaw(1, session.sessionId, index, { strokes: await wordStrokes(target) })).json()) as QuizAnswerResponse;
    expect(body).toMatchObject({ correct: true, final: true, failedLetters: [] });
  });

  it("не написанные буквы (пустой список) дают ошибку и называют буквы", async () => {
    const { session, index, target } = await toWrite();
    const strokes = await wordStrokes(target);
    strokes[0] = [];
    const body = (await (await answerRaw(1, session.sessionId, index, { strokes })).json()) as QuizAnswerResponse;
    expect(body).toMatchObject({ correct: false, final: true, failedLetters: [0], mistakes: 1 });
  });

  it("каракули и чужое слово не принимаются", async () => {
    const { session, index, target } = await toWrite();
    const scribble = wordLetters(target.he).map(() => [[{ x: 100, y: 100 }, { x: 300, y: 100 }]]);
    const body = (await (await answerRaw(1, session.sessionId, index, { strokes: scribble })).json()) as QuizAnswerResponse;
    expect(body).toMatchObject({ correct: false, final: true });
    expect(body.failedLetters!.length).toBe(wordLetters(target.he).length);
  });

  it("неверная форма данных это 400, и вопрос остаётся неотвеченным", async () => {
    const { session, index, target } = await toWrite();
    const good = await wordStrokes(target);
    for (const strokes of [undefined, "штрихи", good.slice(1), good.map(() => [[{ x: "1", y: 2 }]]), good.map(() => [[{ x: 1e9, y: 2 }]])]) {
      expect((await answerRaw(1, session.sessionId, index, { strokes })).status).toBe(400);
    }
    expect(await count("SELECT next_index AS n FROM quiz_sessions")).toBe(index);
  });
});

describe("статистика по вопросам", () => {
  it("считает, сколько раз спрашивали слово данным типом и сколько раз ответили верно", async () => {
    await completeLesson(1);
    const session = await start(1);
    const wrong = indexesOf(session, "speak");
    await playAll(1, session, wrong);

    expect(await count("SELECT SUM(asked) AS n FROM question_stats")).toBe(QUIZ_SIZE);
    expect(await count("SELECT SUM(correct) AS n FROM question_stats")).toBe(QUIZ_SIZE - wrong.length);
    expect(await count("SELECT SUM(correct) AS n FROM question_stats WHERE question_type = 'speak'")).toBe(0);
    expect(await count("SELECT COUNT(*) AS n FROM question_stats WHERE question_type = 'write'")).toBe(5);
  });

  it("прерванная викторина тоже попадает в статистику, но не в результаты", async () => {
    await completeLesson(1);
    const session = await start(1);
    await playAll(1, session, [0, 1, 2, 3, 4, 5]);
    expect(await count("SELECT SUM(asked) AS n FROM question_stats")).toBe(6);
    expect(await count("SELECT COUNT(*) AS n FROM quiz_attempts")).toBe(0);
  });
});

describe("подпись входа", () => {
  it("маршруты викторины требуют входа", async () => {
    expect((await api("/api/quiz/answer", { method: "POST", body: "{}" })).status).toBe(401);
    expect((await api("/api/quiz/speech?sessionId=a&index=0", { method: "POST" })).status).toBe(401);
    expect(auth(1).Authorization.startsWith("tma ")).toBe(true);
  });
});

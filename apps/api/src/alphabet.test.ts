// Алфавит на сервере: этапы букв, засчитывание, викторина. Настоящий SQLite (test-utils/d1.ts), как в quiz.test.ts.
import { beforeEach, describe, expect, it } from "vitest";
import {
  ALPHABET_QUIZ_RULES,
  POINTS_PER_WORD,
  type MeResponse,
  type QuizAnswerResponse,
  type QuizQuestion,
  type QuizStartResponse,
  type WordProgress,
} from "@milav/shared";
import {
  alphabetLesson,
  api,
  completeAlphabetLesson,
  completeLetter,
  completeWord,
  ctx,
  letter,
  letterStageBody,
  letterStrokes,
  post,
  resetHarness,
  speak,
  stageBody,
  word,
} from "./test-utils/harness";

beforeEach(resetHarness);

const stage = (as: number, body: unknown) => post("/api/progress/stage", as, body);
const me = async (as: number) => (await (await api("/api/me", { as })).json()) as MeResponse;
const count = async (sql: string, ...params: unknown[]) =>
  (await ctx.env.DB.prepare(sql).bind(...params).first<{ n: number }>())!.n;
const letterOf = (q: QuizQuestion) => alphabetLesson.letters.find((l) => l.id === q.wordId)!;

describe("этапы буквы", () => {
  it("«слушай» засчитывается отметкой, очки только после трёх этапов (без «говори»)", async () => {
    const listen = await stage(1, await letterStageBody(letter, "listen"));
    expect(listen.status).toBe(200);
    const body = (await listen.json()) as { progress: WordProgress; pointsAwarded: number };
    expect(body.progress).toMatchObject({ wordId: letter.id, listen: true, write: false, type: false, completed: false });
    expect(body.pointsAwarded).toBe(0);

    expect((await stage(1, await letterStageBody(letter, "write"))).status).toBe(200);
    const last = await stage(1, await letterStageBody(letter, "type"));
    const done = (await last.json()) as { progress: WordProgress; pointsAwarded: number; points: number };
    expect(done.progress.completed).toBe(true);
    expect(done.progress.speak).toBe(false);
    expect(done.pointsAwarded).toBe(POINTS_PER_WORD);
    expect(done.points).toBe(POINTS_PER_WORD);
  });

  it("порядок этапов не важен, повторный этап очков не добавляет", async () => {
    for (const s of ["type", "listen", "write"] as const) expect((await stage(1, await letterStageBody(letter, s))).status).toBe(200);
    expect((await me(1)).points).toBe(1);
    const again = (await (await stage(1, await letterStageBody(letter, "type"))).json()) as { pointsAwarded: number };
    expect(again.pointsAwarded).toBe(0);
    expect((await me(1)).points).toBe(1);
  });

  it("этап «говори» для буквы не принимается ни отметкой, ни проверкой речи", async () => {
    const res = await stage(1, { wordId: letter.id, stage: "speak" });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "speak_requires_speech_check" });
    ctx.heard = letter.he;
    const speech = await speak(1, letter.id);
    expect(speech.status).toBe(404);
    expect(await count("SELECT COUNT(*) AS n FROM word_progress")).toBe(0);
  });

  it("«печатай» без буквы и с чужой буквой не засчитывается", async () => {
    const none = await stage(1, { wordId: letter.id, stage: "type" });
    expect(none.status).toBe(400);
    expect(await none.json()).toEqual({ error: "proof_required" });
    const other = alphabetLesson.letters[1]!;
    const wrong = await stage(1, { wordId: letter.id, stage: "type", typed: other.he });
    expect(wrong.status).toBe(422);
    expect(await wrong.json()).toEqual({ error: "type_mismatch" });
    const two = await stage(1, { wordId: letter.id, stage: "type", typed: letter.he + other.he });
    expect(two.status).toBe(422);
    expect(await count("SELECT COUNT(*) AS n FROM word_progress")).toBe(0);
  });

  it("«пиши» без штрихов, с чужой буквой и с лишними буквами не засчитывается", async () => {
    const none = await stage(1, { wordId: letter.id, stage: "write" });
    expect(none.status).toBe(400);
    const other = alphabetLesson.letters[1]!;
    const wrong = await stage(1, { wordId: letter.id, stage: "write", strokes: [await letterStrokes(other.he)] });
    expect(wrong.status).toBe(422);
    expect(await wrong.json()).toEqual({ error: "write_rejected", failedLetters: [0] });
    const extra = await stage(1, { wordId: letter.id, stage: "write", strokes: [await letterStrokes(letter.he), await letterStrokes(letter.he)] });
    expect(extra.status).toBe(400);
    expect(await count("SELECT COUNT(*) AS n FROM word_progress")).toBe(0);
  });

  it("неизвестная буква и вход без подписи", async () => {
    expect((await stage(1, { wordId: "alphabet-9-nope", stage: "listen" })).status).toBe(404);
    expect((await api("/api/progress/stage", { method: "POST", body: "{}" })).status).toBe(401);
  });

  it("прогресс урока алфавита: по буквам, викторина ещё не сдана", async () => {
    await completeLetter(1, letter.id);
    const res = await api(`/api/lessons/${alphabetLesson.id}/progress`, { as: 1 });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { words: WordProgress[]; quiz: { passed: boolean; bestCorrect: number | null } };
    expect(body.words.map((w) => w.wordId)).toEqual(alphabetLesson.letters.map((l) => l.id));
    expect(body.words.map((w) => w.completed)).toEqual(alphabetLesson.letters.map((l) => l.id === letter.id));
    expect(body.quiz).toEqual({ passed: false, bestCorrect: null });
  });

  it("слова обычных уроков по-прежнему требуют все четыре этапа", async () => {
    for (const s of ["listen", "write", "type"] as const) {
      expect((await stage(1, await stageBody(word, s))).status).toBe(200);
    }
    expect((await me(1)).points).toBe(0);
    await completeWord(1, word.id);
    expect((await me(1)).points).toBe(POINTS_PER_WORD);
  });
});

describe("викторина алфавита", () => {
  const startRaw = (as: number) => post("/api/quiz/start", as, { lessonId: alphabetLesson.id });
  async function start(as: number): Promise<QuizStartResponse> {
    const res = await startRaw(as);
    expect(res.status).toBe(200);
    return (await res.json()) as QuizStartResponse;
  }
  const answerRaw = (as: number, sessionId: string, index: number, extra: Record<string, unknown>) =>
    post("/api/quiz/answer", as, { sessionId, index, ...extra });

  /** Отвечает на вопрос `index` верно или неверно, как честный ученик. */
  async function play(as: number, session: QuizStartResponse, index: number, right: boolean) {
    const q = session.questions[index]!;
    const target = letterOf(q);
    let res: Response;
    if (q.type === "name-write") {
      const strokes = right ? [await letterStrokes(target.he)] : [[]];
      res = await answerRaw(as, session.sessionId, index, { strokes });
    } else if (q.type === "name-type") {
      const wrong = alphabetLesson.letters.find((l) => l.id !== target.id)!.he;
      res = await answerRaw(as, session.sessionId, index, { typed: right ? target.he : wrong });
    } else {
      const choice = right ? q.wordId : q.options.find((id) => id !== q.wordId)!;
      res = await answerRaw(as, session.sessionId, index, { choice });
    }
    expect(res.status).toBe(200);
    return (await res.json()) as QuizAnswerResponse;
  }

  async function playAll(as: number, session: QuizStartResponse, wrong: number[] = []) {
    const answers: QuizAnswerResponse[] = [];
    for (let i = 0; i < session.questions.length; i++) {
      const a = await play(as, session, i, !wrong.includes(i));
      answers.push(a);
      if (a.aborted) break;
    }
    return answers;
  }

  it("пока не пройдены все буквы, викторина не начинается", async () => {
    await completeLetter(1, letter.id);
    const res = await startRaw(1);
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "lesson_not_completed" });
    expect(await count("SELECT COUNT(*) AS n FROM quiz_sessions")).toBe(0);
  });

  it("после урока выдаёт 20 вопросов по буквам урока", async () => {
    await completeAlphabetLesson(1);
    const session = await start(1);
    expect(session.lessonId).toBe(alphabetLesson.id);
    expect(session.questions.length).toBe(ALPHABET_QUIZ_RULES.size);
    const ids = new Set(alphabetLesson.letters.map((l) => l.id));
    expect(session.questions.every((q) => ids.has(q.wordId))).toBe(true);
    expect(new Set(session.questions.map((q) => q.type))).toEqual(new Set(["hear-letter", "letter-name", "name-write", "name-type"]));
  });

  it("все ответы верны: урок сдан, статус растёт, итог записан", async () => {
    await completeAlphabetLesson(1);
    const session = await start(1);
    const answers = await playAll(1, session);
    expect(answers.length).toBe(ALPHABET_QUIZ_RULES.size);
    const result = answers.at(-1)!.result!;
    expect(result).toMatchObject({ passed: true, correct: 20, total: 20, mistakes: 0, firstTimePassed: true, passedLessons: 1 });
    expect(await count("SELECT COUNT(*) AS n FROM lesson_passed WHERE lesson_id = ?", alphabetLesson.id)).toBe(1);
    expect(await count("SELECT COUNT(*) AS n FROM quiz_attempts WHERE passed = 1")).toBe(1);
    const profile = await me(1);
    expect(profile.passedLessons).toBe(1);
    expect(profile.points).toBe(alphabetLesson.letters.length * POINTS_PER_WORD);
  });

  it("4 ошибки допустимы, итог 16 из 20 сдан", async () => {
    await completeAlphabetLesson(1);
    const session = await start(1);
    const answers = await playAll(1, session, [0, 5, 10, 15]);
    expect(answers.length).toBe(20);
    expect(answers.at(-1)!.result).toMatchObject({ passed: true, correct: 16, total: 20, mistakes: 4 });
  });

  it("5-я ошибка прерывает викторину, ничего не сохраняется", async () => {
    await completeAlphabetLesson(1);
    const session = await start(1);
    const answers = await playAll(1, session, [0, 1, 2, 3, 4]);
    expect(answers.length).toBe(ALPHABET_QUIZ_RULES.maxMistakes + 1);
    expect(answers.at(-1)).toMatchObject({ aborted: true, mistakes: 5 });
    expect(answers.at(-1)!.result).toBeUndefined();
    expect(await count("SELECT COUNT(*) AS n FROM lesson_passed")).toBe(0);
    expect(await count("SELECT COUNT(*) AS n FROM quiz_attempts")).toBe(0);
    const next = await answerRaw(1, session.sessionId, 5, { choice: "x" });
    expect(next.status).toBe(409);
  });

  it("неверная форма ответа не принимается и не тратит вопрос", async () => {
    await completeAlphabetLesson(1);
    const session = await start(1);
    const byType = (t: QuizQuestion["type"]) => session.questions.findIndex((q) => q.type === t);

    // Выбор: вариант не из списка.
    expect((await answerRaw(1, session.sessionId, 0, { choice: "alphabet-9-x" })).status).toBe(400);
    expect((await answerRaw(1, session.sessionId, 0, {})).status).toBe(400);
    // Ответы по порядку: пока не ответили на 0, на 10 ответить нельзя.
    expect((await answerRaw(1, session.sessionId, 10, { typed: "א" })).status).toBe(409);
    await play(1, session, 0, true);
    for (let i = 1; i < byType("name-write"); i++) await play(1, session, i, true);
    // Письмо: без штрихов и с лишним списком.
    const w = byType("name-write");
    expect((await answerRaw(1, session.sessionId, w, {})).status).toBe(400);
    expect((await answerRaw(1, session.sessionId, w, { strokes: [] })).status).toBe(400);
    expect((await answerRaw(1, session.sessionId, w, { strokes: [await letterStrokes("א"), await letterStrokes("ב")] })).status).toBe(400);
    await play(1, session, w, true);
    for (let i = w + 1; i < byType("name-type"); i++) await play(1, session, i, true);
    // Набор: без буквы, не строка, слишком длинная строка.
    const t = byType("name-type");
    expect((await answerRaw(1, session.sessionId, t, {})).status).toBe(400);
    expect((await answerRaw(1, session.sessionId, t, { typed: 5 })).status).toBe(400);
    expect((await answerRaw(1, session.sessionId, t, { typed: "אבגדהוזחטי" })).status).toBe(400);
    const wrongTyped = (await (await answerRaw(1, session.sessionId, t, { typed: "ש" })).json()) as QuizAnswerResponse;
    expect(wrongTyped).toMatchObject({ correct: false, final: true, mistakes: 1 });
  });

  it("«сдаюсь» на письме засчитывается неверным", async () => {
    await completeAlphabetLesson(1);
    const session = await start(1);
    const w = session.questions.findIndex((q) => q.type === "name-write");
    for (let i = 0; i < w; i++) await play(1, session, i, true);
    const res = (await (await answerRaw(1, session.sessionId, w, { giveUp: true })).json()) as QuizAnswerResponse;
    expect(res).toMatchObject({ correct: false, final: true, mistakes: 1 });
  });

  it("повторный запрос того же вопроса возвращает тот же ответ без изменений", async () => {
    await completeAlphabetLesson(1);
    const session = await start(1);
    const first = await play(1, session, 0, true);
    const q = session.questions[0]!;
    const again = (await (await answerRaw(1, session.sessionId, 0, { choice: q.wordId })).json()) as QuizAnswerResponse;
    expect(again).toEqual({ ...first, repeat: true });
  });

  it("вопрос «произнеси» в алфавите невозможен: запись голоса к вопросу не принимается", async () => {
    await completeAlphabetLesson(1);
    const session = await start(1);
    const res = await api(`/api/quiz/speech?sessionId=${session.sessionId}&index=0`, {
      method: "POST",
      as: 1,
      body: new Uint8Array(2000),
      headers: { "Content-Type": "audio/webm" },
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "not_a_speech_question" });
  });

  it("статистика по вопросам пишется по id буквы и типу алфавита", async () => {
    await completeAlphabetLesson(1);
    const session = await start(1);
    await playAll(1, session, [0]);
    expect(await count("SELECT SUM(asked) AS n FROM question_stats")).toBe(20);
    expect(await count("SELECT SUM(correct) AS n FROM question_stats")).toBe(19);
    expect(await count("SELECT COUNT(*) AS n FROM question_stats WHERE question_type = 'name-type'")).toBe(5);
  });

  it("повторная сдача не добавляет сданных уроков", async () => {
    await completeAlphabetLesson(1);
    await playAll(1, await start(1));
    const second = await playAll(1, await start(1));
    expect(second.at(-1)!.result).toMatchObject({ passed: true, firstTimePassed: false, passedLessons: 1 });
    expect((await me(1)).passedLessons).toBe(1);
  });
});

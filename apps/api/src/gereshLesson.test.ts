// Урок со звуками дж, ж, ч (ג׳ ז׳ צ׳) на сервере: два этапа вместо трёх, своя викторина из 9 вопросов.
// Настоящий SQLite (test-utils/d1.ts), как в alphabet.test.ts.
import { beforeEach, describe, expect, it } from "vitest";
import { alphabetLessons } from "@milav/content";
import {
  GERESH_QUESTION_TYPES,
  GERESH_QUIZ_RULES,
  POINTS_PER_WORD,
  isGereshForm,
  type MeResponse,
  type QuizStartResponse,
  type WordProgress,
} from "@milav/shared";
import { answerQuestion, api, ctx, playQuiz, post, resetHarness, startQuiz } from "./test-utils/harness";

beforeEach(resetHarness);

const geresh = alphabetLessons.find((l) => l.letters.every((x) => isGereshForm(x.he)))!;
const first = geresh.letters[0]!;
const stage = (as: number, body: unknown) => post("/api/progress/stage", as, body);
const me = async (as: number) => (await (await api("/api/me", { as })).json()) as MeResponse;
const count = async (sql: string, ...params: unknown[]) =>
  (await ctx.env.DB.prepare(sql).bind(...params).first<{ n: number }>())!.n;

async function completeAll(as: number) {
  for (const l of geresh.letters) {
    expect((await stage(as, { wordId: l.id, stage: "listen" })).status).toBe(200);
    expect((await stage(as, { wordId: l.id, stage: "type", typed: l.he })).status).toBe(200);
  }
}

describe("этапы формы с гереш", () => {
  it("урок найден, он бесплатный и в нём три формы", () => {
    expect(geresh.id).toBe("alphabet-6");
    expect(geresh.free).toBe(true);
    expect(geresh.letters.map((l) => l.he)).toEqual(["ג׳", "ז׳", "צ׳"]);
  });

  it("«слушай» и «печатай» засчитывают форму и приносят очко; «пиши» здесь не принимается", async () => {
    const listen = await stage(1, { wordId: first.id, stage: "listen" });
    const body = (await listen.json()) as { progress: WordProgress; pointsAwarded: number };
    expect(body.progress).toMatchObject({ listen: true, type: false, completed: false });
    expect(body.pointsAwarded).toBe(0);

    const write = await stage(1, { wordId: first.id, stage: "write", strokes: [[{ x: 1, y: 1 }]] });
    expect(write.status).toBe(400);
    expect(await write.json()).toEqual({ error: "bad_stage" });

    const typed = await stage(1, { wordId: first.id, stage: "type", typed: first.he });
    const done = (await typed.json()) as { progress: WordProgress; pointsAwarded: number; points: number };
    expect(done.progress.completed).toBe(true);
    expect(done.pointsAwarded).toBe(POINTS_PER_WORD);
    expect(done.points).toBe(POINTS_PER_WORD);
  });

  it("набор без гереш и с чужой формой не засчитывается; два знака слитно принимаются", async () => {
    for (const typed of ["ג", "׳", "ז׳", "גג", "׳ג", ""]) {
      const res = await stage(1, { wordId: first.id, stage: "type", typed });
      expect(res.status, typed).toBe(typed === "" ? 400 : 422);
    }
    expect(await count("SELECT COUNT(*) AS n FROM word_progress")).toBe(0);
    expect((await stage(1, { wordId: first.id, stage: "type", typed: "ג׳" })).status).toBe(200);
  });
});

describe("викторина формы с гереш", () => {
  it("не начинается, пока формы не пройдены", async () => {
    const res = await post("/api/quiz/start", 1, { lessonId: geresh.id });
    expect(res.status).toBe(409);
  });

  it("9 вопросов трёх типов, без «напиши»; сдана при 7 из 9, урок и очки засчитаны", async () => {
    await completeAll(1);
    const quiz = await startQuiz(1, geresh.id);
    expect(quiz.questions.length).toBe(GERESH_QUIZ_RULES.size);
    expect(new Set(quiz.questions.map((q) => q.type))).toEqual(new Set(GERESH_QUESTION_TYPES));

    const last = await playQuiz(1, quiz, [0, 4]); // две ошибки допустимы
    expect(last.result).toBeDefined();
    expect(last.result!.correct).toBe(7);
    expect(last.result!.passed).toBe(true);
    expect(await count("SELECT COUNT(*) AS n FROM lesson_passed WHERE lesson_id = ?", geresh.id)).toBe(1);
    expect((await me(1)).points).toBe(geresh.letters.length * POINTS_PER_WORD);
  });

  it("третья ошибка прерывает викторину, ничего не записывается", async () => {
    await completeAll(1);
    const quiz = await startQuiz(1, geresh.id);
    const last = await playQuiz(1, quiz, [0, 1, 2]);
    expect(last.aborted).toBe(true);
    expect(last.result).toBeUndefined();
    expect(await count("SELECT COUNT(*) AS n FROM lesson_passed WHERE lesson_id = ?", geresh.id)).toBe(0);
  });

  it("«найди на клавиатуре»: верно только полная форма с гереш", async () => {
    await completeAll(1);
    const quiz: QuizStartResponse = await startQuiz(1, geresh.id);
    const index = quiz.questions.findIndex((q) => q.type === "name-type");
    // Ответы идут по порядку: проходим предыдущие верно.
    for (let i = 0; i < index; i++) await answerQuestion(1, quiz, i, true);
    const wrong = await post("/api/quiz/answer", 1, { sessionId: quiz.sessionId, index, typed: "ג" });
    expect(wrong.status).toBe(200);
    expect(((await wrong.json()) as { correct: boolean }).correct).toBe(false);
  });
});

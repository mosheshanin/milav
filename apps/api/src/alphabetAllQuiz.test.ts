// Общая викторина по всем буквам алфавита: генерация вопросов и серверный сценарий (настоящий SQLite, как в alphabet.test.ts).
// Главное правило: это не урок, поэтому в сданные уроки, статус и бейджи она не идёт, а на главной видна как «сдана».
import { beforeEach, describe, expect, it } from "vitest";
import { alphabetAll, alphabetLessons, getQuizLesson } from "@milav/content";
import {
  ALPHABET_ALL_ID,
  ALPHABET_ALL_QUIZ_RULES,
  ALPHABET_QUESTION_TYPES,
  ALPHABET_QUIZ_RULES,
  HEBREW_LETTERS,
  alphabetAllLesson,
  isFormPair,
  isGereshForm,
  quizRulesFor,
  type HomeResponse,
  type QuizStartResponse,
} from "@milav/shared";
import { generateAlphabetAllQuiz, generateLessonQuiz, isChoiceType } from "./quizGen";
import { api, ctx, playQuiz, post, resetHarness, startQuiz, statsRow } from "./test-utils/harness";

beforeEach(resetHarness);

function seeded(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}

const letters = alphabetAll.letters;
const count = async (sql: string, ...params: unknown[]) =>
  (await ctx.env.DB.prepare(sql).bind(...params).first<{ n: number }>())!.n;

/** Все буквы выучены (прогресс пишется прямо в базу: в тесте важна викторина, а не 81 запрос этапов). */
async function learnAllLetters(as: number): Promise<void> {
  await api("/api/me", { as }); // создаёт пользователя
  for (const l of letters) {
    const lessonId = alphabetLessons.find((lesson) => lesson.letters.some((x) => x.id === l.id))!.id;
    await ctx.env.DB
      .prepare(
        "INSERT INTO word_progress (user_id, word_id, lesson_id, stage_listen, stage_write, stage_type, completed_at) VALUES (?, ?, ?, 1, 1, 1, datetime('now'))",
      )
      .bind(as, l.id, lessonId)
      .run();
  }
}

describe("«урок» общей викторины", () => {
  it("27 форм из уроков 1–5 по порядку, без звуков с гереш", () => {
    expect(alphabetAll.id).toBe(ALPHABET_ALL_ID);
    expect(letters.map((l) => l.he)).toEqual([...HEBREW_LETTERS]);
    expect(letters.some((l) => isGereshForm(l.he))).toBe(false);
    expect(new Set(letters.map((l) => l.id)).size).toBe(27);
  });

  it("сервер и приложение собирают его одной функцией: порядок уроков не важен", () => {
    const shuffled = [...alphabetLessons].reverse();
    expect(alphabetAllLesson(shuffled).letters.map((l) => l.id)).toEqual(letters.map((l) => l.id));
  });

  it("это не настоящий урок: его нет среди уроков, но викторине он доступен по id", () => {
    expect(alphabetLessons.some((l) => l.id === ALPHABET_ALL_ID)).toBe(false);
    expect(getQuizLesson(ALPHABET_ALL_ID)).toBe(alphabetAll);
    expect(getQuizLesson(alphabetLessons[0]!.id)).toBe(alphabetLessons[0]);
    expect(getQuizLesson("no-such-lesson")).toBeUndefined();
  });

  it("правила: 28 вопросов по 7 из 4 типов, сдана при 22 (80% вниз), седьмая ошибка прерывает", () => {
    const r = ALPHABET_ALL_QUIZ_RULES;
    expect(r).toEqual({ size: 28, perType: 7, pass: 22, maxMistakes: 6 });
    expect(r.size).toBe(ALPHABET_QUESTION_TYPES.length * r.perType);
    expect(r.pass).toBe(Math.floor(r.size * 0.8));
    expect(r.maxMistakes).toBe(r.size - r.pass);
    expect(quizRulesFor(alphabetAll)).toBe(r);
    expect(quizRulesFor(alphabetLessons[0])).toBe(ALPHABET_QUIZ_RULES);
  });
});

describe("генерация общей викторины", () => {
  it("28 вопросов: по 7 каждого из 4 типов в порядке урока алфавита", () => {
    const quiz = generateAlphabetAllQuiz(letters, seeded(5));
    expect(quiz.length).toBe(ALPHABET_ALL_QUIZ_RULES.size);
    ALPHABET_QUESTION_TYPES.forEach((type, i) => {
      const block = quiz.slice(i * 7, (i + 1) * 7);
      expect(block.every((q) => q.type === type), type).toBe(true);
    });
  });

  it("каждая из 27 букв спрашивается хотя бы раз, внутри типа буквы не повторяются (при любом зерне)", () => {
    for (let seed = 1; seed <= 60; seed++) {
      const quiz = generateAlphabetAllQuiz(letters, seeded(seed));
      expect(new Set(quiz.map((q) => q.wordId)).size, `зерно ${seed}`).toBe(27);
      for (const type of ALPHABET_QUESTION_TYPES) {
        const ids = quiz.filter((q) => q.type === type).map((q) => q.wordId);
        expect(new Set(ids).size, `${type}, зерно ${seed}`).toBe(ids.length);
      }
    }
  });

  it("выбор из 4 разных букв всего алфавита, верная ровно одна, пары «обычная и конечная» рядом нет", () => {
    const ids = new Set(letters.map((l) => l.id));
    const heOf = new Map(letters.map((l) => [l.id, l.he]));
    for (let seed = 1; seed <= 40; seed++) {
      for (const q of generateAlphabetAllQuiz(letters, seeded(seed))) {
        if (!isChoiceType(q.type)) {
          expect(q.options).toEqual([]);
          continue;
        }
        expect(q.options.length).toBe(4);
        expect(new Set(q.options).size).toBe(4);
        expect(q.options.every((id) => ids.has(id))).toBe(true);
        expect(q.options.filter((id) => id === q.wordId).length).toBe(1);
        const target = heOf.get(q.wordId)!;
        expect(q.options.some((id) => isFormPair(heOf.get(id)!, target))).toBe(false);
      }
    }
  });

  it("варианты берутся из всех уроков алфавита, а не из одного", () => {
    const lessonOf = (id: string) => alphabetLessons.findIndex((l) => l.letters.some((x) => x.id === id));
    const seen = new Set<number>();
    for (const q of generateAlphabetAllQuiz(letters, seeded(9))) for (const id of q.options) seen.add(lessonOf(id));
    expect(seen.size).toBeGreaterThanOrEqual(4);
  });

  it("generateLessonQuiz выбирает общую викторину по id, обычный урок алфавита остаётся прежним", () => {
    expect(generateLessonQuiz(alphabetAll, seeded(3)).length).toBe(ALPHABET_ALL_QUIZ_RULES.size);
    expect(generateLessonQuiz(alphabetLessons[0]!, seeded(3)).length).toBe(ALPHABET_QUIZ_RULES.size);
  });
});

describe("общая викторина на сервере", () => {
  const startRaw = (as: number) => post("/api/quiz/start", as, { lessonId: ALPHABET_ALL_ID });
  const start = (as: number) => startQuiz(as, ALPHABET_ALL_ID);

  it("пока выучены не все буквы, викторина не начинается", async () => {
    await api("/api/me", { as: 1 });
    await ctx.env.DB
      .prepare(
        "INSERT INTO word_progress (user_id, word_id, lesson_id, stage_listen, stage_write, stage_type, completed_at) VALUES (1, ?, ?, 1, 1, 1, datetime('now'))",
      )
      .bind(letters[0]!.id, alphabetLessons[0]!.id)
      .run();
    const res = await startRaw(1);
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "lesson_not_completed" });
    expect(await count("SELECT COUNT(*) AS n FROM quiz_sessions")).toBe(0);
  });

  it("буквы звуков дж, ж, ч для открытия не нужны", async () => {
    // Урок 6 не выучен вовсе, а викторина всё равно открывается.
    await learnAllLetters(1);
    expect((await startRaw(1)).status).toBe(200);
  });

  it("администратор может начать до изучения букв, обычный ученик нет", async () => {
    const ADMIN = 4402;
    const env = { ...ctx.env, ADMIN_IDS: String(ADMIN) };
    const asAdmin = await api(
      "/api/quiz/start",
      { method: "POST", as: ADMIN, body: JSON.stringify({ lessonId: ALPHABET_ALL_ID }), headers: { "Content-Type": "application/json" } },
      env,
    );
    expect(asAdmin.status).toBe(200);
    expect((await startRaw(1)).status).toBe(409);
  });

  it("после изучения выдаёт 28 вопросов, и в них есть все 27 букв", async () => {
    await learnAllLetters(1);
    const session = await start(1);
    expect(session.lessonId).toBe(ALPHABET_ALL_ID);
    expect(session.questions.length).toBe(ALPHABET_ALL_QUIZ_RULES.size);
    expect(new Set(session.questions.map((q) => q.wordId)).size).toBe(27);
  });

  async function playAll(as: number, session: QuizStartResponse, wrong: number[] = []) {
    return playQuiz(as, session, wrong);
  }

  it("все ответы верны: сдана, но это не урок (сданные уроки, статус и бейджи не меняются)", async () => {
    await learnAllLetters(1);
    const session = await start(1);
    const last = await playAll(1, session);
    expect(last.result).toMatchObject({ passed: true, correct: 28, total: 28, mistakes: 0, firstTimePassed: false, passedLessons: 0 });
    expect(last.result!.play.newBadges).toEqual([]);
    expect(await count("SELECT COUNT(*) AS n FROM lesson_passed")).toBe(0);
    expect(await count("SELECT COUNT(*) AS n FROM quiz_attempts WHERE lesson_id = ? AND passed = 1", ALPHABET_ALL_ID)).toBe(1);
    expect(await statsRow(1)).toMatchObject({ passed_lessons: 0, alphabet_lessons: 0, perfect_quizzes: 0, sections_mask: 0 });
    expect(await count("SELECT COUNT(*) AS n FROM user_badges WHERE user_id = 1")).toBe(0);
  });

  it("6 ошибок допустимы, итог 22 из 28 сдан", async () => {
    await learnAllLetters(1);
    const session = await start(1);
    const last = await playAll(1, session, [0, 4, 8, 12, 16, 20]);
    expect(last.result).toMatchObject({ passed: true, correct: 22, total: 28, mistakes: 6 });
  });

  it("7-я ошибка прерывает викторину, ничего не сохраняется", async () => {
    await learnAllLetters(1);
    const session = await start(1);
    const last = await playAll(1, session, [0, 1, 2, 3, 4, 5, 6]);
    expect(last).toMatchObject({ aborted: true, mistakes: 7 });
    expect(last.result).toBeUndefined();
    expect(await count("SELECT COUNT(*) AS n FROM quiz_attempts")).toBe(0);
    expect(await count("SELECT COUNT(*) AS n FROM lesson_passed")).toBe(0);
  });

  it("прерванная попытка ничего не записывает: на главной викторина не сдана и без счёта", async () => {
    await learnAllLetters(1);
    const session = await start(1);
    const last = await playAll(1, session, Array.from({ length: 7 }, (_, i) => 20 + i)); // 21 верный, 7 ошибок на последних вопросах
    expect(last.aborted).toBe(true);
    const home = (await (await api("/api/home", { as: 1 })).json()) as HomeResponse;
    expect(home.lessons[ALPHABET_ALL_ID]).toEqual({ words: [], quiz: { passed: false, bestCorrect: null } });
  });

  it("на главной после успешной попытки: сдана и лучший счёт; повторная попытка снова возможна", async () => {
    await learnAllLetters(1);
    await playAll(1, await start(1));
    const home = (await (await api("/api/home", { as: 1 })).json()) as HomeResponse;
    expect(home.lessons[ALPHABET_ALL_ID]).toEqual({ words: [], quiz: { passed: true, bestCorrect: 28 } });
    // Обычные уроки по-прежнему приходят, общая викторина лишь добавлена к ним.
    expect(Object.keys(home.lessons).length).toBeGreaterThan(30);
    // Повтор: новая сессия открывается, прежний результат не пропадает.
    await playAll(1, await start(1), [0, 1]);
    expect(await count("SELECT COUNT(*) AS n FROM quiz_attempts WHERE lesson_id = ?", ALPHABET_ALL_ID)).toBe(2);
    const again = (await (await api("/api/home", { as: 1 })).json()) as HomeResponse;
    expect(again.lessons[ALPHABET_ALL_ID]!.quiz).toEqual({ passed: true, bestCorrect: 28 });
  });

  it("урока alphabet-all по API не отдаётся: приложение собирает его из уроков алфавита", async () => {
    expect((await api(`/api/lessons/${ALPHABET_ALL_ID}`, { as: 1 })).status).toBe(404);
  });
});

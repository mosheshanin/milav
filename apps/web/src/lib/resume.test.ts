import { describe, expect, it } from "vitest";
import { LETTER_STAGES, PAID_LESSONS_OPEN, STAGES, type LessonMeta, type WordProgress } from "@milav/shared";
import { findResume, orderLessons, type LessonState } from "./resume";

function lesson(id: string, over: Partial<LessonMeta> = {}): LessonMeta {
  return {
    id,
    topicId: "animals",
    section: "nouns",
    topic: "Животные",
    number: 1,
    free: true,
    title: id,
    count: 10,
    stages: [...STAGES],
    v: "test",
    ...over,
  };
}

function word(id: string, done: Partial<WordProgress> = {}): WordProgress {
  const stages = { listen: false, speak: false, write: false, type: false, ...done };
  return { wordId: id, ...stages, completed: stages.listen && stages.speak && stages.write && stages.type };
}

const ALL = { listen: true, speak: true, write: true, type: true };

/** Урок из 10 слов: первые `passedWords` пройдены, у следующего отмечены этапы `current`. */
function state(passedWords: number, current: Partial<WordProgress> = {}, quizPassed = false): LessonState {
  return {
    words: Array.from({ length: 10 }, (_, i) =>
      i < passedWords ? word(`w${i}`, ALL) : i === passedWords ? word(`w${i}`, current) : word(`w${i}`),
    ),
    quiz: { passed: quizPassed },
  };
}

describe("порядок уроков", () => {
  it("как на главной: разделы, темы по первому появлению, номера по возрастанию", () => {
    const ordered = orderLessons([
      lesson("adj-1", { section: "adjectives", topic: "Цвета" }),
      lesson("food-2", { topic: "Еда", number: 2 }),
      lesson("animals-1", { topic: "Животные" }),
      lesson("food-1", { topic: "Еда", number: 1 }),
      lesson("verbs-1", { section: "verbs", topic: "Движение" }),
      lesson("animals-2", { topic: "Животные", number: 2 }),
      lesson("num-1", { section: "numbers", topic: "Числа" }),
      lesson("pron-1", { section: "basics", topic: "Местоимения" }),
    ]);
    // Сначала основа и числа, потом существительные: тема «Еда» появилась первой, потом «Животные»; глаголы; прилагательные.
    expect(ordered.map((l) => l.id)).toEqual(["pron-1", "num-1", "food-1", "food-2", "animals-1", "animals-2", "verbs-1", "adj-1"]);
  });
});

describe("«Продолжить»", () => {
  const lessons = [lesson("a1"), lesson("a2", { number: 2 }), lesson("a3", { number: 3 })];

  it("новичку предлагает начать первый урок", () => {
    const progress = { a1: state(0), a2: state(0), a3: state(0) };
    expect(findResume(lessons, progress)).toEqual({ kind: "word", lessonId: "a1", wordIndex: 0, stage: "listen", started: false });
  });

  it("в начатом уроке ведёт на первое непройденное слово и этап", () => {
    const progress = { a1: state(3, { listen: true, speak: true }), a2: state(0), a3: state(0) };
    expect(findResume(lessons, progress)).toEqual({ kind: "word", lessonId: "a1", wordIndex: 3, stage: "write", started: true });
  });

  it("этап берётся первый непройденный, даже если пройдены не подряд", () => {
    const progress = { a1: state(0, { listen: true, write: true }), a2: state(0), a3: state(0) };
    expect(findResume(lessons, progress)).toMatchObject({ wordIndex: 0, stage: "speak" });
  });

  it("сданные уроки пропускаются", () => {
    const progress = { a1: state(10, {}, true), a2: state(0), a3: state(0) };
    expect(findResume(lessons, progress)).toMatchObject({ lessonId: "a2", started: false });
  });

  it("начатый урок важнее непочатого, даже если идёт позже в списке", () => {
    const progress = { a1: state(0), a2: state(0), a3: state(2, { listen: true }) };
    expect(findResume(lessons, progress)).toMatchObject({ lessonId: "a3", wordIndex: 2, stage: "speak", started: true });
  });

  it("когда все слова пройдены, а викторина не сдана, ведёт к викторине", () => {
    const progress = { a1: state(10), a2: state(0), a3: state(0) };
    expect(findResume(lessons, progress)).toEqual({ kind: "quiz", lessonId: "a1" });
  });

  it("если сдано всё, предлагать нечего; не загруженные уроки не предлагаются", () => {
    expect(findResume(lessons, { a1: state(10, {}, true), a2: state(10, {}, true), a3: state(10, {}, true) })).toBeNull();
    expect(findResume(lessons, {})).toBeNull();
  });

  it("платный урок предлагается, пока платные открыты всем до Stars (PAID_LESSONS_OPEN)", () => {
    expect(PAID_LESSONS_OPEN).toBe(true);
    expect(findResume([lesson("paid", { free: false })], { paid: state(0) })).not.toBeNull();
  });
});

describe("алфавит", () => {
  const alphabet = (number: number): LessonMeta => ({
    id: `alphabet-${number}`,
    topicId: "alphabet",
    section: "alphabet",
    topic: "Алфавит",
    number,
    free: true,
    title: `Алфавит ${number}`,
    count: 5,
    stages: [...LETTER_STAGES],
    letters: [],
    v: "test",
  });

  /** Урок из 5 букв: первые `passedLetters` пройдены (без «говори»), у следующей отмечены этапы `current`. */
  function letterState(passedLetters: number, current: Partial<WordProgress> = {}, quizPassed = false): LessonState {
    const done = { listen: true, speak: false, write: true, type: true };
    const letter = (i: number, over: Partial<WordProgress>) => ({
      ...word(`l${i}`, over),
      completed: !!(over.listen && over.write && over.type),
    });
    return {
      words: Array.from({ length: 5 }, (_, i) => (i < passedLetters ? letter(i, done) : i === passedLetters ? letter(i, current) : letter(i, {}))),
      quiz: { passed: quizPassed },
    };
  }

  const lessons = [lesson("animals-1"), alphabet(2), alphabet(1)];

  it("алфавит стоит первым на главной, по номерам", () => {
    expect(orderLessons(lessons).map((l) => l.id)).toEqual(["alphabet-1", "alphabet-2", "animals-1"]);
  });

  it("новичку предлагает начать с первого урока алфавита", () => {
    const progress = { "alphabet-1": letterState(0), "alphabet-2": letterState(0), "animals-1": state(0) };
    expect(findResume(lessons, progress)).toEqual({ kind: "word", lessonId: "alphabet-1", wordIndex: 0, stage: "listen", started: false });
  });

  it("после «слушай» ведёт на «пиши», а не на несуществующий «говори»", () => {
    const progress = { "alphabet-1": letterState(2, { listen: true }), "animals-1": state(0) };
    expect(findResume(lessons, progress)).toEqual({ kind: "word", lessonId: "alphabet-1", wordIndex: 2, stage: "write", started: true });
  });

  it("когда все буквы пройдены, ведёт к викторине алфавита", () => {
    const progress = { "alphabet-1": letterState(5), "animals-1": state(0) };
    expect(findResume(lessons, progress)).toEqual({ kind: "quiz", lessonId: "alphabet-1" });
  });

  it("начатый урок слов важнее непочатого алфавита", () => {
    const progress = { "alphabet-1": letterState(0), "animals-1": state(2, { listen: true }) };
    expect(findResume(lessons, progress)).toMatchObject({ lessonId: "animals-1", wordIndex: 2, started: true });
  });

  it("сданный алфавит пропускается", () => {
    const progress = { "alphabet-1": letterState(5, {}, true), "animals-1": state(0) };
    expect(findResume(lessons, progress)).toMatchObject({ lessonId: "animals-1", started: false });
  });
});

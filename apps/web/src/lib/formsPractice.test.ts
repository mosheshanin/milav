import { describe, expect, it } from "vitest";
import { KATAV, katavWord } from "../../../../content/verbFixture";
import { verbForms, type Word, type WordForm } from "@milav/shared";
import {
  PRACTICE_OPTIONS,
  PRACTICE_QUESTIONS,
  buildPractice,
  practiceVerdict,
  practiceWords,
  shuffle,
  slotId,
  slotLabel,
  type PracticeQuestion,
} from "./formsPractice";

/** Предсказуемый генератор случайных чисел (mulberry32), чтобы тесты были воспроизводимыми. */
function seeded(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const verbWord = (id = "paal-1-write"): Word => ({ ...katavWord(), id, verb: structuredClone(KATAV) }) as unknown as Word;
const noun = { id: "animals-1-dog", he: "כלב", niqqud: "כֶּלֶב", translit: "кэ́лев", ru: "собака", reviewed: false } as unknown as Word;
const letter = { id: "alef", name: { he: "אלף" } } as never;

const ALL_SEEDS = Array.from({ length: 40 }, (_, i) => i + 1);

describe("практика форм: отбор глаголов", () => {
  it("берутся только слова с блоком verb, буквы и существительные пропускаются", () => {
    const v = verbWord();
    expect(practiceWords([noun, v, letter])).toEqual([v]);
    expect(practiceWords([noun])).toEqual([]);
  });

  it("подписи слота: время и кто делает", () => {
    expect(slotLabel("past", "3ms")).toBe("Прошедшее · он");
    expect(slotLabel("present", "fs")).toBe("Настоящее · ж. р., ед. ч.");
    expect(slotLabel("imperative", "mp")).toBe("Повелительное · вы (м.)");
    expect(slotId("future", "1s")).toBe("future:1s");
  });

  it("shuffle не меняет исходный массив и сохраняет состав", () => {
    const src = [1, 2, 3, 4, 5, 6];
    const out = shuffle(src, seeded(3));
    expect(src).toEqual([1, 2, 3, 4, 5, 6]);
    expect([...out].sort()).toEqual(src);
  });
});

describe("практика форм: набор вопросов", () => {
  it("10 вопросов, типы чередуются начиная с «выбери форму»", () => {
    const qs = buildPractice([verbWord()], seeded(1));
    expect(qs).toHaveLength(PRACTICE_QUESTIONS);
    expect(qs.map((q) => q.kind)).toEqual(Array.from({ length: PRACTICE_QUESTIONS }, (_, i) => (i % 2 === 0 ? "pick" : "identify")));
  });

  it("без глаголов вопросов нет", () => {
    expect(buildPractice([], seeded(1))).toEqual([]);
    expect(buildPractice([noun], seeded(1))).toEqual([]);
  });

  it("у каждого вопроса 4 разных варианта, один из них верный и совпадает с формой", () => {
    for (const seed of ALL_SEEDS) {
      for (const q of buildPractice([verbWord()], seeded(seed))) {
        expect(q.options).toHaveLength(PRACTICE_OPTIONS);
        expect(new Set(q.options.map((o) => o.id)).size).toBe(PRACTICE_OPTIONS);
        expect(new Set(q.options.map((o) => o.text)).size).toBe(PRACTICE_OPTIONS);
        expect(q.options.filter((o) => o.id === q.correctId)).toHaveLength(1);
        expect(q.correctId).toBe(slotId(q.tense, q.key));
        expect(q.slot).toBe(slotLabel(q.tense, q.key));
      }
    }
  });

  it("«выбери форму»: текст вариантов это формы с огласовками, верный вариант равен нужной форме", () => {
    const entries = verbForms(KATAV);
    const byId = new Map(entries.map((e) => [slotId(e.tense, e.key), e.form]));
    for (const seed of ALL_SEEDS) {
      for (const q of buildPractice([verbWord()], seeded(seed)).filter((x) => x.kind === "pick")) {
        for (const o of q.options) expect(o.text).toBe(byId.get(o.id)!.niqqud);
        expect(q.options.find((o) => o.id === q.correctId)!.text).toBe(q.form.niqqud);
      }
    }
  });

  it("«определи форму»: варианты это подписи, а у спрашиваемой формы нет двойников с другим ответом", () => {
    const entries = verbForms(KATAV);
    for (const seed of ALL_SEEDS) {
      for (const q of buildPractice([verbWord()], seeded(seed)).filter((x) => x.kind === "identify")) {
        for (const o of q.options) {
          const [tense, key] = o.id.split(":") as [never, string];
          expect(o.text).toBe(slotLabel(tense, key));
        }
        // Ни один неверный вариант не является той же формой по написанию: иначе верных ответов было бы два.
        const twins = entries.filter((e) => e.form.niqqud === q.form.niqqud).map((e) => slotId(e.tense, e.key));
        expect(twins).toEqual([q.correctId]);
        for (const o of q.options.filter((x) => x.id !== q.correctId)) {
          expect(entries.find((e) => slotId(e.tense, e.key) === o.id)!.form.niqqud).not.toBe(q.form.niqqud);
        }
      }
    }
  });

  it("совпадающие формы (будущее «ты (м.)» и «она») не дают двух верных ответов в «выбери форму»", () => {
    // Образец: 2ms и 3fs будущего пишутся תכתוב. В вариантах такая форма встречается один раз.
    for (const seed of ALL_SEEDS) {
      for (const q of buildPractice([verbWord()], seeded(seed)).filter((x) => x.kind === "pick")) {
        const texts = q.options.map((o) => o.text);
        expect(new Set(texts).size).toBe(texts.length);
      }
    }
  });

  it("одна форма не спрашивается дважды за подход", () => {
    for (const seed of ALL_SEEDS) {
      const qs = buildPractice([verbWord()], seeded(seed));
      const ids = qs.map((q) => `${q.wordId}:${q.correctId}`);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it("неверные варианты чаще берутся из того же времени", () => {
    let sameTense = 0;
    let total = 0;
    for (const seed of ALL_SEEDS) {
      for (const q of buildPractice([verbWord()], seeded(seed))) {
        for (const o of q.options.filter((x) => x.id !== q.correctId)) {
          total++;
          if (o.id.startsWith(`${q.tense}:`)) sameTense++;
        }
      }
    }
    // Для времени, где форм достаточно, два из трёх неверных вариантов того же времени: заметно больше трети.
    expect(sameTense / total).toBeGreaterThan(0.5);
  });

  it("все времена попадают в вопросы, а не только самое многочисленное", () => {
    const seen = new Set<string>();
    for (const seed of ALL_SEEDS) for (const q of buildPractice([verbWord()], seeded(seed))) seen.add(q.tense);
    expect([...seen].sort()).toEqual(["future", "imperative", "past", "present"]);
  });

  it("при нескольких глаголах вопросы распределяются между ними", () => {
    const words = [verbWord("paal-1-write"), verbWord("paal-1-read"), verbWord("paal-1-close")];
    const qs = buildPractice(words, seeded(5));
    expect(qs).toHaveLength(PRACTICE_QUESTIONS);
    expect(new Set(qs.map((q) => q.wordId)).size).toBe(3);
    for (const id of ["paal-1-write", "paal-1-read", "paal-1-close"]) {
      expect(qs.filter((q) => q.wordId === id).length).toBeGreaterThanOrEqual(3);
    }
  });

  it("одинаковое зерно даёт одинаковый набор, разное зерно разный", () => {
    const a = buildPractice([verbWord()], seeded(7));
    expect(buildPractice([verbWord()], seeded(7))).toEqual(a);
    expect(buildPractice([verbWord()], seeded(8))).not.toEqual(a);
  });

  it("без повелительного наклонения вопросов о нём нет", () => {
    const w = verbWord();
    delete (w.verb as { imperative?: unknown }).imperative;
    for (const seed of ALL_SEEDS) {
      for (const q of buildPractice([w], seeded(seed))) expect(q.tense).not.toBe("imperative");
    }
  });

  it("если форм мало, вопросов меньше, а не повторы и не ошибка", () => {
    const qs = buildPractice([verbWord()], seeded(2), 40);
    // Всего 27 форм, а «определи форму» исключает совпадающие по написанию: меньше 40, но не пусто.
    expect(qs.length).toBeGreaterThan(20);
    expect(qs.length).toBeLessThan(40);
    const ids = qs.map((q) => q.correctId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("если у глагола слишком мало разных форм для четырёх вариантов, вопрос не строится", () => {
    const w = verbWord();
    const same: WordForm = { he: "כתב", niqqud: "כָּתַב", translit: "катав" };
    for (const tense of ["present", "past", "future", "imperative"] as const) {
      for (const key of Object.keys((w.verb as unknown as Record<string, Record<string, WordForm>>)[tense]!)) {
        (w.verb as unknown as Record<string, Record<string, WordForm>>)[tense]![key] = { ...same };
      }
    }
    expect(buildPractice([w], seeded(1))).toEqual([]);
  });

  it("вопрос не ссылается на исходные данные урока: правка вопроса их не портит", () => {
    const w = verbWord();
    const before = JSON.stringify(w);
    const qs: PracticeQuestion[] = buildPractice([w], seeded(4));
    qs[0]!.options.reverse();
    expect(JSON.stringify(w)).toBe(before);
  });
});

describe("практика форм: итог", () => {
  it("слова по доле верных ответов", () => {
    expect(practiceVerdict(10, 10)).toBe("Без ошибок!");
    expect(practiceVerdict(8, 10)).toBe("Отлично");
    expect(practiceVerdict(5, 10)).toBe("Неплохо, повторите ещё раз");
    expect(practiceVerdict(2, 10)).toBe("Посмотрите формы на карточках и попробуйте снова");
    expect(practiceVerdict(0, 0)).toBe("Пока нечего повторять");
  });
});

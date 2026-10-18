import { describe, expect, it } from "vitest";
import { GIZRA_KEYS, WEAK_ROOTS_TOPIC_ID, buildPractice, formSound, isBookForm, spokenVerbForms, verbForms, type Gizra, type Lesson, type VerbData, type Word } from "@milav/shared";
import { gizraOptionalPositions, gizraProblems, setProblems, verbProblems } from "./rules";
import { KATAV, KATAV_INFINITIVE } from "./verbFixture";
import { WEAK_LESSONS, buildWeakLesson, hebrewOf } from "./verbWeak";

const lessons = WEAK_LESSONS.map((_, i) => buildWeakLesson(i + 1) as unknown as Lesson);
const words = lessons.flatMap((l) => l.words) as Word[];
const byKey = (key: string): Word => words.find((w) => w.id.endsWith(`-${key}`))!;

/** Сильный корень с приписанным типом: проверка самого `gizra` без таблицы форм. */
const rootOnly = (root: string, gizra: Gizra[]): Pick<VerbData, "root" | "gizra"> => ({ root, gizra });

describe("слабые корни: состав уроков", () => {
  it("3 урока по 10 глаголов, у каждого есть gizra, бинъян пааль, всё не проверено носителем", () => {
    expect(lessons.map((l) => l.id)).toEqual(["weak-1", "weak-2", "weak-3"]);
    for (const lesson of lessons) {
      expect(lesson.topicId).toBe(WEAK_ROOTS_TOPIC_ID);
      expect(lesson.section).toBe("verbs");
      expect(lesson.words).toHaveLength(10);
    }
    for (const word of words) {
      expect(word.verb?.binyan, word.id).toBe("paal");
      expect(word.verb?.gizra?.length, word.id).toBeGreaterThan(0);
      expect(word.reviewed, word.id).toBe(false);
    }
  });

  it("бесплатен только первый урок темы (решение владельца 18.10)", () => {
    expect(lessons.map((l) => l.free)).toEqual([true, false, false]);
  });

  it("30 разных глаголов: корни и id не повторяются", () => {
    expect(words).toHaveLength(30);
    expect(new Set(words.map((w) => w.verb!.root)).size).toBe(30);
    expect(new Set(words.map((w) => w.id)).size).toBe(30);
    expect(new Set(words.map((w) => w.ru)).size).toBe(30);
  });

  it("встречаются все 8 типов слабых корней", () => {
    const seen = new Set(words.flatMap((w) => w.verb!.gizra!));
    for (const g of GIZRA_KEYS) expect(seen.has(g), g).toBe(true);
  });

  it("весь набор проходит правила набора, включая правило темы weak", () => {
    expect(setProblems(lessons)).toEqual([]);
  });

  it("каждый глагол проходит проверку форм, корня и транскрипции", () => {
    for (const word of words) expect(verbProblems(word.he, word.verb!), word.id).toEqual([]);
  });

  it("иврит без огласовок выводится из огласованного написания", () => {
    expect(hebrewOf("הוֹלֵךְ")).toBe("הולך");
    expect(hebrewOf("שׁוֹתֶה")).toBe("שותה");
    for (const word of words) expect(word.he, word.id).toBe(hebrewOf(word.niqqud!));
  });

  it("повелительного нет у тех, у кого оно не употребляется; у остальных все 4 формы", () => {
    const without = words.filter((w) => !w.verb!.imperative).map((w) => w.id.replace(/^weak-\d-/, ""));
    expect(without.sort()).toEqual(["know", "live", "love", "sleep", "want", "fall"].sort());
    for (const word of words.filter((w) => w.verb!.imperative)) expect(Object.keys(word.verb!.imperative!), word.id).toHaveLength(4);
  });

  it("книжные формы помечены, а в вопросах не спрашиваются", () => {
    for (const word of words) {
      const book = verbForms(word.verb!).filter((e) => isBookForm(e.tense, e.key));
      expect(book.length, word.id).toBe(word.verb!.imperative ? 3 : 2);
      expect(spokenVerbForms(word.verb!).length, word.id).toBe(verbForms(word.verb!).length - book.length);
    }
  });
});

describe("слабые корни: контрольные формы (иврит без огласовок, независимо от таблицы)", () => {
  const he = (key: string, tense: "present" | "past" | "future" | "imperative", form: string) =>
    (byKey(key).verb![tense] as Record<string, { he: string }>)[form]!.he;

  it("פ״נ: נתנ и נפל теряют первую נ в будущем, повелительном и инфинитиве", () => {
    expect(byKey("give").he).toBe("לתת");
    expect(he("give", "future", "1s")).toBe("אתן");
    expect(he("give", "imperative", "ms")).toBe("תן");
    expect(he("give", "past", "1s")).toBe("נתתי");
    expect(byKey("fall").he).toBe("ליפול");
    expect(he("fall", "future", "3ms")).toBe("יפול");
  });

  it("פ״י: ישב и הלכ", () => {
    expect(byKey("sit").he).toBe("לשבת");
    expect(he("sit", "future", "1s")).toBe("אשב");
    expect(he("sit", "imperative", "ms")).toBe("שב");
    expect(he("sit", "present", "ms")).toBe("יושב");
    expect(byKey("go").he).toBe("ללכת");
    expect(he("go", "future", "1s")).toBe("אלך");
    expect(he("go", "imperative", "ms")).toBe("לך");
  });

  it("פ״א: אכל и אמר, א пропадает только в инфинитиве לומר", () => {
    expect(byKey("say").he).toBe("לומר");
    expect(he("say", "future", "3ms")).toBe("יאמר");
    expect(byKey("eat").he).toBe("לאכול");
    expect(he("eat", "future", "1s")).toBe("אוכל");
  });

  it("פ״ל: לקח", () => {
    expect(he("take", "future", "3ms")).toBe("יקח");
    expect(he("take", "imperative", "ms")).toBe("קח");
    expect(he("take", "past", "3ms")).toBe("לקח");
  });

  it("ע״ו и ע״י: средняя буква не пишется в настоящем и прошедшем", () => {
    expect(he("getup", "present", "ms")).toBe("קם");
    expect(he("getup", "past", "1s")).toBe("קמתי");
    expect(he("getup", "future", "1s")).toBe("אקום");
    expect(he("put", "present", "ms")).toBe("שם");
    expect(he("put", "future", "1s")).toBe("אשים");
    expect(he("sing", "present", "ms")).toBe("שר");
    expect(he("sing", "future", "2mp")).toBe("תשירו");
  });

  it("ל״ה: последняя ה заменяется окончанием", () => {
    expect(he("do", "past", "1s")).toBe("עשיתי");
    expect(he("do", "past", "3p")).toBe("עשו");
    expect(he("buy", "present", "ms")).toBe("קונה");
    expect(he("see", "future", "1s")).toBe("אראה");
    expect(he("drink", "past", "3fs")).toBe("שתתה");
  });

  it("ל״א и составные: א пишется всегда", () => {
    expect(he("read", "past", "3fs")).toBe("קראה");
    expect(he("find", "past", "1s")).toBe("מצאתי");
    expect(he("goout", "past", "1s")).toBe("יצאתי");
    expect(he("goout", "future", "1s")).toBe("אצא");
    expect(he("come", "past", "1s")).toBe("באתי");
    expect(he("come", "future", "1s")).toBe("אבוא");
  });
});

describe("слабые корни: поле gizra и проверка корня", () => {
  it("правильные сочетания без замечаний", () => {
    expect(gizraProblems(rootOnly("נפל", ["pe_nun"]))).toEqual([]);
    expect(gizraProblems(rootOnly("ישב", ["pe_yod"]))).toEqual([]);
    expect(gizraProblems(rootOnly("הלכ", ["pe_yod"]))).toEqual([]);
    expect(gizraProblems(rootOnly("יצא", ["pe_yod", "lamed_alef"]))).toEqual([]);
    expect(gizraProblems(rootOnly("בוא", ["ayin_vav", "lamed_alef"]))).toEqual([]);
    expect(gizraProblems({ root: "כתב" })).toEqual([]);
  });

  it("тип, не подходящий корню, и ошибки записи ловятся", () => {
    expect(gizraProblems(rootOnly("כתב", ["pe_nun"])).join("\n")).toMatch(/pe_nun/);
    expect(gizraProblems(rootOnly("נפל", ["lamed_he"])).join("\n")).toMatch(/lamed_he/);
    expect(gizraProblems(rootOnly("נפל", ["pe_nun", "pe_nun"])).join("\n")).toMatch(/повторя/);
    expect(gizraProblems({ root: "נפל", gizra: [] })).not.toEqual([]);
    expect(gizraProblems(rootOnly("נפל", ["pe_nun", "pe_yod", "lamed_he"]))).not.toEqual([]);
    expect(gizraProblems({ root: "נפל", gizra: ["bogus" as Gizra] })).not.toEqual([]);
  });

  it("пропуски букв допускаются только там, где положено типу", () => {
    const pos = (root: string, g: Gizra[], slot: Parameters<typeof gizraOptionalPositions>[1], key?: string) => [...gizraOptionalPositions(rootOnly(root, g), slot, key)];
    expect(pos("כתב", [], "future")).toEqual([]);
    expect(pos("נפל", ["pe_nun"], "future")).toEqual([0]);
    expect(pos("נפל", ["pe_nun"], "past")).toEqual([]);
    expect(pos("נתנ", ["pe_nun"], "infinitive")).toEqual([0, 2]);
    expect(pos("נתנ", ["pe_nun"], "past")).toEqual([2]);
    expect(pos("אכל", ["pe_alef"], "infinitive")).toEqual([0]);
    expect(pos("אכל", ["pe_alef"], "future")).toEqual([]);
    expect(pos("לקח", ["pe_lamed"], "imperative")).toEqual([0]);
    expect(pos("קומ", ["ayin_vav"], "present")).toEqual([1]);
    expect(pos("קומ", ["ayin_vav"], "future", "1s")).toEqual([]);
    expect(pos("קומ", ["ayin_vav"], "future", "2fp")).toEqual([1]);
    expect(pos("קומ", ["ayin_vav"], "imperative", "fp")).toEqual([1]);
    expect(pos("קרא", ["lamed_alef"], "past")).toEqual([]);
    expect(pos("עשה", ["lamed_he"], "past")).toEqual([2]);
  });

  it("у слова с gizra лишнюю потерю буквы корня правило ловит, у сильного корня тоже", () => {
    const strong = structuredClone(KATAV) as VerbData;
    strong.future["1s"] = { ...strong.future["1s"], he: "אכב", niqqud: "אֶכְב", translit: "эхв" };
    expect(verbProblems(KATAV_INFINITIVE.he, strong).join("\n")).toMatch(/future\.1s/);

    // Корень записан פ״נ, но в будущем потеряна не первая буква: ошибка.
    const bad = structuredClone(byKey("fall").verb!);
    bad.future["1s"] = { he: "אנול", niqqud: "אֶנּוֹל", translit: `эно${"́"}л` };
    expect(verbProblems(byKey("fall").he, bad).join("\n")).toMatch(/future\.1s/);
  });

  it("правило темы weak: нужен раздел «Глаголы» и gizra у каждого глагола", () => {
    const broken = structuredClone(lessons) as Lesson[];
    delete (broken[0]!.words[0]!.verb as VerbData).gizra;
    expect(setProblems(broken).join("\n")).toMatch(/gizra/);
  });
});

describe("слабые корни: практика форм с целиком совпадающими формами", () => {
  /** Генератор случайных чисел с фиксированным зерном, чтобы тест не мигал. */
  function rng(seed: number): () => number {
    let s = seed;
    return () => {
      s = (s * 1664525 + 1013904223) % 4294967296;
      return s / 4294967296;
    };
  }

  it("в глаголах есть формы, совпадающие по звучанию (בא, קם, שם, ישן, שתה)", () => {
    const sound = (key: string, tense: "present" | "past", form: string) => formSound((byKey(key).verb![tense] as Record<string, any>)[form]);
    expect(sound("come", "present", "ms")).toBe(sound("come", "past", "3ms"));
    expect(sound("getup", "present", "ms")).toBe(sound("getup", "past", "3ms"));
    expect(sound("drink", "past", "3ms")).toBe(sound("drink", "past", "3fs"));
  });

  it("«определи форму» не спрашивает форму, у которой есть двойник, и не ставит двойника верной формы вариантом", () => {
    for (let seed = 1; seed <= 60; seed++) {
      for (const word of words) {
        for (const q of buildPractice([word], rng(seed), 10)) {
          const entries = spokenVerbForms(word.verb!);
          const correct = entries.find((e) => `${e.tense}:${e.key}` === q.correctId)!;
          if (q.kind === "identify") {
            const twins = entries.filter((e) => e.form.niqqud === correct.form.niqqud || formSound(e.form) === formSound(correct.form));
            expect(twins, `${word.id} ${q.correctId}`).toHaveLength(1);
          }
          if (q.kind === "pick") {
            // Неверные варианты не звучат и не пишутся так же, как верный (иначе был бы второй верный ответ).
            for (const o of q.options.filter((x) => x.id !== q.correctId)) {
              const e = entries.find((x) => `${x.tense}:${x.key}` === o.id)!;
              expect(formSound(e.form), `${word.id}: вариант ${o.id} звучит как верный ${q.correctId}`).not.toBe(formSound(correct.form));
              expect(e.form.niqqud).not.toBe(correct.form.niqqud);
            }
          }
          expect(q.options.map((o) => o.id)).toContain(q.correctId);
          expect(new Set(q.options.map((o) => o.id)).size).toBe(q.options.length);
        }
      }
    }
  });

  it("для каждого из 30 глаголов практика собирает хотя бы 6 вопросов", () => {
    for (const word of words) expect(buildPractice([word], rng(7), 10).length, word.id).toBeGreaterThanOrEqual(6);
  });
});

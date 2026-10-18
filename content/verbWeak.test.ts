import { describe, expect, it } from "vitest";
import { GIZRA_KEYS, WEAK_ROOTS_TOPIC_ID, buildPractice, formSound, isBookForm, spokenVerbForms, verbForms, type Gizra, type Lesson, type VerbData, type Word } from "@milav/shared";
import { gizraOptionalPositions, gizraProblems, paalOptionalPositions, setProblems, verbProblems } from "./rules";
import { KATAV, KATAV_INFINITIVE } from "./verbFixture";
import { WEAK_LESSONS, buildWeakLesson, hebrewOf } from "./verbWeak";

const lessons = WEAK_LESSONS.map((_, i) => buildWeakLesson(i + 1) as unknown as Lesson);
const words = lessons.flatMap((l) => l.words) as Word[];
const byKey = (key: string): Word => words.find((w) => w.id.endsWith(`-${key}`))!;

/** Сильный корень с приписанным типом: проверка самого `gizra` без таблицы форм. */
const rootOnly = (root: string, gizra: Gizra[]): Pick<VerbData, "root" | "gizra"> => ({ root, gizra });

/** Бинъян урока: уроки 1–3 пааль (часть 1), 4 хифъиль, 5 пиэль, 6 нифъаль (часть 2, 18.10). */
const BINYAN_OF_LESSON = ["paal", "paal", "paal", "hifil", "piel", "nifal"] as const;

describe("слабые корни: состав уроков", () => {
  it("6 уроков по 10 глаголов, у каждого есть gizra, бинъян урока один, всё не проверено носителем", () => {
    expect(lessons.map((l) => l.id)).toEqual(["weak-1", "weak-2", "weak-3", "weak-4", "weak-5", "weak-6"]);
    lessons.forEach((lesson, i) => {
      expect(lesson.topicId).toBe(WEAK_ROOTS_TOPIC_ID);
      expect(lesson.section).toBe("verbs");
      expect(lesson.words).toHaveLength(10);
      for (const word of lesson.words) expect(word.verb?.binyan, word.id).toBe(BINYAN_OF_LESSON[i]);
    });
    for (const word of words) {
      expect(word.verb?.gizra?.length, word.id).toBeGreaterThan(0);
      expect(word.reviewed, word.id).toBe(false);
    }
  });

  it("бесплатен только первый урок темы (решение владельца 18.10)", () => {
    expect(lessons.map((l) => l.free)).toEqual([true, false, false, false, false, false]);
  });

  it("60 разных глаголов: инфинитивы, id и переводы не повторяются, корень не повторяется внутри бинъяна", () => {
    expect(words).toHaveLength(60);
    expect(new Set(words.map((w) => w.he)).size).toBe(60);
    expect(new Set(words.map((w) => w.id)).size).toBe(60);
    expect(new Set(words.map((w) => w.ru)).size).toBe(60);
    expect(new Set(words.map((w) => `${w.verb!.binyan}:${w.verb!.root}`)).size).toBe(60);
  });

  it("встречаются все 8 типов слабых корней, а в каждом бинъяне части 2 есть их свои типы", () => {
    const seen = new Set(words.flatMap((w) => w.verb!.gizra!));
    for (const g of GIZRA_KEYS) expect(seen.has(g), g).toBe(true);
    const gizraOf = (n: number) => new Set(lessons[n - 1]!.words.flatMap((w) => w.verb!.gizra!));
    for (const g of ["pe_nun", "pe_yod", "ayin_vav", "ayin_yod", "lamed_he", "lamed_alef"] as const) expect(gizraOf(4).has(g), `weak-4 ${g}`).toBe(true);
    for (const g of ["lamed_he", "lamed_alef", "ayin_yod"] as const) expect(gizraOf(5).has(g), `weak-5 ${g}`).toBe(true);
    for (const g of ["pe_nun", "pe_yod", "lamed_he", "lamed_alef"] as const) expect(gizraOf(6).has(g), `weak-6 ${g}`).toBe(true);
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
    // Уроки 1–3: знать, жить, любить, спать, хотеть, падать. Урок 5: надеяться (вопрос 68). Урок 6: нифъаль целиком.
    expect(without.sort()).toEqual(
      ["know", "live", "love", "sleep", "want", "fall", "hope", "befound", "becalled", "bedone", "seem", "beborn", "bebuilt", "arise", "begiven", "besaved", "beknown"].sort(),
    );
    for (const word of words.filter((w) => w.verb!.imperative)) expect(Object.keys(word.verb!.imperative!), word.id).toHaveLength(4);
    // Хифъиль: приказ есть у всех десяти.
    for (const word of lessons[3]!.words) expect(word.verb!.imperative, word.id).toBeDefined();
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

describe("слабые корни, часть 2: контрольные формы хифъиль, пиэль и нифъаль (иврит без огласовок)", () => {
  const he = (key: string, tense: "present" | "past" | "future" | "imperative", form: string) =>
    (byKey(key).verb![tense] as Record<string, { he: string }>)[form]!.he;

  it("хифъиль פ״נ: נ сливается со второй буквой (הגיד, הגדתי, אגיד, הגד)", () => {
    expect(byKey("tell").he).toBe("להגיד");
    expect(he("tell", "present", "ms")).toBe("מגיד");
    expect(he("tell", "past", "1s")).toBe("הגדתי");
    expect(he("tell", "past", "3ms")).toBe("הגיד");
    expect(he("tell", "future", "1s")).toBe("אגיד");
    expect(he("tell", "imperative", "ms")).toBe("הגד");
    expect(byKey("arrive").he).toBe("להגיע");
    expect(he("arrive", "past", "1s")).toBe("הגעתי");
    expect(he("arrive", "imperative", "ms")).toBe("הגע");
    expect(he("recognize", "past", "1s")).toBe("הכרתי");
    expect(he("recognize", "future", "2fs")).toBe("תכירי");
  });

  it("хифъиль פ״י: י на месте (הציע, אציע, הצע), у יצא ещё и א", () => {
    expect(byKey("offer").he).toBe("להציע");
    expect(he("offer", "present", "ms")).toBe("מציע");
    expect(he("offer", "past", "1s")).toBe("הצעתי");
    expect(he("offer", "future", "1s")).toBe("אציע");
    expect(he("offer", "imperative", "ms")).toBe("הצע");
    expect(byKey("takeout").he).toBe("להוציא");
    expect(he("takeout", "past", "1s")).toBe("הוצאתי");
    expect(he("takeout", "future", "2fs")).toBe("תוציאי");
    expect(he("takeout", "imperative", "ms")).toBe("הוצא");
  });

  it("хифъиль ע״ו: מביא, הבאתי, תביאי; הניח с ח; הכין с נ", () => {
    expect(byKey("bring").he).toBe("להביא");
    expect(he("bring", "present", "ms")).toBe("מביא");
    expect(he("bring", "past", "1s")).toBe("הבאתי");
    expect(he("bring", "past", "3fs")).toBe("הביאה");
    expect(he("bring", "future", "2fs")).toBe("תביאי");
    expect(he("bring", "imperative", "fp")).toBe("הבאנה");
    expect(byKey("place").he).toBe("להניח");
    expect(he("place", "past", "1s")).toBe("הנחתי");
    expect(he("place", "imperative", "ms")).toBe("הנח");
    expect(byKey("prepare").he).toBe("להכין");
    expect(he("prepare", "past", "3ms")).toBe("הכין");
    expect(he("prepare", "past", "1p")).toBe("הכנו");
  });

  it("хифъиль ע״י: י пишется в הבין, но не в הבנתי, הבן, תבנה", () => {
    expect(byKey("understand").he).toBe("להבין");
    expect(he("understand", "present", "ms")).toBe("מבין");
    expect(he("understand", "past", "1s")).toBe("הבנתי");
    expect(he("understand", "past", "3ms")).toBe("הבין");
    expect(he("understand", "past", "3fs")).toBe("הבינה");
    expect(he("understand", "future", "1s")).toBe("אבין");
    expect(he("understand", "future", "2fp")).toBe("תבנה");
    expect(he("understand", "imperative", "ms")).toBe("הבן");
    expect(he("understand", "imperative", "fs")).toBe("הביני");
  });

  it("хифъиль ל״ה: последняя ה заменяется окончанием (הראיתי, הראו, תראי)", () => {
    expect(byKey("show").he).toBe("להראות");
    expect(he("show", "present", "ms")).toBe("מראה");
    expect(he("show", "past", "1s")).toBe("הראיתי");
    expect(he("show", "past", "3p")).toBe("הראו");
    expect(he("show", "future", "2fs")).toBe("תראי");
    expect(he("show", "imperative", "ms")).toBe("הראה");
  });

  it("пиэль ל״ה: י после первой буквы в прошедшем (חיכיתי, חיכתה), нет в будущем (תחכי)", () => {
    expect(byKey("wait").he).toBe("לחכות");
    expect(he("wait", "present", "ms")).toBe("מחכה");
    expect(he("wait", "past", "1s")).toBe("חיכיתי");
    expect(he("wait", "past", "3fs")).toBe("חיכתה");
    expect(he("wait", "future", "2fs")).toBe("תחכי");
    expect(he("wait", "imperative", "ms")).toBe("חכה");
    expect(he("clean", "past", "1s")).toBe("ניקיתי");
    expect(he("try", "past", "1s")).toBe("ניסיתי");
    expect(he("change", "past", "1s")).toBe("שיניתי");
    expect(he("spend", "past", "1s")).toBe("ביליתי");
    expect(he("reveal", "past", "1s")).toBe("גיליתי");
    expect(he("cover", "past", "1s")).toBe("כיסיתי");
  });

  it("пиэль קוה: двойная ו в написании целиком (מקווה, קיוויתי, קיוו, לקוות)", () => {
    expect(byKey("hope").he).toBe("לקוות");
    expect(he("hope", "present", "ms")).toBe("מקווה");
    expect(he("hope", "present", "fp")).toBe("מקוות");
    expect(he("hope", "past", "1s")).toBe("קיוויתי");
    expect(he("hope", "past", "3fs")).toBe("קיוותה");
    expect(he("hope", "past", "3p")).toBe("קיוו");
    expect(he("hope", "future", "2fs")).toBe("תקווי");
    expect(he("hope", "future", "2mp")).toBe("תקוו");
  });

  it("пиэль ע״י (סיים): י остаётся во всех формах, двойная י в написании целиком", () => {
    expect(byKey("finish").he).toBe("לסיים");
    expect(he("finish", "present", "ms")).toBe("מסיים");
    expect(he("finish", "past", "1s")).toBe("סיימתי");
    expect(he("finish", "past", "3ms")).toBe("סיים");
    expect(he("finish", "future", "1s")).toBe("אסיים");
    expect(he("finish", "imperative", "ms")).toBe("סיים");
  });

  it("пиэль ל״א (מילא): א пишется всегда", () => {
    expect(byKey("fill").he).toBe("למלא");
    expect(he("fill", "present", "ms")).toBe("ממלא");
    expect(he("fill", "past", "1s")).toBe("מילאתי");
    expect(he("fill", "past", "3fs")).toBe("מילאה");
    expect(he("fill", "future", "2fs")).toBe("תמלאי");
  });

  it("нифъаль פ״נ: נתנ и נצל (ניתן, ניתתי, ניתנה, אנתן, תינתן, ניצלתי)", () => {
    expect(byKey("begiven").he).toBe("להינתן");
    expect(he("begiven", "present", "ms")).toBe("ניתן");
    expect(he("begiven", "past", "1s")).toBe("ניתתי");
    expect(he("begiven", "past", "3fs")).toBe("ניתנה");
    expect(he("begiven", "past", "1p")).toBe("ניתנו");
    expect(he("begiven", "future", "1s")).toBe("אנתן");
    expect(he("begiven", "future", "2ms")).toBe("תינתן");
    expect(byKey("besaved").he).toBe("להינצל");
    expect(he("besaved", "past", "1s")).toBe("ניצלתי");
    expect(he("besaved", "future", "2ms")).toBe("תינצל");
  });

  it("нифъаль פ״י: י становится ו (נולד, אוולד, תיוולד, נודע)", () => {
    expect(byKey("beborn").he).toBe("להיוולד");
    expect(he("beborn", "present", "ms")).toBe("נולד");
    expect(he("beborn", "past", "1s")).toBe("נולדתי");
    expect(he("beborn", "future", "1s")).toBe("אוולד");
    expect(he("beborn", "future", "2ms")).toBe("תיוולד");
    expect(byKey("arise").he).toBe("להיווצר");
    expect(he("arise", "present", "ms")).toBe("נוצר");
    expect(byKey("beknown").he).toBe("להיוודע");
    expect(he("beknown", "present", "ms")).toBe("נודע");
    expect(he("beknown", "future", "2ms")).toBe("תיוודע");
  });

  it("нифъаль ל״ה и ל״א: נעשה, נראית, איראה, נבנתה; נמצאה, תימצא, תיקראי", () => {
    expect(byKey("bedone").he).toBe("להיעשות");
    expect(he("bedone", "present", "ms")).toBe("נעשה");
    expect(he("bedone", "past", "1s")).toBe("נעשיתי");
    expect(byKey("seem").he).toBe("להיראות");
    expect(he("seem", "present", "fs")).toBe("נראית");
    expect(he("seem", "future", "1s")).toBe("איראה");
    expect(byKey("bebuilt").he).toBe("להיבנות");
    expect(he("bebuilt", "past", "3fs")).toBe("נבנתה");
    expect(byKey("befound").he).toBe("להימצא");
    expect(he("befound", "past", "3fs")).toBe("נמצאה");
    expect(he("befound", "future", "2ms")).toBe("תימצא");
    expect(he("becalled", "future", "2fs")).toBe("תיקראי");
  });

  it("у каждого глагола части 2 есть одинаковое по бинъяну начало форм (приставки)", () => {
    for (const word of lessons[3]!.words) {
      expect(word.verb!.present.ms.he.startsWith("מ"), word.id).toBe(true);
      expect(word.verb!.past["3ms"].he.startsWith("ה"), word.id).toBe(true);
      expect(word.he.startsWith("לה"), word.id).toBe(true);
    }
    for (const word of lessons[4]!.words) expect(word.verb!.present.ms.he.startsWith("מ"), word.id).toBe(true);
    for (const word of lessons[5]!.words) {
      expect(word.verb!.present.ms.he.startsWith("נ"), word.id).toBe(true);
      expect(word.he.startsWith("לה"), word.id).toBe(true);
    }
  });
});

describe("слабые корни, часть 2: проверка корня по бинъянам", () => {
  const pos = (binyan: VerbData["binyan"], root: string, g: Gizra[], slot: Parameters<typeof gizraOptionalPositions>[1], key?: string) => [...gizraOptionalPositions({ binyan, root, gizra: g }, slot, key)];

  it("пааль и глагол без бинъяна идут по прежнему правилу (все глаголы частей 1–3 совпадают форма в форму)", () => {
    const slots = [
      ["infinitive", [undefined]],
      ["present", ["ms", "fs", "mp", "fp"]],
      ["past", ["1s", "2ms", "2fs", "3ms", "3fs", "1p", "2mp", "2fp", "3p"]],
      ["future", ["1s", "2ms", "2fs", "3ms", "3fs", "1p", "2mp", "2fp", "3mp", "3fp"]],
      ["imperative", ["ms", "fs", "mp", "fp"]],
    ] as const;
    for (const word of lessons.slice(0, 3).flatMap((l) => l.words)) {
      const verb = word.verb!;
      for (const [slot, keys] of slots) {
        for (const key of keys) {
          expect([...gizraOptionalPositions(verb, slot, key)].sort(), `${word.id} ${slot} ${key}`).toEqual([...paalOptionalPositions(verb, slot, key)].sort());
          expect([...gizraOptionalPositions({ root: verb.root, gizra: verb.gizra }, slot, key)].sort(), `${word.id} без бинъяна ${slot} ${key}`).toEqual(
            [...paalOptionalPositions(verb, slot, key)].sort(),
          );
        }
      }
    }
  });

  it("хифъиль: пропуски букв по типам", () => {
    expect(pos("hifil", "נגד", ["pe_nun"], "future", "1s")).toEqual([0]);
    expect(pos("hifil", "נגד", ["pe_nun"], "past", "3ms")).toEqual([0]);
    expect(pos("hifil", "יצע", ["pe_yod"], "present", "ms")).toEqual([0]);
    expect(pos("hifil", "בוא", ["ayin_vav", "lamed_alef"], "past", "3ms")).toEqual([1]);
    expect(pos("hifil", "ראה", ["lamed_he"], "future", "2fs")).toEqual([2]);
    // ע״י: י не пишется только в прошедшем с окончанием на согласную, в повелительном ms и в книжных формах.
    expect(pos("hifil", "בינ", ["ayin_yod"], "past", "1s")).toEqual([1]);
    expect(pos("hifil", "בינ", ["ayin_yod"], "past", "1p")).toEqual([1]);
    expect(pos("hifil", "בינ", ["ayin_yod"], "past", "3ms")).toEqual([]);
    expect(pos("hifil", "בינ", ["ayin_yod"], "past", "3p")).toEqual([]);
    expect(pos("hifil", "בינ", ["ayin_yod"], "present", "ms")).toEqual([]);
    expect(pos("hifil", "בינ", ["ayin_yod"], "future", "2ms")).toEqual([]);
    expect(pos("hifil", "בינ", ["ayin_yod"], "future", "2fp")).toEqual([1]);
    expect(pos("hifil", "בינ", ["ayin_yod"], "imperative", "ms")).toEqual([1]);
    expect(pos("hifil", "בינ", ["ayin_yod"], "imperative", "fs")).toEqual([]);
    expect(pos("hifil", "בינ", ["ayin_yod"], "imperative", "fp")).toEqual([1]);
    expect(pos("hifil", "כתב", [], "future", "1s")).toEqual([]);
  });

  it("пиэль: выпадает только последняя ה, ע״י и ל״א пишутся полностью", () => {
    expect(pos("piel", "חכה", ["lamed_he"], "past", "1s")).toEqual([2]);
    expect(pos("piel", "סימ", ["ayin_yod"], "past", "1s")).toEqual([]);
    expect(pos("piel", "מלא", ["lamed_alef"], "future", "1s")).toEqual([]);
  });

  it("нифъаль: י первой буквы и ה последней не пишутся, у נתנ последняя נ сливается с ת", () => {
    expect(pos("nifal", "ילד", ["pe_yod"], "present", "ms")).toEqual([0]);
    expect(pos("nifal", "עשה", ["lamed_he"], "past", "1s")).toEqual([2]);
    expect(pos("nifal", "נצל", ["pe_nun"], "past", "1s")).toEqual([]);
    expect(pos("nifal", "נתנ", ["pe_nun"], "past", "1s")).toEqual([2]);
    expect(pos("nifal", "נתנ", ["pe_nun"], "past", "2mp")).toEqual([2]);
    expect(pos("nifal", "נתנ", ["pe_nun"], "past", "3ms")).toEqual([]);
    expect(pos("nifal", "נתנ", ["pe_nun"], "past", "1p")).toEqual([]);
    expect(pos("nifal", "נתנ", ["pe_nun"], "future", "1s")).toEqual([]);
    // Другие бинъяны (хитпаэль, пиэль без типа) пропусков не получают.
    expect(pos("hitpael", "נגד", ["pe_nun"], "future", "1s")).toEqual([]);
  });

  it("потерю буквы корня в хифъиль, пиэль и нифъаль правило ловит", () => {
    // Хифъиль ע״י: в 3ms прошедшего нет י.
    const understand = structuredClone(byKey("understand").verb!);
    understand.past["3ms"] = { he: "הבן", niqqud: "הֵבֵן", translit: `хеве${"́"}н` };
    expect(verbProblems(byKey("understand").he, understand).join("\n")).toMatch(/past\.3ms/);
    // Пиэль ע״י: в 3ms прошедшего нет второй י, но оставлена одна: корень סימ ещё найден, а вот без י совсем нет.
    const finish = structuredClone(byKey("finish").verb!);
    finish.past["3ms"] = { he: "סם", niqqud: "סֵם", translit: `се${"́"}м` };
    expect(verbProblems(byKey("finish").he, finish).join("\n")).toMatch(/past\.3ms/);
    // Нифъаль פ״נ: у נצל нельзя терять ל.
    const saved = structuredClone(byKey("besaved").verb!);
    saved.past["1s"] = { he: "ניצתי", niqqud: "נִיצַּתִּי", translit: `ница${"́"}ти` };
    expect(verbProblems(byKey("besaved").he, saved).join("\n")).toMatch(/past\.1s/);
    // Бинъян не по написанию: нифъаль, а причастие без נ.
    const wrong = structuredClone(byKey("befound").verb!);
    wrong.present.ms = { he: "מצא", niqqud: "מָצָא", translit: `маца${"́"}` };
    expect(verbProblems(byKey("befound").he, wrong).join("\n")).toMatch(/present\.ms/);
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

  it("в глаголах части 2 тоже есть формы с одинаковым звучанием и написанием (הגיע, נולד, נמצא, מראה)", () => {
    const sound = (key: string, tense: "present" | "past" | "future" | "imperative", form: string) => formSound((byKey(key).verb![tense] as Record<string, any>)[form]);
    // Хифъиль להגיע: прошедшее 3ms и 3fs звучат одинаково (хиги'а), так же будущее 2ms и 3fs.
    expect(sound("arrive", "past", "3ms")).toBe(sound("arrive", "past", "3fs"));
    expect(sound("arrive", "future", "2ms")).toBe(sound("arrive", "future", "3fs"));
    // Нифъаль: настоящее ms и прошедшее 3ms (נולד, נמצא, נקרא) звучат одинаково; у נעשה/נראה (ל״ה) настоящее и прошедшее разные.
    for (const key of ["beborn", "befound", "becalled", "arise", "besaved", "begiven"]) expect(sound(key, "present", "ms"), key).toBe(sound(key, "past", "3ms"));
    expect(sound("bedone", "present", "ms")).not.toBe(sound("bedone", "past", "3ms"));
    // ל״ה (מראה, נראה): ms и fs пишутся одинаково и различаются только гласной.
    expect(byKey("show").verb!.present.ms.he).toBe(byKey("show").verb!.present.fs.he);
    expect(sound("show", "present", "ms")).not.toBe(sound("show", "present", "fs"));
    expect(byKey("wait").verb!.present.ms.he).toBe(byKey("wait").verb!.present.fs.he);
    // Одинаково пишущиеся формы у части 2 есть (будущее 2ms и 3fs, 2fp и 3fp), их двойники учтены в практике.
    for (const key of ["bring", "tell", "wait", "fill", "befound"]) {
      const verb = byKey(key).verb!;
      expect(verb.future["2ms"].niqqud, key).toBe(verb.future["3fs"].niqqud);
    }
  });

  it("для каждого из 60 глаголов практика собирает хотя бы 6 вопросов", () => {
    for (const word of words) expect(buildPractice([word], rng(7), 10).length, word.id).toBeGreaterThanOrEqual(6);
  });
});

import { describe, expect, it } from "vitest";
import { VERB_FORMS_TOTAL, normalizeHebrew, verbForms } from "@milav/shared";
import { DIBER, DIBER_INFINITIVE, KATAV, KATAV_INFINITIVE } from "./verbFixture";
import { stressProblems, skeletonProblems, stripStress, syllables, verbProblems } from "./rules";
import { SIN_ROOTS, conjugatePaal, conjugatePiel, paalRootProblems, pielRootProblems } from "./verbGen";
import { PAAL_LESSONS, PIEL_LESSONS, buildPaalLesson, buildPielLesson } from "./verbLessons";

const ROOTS = PAAL_LESSONS.flatMap((l) => l.verbs.map((v) => v.root));

describe("генератор форм пааль: образец «писать»", () => {
  it("для корня כתב получает те же 27 форм и инфинитив, что набраны в образце вручную", () => {
    const { infinitive, verb } = conjugatePaal("כתב");
    expect(infinitive).toEqual(KATAV_INFINITIVE);
    expect(verb).toEqual(KATAV);
  });

  it("всегда 27 форм, бинъян пааль, корень сохранён", () => {
    for (const root of ROOTS) {
      const { verb } = conjugatePaal(root);
      expect(verbForms(verb)).toHaveLength(VERB_FORMS_TOTAL);
      expect(verb.binyan).toBe("paal");
      expect(verb.root).toBe(root);
    }
  });
});

describe("генератор форм пааль: правила огласовок", () => {
  /** Знаки огласовок в разном порядке читаются одинаково: сравниваем в нормальной форме Unicode. */
  const same = (actual: string, expected: string) => expect(actual.normalize("NFD")).toBe(expected.normalize("NFD"));
  const form = (root: string, tense: "present" | "past" | "future" | "imperative", key: string) => {
    const set = conjugatePaal(root).verb[tense] as Record<string, { he: string; niqqud: string; translit: string }>;
    return set[key]!;
  };

  it("дагеш бегадкефат: в начале слова и после немой шва, но не после гласной", () => {
    // Начало слова: בָּדַק, תִּ, פּוֹגֵשׁ. После гласной приставки ל: ב без дагеша (לִבְדּוֹק), следующая д после немой шва с дагешем.
    same(form("בדק", "past", "3ms").niqqud, "בָּדַק");
    same(conjugatePaal("בדק").infinitive.niqqud, "לִבְדּוֹק");
    same(form("פגש", "present", "ms").niqqud, "פּוֹגֵשׁ");
    // После гласной (кубуц, патах, холам) дагеша нет: שָׁפַכְתִּי, כ без дагеша.
    same(form("שפכ", "past", "1s").niqqud, "שָׁפַכְתִּי");
    // После подвижной шва дагеша нет: בְּדַקְתֶּם (д после шва в начале слова), קָפְצָה (פ после камаца без дагеша).
    same(form("קפצ", "past", "3fs").niqqud, "קָפְצָה");
    same(form("קפצ", "past", "2mp").niqqud, "קְפַצְתֶּם");
    // После немой шва дагеш у второй буквы корня: תִּקְפֹּצְנָה.
    same(form("קפצ", "future", "2fp").niqqud, "תִּקְפֹּצְנָה");
    same(form("קפצ", "future", "2fs").niqqud, "תִּקְפְּצִי");
  });

  it("окончание ת получает дагеш после немой шва (כתבתי, כתבתם), а приставка ת в начале слова тоже", () => {
    same(form("זרק", "past", "1s").niqqud, "זָרַקְתִּי");
    same(form("זרק", "past", "2mp").niqqud, "זְרַקְתֶּם");
    same(form("זרק", "future", "2ms").niqqud, "תִּזְרוֹק");
  });

  it("конечные формы только в конце слова, ך со знаком шва", () => {
    same(form("שפכ", "past", "3ms").niqqud, "שָׁפַךְ");
    same(form("שפכ", "past", "3fs").niqqud, "שָׁפְכָה");
    expect(form("קפצ", "present", "ms").he).toBe("קופץ");
    expect(form("קפצ", "present", "mp").he).toBe("קופצים");
    expect(form("רשמ", "past", "3ms").he).toBe("רשם");
    expect(form("רשמ", "past", "2mp").he).toBe("רשמתם");
    expect(conjugatePaal("שלפ").infinitive.he).toBe("לשלוף");
  });

  it("точка «шин» у ש, порядок знаков: точка, гласная, дагеш", () => {
    same(form("שבר", "past", "3ms").niqqud, "שָׁבַר");
    same(form("דרש", "past", "3ms").niqqud, "דָּרַשׁ");
    same(conjugatePaal("שבר").infinitive.niqqud, "לִשְׁבּוֹר");
  });

  it("звуки ב כ פ по дагешу: б/в, к/х, п/ф", () => {
    expect(form("בדק", "past", "3ms").translit).toBe("бада́к");
    expect(conjugatePaal("בדק").infinitive.translit).toBe("ливдо́к");
    expect(form("רכב", "present", "ms").translit).toBe("рохе́в");
    expect(conjugatePaal("רכב").infinitive.translit).toBe("лирко́в");
    expect(form("קפצ", "present", "ms").translit).toBe("кофе́ц");
    expect(form("קפצ", "future", "1s").translit).toBe("экпо́ц");
    expect(form("שפכ", "past", "1s").translit).toBe("шафа́хти");
  });

  it("ударение: в прошедшем -ти, -та, -ну без ударения, -тем, -тен и 3-е лицо ударные; 3fp, 2fp, женское множественное будущего и женское настоящее на предпоследнем слоге", () => {
    expect(form("גנב", "past", "1s").translit).toBe("гана́вти");
    expect(form("גנב", "past", "2ms").translit).toBe("гана́вта");
    expect(form("גנב", "past", "2fs").translit).toBe("гана́вт");
    expect(form("גנב", "past", "1p").translit).toBe("гана́вну");
    expect(form("גנב", "past", "2mp").translit).toBe("гнавте́м");
    expect(form("גנב", "past", "3p").translit).toBe("ганву́");
    expect(form("גנב", "past", "3ms").translit).toBe("гана́в");
    expect(form("גנב", "past", "3fs").translit).toBe("ганва́");
    expect(form("גנב", "present", "fs").translit).toBe("гоне́вет");
    expect(form("גנב", "future", "2fp").translit).toBe("тигно́вна");
    expect(form("גנב", "imperative", "fp").translit).toBe("гно́вна");
    expect(form("גנב", "imperative", "ms").translit).toBe("гнов");
  });
});

describe("генератор форм пааль: отказ на неподходящих корнях", () => {
  const bad: [string, string][] = [
    ["קרא", "гортанная/слабая א"],
    ["פתח", "гортанная ח"],
    ["נסע", "נ в начале и ע"],
    ["שמח", "гортанная ח"],
    ["בנה", "слабая ה"],
    ["שוב", "ו в корне"],
    ["שכר", "пишется с син"],
    ["כת", "две буквы"],
    ["כתבב", "четыре буквы"],
    ["ססס", "одинаковые буквы"],
    ["שפך", "конечная форма в корне"],
  ];
  for (const [root, why] of bad) {
    it(`корень ${root} (${why}) отклоняется`, () => {
      expect(paalRootProblems(root).length).toBeGreaterThan(0);
      expect(() => conjugatePaal(root)).toThrow();
    });
  }

  it("корни из списка не пишутся с син", () => {
    for (const root of ROOTS) expect(SIN_ROOTS).not.toContain(root);
  });
});

describe("уроки пааль: составлены генератором", () => {
  it("3 урока по 10 глаголов, все корни разные, все ключи и ru заданы", () => {
    expect(PAAL_LESSONS).toHaveLength(3);
    for (const lesson of PAAL_LESSONS) expect(lesson.verbs).toHaveLength(10);
    expect(new Set(ROOTS).size).toBe(30);
    for (const lesson of PAAL_LESSONS) {
      const keys = lesson.verbs.map((v) => v.key);
      expect(new Set(keys).size).toBe(10);
    }
  });

  it("корни проходят проверку генератора, а формы — проверки глаголов, ударения и согласных", () => {
    for (const root of ROOTS) expect(paalRootProblems(root), root).toEqual([]);
    for (let n = 1; n <= 3; n++) {
      const lesson = buildPaalLesson(n) as { words: { he: string; verb: Parameters<typeof verbProblems>[1] }[] };
      for (const word of lesson.words) {
        expect(verbProblems(word.he, word.verb), word.he).toEqual([]);
        for (const { form } of verbForms(word.verb)) {
          expect(stressProblems(form.translit), form.translit).toEqual([]);
          expect(skeletonProblems(form.he, form.translit), form.translit).toEqual([]);
          expect(normalizeHebrew(form.niqqud)).toBe(normalizeHebrew(form.he));
          expect(syllables(form.translit)).toBeGreaterThan(0);
          expect(stripStress(form.translit)).not.toContain("́");
        }
      }
    }
  });

  it("совпадающие по написанию формы одного глагола одинаково читаются там, где это один и тот же звук (תכתוב: «ты м.» и «она»)", () => {
    const { verb } = conjugatePaal("כתב");
    expect(verb.future["2ms"]).toEqual(verb.future["3fs"]);
    expect(verb.past["2ms"].he).toBe(verb.past["2fs"].he);
    expect(verb.past["2ms"].niqqud).not.toBe(verb.past["2fs"].niqqud);
  });

  it("фраза-пример подставляет настоящее время глагола", () => {
    const lesson = buildPaalLesson(1) as { words: { example: { he: string; translit: string }; verb: { present: { ms: { he: string; translit: string }; fs: { he: string } } } }[] };
    const write = lesson.words[0]!;
    expect(write.example.he).toBe(`אני ${write.verb.present.ms.he} מכתב`);
    expect(write.example.translit).toBe("ани котев михтав");
    expect(write.example.he).not.toContain("{");
    const dance = lesson.words[6]!;
    expect(dance.example.he).toContain(dance.verb.present.fs.he);
  });

  it("урок 1–3 бесплатный, id paal-<номер>, тема «Пааль» раздел verbs", () => {
    for (let n = 1; n <= 3; n++) {
      const lesson = buildPaalLesson(n) as { id: string; free: boolean; topicId: string; section: string; topic: string };
      expect(lesson).toMatchObject({ id: `paal-${n}`, free: true, topicId: "paal", section: "verbs", topic: "Пааль" });
    }
    expect(() => buildPaalLesson(4)).toThrow();
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// Пиэль

const PIEL_ROOTS = PIEL_LESSONS.flatMap((l) => l.verbs.map((v) => v.root));

describe("генератор форм пиэль: образец «говорить»", () => {
  it("для корня דבר получает те же 27 форм и инфинитив, что набраны в образце вручную", () => {
    const { infinitive, verb } = conjugatePiel("דבר");
    expect(infinitive).toEqual(DIBER_INFINITIVE);
    expect(verb).toEqual(DIBER);
  });

  it("всегда 27 форм, бинъян пиэль, корень сохранён, приставки бинъяна на месте", () => {
    for (const root of PIEL_ROOTS) {
      const { infinitive, verb } = conjugatePiel(root);
      expect(verbForms(verb)).toHaveLength(VERB_FORMS_TOTAL);
      expect(verb.binyan).toBe("piel");
      expect(verb.root).toBe(root);
      expect(infinitive.he.startsWith("ל")).toBe(true);
      expect(verb.present.ms.he.startsWith("מ")).toBe(true);
    }
  });
});

describe("генератор форм пиэль: правила огласовок", () => {
  const same = (actual: string, expected: string) => expect(actual.normalize("NFD")).toBe(expected.normalize("NFD"));
  const form = (root: string, tense: "present" | "past" | "future" | "imperative", key: string) => {
    const set = conjugatePiel(root).verb[tense] as Record<string, { he: string; niqqud: string; translit: string }>;
    return set[key]!;
  };

  it("удвоение второй буквы корня во всех формах: дагеш, а ב כ פ твёрдые (б, к, п)", () => {
    for (const root of PIEL_ROOTS) {
      for (const { form: f } of verbForms(conjugatePiel(root).verb)) {
        const c2 = [...root][1]!;
        expect(f.niqqud.normalize("NFD"), `${root} ${f.niqqud}`).toMatch(new RegExp(`${c2}[\u05B0-\u05BB\u05C1]*\u05BC`));
      }
    }
    expect(form("קבל", "present", "ms").translit).toBe("мекабе́л");
    expect(form("כבס", "past", "3ms").translit).toBe("кибе́с");
    expect(form("ספר", "present", "ms").translit).toBe("месапе́р");
    expect(form("סכמ", "imperative", "ms").translit).toBe("саке́м");
  });

  it("первая буква корня: дагеш в начале слова (прошедшее, повелительное), без дагеша после приставки с подвижной шва", () => {
    same(form("בקר", "past", "3ms").niqqud, "בִּיקֵּר");
    expect(form("בקר", "past", "3ms").translit).toBe("бике́р");
    same(conjugatePiel("בקר").infinitive.niqqud, "לְבַקֵּר");
    expect(conjugatePiel("בקר").infinitive.translit).toBe("леваке́р");
    expect(form("כבס", "present", "ms").translit).toBe("мехабе́с");
    expect(form("פטר", "future", "3ms").translit).toBe("ефате́р");
    same(form("פטר", "imperative", "ms").niqqud, "פַּטֵּר");
    expect(form("פטר", "imperative", "ms").translit).toBe("пате́р");
  });

  it("приставки будущего: אֲ «а», остальные с подвижной шва «е»; окончание ת после немой шва с дагешем", () => {
    same(form("שלמ", "future", "1s").niqqud, "אֲשַׁלֵּם");
    expect(form("שלמ", "future", "1s").translit).toBe("ашале́м");
    same(form("שלמ", "future", "2ms").niqqud, "תְּשַׁלֵּם");
    expect(form("שלמ", "future", "1p").translit).toBe("нешале́м");
    same(form("שלמ", "past", "1s").niqqud, "שִׁילַּמְתִּי");
    same(form("קפל", "past", "2fs").niqqud, "קִיפַּלְתְּ");
  });

  it("конечные формы и полное письмо прошедшего с י", () => {
    expect(form("שלמ", "past", "3ms").he).toBe("שילם");
    expect(form("שלמ", "past", "2mp").he).toBe("שילמתם");
    expect(form("שפצ", "present", "ms").he).toBe("משפץ");
    expect(form("לטפ", "imperative", "ms").he).toBe("לטף");
    expect(form("לטפ", "imperative", "fs").he).toBe("לטפי");
    expect(conjugatePiel("קלפ").infinitive.he).toBe("לקלף");
    for (const root of PIEL_ROOTS) {
      for (const f of Object.values(conjugatePiel(root).verb.past)) expect(f.he[1], f.he).toBe("י");
    }
  });

  it("ударение как в пааль: -ти, -та, -ну без ударения, -тем, -тен, 3-е лицо ударные; ж.р. настоящего и формы на -на на предпоследнем", () => {
    expect(form("קבל", "past", "1s").translit).toBe("киба́лти");
    expect(form("קבל", "past", "2ms").translit).toBe("киба́лта");
    expect(form("קבל", "past", "1p").translit).toBe("киба́лну");
    expect(form("קבל", "past", "2mp").translit).toBe("кибалте́м");
    expect(form("קבל", "past", "3fs").translit).toBe("кибла́");
    expect(form("קבל", "present", "fs").translit).toBe("мекабе́лет");
    expect(form("קבל", "future", "2fp").translit).toBe("текабе́лна");
    expect(form("קבל", "imperative", "fp").translit).toBe("кабе́лна");
  });
});

describe("генератор форм пиэль: отказ на неподходящих корнях", () => {
  const bad: [string, string][] = [
    ["ברכ", "ר во второй букве"],
    ["סמנ", "נ в конце"],
    ["שכת", "ת в конце"],
    ["חפש", "гортанная ח"],
    ["נקה", "слабая ה, נ в начале"],
    ["ציר", "י в корне"],
    ["בשר", "пишется с син"],
    ["שמש", "одинаковые буквы"],
    ["טלפנ", "четыре буквы"],
  ];
  for (const [root, why] of bad) {
    it(`корень ${root} (${why}) отклоняется`, () => {
      expect(pielRootProblems(root).length).toBeGreaterThan(0);
      expect(() => conjugatePiel(root)).toThrow();
    });
  }
});

describe("уроки пиэль: составлены генератором", () => {
  it("3 урока по 10 глаголов, все корни разные, ключи уникальны, корни не с син", () => {
    expect(PIEL_LESSONS).toHaveLength(3);
    for (const lesson of PIEL_LESSONS) expect(lesson.verbs).toHaveLength(10);
    expect(new Set(PIEL_ROOTS).size).toBe(30);
    const keys = PIEL_LESSONS.flatMap((l) => l.verbs.map((v) => v.key));
    expect(new Set(keys).size).toBe(30);
    for (const root of PIEL_ROOTS) expect(SIN_ROOTS).not.toContain(root);
  });

  it("корни проходят проверку генератора, а формы — проверки глаголов, ударения и согласных", () => {
    for (const root of PIEL_ROOTS) expect(pielRootProblems(root), root).toEqual([]);
    for (let n = 1; n <= 3; n++) {
      const lesson = buildPielLesson(n) as { words: { he: string; verb: Parameters<typeof verbProblems>[1] }[] };
      for (const word of lesson.words) {
        expect(verbProblems(word.he, word.verb), word.he).toEqual([]);
        for (const { form } of verbForms(word.verb)) {
          expect(stressProblems(form.translit), form.translit).toEqual([]);
          expect(skeletonProblems(form.he, form.translit), form.translit).toEqual([]);
          expect(normalizeHebrew(form.niqqud)).toBe(normalizeHebrew(form.he));
        }
      }
    }
  });

  it("урок 1–3 бесплатный, id piel-<номер>, тема «Пиэль» раздел verbs; фраза с настоящим временем", () => {
    for (let n = 1; n <= 3; n++) {
      const lesson = buildPielLesson(n) as { id: string; free: boolean; topicId: string; section: string; topic: string; words: { id: string; example: { he: string } }[] };
      expect(lesson).toMatchObject({ id: `piel-${n}`, free: true, topicId: "piel", section: "verbs", topic: "Пиэль" });
      for (const w of lesson.words) {
        expect(w.id.startsWith(`piel-${n}-`)).toBe(true);
        expect(w.example.he).not.toContain("{");
      }
    }
    const speak = (buildPielLesson(1) as { words: { example: { he: string; translit: string } }[] }).words[0]!;
    expect(speak.example).toMatchObject({ he: "אני מדבר עברית", translit: "ани медабер иврит" });
    expect(() => buildPielLesson(4)).toThrow();
  });
});

import { describe, expect, it } from "vitest";
import { VERB_FORMS_TOTAL, formSound, normalizeHebrew, verbForms } from "@milav/shared";
import { DIBER, DIBER_INFINITIVE, HISBIR, HISBIR_INFINITIVE, HITLABESH, HITLABESH_INFINITIVE, KATAV, KATAV_INFINITIVE, NIKHTAV, NIKHTAV_INFINITIVE } from "./verbFixture";
import { stressProblems, skeletonProblems, stripStress, syllables, verbProblems } from "./rules";
import { SIN_ROOTS, conjugateHifil, conjugateHitpael, conjugateNifal, conjugatePaal, conjugatePiel, hifilRootProblems, hitpaelRootProblems, nifalRootProblems, paalRootProblems, pielRootProblems } from "./verbGen";
import { HIFIL_LESSONS, HITPAEL_LESSONS, NIFAL_LESSONS, PAAL_LESSONS, PIEL_LESSONS, buildHifilLesson, buildHitpaelLesson, buildNifalLesson, buildPaalLesson, buildPielLesson } from "./verbLessons";

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
    ["הרג", "гортанная ה в начале"],
    ["אמר", "слабая א в начале"],
    ["עבח", "гортанные в начале и в конце"],
    ["בחע", "гортанные посередине и в конце сразу"],
    ["עחר", "гортанные в начале и посередине сразу"],
    ["אחר", "א в начале (слабый корень)"],
    ["נסע", "נ в начале и ע"],
    ["שמח", "пишется с син"],
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
  it("5 уроков по 10 глаголов, все корни разные, все ключи и ru заданы", () => {
    expect(PAAL_LESSONS).toHaveLength(5);
    for (const lesson of PAAL_LESSONS) expect(lesson.verbs).toHaveLength(10);
    expect(new Set(ROOTS).size).toBe(50);
    for (const lesson of PAAL_LESSONS) {
      const keys = lesson.verbs.map((v) => v.key);
      expect(new Set(keys).size).toBe(10);
    }
  });

  it("корни проходят проверку генератора, а формы — проверки глаголов, ударения и согласных", () => {
    for (const root of ROOTS) expect(paalRootProblems(root), root).toEqual([]);
    for (let n = 1; n <= 5; n++) {
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

  it("урок 1 бесплатный, 2–5 платные, id paal-<номер>, тема «Пааль» раздел verbs", () => {
    for (let n = 1; n <= 5; n++) {
      const lesson = buildPaalLesson(n) as { id: string; free: boolean; topicId: string; section: string; topic: string };
      expect(lesson).toMatchObject({ id: `paal-${n}`, free: n === 1, topicId: "paal", section: "verbs", topic: "Пааль" });
    }
    expect(() => buildPaalLesson(6)).toThrow();
  });
});

describe("генератор форм пааль: гортанные корни (19.10, «Пааль 4»)", () => {
  /**
   * Таблицы сверены с pealim.com форма в форму (инфинитив и повелительное ms записаны с буквой ו, как везде в уроках; в будущем
   * 3fp у нас יִ-, как в образце «писать», у pealim תִּ-, потому что в речи оба берут תִּ-).
   * Порядок: инфинитив, настоящее ms fs mp fp, прошедшее 1s 2ms 2fs 3ms 3fs 1p 2mp 2fp 3p, будущее 1s 2ms 2fs 3ms 3fs 1p 2mp 2fp 3mp 3fp, повелительное ms fs mp fp.
   */
  const TABLES: Record<string, string> = {
    עבד: "לַעֲבוֹד עוֹבֵד עוֹבֶדֶת עוֹבְדִים עוֹבְדוֹת עָבַדְתִּי עָבַדְתָּ עָבַדְתְּ עָבַד עָבְדָה עָבַדְנוּ עֲבַדְתֶּם עֲבַדְתֶּן עָבְדוּ אֶעֱבוֹד תַּעֲבוֹד תַּעַבְדִי יַעֲבוֹד תַּעֲבוֹד נַעֲבוֹד תַּעַבְדוּ תַּעֲבֹדְנָה יַעַבְדוּ יַעֲבֹדְנָה עֲבוֹד עִבְדִי עִבְדוּ עֲבֹדְנָה",
    חשב: "לַחְשׁוֹב חוֹשֵׁב חוֹשֶׁבֶת חוֹשְׁבִים חוֹשְׁבוֹת חָשַׁבְתִּי חָשַׁבְתָּ חָשַׁבְתְּ חָשַׁב חָשְׁבָה חָשַׁבְנוּ חֲשַׁבְתֶּם חֲשַׁבְתֶּן חָשְׁבוּ אֶחְשׁוֹב תַּחְשׁוֹב תַּחְשְׁבִי יַחְשׁוֹב תַּחְשׁוֹב נַחְשׁוֹב תַּחְשְׁבוּ תַּחְשֹׁבְנָה יַחְשְׁבוּ יַחְשֹׁבְנָה חֲשׁוֹב חִשְׁבִי חִשְׁבוּ חֲשֹׁבְנָה",
    חזר: "לַחֲזוֹר חוֹזֵר חוֹזֶרֶת חוֹזְרִים חוֹזְרוֹת חָזַרְתִּי חָזַרְתָּ חָזַרְתְּ חָזַר חָזְרָה חָזַרְנוּ חֲזַרְתֶּם חֲזַרְתֶּן חָזְרוּ אֶחֱזוֹר תַּחֲזוֹר תַּחַזְרִי יַחֲזוֹר תַּחֲזוֹר נַחֲזוֹר תַּחַזְרוּ תַּחֲזֹרְנָה יַחַזְרוּ יַחֲזֹרְנָה חֲזוֹר חִזְרִי חִזְרוּ חֲזֹרְנָה",
    שמע: "לִשְׁמוֹעַ שׁוֹמֵעַ שׁוֹמַעַת שׁוֹמְעִים שׁוֹמְעוֹת שָׁמַעְתִּי שָׁמַעְתָּ שָׁמַעְתְּ שָׁמַע שָׁמְעָה שָׁמַעְנוּ שְׁמַעְתֶּם שְׁמַעְתֶּן שָׁמְעוּ אֶשְׁמַע תִּשְׁמַע תִּשְׁמְעִי יִשְׁמַע תִּשְׁמַע נִשְׁמַע תִּשְׁמְעוּ תִּשְׁמַעְנָה יִשְׁמְעוּ יִשְׁמַעְנָה שְׁמַע שִׁמְעִי שִׁמְעוּ שְׁמַעְנָה",
    שלח: "לִשְׁלוֹחַ שׁוֹלֵחַ שׁוֹלַחַת שׁוֹלְחִים שׁוֹלְחוֹת שָׁלַחְתִּי שָׁלַחְתָּ שָׁלַחְתְּ שָׁלַח שָׁלְחָה שָׁלַחְנוּ שְׁלַחְתֶּם שְׁלַחְתֶּן שָׁלְחוּ אֶשְׁלַח תִּשְׁלַח תִּשְׁלְחִי יִשְׁלַח תִּשְׁלַח נִשְׁלַח תִּשְׁלְחוּ תִּשְׁלַחְנָה יִשְׁלְחוּ יִשְׁלַחְנָה שְׁלַח שִׁלְחִי שִׁלְחוּ שְׁלַחְנָה",
    פתח: "לִפְתּוֹחַ פּוֹתֵחַ פּוֹתַחַת פּוֹתְחִים פּוֹתְחוֹת פָּתַחְתִּי פָּתַחְתָּ פָּתַחְתְּ פָּתַח פָּתְחָה פָּתַחְנוּ פְּתַחְתֶּם פְּתַחְתֶּן פָּתְחוּ אֶפְתַּח תִּפְתַּח תִּפְתְּחִי יִפְתַּח תִּפְתַּח נִפְתַּח תִּפְתְּחוּ תִּפְתַּחְנָה יִפְתְּחוּ יִפְתַּחְנָה פְּתַח פִּתְחִי פִּתְחוּ פְּתַחְנָה",
    שכח: "לִשְׁכּוֹחַ שׁוֹכֵחַ שׁוֹכַחַת שׁוֹכְחִים שׁוֹכְחוֹת שָׁכַחְתִּי שָׁכַחְתָּ שָׁכַחְתְּ שָׁכַח שָׁכְחָה שָׁכַחְנוּ שְׁכַחְתֶּם שְׁכַחְתֶּן שָׁכְחוּ אֶשְׁכַּח תִּשְׁכַּח תִּשְׁכְּחִי יִשְׁכַּח תִּשְׁכַּח נִשְׁכַּח תִּשְׁכְּחוּ תִּשְׁכַּחְנָה יִשְׁכְּחוּ יִשְׁכַּחְנָה שְׁכַח שִׁכְחִי שִׁכְחוּ שְׁכַחְנָה",
  };
  const niqquds = (root: string): string[] => {
    const { infinitive, verb } = conjugatePaal(root);
    return [infinitive.niqqud, ...(["present", "past", "future", "imperative"] as const).flatMap((t) => Object.values(verb[t]!).map((f) => f.niqqud))];
  };

  for (const [root, table] of Object.entries(TABLES)) {
    it(`корень ${root}: все 27 форм и инфинитив совпадают с таблицей pealim.com`, () => {
      expect(niqquds(root).map((x) => x.normalize("NFD"))).toEqual(table.split(" ").map((x) => x.normalize("NFD")));
    });
  }

  it("первая ע или ח: приставки с патахом, хатаф-патах, хатаф-сеголь после אֶ (оба вида ח: хатаф и немая шва)", () => {
    expect(conjugatePaal("עבד").verb.future["2ms"].translit).toBe("тааво́д");
    expect(conjugatePaal("עבד").verb.future["1s"].translit).toBe("ээво́д");
    expect(conjugatePaal("חזר").verb.future["1s"].translit).toBe("эхэзо́р");
    expect(conjugatePaal("חשב").verb.future["1s"].translit).toBe("эхшо́в");
    expect(conjugatePaal("עבד").infinitive.translit).toBe("лааво́д");
    expect(conjugatePaal("חשב").infinitive.translit).toBe("лахшо́в");
    // 2fs и 2mp будущего: ע и хатаф-ח дают патах под первой буквой, ח с немой шва нет
    expect(conjugatePaal("עבד").verb.future["2fs"].translit).toBe("таавди́");
    expect(conjugatePaal("חשב").verb.future["2fs"].translit).toBe("тахшви́");
    // хатаф-патах в прошедшем 2mp и 2fp и в повелительном ms у любой первой гортанной
    expect(conjugatePaal("חשב").verb.past["2mp"].niqqud.normalize("NFD")).toBe("חֲשַׁבְתֶּם".normalize("NFD"));
    expect(conjugatePaal("עבד").verb.imperative!.ms.translit).toBe("аво́д");
  });

  it("последняя ח или ע: патах-гануб читается перед согласной и не даёт слога (ударение на предыдущем)", () => {
    expect(conjugatePaal("שלח").infinitive.translit).toBe("лишло́ах");
    expect(conjugatePaal("שמע").infinitive.translit).toBe("лишмо́а");
    expect(conjugatePaal("שלח").verb.present.ms.translit).toBe("шоле́ах");
    expect(conjugatePaal("שמע").verb.present.ms.translit).toBe("шоме́а");
    // патах в будущем: ударение на последнем слоге, ח читается после гласной
    expect(conjugatePaal("פתח").verb.future["3ms"].translit).toBe("ифта́х");
    // 2fs прошедшего как у сильных корней: шва под ח, без лишнего слога
    expect(conjugatePaal("שלח").verb.past["2fs"].translit).toBe("шала́хт");
  });

  it("корень стоит в каждой форме, проверки глаголов проходят (в том числе у עזב, עזר, עמד, сверенных по pealim.com только частично)", () => {
    for (const root of Object.keys(TABLES).concat(["עזב", "עזר", "עמד"])) {
      const { infinitive, verb } = conjugatePaal(root);
      expect(verbProblems(infinitive.he, verb), root).toEqual([]);
    }
  });
});

describe("генератор форм пааль: патах в будущем и гортанная посередине (19.10, «Пааль 5»)", () => {
  /**
   * Таблицы сверены с pealim.com форма в форму скриптом-сравнением (11 корней по 28 форм, 308 сверок: инфинитив и повелительное ms записаны
   * с буквой ו, как везде в уроках; в будущем 3fp у нас יִ-, у pealim תִּ-). У מחק и דחפ pealim даёт холам основным вариантом (יִמְחֹק),
   * патах запасным; у остальных пяти корней со второй гортанной патах (יִבְחַר). Порядок форм как в блоке «Пааль 4».
   */
  const TABLES: Record<string, string> = {
    למד: "לִלְמוֹד לוֹמֵד לוֹמֶדֶת לוֹמְדִים לוֹמְדוֹת לָמַדְתִּי לָמַדְתָּ לָמַדְתְּ לָמַד לָמְדָה לָמַדְנוּ לְמַדְתֶּם לְמַדְתֶּן לָמְדוּ אֶלְמַד תִּלְמַד תִּלְמְדִי יִלְמַד תִּלְמַד נִלְמַד תִּלְמְדוּ תִּלְמַדְנָה יִלְמְדוּ יִלְמַדְנָה לְמַד לִמְדִי לִמְדוּ לְמַדְנָה",
    לבש: "לִלְבּוֹשׁ לוֹבֵשׁ לוֹבֶשֶׁת לוֹבְשִׁים לוֹבְשׁוֹת לָבַשְׁתִּי לָבַשְׁתָּ לָבַשְׁתְּ לָבַשׁ לָבְשָׁה לָבַשְׁנוּ לְבַשְׁתֶּם לְבַשְׁתֶּן לָבְשׁוּ אֶלְבַּשׁ תִּלְבַּשׁ תִּלְבְּשִׁי יִלְבַּשׁ תִּלְבַּשׁ נִלְבַּשׁ תִּלְבְּשׁוּ תִּלְבַּשְׁנָה יִלְבְּשׁוּ יִלְבַּשְׁנָה לְבַשׁ לִבְשִׁי לִבְשׁוּ לְבַשְׁנָה",
    שכב: "לִשְׁכַּב שׁוֹכֵב שׁוֹכֶבֶת שׁוֹכְבִים שׁוֹכְבוֹת שָׁכַבְתִּי שָׁכַבְתָּ שָׁכַבְתְּ שָׁכַב שָׁכְבָה שָׁכַבְנוּ שְׁכַבְתֶּם שְׁכַבְתֶּן שָׁכְבוּ אֶשְׁכַּב תִּשְׁכַּב תִּשְׁכְּבִי יִשְׁכַּב תִּשְׁכַּב נִשְׁכַּב תִּשְׁכְּבוּ תִּשְׁכַּבְנָה יִשְׁכְּבוּ יִשְׁכַּבְנָה שְׁכַב שִׁכְבִי שִׁכְבוּ שְׁכַבְנָה",
    בחר: "לִבְחוֹר בּוֹחֵר בּוֹחֶרֶת בּוֹחֲרִים בּוֹחֲרוֹת בָּחַרְתִּי בָּחַרְתָּ בָּחַרְתְּ בָּחַר בָּחֲרָה בָּחַרְנוּ בְּחַרְתֶּם בְּחַרְתֶּן בָּחֲרוּ אֶבְחַר תִּבְחַר תִּבְחֲרִי יִבְחַר תִּבְחַר נִבְחַר תִּבְחֲרוּ תִּבְחַרְנָה יִבְחֲרוּ יִבְחַרְנָה בְּחַר בַּחֲרִי בַּחֲרוּ בְּחַרְנָה",
    פחד: "לִפְחוֹד פּוֹחֵד פּוֹחֶדֶת פּוֹחֲדִים פּוֹחֲדוֹת פָּחַדְתִּי פָּחַדְתָּ פָּחַדְתְּ פָּחַד פָּחֲדָה פָּחַדְנוּ פְּחַדְתֶּם פְּחַדְתֶּן פָּחֲדוּ אֶפְחַד תִּפְחַד תִּפְחֲדִי יִפְחַד תִּפְחַד נִפְחַד תִּפְחֲדוּ תִּפְחַדְנָה יִפְחֲדוּ יִפְחַדְנָה פְּחַד פַּחֲדִי פַּחֲדוּ פְּחַדְנָה",
    מחק: "לִמְחוֹק מוֹחֵק מוֹחֶקֶת מוֹחֲקִים מוֹחֲקוֹת מָחַקְתִּי מָחַקְתָּ מָחַקְתְּ מָחַק מָחֲקָה מָחַקְנוּ מְחַקְתֶּם מְחַקְתֶּן מָחֲקוּ אֶמְחוֹק תִּמְחוֹק תִּמְחֲקִי יִמְחוֹק תִּמְחוֹק נִמְחוֹק תִּמְחֲקוּ תִּמְחֹקְנָה יִמְחֲקוּ יִמְחֹקְנָה מְחוֹק מַחֲקִי מַחֲקוּ מְחֹקְנָה",
    צחק: "לִצְחוֹק צוֹחֵק צוֹחֶקֶת צוֹחֲקִים צוֹחֲקוֹת צָחַקְתִּי צָחַקְתָּ צָחַקְתְּ צָחַק צָחֲקָה צָחַקְנוּ צְחַקְתֶּם צְחַקְתֶּן צָחֲקוּ אֶצְחַק תִּצְחַק תִּצְחֲקִי יִצְחַק תִּצְחַק נִצְחַק תִּצְחֲקוּ תִּצְחַקְנָה יִצְחֲקוּ יִצְחַקְנָה צְחַק צַחֲקִי צַחֲקוּ צְחַקְנָה",
    רחצ: "לִרְחוֹץ רוֹחֵץ רוֹחֶצֶת רוֹחֲצִים רוֹחֲצוֹת רָחַצְתִּי רָחַצְתָּ רָחַצְתְּ רָחַץ רָחֲצָה רָחַצְנוּ רְחַצְתֶּם רְחַצְתֶּן רָחֲצוּ אֶרְחַץ תִּרְחַץ תִּרְחֲצִי יִרְחַץ תִּרְחַץ נִרְחַץ תִּרְחֲצוּ תִּרְחַצְנָה יִרְחֲצוּ יִרְחַצְנָה רְחַץ רַחֲצִי רַחֲצוּ רְחַצְנָה",
    בעט: "לִבְעוֹט בּוֹעֵט בּוֹעֶטֶת בּוֹעֲטִים בּוֹעֲטוֹת בָּעַטְתִּי בָּעַטְתָּ בָּעַטְתְּ בָּעַט בָּעֲטָה בָּעַטְנוּ בְּעַטְתֶּם בְּעַטְתֶּן בָּעֲטוּ אֶבְעַט תִּבְעַט תִּבְעֲטִי יִבְעַט תִּבְעַט נִבְעַט תִּבְעֲטוּ תִּבְעַטְנָה יִבְעֲטוּ יִבְעַטְנָה בְּעַט בַּעֲטִי בַּעֲטוּ בְּעַטְנָה",
    צעק: "לִצְעוֹק צוֹעֵק צוֹעֶקֶת צוֹעֲקִים צוֹעֲקוֹת צָעַקְתִּי צָעַקְתָּ צָעַקְתְּ צָעַק צָעֲקָה צָעַקְנוּ צְעַקְתֶּם צְעַקְתֶּן צָעֲקוּ אֶצְעַק תִּצְעַק תִּצְעֲקִי יִצְעַק תִּצְעַק נִצְעַק תִּצְעֲקוּ תִּצְעַקְנָה יִצְעֲקוּ יִצְעַקְנָה צְעַק צַעֲקִי צַעֲקוּ צְעַקְנָה",
    דחפ: "לִדְחוֹף דּוֹחֵף דּוֹחֶפֶת דּוֹחֲפִים דּוֹחֲפוֹת דָּחַפְתִּי דָּחַפְתָּ דָּחַפְתְּ דָּחַף דָּחֲפָה דָּחַפְנוּ דְּחַפְתֶּם דְּחַפְתֶּן דָּחֲפוּ אֶדְחוֹף תִּדְחוֹף תִּדְחֲפִי יִדְחוֹף תִּדְחוֹף נִדְחוֹף תִּדְחֲפוּ תִּדְחֹפְנָה יִדְחֲפוּ יִדְחֹפְנָה דְּחוֹף דַּחֲפִי דַּחֲפוּ דְּחֹפְנָה",
  };
  const niqquds = (root: string): string[] => {
    const { infinitive, verb } = conjugatePaal(root);
    return [infinitive.niqqud, ...(["present", "past", "future", "imperative"] as const).flatMap((t) => Object.values(verb[t]!).map((f) => f.niqqud))];
  };
  const form = (root: string, tense: "present" | "past" | "future" | "imperative", key: string) => {
    const set = conjugatePaal(root).verb[tense] as Record<string, { he: string; niqqud: string; translit: string }>;
    return set[key]!;
  };
  const same = (actual: string, expected: string) => expect(actual.normalize("NFD")).toBe(expected.normalize("NFD"));

  for (const [root, table] of Object.entries(TABLES)) {
    it(`корень ${root}: все 27 форм и инфинитив совпадают с таблицей pealim.com`, () => {
      expect(niqquds(root).map((x) => x.normalize("NFD"))).toEqual(table.split(" ").map((x) => x.normalize("NFD")));
    });
  }

  it("негортанные корни с патахом в будущем: יִלְמַד, повелительное לְמַד, 2fs תִּלְמְדִי, fp תִּלְמַדְנָה; инфинитив с холамом", () => {
    same(form("למד", "future", "3ms").niqqud, "יִלְמַד");
    same(form("למד", "future", "2fs").niqqud, "תִּלְמְדִי");
    same(form("למד", "future", "2fp").niqqud, "תִּלְמַדְנָה");
    same(form("למד", "imperative", "ms").niqqud, "לְמַד");
    same(form("למד", "imperative", "fp").niqqud, "לְמַדְנָה");
    same(conjugatePaal("למד").infinitive.niqqud, "לִלְמוֹד");
    same(conjugatePaal("לבש").infinitive.niqqud, "לִלְבּוֹשׁ");
    // ב после немой шва с дагешем (תִּלְבְּשִׁי, אֶלְבַּשׁ), в повелительном ms после подвижной шва без дагеша (לְבַשׁ)
    same(form("לבש", "future", "2fs").niqqud, "תִּלְבְּשִׁי");
    same(form("לבש", "future", "1s").niqqud, "אֶלְבַּשׁ");
    same(form("לבש", "imperative", "ms").niqqud, "לְבַשׁ");
    expect(form("למד", "future", "3ms").translit).toBe("илма́д");
    expect(form("למד", "future", "2fs").translit).toBe("тилмди́");
    expect(form("למד", "future", "2fp").translit).toBe("тилма́дна");
    expect(form("למד", "imperative", "fp").translit).toBe("лма́дна");
    expect(conjugatePaal("למד").infinitive.translit).toBe("лилмо́д");
  });

  it("у לשכב инфинитив с патахом: לִשְׁכַּב, а не לִשְׁכֹּב (исключение из списка PATAH_INFINITIVE)", () => {
    same(conjugatePaal("שכב").infinitive.niqqud, "לִשְׁכַּב");
    expect(conjugatePaal("שכב").infinitive.he).toBe("לשכב");
    expect(conjugatePaal("שכב").infinitive.translit).toBe("лишка́в");
    same(form("שכב", "future", "3ms").niqqud, "יִשְׁכַּב");
    same(form("שכב", "imperative", "ms").niqqud, "שְׁכַב");
    expect(conjugatePaal("שכב").verb.imperative!.ms.translit).toBe("шхав");
  });

  it("вторая ח или ע: хатаф-патах там, где у других подвижная шва; в повелительном fs и mp патах под первой буквой", () => {
    same(form("בחר", "present", "mp").niqqud, "בּוֹחֲרִים");
    same(form("בחר", "past", "3fs").niqqud, "בָּחֲרָה");
    same(form("בחר", "past", "3p").niqqud, "בָּחֲרוּ");
    same(form("בחר", "future", "2fs").niqqud, "תִּבְחֲרִי");
    same(form("בחר", "imperative", "fs").niqqud, "בַּחֲרִי");
    same(form("בחר", "imperative", "ms").niqqud, "בְּחַר");
    same(form("בחר", "imperative", "fp").niqqud, "בְּחַרְנָה");
    expect(form("בחר", "present", "mp").translit).toBe("бохари́м");
    expect(form("בחר", "past", "3fs").translit).toBe("бахара́");
    expect(form("בחר", "future", "2fs").translit).toBe("тивхари́");
    expect(form("בעט", "present", "mp").translit).toBe("боати́м");
    expect(form("בעט", "future", "2fs").translit).toBe("тивати́");
    // у остальных форм со шва ничего не меняется: בָּחַרְתִּי, בְּחַרְתֶּם
    same(form("בחר", "past", "1s").niqqud, "בָּחַרְתִּי");
    same(form("בחר", "past", "2mp").niqqud, "בְּחַרְתֶּם");
  });

  it("со второй гортанной патах в будущем (יִבְחַר, יִצְחַק), а у מחק и דחף холам (יִמְחֹק, יִדְחֹף), как основной вариант pealim.com", () => {
    for (const root of ["בחר", "פחד", "צחק", "רחצ", "בעט", "צעק"]) {
      const niqqud = form(root, "future", "3ms").niqqud.normalize("NFD");
      expect(niqqud.endsWith("\u05B7" + niqqud.at(-1)), root).toBe(true); // патах перед последней буквой
    }
    same(form("מחק", "future", "3ms").niqqud, "יִמְחוֹק");
    same(form("מחק", "future", "2fp").niqqud, "תִּמְחֹקְנָה");
    same(form("מחק", "imperative", "ms").niqqud, "מְחוֹק");
    same(form("דחפ", "future", "1s").niqqud, "אֶדְחוֹף");
    expect(form("מחק", "future", "3ms").translit).toBe("имхо́к");
    expect(form("מחק", "future", "2fs").translit).toBe("тимхаки́");
  });

  it("ט и ת подряд читаются одним «т»: בָּעַטְתִּי «баа́ти», בָּעַטְתְּ «баа́т», а написание остаётся полным", () => {
    expect(form("בעט", "past", "1s").translit).toBe("баа́ти");
    expect(form("בעט", "past", "2ms").translit).toBe("баа́та");
    expect(form("בעט", "past", "2fs").translit).toBe("баа́т");
    expect(form("בעט", "past", "2mp").translit).toBe("бате́м");
    expect(form("בעט", "past", "1p").translit).toBe("баа́тну");
    expect(form("בעט", "past", "1s").he).toBe("בעטתי");
    // у корня без такого стыка ничего не меняется
    expect(form("צעק", "past", "1s").translit).toBe("цаа́кти");
  });

  it("новые корни проходят проверку генератора, а плохие отклоняются", () => {
    for (const root of Object.keys(TABLES)) expect(paalRootProblems(root), root).toEqual([]);
    for (const root of ["בחע", "עחר", "אחר", "נחר", "חחר"]) expect(paalRootProblems(root).length, root).toBeGreaterThan(0);
  });

  it("корень стоит в каждой форме, проверки глаголов проходят у всех корней урока", () => {
    for (const root of Object.keys(TABLES)) {
      const { infinitive, verb } = conjugatePaal(root);
      expect(verbProblems(infinitive.he, verb), root).toEqual([]);
    }
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

  it("урок 1 бесплатный, 2–3 платные, id piel-<номер>, тема «Пиэль» раздел verbs; фраза с настоящим временем", () => {
    for (let n = 1; n <= 3; n++) {
      const lesson = buildPielLesson(n) as { id: string; free: boolean; topicId: string; section: string; topic: string; words: { id: string; example: { he: string } }[] };
      expect(lesson).toMatchObject({ id: `piel-${n}`, free: n === 1, topicId: "piel", section: "verbs", topic: "Пиэль" });
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

// ---------------------------------------------------------------------------------------------------------------------
// Хифъиль

const HIFIL_ROOTS = HIFIL_LESSONS.flatMap((l) => l.verbs.map((v) => v.root));

describe("генератор форм хифъиль: образец «объяснять»", () => {
  /** Огласовки сравниваем в нормальной форме Unicode: образец набран вручную, порядок знаков может отличаться. */
  const nfd = (f: { he: string; niqqud: string; translit: string }) => ({ ...f, niqqud: f.niqqud.normalize("NFD") });

  it("для корня סבר получает те же 27 форм и инфинитив, что набраны в образце вручную", () => {
    const { infinitive, verb } = conjugateHifil("סבר");
    expect(nfd(infinitive)).toEqual(nfd(HISBIR_INFINITIVE));
    expect(verb.binyan).toBe("hifil");
    expect(verb.root).toBe("סבר");
    for (const { tense, key, form } of verbForms(HISBIR)) {
      const got = (verb[tense] as Record<string, typeof form>)[key]!;
      expect(nfd(got), `${tense}.${key}`).toEqual(nfd(form));
    }
    expect(verbForms(verb)).toHaveLength(VERB_FORMS_TOTAL);
  });

  it("всегда 27 форм, приставки бинъяна на месте (להה, מ, ה в прошедшем)", () => {
    for (const root of HIFIL_ROOTS) {
      const { infinitive, verb } = conjugateHifil(root);
      expect(verbForms(verb)).toHaveLength(VERB_FORMS_TOTAL);
      expect(infinitive.he.startsWith("לה")).toBe(true);
      expect(verb.present.ms.he.startsWith("מ")).toBe(true);
      for (const f of Object.values(verb.past)) expect(f.he.startsWith("ה"), f.he).toBe(true);
    }
  });
});

describe("генератор форм хифъиль: правила", () => {
  const same = (actual: string, expected: string) => expect(actual.normalize("NFD")).toBe(expected.normalize("NFD"));
  const form = (root: string, tense: "present" | "past" | "future" | "imperative", key: string) => {
    const set = conjugateHifil(root).verb[tense] as Record<string, { he: string; niqqud: string; translit: string }>;
    return set[key]!;
  };

  it("первая буква корня после гласной приставки без дагеша, вторая после немой шва с дагешем", () => {
    same(conjugateHifil("כנס").infinitive.niqqud, "לְהַכְנִיס");
    expect(conjugateHifil("כנס").infinitive.translit).toBe("лехахни́с");
    same(form("כתב", "past", "3ms").niqqud, "הִכְתִּיב");
    expect(form("פסק", "future", "3ms").translit).toBe("яфси́к");
    same(form("דפס", "present", "ms").niqqud, "מַדְפִּיס");
  });

  it("приставки: הִ «хи», הַ «ха», מַ «ма», אַ «а», תַּ с дагешем «та», יַ «я», נַ «на»", () => {
    expect(form("זכר", "past", "3ms").translit).toBe("хизки́р");
    expect(form("זכר", "imperative", "ms").translit).toBe("хазке́р");
    expect(form("זכר", "future", "1s").translit).toBe("азки́р");
    same(form("זכר", "future", "2ms").niqqud, "תַּזְכִּיר");
    expect(form("זכר", "future", "3ms").translit).toBe("язки́р");
    expect(form("זכר", "future", "1p").translit).toBe("назки́р");
  });

  it("ударение на основе: 3fs и 3p прошедшего, 2fs, 2mp, 3mp будущего, fs и mp повелительного; у настоящего ж.р. и мн.ч. на конце", () => {
    expect(form("קשב", "past", "3fs").translit).toBe("хикши́ва");
    expect(form("קשב", "past", "3p").translit).toBe("хикши́ву");
    expect(form("קשב", "future", "2fs").translit).toBe("такши́ви");
    expect(form("קשב", "future", "3mp").translit).toBe("якши́ву");
    expect(form("קשב", "imperative", "fs").translit).toBe("хакши́ви");
    expect(form("קשב", "present", "fs").translit).toBe("макшива́");
    expect(form("קשב", "present", "mp").translit).toBe("макшиви́м");
    expect(form("קשב", "past", "1s").translit).toBe("хикша́вти");
    expect(form("קשב", "past", "2mp").translit).toBe("хикшавте́м");
  });

  it("третья נ сливается с окончаниями -נוּ и -נָה: הִזְמַנּוּ, תַּזְמֵנָּה", () => {
    same(form("זמנ", "past", "1p").niqqud, "הִזְמַנּוּ");
    expect(form("זמנ", "past", "1p").he).toBe("הזמנו");
    expect(form("זמנ", "past", "1p").translit).toBe("хизма́ну");
    same(form("זמנ", "future", "2fp").niqqud, "תַּזְמֵנָּה");
    same(form("זמנ", "imperative", "fp").niqqud, "הַזְמֵנָּה");
    same(form("זמנ", "past", "1s").niqqud, "הִזְמַנְתִּי");
    expect(form("זמנ", "present", "ms").he).toBe("מזמין");
  });

  it("вторая буква может быть гортанной: הִתְחִיל, הִשְׁאִיר", () => {
    same(conjugateHifil("תחל").infinitive.niqqud, "לְהַתְחִיל");
    expect(conjugateHifil("תחל").infinitive.translit).toBe("лехатхи́л");
    same(form("שאר", "past", "1s").niqqud, "הִשְׁאַרְתִּי");
    expect(form("שאר", "present", "ms").translit).toBe("маши́р");
  });

  it("конечные формы и ךְ: הִמְשִׁיךְ, הַמְשֵׁךְ, מַמְלִיץ", () => {
    same(form("משכ", "past", "3ms").niqqud, "הִמְשִׁיךְ");
    same(form("משכ", "imperative", "ms").niqqud, "הַמְשֵׁךְ");
    expect(form("מלצ", "present", "ms").he).toBe("ממליץ");
    expect(form("משכ", "present", "fs").he).toBe("ממשיכה");
  });
});

describe("генератор форм хифъиль: отказ на неподходящих корнях", () => {
  const bad: [string, string][] = [
    ["חלט", "гортанная первая буква"],
    ["נכר", "נ в начале"],
    ["צלח", "гортанная третья буква"],
    ["שקת", "ת в конце"],
    ["כונ", "ו в корне"],
    ["שכר", "пишется с син"],
    ["סבב", "одинаковые буквы"],
    ["סב", "две буквы"],
  ];
  for (const [root, why] of bad) {
    it(`корень ${root} (${why}) отклоняется`, () => {
      expect(hifilRootProblems(root).length).toBeGreaterThan(0);
      expect(() => conjugateHifil(root)).toThrow();
    });
  }
});

describe("уроки хифъиль: составлены генератором", () => {
  it("3 урока по 10 глаголов, все корни разные, ключи уникальны, корни не с син", () => {
    expect(HIFIL_LESSONS).toHaveLength(3);
    for (const lesson of HIFIL_LESSONS) expect(lesson.verbs).toHaveLength(10);
    expect(new Set(HIFIL_ROOTS).size).toBe(30);
    const keys = HIFIL_LESSONS.flatMap((l) => l.verbs.map((v) => v.key));
    expect(new Set(keys).size).toBe(30);
    for (const root of HIFIL_ROOTS) expect(SIN_ROOTS).not.toContain(root);
  });

  it("корни проходят проверку генератора, а формы — проверки глаголов, ударения и согласных", () => {
    for (const root of HIFIL_ROOTS) expect(hifilRootProblems(root), root).toEqual([]);
    for (let n = 1; n <= 3; n++) {
      const lesson = buildHifilLesson(n) as { words: { he: string; verb: Parameters<typeof verbProblems>[1] }[] };
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

  it("урок 1 бесплатный, 2–3 платные, id hifil-<номер>, тема «Хифъиль» раздел verbs; фраза с настоящим временем", () => {
    for (let n = 1; n <= 3; n++) {
      const lesson = buildHifilLesson(n) as { id: string; free: boolean; topicId: string; section: string; topic: string; words: { id: string; example: { he: string } }[] };
      expect(lesson).toMatchObject({ id: `hifil-${n}`, free: n === 1, topicId: "hifil", section: "verbs", topic: "Хифъиль" });
      for (const w of lesson.words) {
        expect(w.id.startsWith(`hifil-${n}-`)).toBe(true);
        expect(w.example.he).not.toContain("{");
      }
    }
    const explain = (buildHifilLesson(1) as { words: { example: { he: string; translit: string } }[] }).words[1]!;
    expect(explain.example).toMatchObject({ he: "אני מסביר לך", translit: "ани масбир леха" });
    expect(() => buildHifilLesson(4)).toThrow();
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// Нифъаль

const NIFAL_ROOTS = NIFAL_LESSONS.flatMap((l) => l.verbs.map((v) => v.root));

describe("генератор форм нифъаль: образец «писаться»", () => {
  /** Огласовки сравниваем в нормальной форме Unicode: образец набран вручную, порядок знаков может отличаться. */
  const nfd = (f: { he: string; niqqud: string; translit: string }) => ({ ...f, niqqud: f.niqqud.normalize("NFD") });

  it("для корня כתב получает те же 27 форм и инфинитив, что набраны в образце вручную", () => {
    const { infinitive, verb } = conjugateNifal("כתב");
    expect(nfd(infinitive)).toEqual(nfd(NIKHTAV_INFINITIVE));
    expect(verb.binyan).toBe("nifal");
    expect(verb.root).toBe("כתב");
    for (const { tense, key, form } of verbForms(NIKHTAV)) {
      const got = (verb[tense] as Record<string, typeof form>)[key]!;
      expect(nfd(got), `${tense}.${key}`).toEqual(nfd(form));
    }
    expect(verbForms(verb)).toHaveLength(VERB_FORMS_TOTAL);
    expect(verbProblems(NIKHTAV_INFINITIVE.he, NIKHTAV)).toEqual([]);
  });

  it("всегда 27 форм, приставки бинъяна на месте (להה, נ в прошедшем и настоящем)", () => {
    for (const root of NIFAL_ROOTS) {
      const { infinitive, verb } = conjugateNifal(root);
      expect(verbForms(verb)).toHaveLength(VERB_FORMS_TOTAL);
      expect(infinitive.he.startsWith("לה")).toBe(true);
      expect(verb.present.ms.he.startsWith("נ")).toBe(true);
      for (const f of Object.values(verb.past)) expect(f.he.startsWith("נ"), f.he).toBe(true);
    }
  });
});

describe("генератор форм нифъаль: правила", () => {
  const same = (actual: string, expected: string) => expect(actual.normalize("NFD")).toBe(expected.normalize("NFD"));
  const form = (root: string, tense: "present" | "past" | "future" | "imperative", key: string) => {
    const set = conjugateNifal(root).verb[tense] as Record<string, { he: string; niqqud: string; translit: string }>;
    return set[key]!;
  };

  it("полное письмо: ייכתב, תיכתב, ניכתב, היכתב, להיכתב, но אכתב без י", () => {
    expect(form("כתב", "future", "3ms").he).toBe("ייכתב");
    expect(form("כתב", "future", "3mp").he).toBe("ייכתבו");
    expect(form("כתב", "future", "2ms").he).toBe("תיכתב");
    expect(form("כתב", "future", "1p").he).toBe("ניכתב");
    expect(form("כתב", "future", "1s").he).toBe("אכתב");
    expect(form("כתב", "imperative", "ms").he).toBe("היכתב");
    expect(conjugateNifal("כתב").infinitive.he).toBe("להיכתב");
  });

  it("дагеш и камац у первой буквы корня в будущем: ב כ פ твёрдые, в прошедшем и настоящем мягкие", () => {
    expect(form("כנס", "past", "3ms").translit).toBe("нихна́с");
    expect(form("כנס", "future", "3ms").translit).toBe("икане́с");
    expect(conjugateNifal("כנס").infinitive.translit).toBe("лехикане́с");
    expect(form("פגש", "past", "3ms").translit).toBe("нифга́ш");
    expect(form("פגש", "future", "1p").translit).toBe("нипаге́ш");
    expect(form("בדק", "past", "3ms").translit).toBe("нивда́к");
    expect(form("בדק", "future", "3ms").translit).toBe("ибаде́к");
    same(form("שבר", "future", "3ms").niqqud, "יִישָּׁבֵר");
    same(form("פגש", "future", "3ms").niqqud, "יִיפָּגֵשׁ");
  });

  it("шва второй буквы: «е» после немой шва (3fs, 3p прошедшего), без звука после гласной (будущее, повелительное)", () => {
    expect(form("סגר", "past", "3fs").translit).toBe("нисгера́");
    expect(form("סגר", "past", "3p").translit).toBe("нисгеру́");
    expect(form("סגר", "future", "2fs").translit).toBe("тисагри́");
    expect(form("סגר", "future", "3mp").translit).toBe("исагру́");
    expect(form("סגר", "imperative", "fs").translit).toBe("хисагри́");
    same(form("סגר", "past", "3fs").niqqud, "נִסְגְּרָה");
  });

  it("ударение: -ти, -та, -ну безударные, 3-е лицо на конце, ж.р. настоящего и формы на -на на предпоследнем", () => {
    expect(form("סגר", "past", "1s").translit).toBe("нисга́рти");
    expect(form("סגר", "past", "2ms").translit).toBe("нисга́рта");
    expect(form("סגר", "past", "1p").translit).toBe("нисга́рну");
    expect(form("סגר", "past", "2mp").translit).toBe("нисгарте́м");
    expect(form("סגר", "present", "fs").translit).toBe("нисге́рет");
    expect(form("סגר", "present", "mp").translit).toBe("нисгари́м");
    expect(form("סגר", "present", "fp").translit).toBe("нисгаро́т");
    expect(form("סגר", "future", "2fp").translit).toBe("тисага́рна");
    expect(form("סגר", "imperative", "fp").translit).toBe("хисага́рна");
  });

  it("прошедшее 3ms и настоящее ms звучат одинаково, различаются только огласовкой (патах, камац)", () => {
    for (const root of NIFAL_ROOTS) {
      const past = form(root, "past", "3ms");
      const present = form(root, "present", "ms");
      expect(past.he, root).toBe(present.he);
      expect(stripStress(past.translit), root).toBe(stripStress(present.translit));
      expect(past.niqqud, root).not.toBe(present.niqqud);
    }
  });

  it("вторая буква гортанная: хатаф-патах вместо шва (נִשְׁאֲרָה, תִּזָּהֲרִי), нет шва у ה в נִזְהֲרוּ", () => {
    same(form("שאר", "past", "3fs").niqqud, "נִשְׁאֲרָה");
    same(form("שאר", "future", "2fs").niqqud, "תִּישָּׁאֲרִי");
    expect(form("שאר", "past", "3fs").translit).toBe("нишара́");
    same(form("זהר", "past", "3p").niqqud, "נִזְהֲרוּ");
    same(form("זהר", "future", "2mp").niqqud, "תִּיזָּהֲרוּ");
    same(form("לחמ", "past", "3fs").niqqud, "נִלְחֲמָה");
    same(form("לחמ", "future", "3ms").niqqud, "יִילָּחֵם");
    same(form("לחמ", "imperative", "mp").niqqud, "הִילָּחֲמוּ");
    expect(conjugateNifal("שאר").infinitive.translit).toBe("лехишае́р");
  });

  it("третья буква ח или ע: патах вместо цере и сеголя (יִפָּתַח, נִפְתַּחַת), перед окончанием как у остальных", () => {
    same(form("פתח", "future", "3ms").niqqud, "יִיפָּתַח");
    same(conjugateNifal("פתח").infinitive.niqqud, "לְהִיפָּתַח");
    same(form("פתח", "present", "fs").niqqud, "נִפְתַּחַת");
    expect(form("פתח", "present", "fs").translit).toBe("нифта́хат");
    same(form("פתח", "present", "ms").niqqud, "נִפְתָּח");
    same(form("פתח", "past", "2fs").niqqud, "נִפְתַּחַתְּ");
    same(form("פתח", "past", "2ms").niqqud, "נִפְתַּחְתָּ");
    same(form("פתח", "past", "3fs").niqqud, "נִפְתְּחָה");
    same(form("פתח", "future", "2fs").niqqud, "תִּיפָּתְחִי");
    same(form("שמע", "future", "2ms").niqqud, "תִּישָּׁמַע");
    same(form("מנע", "imperative", "ms").niqqud, "הִימָּנַע");
    same(form("מנע", "present", "fs").niqqud, "נִמְנַעַת");
  });

  it("конечные формы и ךְ: נִמְשַׁךְ, נִמְשָׁךְ, לְהִימָּשֵׁךְ, נִשְׁפַּךְ", () => {
    same(form("משכ", "past", "3ms").niqqud, "נִמְשַׁךְ");
    same(form("משכ", "present", "ms").niqqud, "נִמְשָׁךְ");
    same(conjugateNifal("משכ").infinitive.niqqud, "לְהִימָּשֵׁךְ");
    same(form("משכ", "present", "fs").niqqud, "נִמְשֶׁכֶת");
    expect(form("לחמ", "present", "ms").he).toBe("נלחם");
    same(form("לחמ", "past", "3ms").niqqud, "נִלְחַם");
  });
});

describe("генератор форм нифъаль: отказ на неподходящих корнях", () => {
  const bad: [string, string][] = [
    ["חשב", "гортанная первая буква"],
    ["עלמ", "гортанная первая буква"],
    ["רדמ", "ר в начале"],
    ["נצל", "נ в начале"],
    ["ילד", "י в начале"],
    ["מצא", "гортанная א в конце"],
    ["בנה", "ה в конце"],
    ["שקת", "ת в конце"],
    ["קנה", "ה в конце"],
    ["כונ", "ו в корне"],
    ["שכר", "пишется с син"],
    ["סבב", "одинаковые буквы"],
    ["סב", "две буквы"],
  ];
  for (const [root, why] of bad) {
    it(`корень ${root} (${why}) отклоняется`, () => {
      expect(nifalRootProblems(root).length).toBeGreaterThan(0);
      expect(() => conjugateNifal(root)).toThrow();
    });
  }
});

describe("уроки нифъаль: составлены генератором", () => {
  it("3 урока по 10 глаголов, все корни разные, ключи уникальны, корни не с син", () => {
    expect(NIFAL_LESSONS).toHaveLength(3);
    for (const lesson of NIFAL_LESSONS) expect(lesson.verbs).toHaveLength(10);
    expect(new Set(NIFAL_ROOTS).size).toBe(30);
    const keys = NIFAL_LESSONS.flatMap((l) => l.verbs.map((v) => v.key));
    expect(new Set(keys).size).toBe(30);
    for (const root of NIFAL_ROOTS) expect(SIN_ROOTS).not.toContain(root);
  });

  it("корни проходят проверку генератора, а формы — проверки глаголов, ударения и согласных", () => {
    for (const root of NIFAL_ROOTS) expect(nifalRootProblems(root), root).toEqual([]);
    for (let n = 1; n <= 3; n++) {
      const lesson = buildNifalLesson(n) as { words: { he: string; verb: Parameters<typeof verbProblems>[1] }[] };
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

  it("повелительное только у семи глаголов, где оно живёт в речи: остальным блок убран целиком", () => {
    const withImperative = NIFAL_LESSONS.flatMap((l) => l.verbs).filter((v) => !v.noImperative).map((v) => v.root);
    expect(withImperative.sort()).toEqual(["זהר", "זכר", "כנס", "לחמ", "מנע", "שאר", "שמר"].sort());
    for (let n = 1; n <= 3; n++) {
      const lesson = buildNifalLesson(n) as { words: { verb: { imperative?: unknown; root: string } }[] };
      for (const w of lesson.words) {
        const spec = NIFAL_LESSONS[n - 1]!.verbs.find((v) => v.root === w.verb.root)!;
        expect("imperative" in w.verb, w.verb.root).toBe(!spec.noImperative);
        expect(verbForms(w.verb as Parameters<typeof verbForms>[0]), w.verb.root).toHaveLength(spec.noImperative ? 23 : 27);
      }
    }
  });

  it("урок 1 бесплатный, 2–3 платные, id nifal-<номер>, тема «Нифъаль» раздел verbs; фраза с настоящим временем", () => {
    for (let n = 1; n <= 3; n++) {
      const lesson = buildNifalLesson(n) as { id: string; free: boolean; topicId: string; section: string; topic: string; words: { id: string; example: { he: string } }[] };
      expect(lesson).toMatchObject({ id: `nifal-${n}`, free: n === 1, topicId: "nifal", section: "verbs", topic: "Нифъаль" });
      for (const w of lesson.words) {
        expect(w.id.startsWith(`nifal-${n}-`)).toBe(true);
        expect(w.example.he).not.toContain("{");
      }
    }
    const enter = (buildNifalLesson(1) as { words: { example: { he: string; translit: string } }[] }).words[0]!;
    expect(enter.example).toMatchObject({ he: "אני נכנס פנימה", translit: "ани нихнас пнима" });
    expect(() => buildNifalLesson(4)).toThrow();
  });
});

const nf = (text: string): string => text.normalize("NFD");

const HITPAEL_ROOTS = HITPAEL_LESSONS.flatMap((l) => l.verbs.map((v) => v.root));

describe("генератор форм хитпаэль: образец «одеваться»", () => {
  /** Огласовки сравниваем в нормальной форме Unicode: образец набран вручную, порядок знаков может отличаться. */
  const nfd = (f: { he: string; niqqud: string; translit: string }) => ({ ...f, niqqud: f.niqqud.normalize("NFD") });

  it("для корня לבש получает те же 27 форм и инфинитив, что набраны в образце вручную", () => {
    const { infinitive, verb } = conjugateHitpael("לבש");
    expect(nfd(infinitive)).toEqual(nfd(HITLABESH_INFINITIVE));
    expect(verb.binyan).toBe("hitpael");
    expect(verb.root).toBe("לבש");
    for (const { tense, key, form } of verbForms(HITLABESH)) {
      const got = (verb[tense] as Record<string, typeof form>)[key]!;
      expect(nfd(got), `${tense}.${key}`).toEqual(nfd(form));
    }
    expect(verbForms(verb)).toHaveLength(VERB_FORMS_TOTAL);
    expect(verbProblems(HITLABESH_INFINITIVE.he, HITLABESH)).toEqual([]);
  });

  it("всегда 27 форм, приставки бинъяна на месте (לה, מ в настоящем, ה в прошедшем и повелительном)", () => {
    for (const root of HITPAEL_ROOTS) {
      const { infinitive, verb } = conjugateHitpael(root);
      expect(verbForms(verb), root).toHaveLength(VERB_FORMS_TOTAL);
      expect(infinitive.he.startsWith("לה"), root).toBe(true);
      expect(verb.present.ms.he.startsWith("מ"), root).toBe(true);
      for (const f of Object.values(verb.past)) expect(f.he.startsWith("ה"), f.he).toBe(true);
      for (const f of Object.values(verb.imperative!)) expect(f.he.startsWith("ה"), f.he).toBe(true);
    }
  });
});

describe("генератор форм хитпаэль: правила", () => {
  const forms = (root: string) => conjugateHitpael(root).verb;

  it("приставки: הִתְ в прошедшем и повелительном, מִתְ в настоящем, אֶתְ תִּתְ יִתְ נִתְ в будущем, לְהִתְ в инфинитиве", () => {
    const v = forms("לבש");
    expect(nf(conjugateHitpael("לבש").infinitive.niqqud)).toBe(nf("לְהִתְלַבֵּשׁ"));
    expect(v.present.ms.niqqud.startsWith("מִתְ")).toBe(true);
    expect(v.past["3ms"].niqqud.startsWith("הִתְ")).toBe(true);
    expect(v.imperative!.ms.niqqud.startsWith("הִתְ")).toBe(true);
    expect(v.future["1s"].niqqud.startsWith("אֶתְ")).toBe(true);
    expect(v.future["2ms"].niqqud.startsWith("תִּתְ")).toBe(true);
    expect(v.future["3ms"].niqqud.startsWith("יִתְ")).toBe(true);
    expect(v.future["1p"].niqqud.startsWith("נִתְ")).toBe(true);
    expect(v.future["1s"].translit).toBe("этлабе́ш");
    expect(v.future["3ms"].translit).toBe("итлабе́ш");
  });

  it("вторая буква корня удвоена во всех формах, а ב כ פ в ней твёрдые (хабе́к, не хаве́к)", () => {
    const v = forms("חבק");
    for (const { tense, key, form } of verbForms(v)) {
      expect(form.niqqud, `${tense}.${key}`).toMatch(/ב[\u05B0-\u05BB\u05C1\u05C2]*\u05BC/);
      expect(form.translit, `${tense}.${key}`).toContain("хаб");
    }
  });

  it("первая буква ב כ פ после немой шва приставки получает дагеш: הִתְכַּתֵּב, אֶתְפַּעֵל", () => {
    expect(nf(conjugateHitpael("כתב").infinitive.niqqud)).toBe(nf("לְהִתְכַּתֵּב"));
    expect(forms("כתב").past["3ms"].translit).toBe("хиткате́в");
    expect(nf(forms("פעל").future["1s"].niqqud)).toBe(nf("אֶתְפַּעֵל"));
  });

  it("у первой ס ש перестановка: ת после неё (הִסְתַּדֵּר, הִשְׁתַּמֵּשׁ), ת получает дагеш", () => {
    expect(nf(forms("סדר").past["3ms"].niqqud)).toBe(nf("הִסְתַּדֵּר"));
    expect(forms("סדר").past["3ms"].he).toBe("הסתדר");
    expect(nf(forms("סדר").present.ms.niqqud)).toBe(nf("מִסְתַּדֵּר"));
    expect(nf(forms("שמש").past["3ms"].niqqud)).toBe(nf("הִשְׁתַּמֵּשׁ"));
    expect(forms("שמש").future["3fs"].he).toBe("תשתמש");
    expect(forms("שמש").past["3ms"].translit).toBe("хиштаме́ш");
  });

  it("у первой צ приставка становится ט (הִצְטַלֵּם), у ז становится ד с дагешем (הִזְדַּקֵּן)", () => {
    expect(nf(forms("צלמ").past["3ms"].niqqud)).toBe(nf("הִצְטַלֵּם"));
    expect(forms("צלמ").past["3ms"].he).toBe("הצטלם");
    expect(forms("צלמ").past["3ms"].translit).toBe("хицтале́м");
    expect(nf(forms("זקנ").past["3ms"].niqqud)).toBe(nf("הִזְדַּקֵּן"));
  });

  it("первая гортанная или נ не меняет приставку: הִתְעַלֵּם, הִתְאַפֵּק, הִתְנַצֵּל; ה тоже", () => {
    expect(nf(forms("עלמ").past["3ms"].niqqud)).toBe(nf("הִתְעַלֵּם"));
    expect(nf(forms("אפק").past["3ms"].niqqud)).toBe(nf("הִתְאַפֵּק"));
    expect(nf(forms("נצל").past["3ms"].niqqud)).toBe(nf("הִתְנַצֵּל"));
    expect(nf(forms("הפכ").past["3ms"].niqqud)).toBe(nf("הִתְהַפֵּךְ"));
  });

  it("вторая буква ר не удваивается, под первой камац: הִתְקָרֵב, הִתְקָרְבָה, הִצְטָרֵף", () => {
    const v = forms("קרב");
    expect(nf(v.past["3ms"].niqqud)).toBe(nf("הִתְקָרֵב"));
    expect(nf(v.past["3fs"].niqqud)).toBe(nf("הִתְקָרְבָה"));
    expect(nf(v.past["1s"].niqqud)).toBe(nf("הִתְקָרַבְתִּי"));
    expect(nf(v.present.mp.niqqud)).toBe(nf("מִתְקָרְבִים"));
    expect(v.past["3ms"].translit).toBe("хиткаре́в");
    expect(nf(forms("צרפ").past["3ms"].niqqud)).toBe(nf("הִצְטָרֵף"));
    expect(nf(forms("זרז").past["3ms"].niqqud)).toBe(nf("הִזְדָּרֵז"));
  });

  it("вторая гортанная не удваивается, шва заменяет хатаф-патах: הִתְנַהֲגָה, מִתְרַחֲקִים, הִצְטַעֲרוּ", () => {
    const v = forms("נהג");
    expect(nf(v.past["3ms"].niqqud)).toBe(nf("הִתְנַהֵג"));
    expect(nf(v.past["3fs"].niqqud)).toBe(nf("הִתְנַהֲגָה"));
    expect(v.past["3fs"].translit).toBe("хитнахага́");
    expect(nf(v.present.mp.niqqud)).toBe(nf("מִתְנַהֲגִים"));
    expect(nf(forms("רחק").present.mp.niqqud)).toBe(nf("מִתְרַחֲקִים"));
    expect(nf(forms("צער").past["3p"].niqqud)).toBe(nf("הִצְטַעֲרוּ"));
    expect(nf(forms("צער").past["1s"].niqqud)).toBe(nf("הִצְטַעַרְתִּי"));
    expect(nf(forms("אהב").present.fp.niqqud)).toBe(nf("מִתְאַהֲבוֹת"));
    expect(nf(forms("פעל").present.ms.niqqud)).toBe(nf("מִתְפַּעֵל"));
  });

  it("третья נ сливается с окончаниями -נוּ и -נָה: הִתְחַתַּנּוּ, תִּתְחַתֵּנָּה", () => {
    const v = forms("חתנ");
    expect(nf(v.past["1p"].niqqud)).toBe(nf("הִתְחַתַּנּוּ"));
    expect(v.past["1p"].he).toBe("התחתנו");
    expect(v.past["1p"].translit).toBe("хитхата́ну");
    expect(nf(v.future["2fp"].niqqud)).toBe(nf("תִּתְחַתֵּנָּה"));
    expect(nf(v.imperative!.fp.niqqud)).toBe(nf("הִתְחַתֵּנָּה"));
    expect(nf(v.past["1s"].niqqud)).toBe(nf("הִתְחַתַּנְתִּי"));
    // Обычные корни: נ окончания отдельная буква (תִּתְלַבֵּשְׁנָה).
    expect(nf(forms("לבש").future["2fp"].niqqud)).toBe(nf("תִּתְלַבֵּשְׁנָה"));
  });

  it("первая и третья буквы могут совпадать (שמש, זרז), конечные формы и ךְ на месте", () => {
    expect(hitpaelRootProblems("שמש")).toEqual([]);
    expect(hitpaelRootProblems("זרז")).toEqual([]);
    expect(forms("רחצ").past["3ms"].he).toBe("התרחץ");
    expect(forms("הפכ").past["3ms"].he).toBe("התהפך");
    expect(nf(forms("הפכ").past["3ms"].niqqud)).toBe(nf("הִתְהַפֵּךְ"));
  });

  it("ударение: -ти, -та, -ну безударные, 3-е лицо на конце, ж.р. настоящего и формы на -на на предпоследнем", () => {
    const v = forms("לבש");
    expect(v.past["1s"].translit).toBe("хитлаба́шти");
    expect(v.past["2ms"].translit).toBe("хитлаба́шта");
    expect(v.past["2fs"].translit).toBe("хитлаба́шт");
    expect(v.past["1p"].translit).toBe("хитлаба́шну");
    expect(v.past["2mp"].translit).toBe("хитлабаште́м");
    expect(v.past["3fs"].translit).toBe("хитлабша́");
    expect(v.past["3p"].translit).toBe("хитлабшу́");
    expect(v.present.fs.translit).toBe("митлабе́шет");
    expect(v.present.mp.translit).toBe("митлабши́м");
    expect(v.future["3fp"].translit).toBe("итлабе́шна");
    expect(v.imperative!.fp.translit).toBe("хитлабе́шна");
  });

  it("совпадающие формы: прошедшее 3ms = повелительное ms, 3p = повелительное mp, будущее 2ms = 3fs; больше совпадений нет", () => {
    const allowed = new Set(["past.3ms|imperative.ms", "past.3p|imperative.mp", "future.2ms|future.3fs"]);
    for (const root of HITPAEL_ROOTS) {
      const entries = verbForms(forms(root));
      const seen = new Set<string>();
      for (let i = 0; i < entries.length; i++) {
        for (let j = i + 1; j < entries.length; j++) {
          const a = entries[i]!;
          const b = entries[j]!;
          if (formSound(a.form) !== formSound(b.form) && a.form.niqqud !== b.form.niqqud) continue;
          seen.add(`${a.tense}.${a.key}|${b.tense}.${b.key}`);
        }
      }
      expect([...seen].sort(), root).toEqual([...allowed].sort());
      const v = forms(root);
      expect(v.past["3ms"].niqqud, root).toBe(v.imperative!.ms.niqqud);
      expect(v.past["3p"].niqqud, root).toBe(v.imperative!.mp.niqqud);
    }
  });
});

describe("генератор форм хитпаэль: отказ на неподходящих корнях", () => {
  const bad: [string, string][] = [
    ["דבר", "первая ד растворяет приставку"],
    ["טהר", "первая ט растворяет приставку"],
    ["תקנ", "первая ת растворяет приставку"],
    ["קלח", "третья ח (патах-гануб)"],
    ["שגע", "третья ע (патах-гануб)"],
    ["חבא", "третья א (слабый корень)"],
    ["בנה", "третья ה (слабый корень)"],
    ["כונ", "ו в корне"],
    ["ילד", "י в начале"],
    ["פלל", "удвоенный корень"],
    ["ממש", "первая и вторая одинаковые"],
    ["נפת", "третья ת"],
    ["שחק", "пишется с син"],
    ["סב", "две буквы"],
    ["סכלל", "четыре буквы"],
  ];
  for (const [root, why] of bad) {
    it(`корень ${root} (${why}) отклоняется`, () => {
      expect(hitpaelRootProblems(root).length).toBeGreaterThan(0);
      expect(() => conjugateHitpael(root)).toThrow();
    });
  }
});

describe("уроки хитпаэль: составлены генератором", () => {
  it("3 урока по 10 глаголов, все корни разные, ключи и переводы уникальны, корни не с син", () => {
    expect(HITPAEL_LESSONS).toHaveLength(3);
    for (const lesson of HITPAEL_LESSONS) expect(lesson.verbs).toHaveLength(10);
    expect(new Set(HITPAEL_ROOTS).size).toBe(30);
    const keys = HITPAEL_LESSONS.flatMap((l) => l.verbs.map((v) => v.key));
    expect(new Set(keys).size).toBe(30);
    for (const root of HITPAEL_ROOTS) expect(SIN_ROOTS).not.toContain(root);
  });

  it("корни проходят проверку генератора, а формы — проверки глаголов, ударения и согласных", () => {
    for (const root of HITPAEL_ROOTS) expect(hitpaelRootProblems(root), root).toEqual([]);
    for (let n = 1; n <= 3; n++) {
      const lesson = buildHitpaelLesson(n) as { words: { he: string; verb: Parameters<typeof verbProblems>[1] }[] };
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

  it("повелительное оставлено у всех 30 глаголов (решение владельца 18.10): 27 форм", () => {
    for (let n = 1; n <= 3; n++) {
      const lesson = buildHitpaelLesson(n) as { words: { verb: { imperative?: unknown } }[] };
      for (const w of lesson.words) {
        expect(w.verb.imperative).toBeDefined();
        expect(verbForms(w.verb as Parameters<typeof verbForms>[0])).toHaveLength(VERB_FORMS_TOTAL);
      }
    }
    expect(HITPAEL_LESSONS.flatMap((l) => l.verbs).some((v) => v.noImperative)).toBe(false);
  });

  it("классы корней: перестановка у ס ש צ ז, вторая ר и гортанная, третья נ", () => {
    const has = (pred: (root: string) => boolean) => HITPAEL_ROOTS.filter(pred);
    expect(has((r) => "סשצז".includes(r[0]!)).sort()).toEqual(["זרז", "סדר", "סכל", "צער", "צרפ", "שמש", "שתפ"].sort());
    expect(has((r) => r[1] === "ר")).toEqual(["קרב", "צרפ", "זרז"]);
    expect(has((r) => "אהחע".includes(r[1]!)).sort()).toEqual(["אהב", "להב", "נהג", "פעל", "צער", "רחק"].sort());
    expect(has((r) => r[2] === "נ")).toEqual(["חתנ"]);
  });

  it("урок 1 бесплатный, 2–3 платные, id hitpael-<номер>, тема «Хитпаэль» раздел verbs; фраза с настоящим временем", () => {
    for (let n = 1; n <= 3; n++) {
      const lesson = buildHitpaelLesson(n) as { id: string; free: boolean; topicId: string; section: string; topic: string; words: { id: string; example: { he: string } }[] };
      expect(lesson).toMatchObject({ id: `hitpael-${n}`, free: n === 1, topicId: "hitpael", section: "verbs", topic: "Хитпаэль" });
      for (const w of lesson.words) {
        expect(w.id.startsWith(`hitpael-${n}-`)).toBe(true);
        expect(w.example.he).not.toContain("{");
      }
    }
    const dress = (buildHitpaelLesson(1) as { words: { example: { he: string; translit: string } }[] }).words[0]!;
    expect(dress.example).toMatchObject({ he: "אני מתלבש מהר", translit: "ани митлабеш махер" });
    expect(() => buildHitpaelLesson(4)).toThrow();
  });
});

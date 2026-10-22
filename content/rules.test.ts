import { describe, expect, it } from "vitest";
import { ACUTE, phraseSpeakerProblems, skeletonProblems, speakerReason, stressProblems, stripStress, syllables, wordAfterAni } from "./rules";

const a = ACUTE;

describe("транскрипция: слоги и ударение", () => {
  it("слоги считаются по гласным", () => {
    expect(syllables("сус")).toBe(1);
    expect(syllables("хатуль")).toBe(2);
    expect(syllables(`хату${a}ль`)).toBe(2);
    expect(syllables("арье")).toBe(2);
    expect(syllables("пиль")).toBe(1);
  });

  it("слово из 2+ слогов: ровно один знак после гласной", () => {
    expect(stressProblems(`хату${a}ль`)).toEqual([]);
    expect(stressProblems(`ке${a}лев`)).toEqual([]);
    expect(stressProblems(`арье${a}`)).toEqual([]);
  });

  it("слово из одного слога без знака", () => {
    expect(stressProblems("сус")).toEqual([]);
    expect(stressProblems("пиль")).toEqual([]);
    expect(stressProblems(`су${a}с`)).not.toEqual([]);
  });

  it("нет знака, два знака, знак не после гласной", () => {
    expect(stressProblems("хатуль")).not.toEqual([]);
    expect(stressProblems(`ха${a}ту${a}ль`)).not.toEqual([]);
    expect(stressProblems(`хатуль${a}`)).not.toEqual([]);
    expect(stressProblems(`${a}хатуль`)).not.toEqual([]);
  });

  it("слова через дефис и пробел проверяются по частям", () => {
    // В «тель» один слог (знака нет), в «авив» два слога (знак один): верно.
    expect(stressProblems(`тель-ави${a}в`)).toEqual([]);
    // Знак в односложной части и его нет в двусложной: два нарушения, по одному на часть.
    const wrong = stressProblems(`те${a}ль-авив`);
    expect(wrong).toHaveLength(2);
    expect(wrong[0]).toContain("одного слога");
    expect(wrong[1]).toContain("авив");
  });

  it("слово без гласных не принимается", () => {
    expect(stressProblems("ль")).not.toEqual([]);
  });

  it("stripStress убирает только знак ударения", () => {
    expect(stripStress(`хату${a}ль`)).toBe("хатуль");
  });
});

describe("транскрипция: согласные иврита по порядку", () => {
  const ok: [string, string][] = [
    ["חתול", `хату${a}ль`],
    ["כלב", `ке${a}лев`],
    ["סוס", "сус"],
    ["ציפור", `ципо${a}р`],
    ["דג", "даг"],
    ["פרה", `пара${a}`],
    ["ארנב", `арна${a}в`],
    ["עכבר", `ахба${a}р`],
    ["פיל", "пиль"],
    ["אריה", `арье${a}`],
    ["שולחן", `шульха${a}н`],
    ["ספר", `се${a}фер`],
    // Слово урока из нескольких слов (21.10): пробел пропускается, согласные идут по порядку через границу слов.
    ["אחר כך", `аха${a}р ках`],
    ["בית ספר", `бейт се${a}фер`],
    ["אחת עשרה", `аха${a}т эсре${a}`],
    ["כמה זה עולה", `ка${a}ма зэ оле${a}`],
  ];

  for (const [he, translit] of ok) {
    it(`${he} → ${translit}`, () => {
      expect(skeletonProblems(he, translit)).toEqual([]);
    });
  }

  it("лишняя буква вместо нужной ловится", () => {
    expect(skeletonProblems("ציפור", "сипор")).not.toEqual([]);
    expect(skeletonProblems("חתול", "катуль")).not.toEqual([]);
  });

  it("пропущенная согласная ловится", () => {
    expect(skeletonProblems("חתול", "хатуь")).not.toEqual([]);
  });

  it("порядок согласных важен", () => {
    expect(skeletonProblems("חתול", "лутах")).not.toEqual([]);
  });

  it("у фразы согласные второго слова тоже проверяются", () => {
    expect(skeletonProblems("אחר כך", `аха${a}р`)).not.toEqual([]);
    expect(skeletonProblems("בית ספר", `се${a}фер бейт`)).not.toEqual([]);
  });

  it("редкие звуки передаются двумя буквами: ג как «дж»", () => {
    expect(skeletonProblems("גרפה", "джираф")).toEqual([]);
  });
});

describe("фразы от первого лица (docs/CONTENT.md, «Фразы от первого лица»)", () => {
  const forms = new Map<string, unknown>([
    ["הולך", { he: "הולכת", translit: "холехет" }],
    ["רוצה", { he: "רוצה", translit: "роца" }],
  ]);
  const word = (example: Record<string, unknown>, he = "הולך") => ({ id: "w", he, translit: "", ru: "", reviewed: false, example }) as never;

  it("«אני הולך» без пометки: нужен speaker и женский вариант", () => {
    expect(phraseSpeakerProblems(word({ he: "אני הולך לעבודה", translit: "ани холех леавода", ru: "Я иду на работу" }), forms)).toHaveLength(1);
    expect(phraseSpeakerProblems(word({ he: "אני לא רוצה", translit: "ани ло роце", ru: "Я не хочу" }), forms)).toHaveLength(1);
  });

  it("по-русски мужской род (был, сам, -лся) тоже требует пометки; «он был» и «я дома» нет", () => {
    expect(speakerReason({ he: "הייתי בבית", ru: "Вчера я был дома" }, forms)).toBeDefined();
    expect(speakerReason({ he: "קבעתי תור", ru: "Я записался к врачу" }, forms)).toBeDefined();
    expect(speakerReason({ he: "אני מסתדר", ru: "Я справляюсь сам" }, forms)).toBeDefined();
    expect(speakerReason({ he: "הוא היה בבית", ru: "Он был дома" }, forms)).toBeUndefined();
    expect(speakerReason({ he: "אני בבית", ru: "Я дома" }, forms)).toBeUndefined();
  });

  it("правильная мужская фраза с женским вариантом без замечаний", () => {
    const ok = { he: "אני הולך", translit: "ани холех", ru: "Я иду", speaker: "m", female: { he: "אני הולכת", translit: "ани холехет", ru: "Я иду" } };
    expect(phraseSpeakerProblems(word(ok), forms)).toEqual([]);
  });

  it("женский вариант: не совпадает с мужским, после «אני» женская форма, перевод не мужской, огласовки того же текста", () => {
    const base = { he: "אני הולך", translit: "ани холех", ru: "Я иду", speaker: "m" };
    expect(phraseSpeakerProblems(word({ ...base, female: { he: "אני הולך", translit: "ани холех", ru: "Я иду" } }), forms).length).toBeGreaterThan(0);
    expect(phraseSpeakerProblems(word({ ...base, female: { he: "אני הולכת", translit: "ани холехет", ru: "Я сам иду" } }), forms)).toHaveLength(1);
    const want = { he: "אני רוצה", translit: "ани роце", ru: "Я хочу", speaker: "m" };
    expect(phraseSpeakerProblems(word({ ...want, female: { he: "אני רוצה", niqqud: "אני רוֹצָה", translit: "ани роца", ru: "Я хочу" } }, "רוצה"), forms)).toEqual([]);
    expect(phraseSpeakerProblems(word({ ...want, female: { he: "אני רוצה", niqqud: "אני רוֹצֶה מים", translit: "ани роца", ru: "Я хочу" } }, "רוצה"), forms)).toHaveLength(1);
  });

  it("мужская фраза без женского варианта допустима, только если само слово от первого лица («אני מצטער»)", () => {
    const sorry = { he: "אני מצטער אני מאחר", translit: "ани мицтаер ани меахер", ru: "Простите, я опаздываю", speaker: "m" };
    expect(phraseSpeakerProblems(word(sorry, "אני מצטער"), forms)).toEqual([]);
    expect(phraseSpeakerProblems(word({ he: "אני הולך", translit: "ани холех", ru: "Я иду", speaker: "m" }), forms)).toHaveLength(1);
  });

  it("wordAfterAni пропускает «לא»", () => {
    expect(wordAfterAni("כן אני רוצה")).toBe("רוצה");
    expect(wordAfterAni("אני לא מבין עברית")).toBe("מבין");
    expect(wordAfterAni("זה כלב")).toBeUndefined();
  });
});

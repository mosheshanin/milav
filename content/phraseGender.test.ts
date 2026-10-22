import { describe, expect, it } from "vitest";
import { withFemaleVariant } from "./phraseGender";

const ms = { he: "כותב", niqqud: "כּוֹתֵב", translit: "коте́в" };
const fs = { he: "כותבת", niqqud: "כּוֹתֶבֶת", translit: "коте́вет" };

describe("женский вариант фразы глагола (генераторы уроков)", () => {
  it("«אני כותב מכתב» получает speaker m и «אני כותבת מכתב»", () => {
    expect(withFemaleVariant({ he: "אני כותב מכתב", translit: "ани котев михтав", ru: "Я пишу письмо" }, ms, fs)).toEqual({
      he: "אני כותב מכתב",
      translit: "ани котев михтав",
      ru: "Я пишу письмо",
      speaker: "m",
      female: { he: "אני כותבת מכתב", translit: "ани котевет михтав", ru: "Я пишу письмо" },
    });
  });

  it("фраза не от первого лица остаётся как есть", () => {
    const phrase = { he: "הוא כותב מכתב", translit: "ху котев михтав", ru: "Он пишет письмо" };
    expect(withFemaleVariant(phrase, ms, fs)).toBe(phrase);
  });

  it("одинаковое написание (רוצה): у варианта огласовки слова; свой русский перевод, если задан", () => {
    const r = withFemaleVariant(
      { he: "אני רוצה מים", translit: "ани роце маим", ru: "Я хочу воды" },
      { he: "רוצה", niqqud: "רוֹצֶה", translit: "роце́" },
      { he: "רוצה", niqqud: "רוֹצָה", translit: "роца́" },
      "Я хочу воды",
    );
    expect(r.female).toEqual({ he: "אני רוצה מים", niqqud: "אני רוֹצָה מים", translit: "ани роца маим", ru: "Я хочу воды" });
  });

  it("транскрипция без мужской формы: ошибка (так нашлась опечатка «мевиа»)", () => {
    expect(() => withFemaleVariant({ he: "אני כותב", translit: "ани катав", ru: "Я пишу" }, ms, fs)).toThrow();
  });
});

import { describe, expect, it } from "vitest";
import { DEFAULT_LEARNER_GENDER, isGender, phraseFor } from "./phrase";
import type { Phrase } from "./types";

const going: Phrase = {
  he: "אני הולך",
  translit: "ани холех",
  ru: "Я иду",
  audio: "/audio/x-phrase-m.mp3",
  speaker: "m",
  female: { he: "אני הולכת", translit: "ани холехет", ru: "Я иду", audio: "/audio/x-phrase-f.mp3" },
};

describe("фраза-пример по роду ученика", () => {
  it("по умолчанию мужской род: так написаны основные фразы", () => {
    expect(DEFAULT_LEARNER_GENDER).toBe("m");
  });

  it("женщине женский вариант, мужчине основная фраза", () => {
    expect(phraseFor(going, "f").he).toBe("אני הולכת");
    expect(phraseFor(going, "f").audio).toBe("/audio/x-phrase-f.mp3");
    expect(phraseFor(going, "m").he).toBe("אני הולך");
    expect(phraseFor(going, "m").audio).toBe("/audio/x-phrase-m.mp3");
  });

  it("нейтральная фраза и фраза без женского варианта одинаковы для всех", () => {
    const neutral: Phrase = { he: "זאת אמא טובה", translit: "зот има това", ru: "Это хорошая мама" };
    expect(phraseFor(neutral, "f")).toBe(neutral);
    const sorry: Phrase = { he: "אני מצטערת על זה", translit: "ани мицтаерет аль зэ", ru: "Мне жаль", speaker: "f" };
    expect(phraseFor(sorry, "m")).toBe(sorry);
  });

  it("isGender пропускает только m и f", () => {
    expect(["m", "f", "x", null, undefined, 1].map(isGender)).toEqual([true, true, false, false, false, false]);
  });
});

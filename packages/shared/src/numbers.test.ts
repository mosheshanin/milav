import { describe, expect, it } from "vitest";
import { stressProblems, skeletonProblems } from "../../../content/rules";
import {
  MAX_SPOKEN_NUMBER,
  NUMBER_PIECES,
  numberPiece,
  numberPieceAudio,
  spellAge,
  spellDigits,
  spellFloor,
  spellNumber,
  spellNumberIds,
  spellPrice,
  spellTime,
  spellTimeIds,
} from "./numbers";

const he = (ids: string[]) => ids.map((id) => numberPiece(id).he).join(" ");
const heF = (n: number) => spellNumber(n, "f").he;
const heM = (n: number) => spellNumber(n, "m").he;

describe("куски озвучки чисел", () => {
  it("id уникальны, огласовки того же слова, транскрипция по правилам проекта", () => {
    expect(new Set(NUMBER_PIECES.map((p) => p.id)).size).toBe(NUMBER_PIECES.length);
    for (const p of NUMBER_PIECES) {
      expect(p.niqqud.replace(/[֑-ׇ]/g, ""), `${p.id}: огласовки того же слова`).toBe(p.he);
      expect(stressProblems(p.translit), `${p.id}: ударение`).toEqual([]);
      expect(skeletonProblems(p.he, p.translit), `${p.id}: согласные`).toEqual([]);
    }
  });

  it("путь файла по id", () => {
    expect(numberPieceAudio("f3")).toBe("/audio/num/f3.mp3");
  });

  it("неизвестный кусок это ошибка", () => {
    expect(() => numberPiece("zzz")).toThrow();
  });

  it("каждое число 0…9999 в обоих родах собирается из существующих кусков, все куски используются", () => {
    const used = new Set<string>();
    for (let n = 0; n <= MAX_SPOKEN_NUMBER; n++) {
      for (const g of ["f", "m"] as const) for (const id of spellNumberIds(n, g)) used.add(id);
      if (n >= 1) for (const id of spellNumberIds(n, "m", { price: true })) used.add(id);
    }
    for (let n = 1; n <= MAX_SPOKEN_NUMBER; n++) for (const id of [...spellNumberIds(n, "m", { price: true }), "shp"]) used.add(id);
    for (const id of ["sh1", "m1", "m2c", "shp"]) used.add(id);
    for (let h = 1; h <= 12; h++) for (const m of [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55]) for (const id of spellTimeIds(h, m)) used.add(id);
    for (let d = 0; d <= 9; d++) used.add(`f${d}`);
    for (const id of ["ben", "bat", "kuma"]) used.add(id);
    const unused = NUMBER_PIECES.filter((p) => !used.has(p.id)).map((p) => p.id);
    expect(unused, "куски, которые никогда не нужны").toEqual([]);
  });

  it("за пределами диапазона ошибка", () => {
    expect(() => spellNumberIds(-1)).toThrow(RangeError);
    expect(() => spellNumberIds(MAX_SPOKEN_NUMBER + 1)).toThrow(RangeError);
    expect(() => spellNumberIds(1.5)).toThrow(RangeError);
  });
});

describe("число словами", () => {
  it("женский счёт 0–10 как в уроке «Числа 1–10»", () => {
    expect([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(heF)).toEqual(["אפס", "אחת", "שתיים", "שלוש", "ארבע", "חמש", "שש", "שבע", "שמונה", "תשע", "עשר"]);
  });

  it("мужской род 1–10 как в уроке «Числа с мужскими словами»", () => {
    expect([1, 2, 3, 4, 5, 6, 7, 9, 10].map(heM)).toEqual(["אחד", "שניים", "שלושה", "ארבעה", "חמישה", "שישה", "שבעה", "תשעה", "עשרה"]);
  });

  it("11–19 в двух родах как в уроках «Счёт от 11 до 19»", () => {
    expect([11, 12, 13, 19].map(heF)).toEqual(["אחת עשרה", "שתים עשרה", "שלוש עשרה", "תשע עשרה"]);
    expect([11, 12, 13, 19].map(heM)).toEqual(["אחד עשר", "שנים עשר", "שלושה עשר", "תשעה עשר"]);
    expect(spellNumber(13, "f").niqqud).toBe("שְׁלוֹשׁ עֶשְׂרֵה");
    expect(spellNumber(13, "m").niqqud).toBe("שְׁלוֹשָׁה עָשָׂר");
  });

  it("десятки с единицей: «и» слитно с единицей, как «עשרים ואחד» в уроке", () => {
    expect(heF(20)).toBe("עשרים");
    expect(heF(21)).toBe("עשרים ואחת");
    expect(heM(21)).toBe("עשרים ואחד");
    expect(heF(47)).toBe("ארבעים ושבע");
    expect(heM(47)).toBe("ארבעים ושבעה");
    expect(heF(92)).toBe("תשעים ושתיים");
    expect(spellNumber(22, "f").niqqud).toBe("עֶשְׂרִים וּשְׁתַּיִים");
  });

  it("сотни: «и» только перед последней группой", () => {
    expect(heF(100)).toBe("מאה");
    expect(heF(200)).toBe("מאתיים");
    expect(heF(300)).toBe("שלוש מאות");
    expect(heF(900)).toBe("תשע מאות");
    expect(heF(101)).toBe("מאה ואחת");
    expect(heF(110)).toBe("מאה ועשר");
    expect(heM(110)).toBe("מאה ועשרה");
    expect(heF(111)).toBe("מאה ואחת עשרה");
    expect(heF(112)).toBe("מאה ושתים עשרה");
    expect(heF(120)).toBe("מאה ועשרים");
    expect(heF(125)).toBe("מאה עשרים וחמש");
    expect(heF(342)).toBe("שלוש מאות ארבעים ושתיים");
    expect(heM(805)).toBe("שמונה מאות וחמישה");
  });

  it("тысячи", () => {
    expect(heF(1000)).toBe("אלף");
    expect(heF(2000)).toBe("אלפיים");
    expect(heF(3000)).toBe("שלושת אלפים");
    expect(heF(9000)).toBe("תשעת אלפים");
    expect(heF(1100)).toBe("אלף ומאה");
    expect(heF(1200)).toBe("אלף ומאתיים");
    expect(heF(1300)).toBe("אלף ושלוש מאות");
    expect(heF(1001)).toBe("אלף ואחת");
    expect(heF(2010)).toBe("אלפיים ועשר");
    expect(heF(2024)).toBe("אלפיים עשרים וארבע");
    expect(heF(1999)).toBe("אלף תשע מאות תשעים ותשע");
    expect(heF(9999)).toBe("תשעת אלפים תשע מאות תשעים ותשע");
  });

  it("транскрипция и огласовки склеиваются через пробел", () => {
    const s = spellNumber(125, "f");
    expect(s.ids).toEqual(["h1", "t20", "vf5"]);
    expect(s.translit).toBe("меа́ эсри́м вэ-хаме́ш");
  });
});

describe("цены в шекелях", () => {
  it("один и два особые, дальше мужской род и «шекелей»", () => {
    expect(spellPrice(1).he).toBe("שקל אחד");
    expect(spellPrice(2).he).toBe("שני שקלים");
    expect(spellPrice(3).he).toBe("שלושה שקלים");
    expect(spellPrice(11).he).toBe("אחד עשר שקלים");
    expect(spellPrice(35).he).toBe("שלושים וחמישה שקלים");
    expect(spellPrice(100).he).toBe("מאה שקלים");
    expect(spellPrice(102).he).toBe("מאה ושני שקלים");
    expect(spellPrice(22).he).toBe("עשרים ושני שקלים");
    expect(spellPrice(250).he).toBe("מאתיים וחמישים שקלים");
    expect(spellPrice(2000).he).toBe("אלפיים שקלים");
  });
});

describe("время", () => {
  const t = (h: number, m: number) => spellTime(h, m).he;
  it("целые часы и «и»", () => {
    expect(t(3, 0)).toBe("השעה שלוש");
    expect(t(1, 0)).toBe("השעה אחת");
    expect(t(11, 0)).toBe("השעה אחת עשרה");
    expect(t(12, 0)).toBe("השעה שתים עשרה");
    expect(t(3, 5)).toBe("השעה שלוש וחמש");
    expect(t(3, 10)).toBe("השעה שלוש ועשר");
    expect(t(3, 15)).toBe("השעה שלוש ורבע");
    expect(t(3, 20)).toBe("השעה שלוש ועשרים");
    expect(t(3, 25)).toBe("השעה שלוש עשרים וחמש");
    expect(t(3, 30)).toBe("השעה שלוש וחצי");
  });
  it("после половины называется следующий час и «בלי»", () => {
    expect(t(3, 35)).toBe("השעה ארבע בלי עשרים וחמש");
    expect(t(3, 40)).toBe("השעה ארבע בלי עשרים");
    expect(t(3, 45)).toBe("השעה ארבע בלי רבע");
    expect(t(3, 50)).toBe("השעה ארבע בלי עשר");
    expect(t(3, 55)).toBe("השעה ארבע בלי חמש");
    expect(t(12, 45)).toBe("השעה אחת בלי רבע");
    expect(t(11, 45)).toBe("השעה שתים עשרה בלי רבע");
    expect(t(10, 40)).toBe("השעה אחת עשרה בלי עשרים");
  });
  it("неверное время это ошибка", () => {
    expect(() => spellTimeIds(0, 0)).toThrow(RangeError);
    expect(() => spellTimeIds(13, 0)).toThrow(RangeError);
    expect(() => spellTimeIds(3, 7)).toThrow(RangeError);
  });
});

describe("телефон, возраст, этаж", () => {
  it("номер по цифрам, группами 3-3-4 с паузами между группами", () => {
    const s = spellDigits("0541234567");
    expect(s.ids).toHaveLength(10);
    expect(s.he).toBe("אפס חמש ארבע אחת שתיים שלוש ארבע חמש שש שבע");
    expect(s.groupEnds).toEqual([2, 5]);
  });
  it("только цифры", () => {
    expect(() => spellDigits("05a")).toThrow(RangeError);
  });
  it("возраст с «בן» и «בת», этаж с «קומה»", () => {
    expect(spellAge(35, "ben").he).toBe("בן שלושים וחמש");
    expect(spellAge(8, "bat").he).toBe("בת שמונה");
    expect(spellFloor(3).he).toBe("קומה שלוש");
    expect(spellFloor(12).he).toBe("קומה שתים עשרה");
  });
});

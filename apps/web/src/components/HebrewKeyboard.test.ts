import { describe, expect, it } from "vitest";
import { HEBREW_KEYBOARD_ROWS } from "./HebrewKeyboard";

// Стандартная израильская раскладка SI-1452: буква на каждой латинской клавише, ряды слева направо.
const SI_1452: Record<string, string> = {
  E: "ק", R: "ר", T: "א", Y: "ט", U: "ו", I: "ן", O: "ם", P: "פ",
  A: "ש", S: "ד", D: "ג", F: "כ", G: "ע", H: "י", J: "ח", K: "ל", L: "ך", ";": "ף",
  Z: "ז", X: "ס", C: "ב", V: "ה", B: "נ", N: "מ", M: "צ", ",": "ת", ".": "ץ",
};
const LATIN_ROWS = ["ERTYUIOP", "ASDFGHJKL;", "ZXCVBNM,."];

describe("HebrewKeyboard", () => {
  it("ряды совпадают со стандартной раскладкой SI-1452 слева направо", () => {
    const expected = LATIN_ROWS.map((row) => [...row].map((k) => SI_1452[k]).join(""));
    expect([...HEBREW_KEYBOARD_ROWS]).toEqual(expected);
  });

  it("на клавиатуре все 27 форм букв, каждая по одному разу", () => {
    const keys = HEBREW_KEYBOARD_ROWS.join("");
    expect(keys.length).toBe(27);
    expect(new Set(keys).size).toBe(27);
    for (let code = 0x05d0; code <= 0x05ea; code++) expect(keys, String.fromCharCode(code)).toContain(String.fromCharCode(code));
  });
});

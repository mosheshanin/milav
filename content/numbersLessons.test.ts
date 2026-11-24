import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { spellNumber } from "@milav/shared";

describe("числа сверены с уроками «Числа»", () => {
  it("слова уроков чисел совпадают с тем, как число собирается кусками", () => {
    const dir = new URL("./lessons/", import.meta.url);
    // numbers-1 (женский счёт), numbers-3 (десятки), numbers-4 (11–19 ж.), numbers-5 (11–19 м.); numbers-2 это мужской род, уроки времени без value.
    const cases: [string, "f" | "m"][] = [
      ["numbers-1", "f"],
      ["numbers-3", "f"],
      ["numbers-4", "f"],
      ["numbers-5", "m"],
      ["numbers-2", "m"],
    ];
    let checked = 0;
    for (const [lesson, gender] of cases) {
      const data = JSON.parse(readFileSync(new URL(`${lesson}.json`, dir), "utf8"));
      for (const w of data.words as { id: string; he: string; niqqud: string; value?: number }[]) {
        if (w.value === undefined || w.id.endsWith("-before")) continue;
        const value = w.value;
        // У «Ноль, десятки и сто» (100 м.) и 20+ род не различается; 21 в numbers-5 мужской.
        const spelled = spellNumber(value, gender);
        expect(spelled.he, `${w.id}: иврит`).toBe(w.he);
        expect(spelled.niqqud, `${w.id}: огласовки`).toBe(w.niqqud);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(40);
    expect(readdirSync(dir).length).toBeGreaterThan(0);
  });
});

describe("книжные формы чисел (вопрос 53, 24.11)", () => {
  const dir = new URL("./lessons/", import.meta.url);
  const words = (lesson: string) =>
    JSON.parse(readFileSync(new URL(`${lesson}.json`, dir), "utf8")).words as { id: string; value?: number; book?: true }[];

  it("пометка «книжн.» стоит у мужских 3–10 и 11–19 и только у них", () => {
    const book = ["numbers-1", "numbers-2", "numbers-3", "numbers-4", "numbers-5", "numbers-6"]
      .flatMap(words)
      .filter((w) => w.book)
      .map((w) => w.value);
    expect(book.sort((a, b) => a! - b!)).toEqual([3, 4, 5, 6, 7, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19]);
  });

  it("разговорные мужские формы без пометки: один, два, два перед словом, двадцать один", () => {
    const plain = [...words("numbers-2"), ...words("numbers-5")].filter((w) => !w.book).map((w) => w.id);
    expect(plain.sort()).toEqual(["numbers-2-one", "numbers-2-two", "numbers-2-two-before", "numbers-5-twenty-one"]);
  });
});

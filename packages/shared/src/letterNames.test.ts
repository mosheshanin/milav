import { describe, expect, it } from "vitest";
import { HEBREW_LETTERS, LETTER_NAMES } from "./index";

describe("названия букв", () => {
  it("есть у каждой из 27 форм и ни у чего лишнего", () => {
    expect(Object.keys(LETTER_NAMES).sort()).toEqual([...HEBREW_LETTERS].sort());
    for (const letter of HEBREW_LETTERS) expect(LETTER_NAMES[letter]!.length).toBeGreaterThanOrEqual(2);
  });

  it("конечные формы названы конечными", () => {
    for (const letter of ["ך", "ם", "ן", "ף", "ץ"]) expect(LETTER_NAMES[letter]).toMatch(/^конечная /);
  });
});

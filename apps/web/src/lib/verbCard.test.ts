import { describe, expect, it } from "vitest";
import type { VerbData, WordForm } from "@milav/shared";
import { FUTURE_KEYS, IMPERATIVE_KEYS, PAST_KEYS, PRESENT_KEYS } from "@milav/shared";
import { verbBadge, verbRootLabel, verbTabs, VERB_TENSE_SHORT } from "./verbCard";

const form = (he: string): WordForm => ({ he, niqqud: he, translit: he });
const set = (keys: readonly string[]) => Object.fromEntries(keys.map((k) => [k, form(k)]));

function verb(withImperative = true): VerbData {
  return {
    binyan: "hitpael",
    root: "לבש",
    present: set(PRESENT_KEYS),
    past: set(PAST_KEYS),
    future: set(FUTURE_KEYS),
    ...(withImperative ? { imperative: set(IMPERATIVE_KEYS) } : {}),
  } as VerbData;
}

describe("карточка глагола: вкладки и строки", () => {
  it("четыре вкладки по порядку, строк 4, 9, 10 и 4", () => {
    const tabs = verbTabs(verb());
    expect(tabs.map((t) => t.tense)).toEqual(["present", "past", "future", "imperative"]);
    expect(tabs.map((t) => t.rows.length)).toEqual([4, 9, 10, 4]);
    expect(tabs.map((t) => t.title)).toEqual(["Настоящее", "Прошедшее", "Будущее", "Повелительное"]);
  });

  it("без повелительного наклонения три вкладки", () => {
    expect(verbTabs(verb(false)).map((t) => t.tense)).toEqual(["present", "past", "future"]);
  });

  it("строки идут в порядке ключей, а не в порядке полей в данных", () => {
    const v = verb();
    v.past = Object.fromEntries([...PAST_KEYS].reverse().map((k) => [k, form(k)])) as VerbData["past"];
    expect(verbTabs(v)[1]!.rows.map((r) => r.key)).toEqual([...PAST_KEYS]);
  });

  it("подписи: настоящее по роду и числу, прошедшее и будущее по лицу", () => {
    const [present, past, future, imperative] = verbTabs(verb());
    expect(present!.rows.map((r) => r.label)).toEqual(["м. р., ед. ч.", "ж. р., ед. ч.", "м. р., мн. ч.", "ж. р., мн. ч."]);
    expect(past!.rows[0]).toMatchObject({ key: "1s", label: "я", pronoun: "אני" });
    expect(past!.rows[8]).toMatchObject({ key: "3p", label: "они", pronoun: "הם/הן" });
    expect(future!.rows[8]).toMatchObject({ key: "3mp", label: "они (м.)", pronoun: "הם" });
    expect(future!.rows[9]).toMatchObject({ key: "3fp", label: "они (ж.)", pronoun: "הן" });
    expect(imperative!.rows.map((r) => r.label)).toEqual(["ты (м.)", "ты (ж.)", "вы (м.)", "вы (ж.)"]);
  });

  it("местоимение иврита только у прошедшего и будущего", () => {
    const [present, past, future, imperative] = verbTabs(verb());
    expect(present!.rows.every((r) => r.pronoun === undefined)).toBe(true);
    expect(imperative!.rows.every((r) => r.pronoun === undefined)).toBe(true);
    expect(past!.rows.every((r) => !!r.pronoun)).toBe(true);
    expect(future!.rows.every((r) => !!r.pronoun)).toBe(true);
  });

  it("форма, которой нет в данных, пропускается, а не ломает карточку", () => {
    const v = verb();
    delete (v.past as Partial<VerbData["past"]>)["2fp"];
    const past = verbTabs(v)[1]!;
    expect(past.rows).toHaveLength(8);
    expect(past.rows.map((r) => r.key)).not.toContain("2fp");
  });

  it("у каждой вкладки есть короткое название", () => {
    for (const tab of verbTabs(verb())) expect(tab.short).toBe(VERB_TENSE_SHORT[tab.tense]);
    expect(Object.values(VERB_TENSE_SHORT).every((s) => s.length <= 6)).toBe(true);
  });
});

describe("карточка глагола: плашка бинъяна и корня", () => {
  it("корень через неразрывный дефис", () => {
    expect(verbRootLabel("כתב")).toBe("כ‑ת‑ב");
    expect(verbRootLabel("כתב")).not.toContain("-");
  });

  it("название бинъяна по-русски", () => {
    expect(verbBadge(verb())).toEqual({ binyan: "Хитпаэль", root: "ל‑ב‑ש" });
    expect(verbBadge({ ...verb(), binyan: "paal" })).toMatchObject({ binyan: "Пааль" });
  });

  it("неизвестный бинъян не ломает плашку", () => {
    expect(verbBadge({ ...verb(), binyan: "kal" as VerbData["binyan"] }).binyan).toBe("kal");
  });
});

describe("карточка глагола: книжные формы (вопрос 31)", () => {
  it("помечены будущее 2fp, 3fp и повелительное fp, остальные нет", () => {
    const marked = verbTabs(verb()).flatMap((t) => t.rows.filter((r) => r.book).map((r) => `${t.tense}:${r.key}`));
    expect(marked).toEqual(["future:2fp", "future:3fp", "imperative:fp"]);
  });
});

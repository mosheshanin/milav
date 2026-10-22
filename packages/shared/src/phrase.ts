// Фраза-пример по роду ученика (настройка «Фразы-примеры от лица», docs/SPEC.md, «Род во фразах-примерах»).
import type { Gender, Phrase, PhraseText } from "./types";

/** Род ученика по умолчанию: так написаны все основные фразы уроков. */
export const DEFAULT_LEARNER_GENDER: Gender = "m";

export const LEARNER_GENDERS: readonly Gender[] = ["m", "f"];

/** Подписи выбора в «Настройках». */
export const LEARNER_GENDER_TITLES: Record<Gender, string> = { m: "Мужчины", f: "Женщины" };

export function isGender(value: unknown): value is Gender {
  return value === "m" || value === "f";
}

/**
 * Какую фразу показывать и озвучивать ученику: у женщины женский вариант, если он есть, иначе основная фраза.
 * Фраза с постоянным говорящим («אני מצטערת» у слова женского рода) показывается всем одинаково.
 */
export function phraseFor(example: Phrase, gender: Gender): PhraseText {
  return gender === "f" && example.female ? example.female : example;
}

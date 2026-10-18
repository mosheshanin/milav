import {
  BINYANIM,
  GIZRA_INFO,
  VERB_FORM_KEYS,
  VERB_FORM_LABELS,
  VERB_PRONOUNS_HE,
  VERB_TENSES,
  VERB_TENSE_TITLES,
  isBookForm,
  type VerbData,
  type VerbTense,
  type WordForm,
} from "@milav/shared";

/** Короткие названия вкладок: четыре полных названия не помещаются в ряд на экране 360 px. Полное название над списком форм. */
export const VERB_TENSE_SHORT: Readonly<Record<VerbTense, string>> = {
  present: "Наст.",
  past: "Прош.",
  future: "Буд.",
  imperative: "Повел.",
};

/** Одна строка таблицы форм: подпись, местоимение иврита (у прошедшего и будущего) и сама форма. */
export interface VerbRow {
  key: string;
  label: string;
  /** Местоимение иврита: אני, הוא… В настоящем времени и в повелительном его нет. */
  pronoun: string | undefined;
  form: WordForm;
  /** Книжная форма (תכתובנה): на карточке с пометкой «книжн.», в упражнениях её нет. */
  book: boolean;
}

export interface VerbTab {
  tense: VerbTense;
  /** Полное название времени. */
  title: string;
  /** Короткое название для вкладки. */
  short: string;
  rows: VerbRow[];
}

/**
 * Вкладки карточки глагола: настоящее, прошедшее, будущее и повелительное (если оно есть у глагола).
 * Строки идут в порядке ключей из `VERB_FORM_KEYS`; формы, которых в данных нет, пропускаются.
 */
export function verbTabs(verb: VerbData): VerbTab[] {
  return VERB_TENSES.flatMap((tense) => {
    const set = verb[tense] as Record<string, WordForm> | undefined;
    if (!set) return [];
    const withPronoun = tense === "past" || tense === "future";
    const rows = VERB_FORM_KEYS[tense].flatMap((key): VerbRow[] => {
      const form = set[key];
      if (!form) return [];
      return [{ key, label: VERB_FORM_LABELS[tense][key] ?? key, pronoun: withPronoun ? VERB_PRONOUNS_HE[key] : undefined, form, book: isBookForm(tense, key) }];
    });
    return rows.length ? [{ tense, title: VERB_TENSE_TITLES[tense], short: VERB_TENSE_SHORT[tense], rows }] : [];
  });
}

/** Корень для показа: буквы через неразрывный дефис, чтобы не переносились («כ‑ת‑ב»). */
export function verbRootLabel(root: string): string {
  return [...root].join("‑");
}

/** Плашка над таблицей форм: название бинъяна по-русски, корень и (у слабого корня) тип гзары: «פ״נ» и «первая נ». */
export interface VerbBadge {
  binyan: string;
  root: string;
  gizra?: { he: string; ru: string }[];
}

export function verbBadge(verb: VerbData): VerbBadge {
  const badge: VerbBadge = { binyan: BINYANIM[verb.binyan]?.ru ?? verb.binyan, root: verbRootLabel(verb.root) };
  if (verb.gizra?.length) badge.gizra = verb.gizra.map((g) => ({ he: GIZRA_INFO[g]?.he ?? g, ru: GIZRA_INFO[g]?.ru ?? "" }));
  return badge;
}

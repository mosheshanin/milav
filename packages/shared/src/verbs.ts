import type { WordForm } from "./types";

// Глаголы (решения владельца, 14.10: CLAUDE.md, docs/CONTENT.md). У слова раздела «Глаголы» в `he` лежит инфинитив,
// а остальное (бинъян, корень, формы по временам) в блоке `verb`.

/** Бинъяны, с которых начинаем. Пуаль и хуфъаль (страдательные) добавим отдельным уроком: у них нет инфинитива. */
export const BINYAN_KEYS = ["paal", "nifal", "piel", "hifil", "hitpael"] as const;
export type Binyan = (typeof BINYAN_KEYS)[number];

export interface BinyanInfo {
  /** Название на экране. */
  ru: string;
  /** Название на иврите с огласовками. */
  he: string;
  /** Как начинается инфинитив этого бинъяна (проверка того, что бинъян указан верно). */
  infinitivePrefix: string;
  /** Как начинается причастие мужского рода единственного числа (настоящее время); у пааль приставки нет. */
  presentPrefix: string;
}

/**
 * Бинъяны и то, что видно в написании: у нифъаль, хифъиль и хитпаэль инфинитив начинается с לה, у нифъаль в настоящем
 * времени приставка נ, у пиэль, хифъиль и хитпаэль приставка מ. Тест сверяет это с формами и ловит неверный бинъян.
 */
export const BINYANIM: Readonly<Record<Binyan, BinyanInfo>> = {
  paal: { ru: "Пааль", he: "פָּעַל", infinitivePrefix: "ל", presentPrefix: "" },
  nifal: { ru: "Нифъаль", he: "נִפְעַל", infinitivePrefix: "לה", presentPrefix: "נ" },
  piel: { ru: "Пиэль", he: "פִּעֵל", infinitivePrefix: "ל", presentPrefix: "מ" },
  hifil: { ru: "Хифъиль", he: "הִפְעִיל", infinitivePrefix: "לה", presentPrefix: "מ" },
  hitpael: { ru: "Хитпаэль", he: "הִתְפַּעֵל", infinitivePrefix: "לה", presentPrefix: "מ" },
};

/**
 * Типы слабых корней (гзары, «גזרות»). Поле `gizra` у глагола необязательно: у сильных корней его нет. Составной случай
 * записывается двумя кодами, основной первым (יצא: pe_yod + lamed_alef; בוא: ayin_vav + lamed_alef). Для глаголов с `gizra`
 * проверка корня допускает отсутствие букв корня только там, где это положено типу (`gizraRootProblems` в content/rules.ts).
 * Формы таких глаголов вписываются вручную по учебной таблице (вопрос 54, 17.10).
 */
export const GIZRA_KEYS = ["pe_nun", "pe_yod", "pe_alef", "pe_lamed", "ayin_vav", "ayin_yod", "lamed_he", "lamed_alef"] as const;
export type Gizra = (typeof GIZRA_KEYS)[number];

export interface GizraInfo {
  /** Название на иврите (פ״נ). */
  he: string;
  /** Короткое пояснение по-русски. */
  ru: string;
  /** Номер буквы корня (с 0), которая должна быть у этого типа: проверяет, что тип указан верно. `letters`: какие буквы подходят. */
  position: number;
  letters: readonly string[];
}

export const GIZRA_INFO: Readonly<Record<Gizra, GizraInfo>> = {
  pe_nun: { he: "פ״נ", ru: "первая נ", position: 0, letters: ["נ"] },
  pe_yod: { he: "פ״י", ru: "первая י", position: 0, letters: ["י", "ה"] },
  pe_alef: { he: "פ״א", ru: "первая א", position: 0, letters: ["א"] },
  pe_lamed: { he: "פ״ל", ru: "первая ל (לקח)", position: 0, letters: ["ל"] },
  ayin_vav: { he: "ע״ו", ru: "средняя ו", position: 1, letters: ["ו"] },
  ayin_yod: { he: "ע״י", ru: "средняя י", position: 1, letters: ["י"] },
  lamed_he: { he: "ל״ה", ru: "последняя ה", position: 2, letters: ["ה"] },
  lamed_alef: { he: "ל״א", ru: "последняя א", position: 2, letters: ["א"] },
};

/** Тема со слабыми корнями (смешанные бинъяны, у каждого глагола есть `gizra`). */
export const WEAK_ROOTS_TOPIC_ID = "weak";

export function isGizra(value: string): value is Gizra {
  return (GIZRA_KEYS as readonly string[]).includes(value);
}

export const VERB_TENSES = ["present", "past", "future", "imperative"] as const;
export type VerbTense = (typeof VERB_TENSES)[number];

export const VERB_TENSE_TITLES: Readonly<Record<VerbTense, string>> = {
  present: "Настоящее",
  past: "Прошедшее",
  future: "Будущее",
  imperative: "Повелительное",
};

// Ключи форм: цифра это лицо, s единственное и p множественное число, m и f род.
// В настоящем времени и в повелительном наклонении лица нет, поэтому там только род и число.

/** Настоящее время (причастие): мужской и женский род, единственное и множественное число. */
export const PRESENT_KEYS = ["ms", "fs", "mp", "fp"] as const;
/** Прошедшее время: у 1-го лица и у 3-го лица множественного числа род не различается. */
export const PAST_KEYS = ["1s", "2ms", "2fs", "3ms", "3fs", "1p", "2mp", "2fp", "3p"] as const;
/** Будущее время: полная таблица, у 3-го лица множественного числа две формы. */
export const FUTURE_KEYS = ["1s", "2ms", "2fs", "3ms", "3fs", "1p", "2mp", "2fp", "3mp", "3fp"] as const;
/** Повелительное наклонение: у глагола его может не быть, поэтому весь блок необязателен. */
export const IMPERATIVE_KEYS = ["ms", "fs", "mp", "fp"] as const;

export type PresentKey = (typeof PRESENT_KEYS)[number];
export type PastKey = (typeof PAST_KEYS)[number];
export type FutureKey = (typeof FUTURE_KEYS)[number];
export type ImperativeKey = (typeof IMPERATIVE_KEYS)[number];

export const VERB_FORM_KEYS: Readonly<Record<VerbTense, readonly string[]>> = {
  present: PRESENT_KEYS,
  past: PAST_KEYS,
  future: FUTURE_KEYS,
  imperative: IMPERATIVE_KEYS,
};

/** Подписи форм на экране: кто совершает действие. */
export const VERB_FORM_LABELS: Readonly<Record<VerbTense, Readonly<Record<string, string>>>> = {
  present: { ms: "м. р., ед. ч.", fs: "ж. р., ед. ч.", mp: "м. р., мн. ч.", fp: "ж. р., мн. ч." },
  past: {
    "1s": "я",
    "2ms": "ты (м.)",
    "2fs": "ты (ж.)",
    "3ms": "он",
    "3fs": "она",
    "1p": "мы",
    "2mp": "вы (м.)",
    "2fp": "вы (ж.)",
    "3p": "они",
  },
  future: {
    "1s": "я",
    "2ms": "ты (м.)",
    "2fs": "ты (ж.)",
    "3ms": "он",
    "3fs": "она",
    "1p": "мы",
    "2mp": "вы (м.)",
    "2fp": "вы (ж.)",
    "3mp": "они (м.)",
    "3fp": "они (ж.)",
  },
  imperative: { ms: "ты (м.)", fs: "ты (ж.)", mp: "вы (м.)", fp: "вы (ж.)" },
};

/** Местоимения иврита к формам прошедшего и будущего времени (в настоящем и повелительном их нет). */
export const VERB_PRONOUNS_HE: Readonly<Record<string, string>> = {
  "1s": "אני",
  "2ms": "אתה",
  "2fs": "את",
  "3ms": "הוא",
  "3fs": "היא",
  "1p": "אנחנו",
  "2mp": "אתם",
  "2fp": "אתן",
  "3p": "הם/הן",
  "3mp": "הם",
  "3fp": "הן",
};

/** Данные глагола. Основная форма (инфинитив) лежит в самом слове: `Word.he`. */
export interface VerbData {
  binyan: Binyan;
  /** Корень: 3–4 буквы иврита без конечных форм, например «כתב». */
  root: string;
  /** Тип слабого корня (1–2 кода). У сильных корней нет. */
  gizra?: Gizra[];
  present: Record<PresentKey, WordForm>;
  past: Record<PastKey, WordForm>;
  future: Record<FutureKey, WordForm>;
  imperative?: Record<ImperativeKey, WordForm>;
}

/** Одна форма глагола вместе с тем, где она лежит. */
export interface VerbFormEntry {
  tense: VerbTense;
  key: string;
  form: WordForm;
}

/** Все формы глагола по порядку: настоящее, прошедшее, будущее, повелительное (если есть). */
export function verbForms(verb: VerbData): VerbFormEntry[] {
  const entries: VerbFormEntry[] = [];
  for (const tense of VERB_TENSES) {
    const set = verb[tense] as Record<string, WordForm> | undefined;
    if (!set) continue;
    for (const key of VERB_FORM_KEYS[tense]) {
      const form = set[key];
      if (form) entries.push({ tense, key, form });
    }
  }
  return entries;
}

/**
 * Книжные формы (вопрос 31, решение владельца 17.10): будущее «вы (ж.)» и «они (ж.)» (תכתובנה) и повелительное «вы (ж.)»
 * (כתובנה). В речи их почти не говорят, вместо них звучат формы мужского рода. На карточке они остаются с пометкой
 * «книжн.», а в «Практике форм» и в повторении не спрашиваются. В данных уроков они есть, как и раньше.
 */
export const BOOK_FORMS: Readonly<Partial<Record<VerbTense, readonly string[]>>> = {
  future: ["2fp", "3fp"],
  imperative: ["fp"],
};

export function isBookForm(tense: VerbTense, key: string): boolean {
  return BOOK_FORMS[tense]?.includes(key) ?? false;
}

/** Формы, которые спрашиваем в упражнениях: все, кроме книжных. */
export function spokenVerbForms(verb: VerbData): VerbFormEntry[] {
  return verbForms(verb).filter((e) => !isBookForm(e.tense, e.key));
}

/** Сколько форм у полного глагола: 4 + 9 + 10 + 4. */
export const VERB_FORMS_TOTAL =
  PRESENT_KEYS.length + PAST_KEYS.length + FUTURE_KEYS.length + IMPERATIVE_KEYS.length;

/** Путь к озвучке формы: `/audio/<id слова>-form-<время>-<ключ>.mp3`. Так же называет файлы скрипт озвучки. */
export function verbFormAudioPath(wordId: string, tense: VerbTense, key: string): string {
  return `/audio/${wordId}-form-${tense}-${key}.mp3`;
}

export function isBinyan(value: string): value is Binyan {
  return (BINYAN_KEYS as readonly string[]).includes(value);
}

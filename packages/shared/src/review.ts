// Проверка контента носителем в приложении (панель, этап 3: docs/ADMIN.md, «Этап 3: как сделано»).
//
// Проверяющий смотрит слово или букву и ставит «верно» либо предлагает исправления по полям и пишет комментарий.
// Отзывы копятся в базе (content_reviews) и уроки сами не меняют: контент живёт в репозитории, правки переносит
// Claude инструментом `npm run content:reviews` (tools/content-reviews.ts). Один и тот же код здесь описывает поля
// для панели, проверяет отзыв на сервере и применяет правки в инструменте.
import { isLetter } from "./alphabet";
import type { Gender, Letter, Reviewed, StudyItem, Word } from "./types";
import { VERB_FORM_KEYS, VERB_FORM_LABELS, VERB_TENSES, VERB_TENSE_TITLES } from "./verbs";

/** Отзыв: «верно» или «есть замечания» (исправления по полям и/или комментарий). */
export type ReviewVerdict = "ok" | "fix";
export const REVIEW_VERDICTS: readonly ReviewVerdict[] = ["ok", "fix"];

/**
 * Состояние слова для проверяющего:
 * - `new`: не проверено (ни отзыва, ни отметки в уроке);
 * - `fix`: есть замечания, ждут переноса в урок;
 * - `ok`: отмечено «верно», ждёт переноса в урок;
 * - `done`: проверено, отметка `reviewed` уже в уроке.
 */
export type ReviewStatus = "new" | "fix" | "ok" | "done";
export const REVIEW_STATUS_TITLES: Record<ReviewStatus, string> = {
  new: "Не проверено",
  fix: "Есть замечания",
  ok: "Верно, ждёт переноса",
  done: "Проверено",
};

/** Предел длины исправленного значения и комментария (знаков). */
export const REVIEW_VALUE_MAX = 200;
export const REVIEW_COMMENT_MAX = 1000;

/** Поле, которое проверяющий может исправить. `path` это путь в JSON урока: `niqqud`, `example.ru`, `verb.past.3ms.he`. */
export interface ReviewField {
  path: string;
  /** Группа на экране: «Слово», «Фраза», «Прошедшее» и т. п. */
  group: string;
  /** Подпись поля внутри группы. */
  label: string;
  value: string;
  /** Как показывать и вводить: иврит (справа налево), род (выбор м/ж) или обычный текст. */
  kind: "he" | "gender" | "text";
}

const GENDER_TITLES: Record<Gender, string> = { m: "мужской", f: "женский" };

/** Подпись значения рода: «мужской» вместо «m». Остальные значения как есть. */
export function reviewValueTitle(field: Pick<ReviewField, "kind">, value: string): string {
  return field.kind === "gender" ? (GENDER_TITLES[value as Gender] ?? value) : value;
}

/** Озвучка создаётся из этих полей: после их правки файл нужно переозвучить (docs/AUDIO.md). */
export function isVoicedPath(path: string): boolean {
  return (
    path === "niqqud" ||
    path === "example.he" ||
    path === "example.niqqud" ||
    path === "example.female.he" ||
    path === "example.female.niqqud" ||
    path === "name.niqqud" ||
    /^(forms|verb\.\w+)\.\w+\.niqqud$/.test(path)
  );
}

function wordFields(word: Word): ReviewField[] {
  const out: ReviewField[] = [];
  const add = (group: string, path: string, label: string, value: string | undefined, kind: ReviewField["kind"] = "text") => {
    if (value !== undefined) out.push({ path, group, label, value, kind });
  };
  add("Слово", "he", "Иврит", word.he, "he");
  add("Слово", "niqqud", "С огласовками", word.niqqud, "he");
  add("Слово", "translit", "Транскрипция", word.translit);
  add("Слово", "ru", "Перевод", word.ru);
  add("Слово", "gender", "Род", word.gender, "gender");
  if (word.example) {
    add("Фраза", "example.he", "Иврит", word.example.he, "he");
    add("Фраза", "example.translit", "Транскрипция", word.example.translit);
    add("Фраза", "example.ru", "Перевод", word.example.ru);
    // Фраза от первого лица: основная мужская, рядом женский вариант (docs/CONTENT.md, «Фразы от первого лица»).
    const female = word.example.female;
    if (female) {
      add("Фраза (говорит женщина)", "example.female.he", "Иврит", female.he, "he");
      add("Фраза (говорит женщина)", "example.female.translit", "Транскрипция", female.translit);
      add("Фраза (говорит женщина)", "example.female.ru", "Перевод", female.ru);
    }
  }
  if (word.forms) {
    const titles = { f: "Ж. р.", mp: "Мн. ч., м. р.", fp: "Мн. ч., ж. р." } as const;
    for (const key of ["f", "mp", "fp"] as const) {
      const form = word.forms[key];
      add("Формы", `forms.${key}.he`, `${titles[key]}: иврит`, form.he, "he");
      add("Формы", `forms.${key}.niqqud`, `${titles[key]}: с огласовками`, form.niqqud, "he");
      add("Формы", `forms.${key}.translit`, `${titles[key]}: транскрипция`, form.translit);
    }
  }
  if (word.verb) {
    add("Слово", "verb.root", "Корень", word.verb.root, "he");
    for (const tense of VERB_TENSES) {
      const set = word.verb[tense] as Record<string, { he: string; niqqud: string; translit: string }> | undefined;
      if (!set) continue;
      for (const key of VERB_FORM_KEYS[tense]) {
        const form = set[key];
        if (!form) continue;
        const who = VERB_FORM_LABELS[tense][key] ?? key;
        add(VERB_TENSE_TITLES[tense], `verb.${tense}.${key}.he`, `${who}: иврит`, form.he, "he");
        add(VERB_TENSE_TITLES[tense], `verb.${tense}.${key}.niqqud`, `${who}: с огласовками`, form.niqqud, "he");
        add(VERB_TENSE_TITLES[tense], `verb.${tense}.${key}.translit`, `${who}: транскрипция`, form.translit);
      }
    }
  }
  return out;
}

function letterFields(letter: Letter): ReviewField[] {
  const f = (group: string, path: string, label: string, value: string, kind: ReviewField["kind"] = "text"): ReviewField => ({ path, group, label, value, kind });
  return [
    f("Название", "name.he", "Иврит", letter.name.he, "he"),
    f("Название", "name.niqqud", "С огласовками", letter.name.niqqud, "he"),
    f("Название", "name.ru", "По-русски", letter.name.ru),
    f("Название", "sound", "Звук", letter.sound),
    f("Слово-пример", "example.he", "Иврит", letter.example.he, "he"),
    f("Слово-пример", "example.niqqud", "С огласовками", letter.example.niqqud, "he"),
    f("Слово-пример", "example.translit", "Транскрипция", letter.example.translit),
    f("Слово-пример", "example.ru", "Перевод", letter.example.ru),
  ];
}

/** Поля слова или буквы, которые можно исправить, в порядке показа. Озвучка, картинка и id сюда не входят. */
export function reviewFields(item: StudyItem): ReviewField[] {
  return isLetter(item) ? letterFields(item) : wordFields(item);
}

/** JSON с ключами по алфавиту и без озвучки и картинок: от них проверка носителем не зависит. */
function stableText(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableText).join(",")}]`;
  if (value && typeof value === "object") {
    const keys = Object.keys(value as object)
      .filter((k) => k !== "audio" && k !== "image" && (value as Record<string, unknown>)[k] !== undefined)
      .sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${stableText((value as Record<string, unknown>)[k])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

/**
 * Отпечаток слова (буквы): меняется при любой правке текста и отметки `reviewed`, но не при добавлении озвучки
 * или картинки. Отзыв хранит отпечаток того, что видел проверяющий. Когда правки перенесли в урок (или слово
 * поменяли по другой причине), отпечаток меняется и отзыв уходит из «ждут переноса» в историю.
 * Хэш cyrb53, 14 шестнадцатеричных знаков: для сравнения версий этого достаточно.
 */
export function reviewFingerprint(item: StudyItem): string {
  const text = stableText(item);
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).padStart(14, "0");
}

/** Отзыв, как его присылает приложение (PUT /api/review/items/:id). */
export interface ReviewSaveRequest {
  verdict: ReviewVerdict;
  /** Исправления: путь поля → новое значение. Только при `fix`. */
  fixes?: Record<string, string>;
  comment?: string;
  /** Отпечаток слова, которое видел проверяющий (из GET /api/review/items/:id). */
  version: string;
}

export type ReviewCheck =
  | { ok: true; verdict: ReviewVerdict; fixes: Record<string, string>; comment: string }
  | { ok: false; error: "bad_verdict" | "bad_field" | "bad_value" | "same_value" | "too_long" | "empty_fix" | "fixes_with_ok" };

// Управляющие символы (кроме перевода строки в комментарии) в контент не пускаем.
const CONTROL = /[\u0000-\u0008\u000b-\u001f\u007f]/;

/** Проверяет отзыв против полей слова. Значения обрезаются по краям; то же значение, что в уроке, это ошибка. */
export function checkReview(item: StudyItem, body: Partial<ReviewSaveRequest> | null | undefined): ReviewCheck {
  if (!REVIEW_VERDICTS.includes(body?.verdict as ReviewVerdict)) return { ok: false, error: "bad_verdict" };
  const verdict = body!.verdict as ReviewVerdict;
  const rawComment = body!.comment ?? "";
  if (typeof rawComment !== "string" || CONTROL.test(rawComment.replace(/[\n\t]/g, ""))) return { ok: false, error: "bad_value" };
  const comment = rawComment.trim();
  if (comment.length > REVIEW_COMMENT_MAX) return { ok: false, error: "too_long" };

  const rawFixes = body!.fixes ?? {};
  if (typeof rawFixes !== "object" || rawFixes === null || Array.isArray(rawFixes)) return { ok: false, error: "bad_field" };
  const fields = new Map(reviewFields(item).map((f) => [f.path, f]));
  const fixes: Record<string, string> = {};
  for (const [path, raw] of Object.entries(rawFixes)) {
    const field = fields.get(path);
    if (!field) return { ok: false, error: "bad_field" };
    if (typeof raw !== "string" || CONTROL.test(raw) || /\n/.test(raw)) return { ok: false, error: "bad_value" };
    const value = raw.trim();
    if (value.length === 0) return { ok: false, error: "bad_value" };
    if (value.length > REVIEW_VALUE_MAX) return { ok: false, error: "too_long" };
    if (field.kind === "gender" && value !== "m" && value !== "f") return { ok: false, error: "bad_value" };
    if (value === field.value) return { ok: false, error: "same_value" };
    fixes[path] = value;
  }

  const hasFixes = Object.keys(fixes).length > 0;
  if (verdict === "ok" && hasFixes) return { ok: false, error: "fixes_with_ok" };
  if (verdict === "fix" && !hasFixes && comment.length === 0) return { ok: false, error: "empty_fix" };
  return { ok: true, verdict, fixes, comment };
}

/**
 * Применяет исправления к копии слова (буквы). Пути берутся только из `reviewFields`, поэтому новых полей не появится.
 * Возвращает новую копию; исходное слово не меняется.
 */
export function applyReviewFixes<T extends StudyItem>(item: T, fixes: Record<string, string>): T {
  const copy = JSON.parse(JSON.stringify(item)) as Record<string, unknown>;
  const known = new Set(reviewFields(item).map((f) => f.path));
  for (const [path, value] of Object.entries(fixes)) {
    if (!known.has(path)) throw new Error(`неизвестное поле ${path}`);
    const parts = path.split(".");
    let node = copy;
    for (const part of parts.slice(0, -1)) node = node[part] as Record<string, unknown>;
    node[parts[parts.length - 1]!] = value;
  }
  return copy as unknown as T;
}

/** Состояние слова по отзывам, которые относятся к его текущей версии, и по отметке в уроке. */
export function reviewStatusOf(reviewed: false | Reviewed, currentVerdicts: readonly ReviewVerdict[]): ReviewStatus {
  if (currentVerdicts.includes("fix")) return "fix";
  if (currentVerdicts.includes("ok")) return "ok";
  return reviewed === false ? "new" : "done";
}

// ---- Ответы API проверки ----

/** Строка списка: главное о слове или букве, без всех полей. */
export interface ReviewListItem {
  id: string;
  kind: "word" | "letter";
  lessonId: string;
  he: string;
  translit: string;
  ru: string;
  /** Есть ли картинка (у буквы картинка слова-примера). */
  hasImage: boolean;
  status: ReviewStatus;
  /** Мой отзыв на текущую версию, если есть. */
  mine: ReviewVerdict | null;
  /** Кто и когда проверил, если отметка уже в уроке. */
  reviewed: false | Reviewed;
}

export interface ReviewListLesson {
  id: string;
  /** «Животные · 1. Знакомые животные». */
  title: string;
}

export interface ReviewListResponse {
  lessons: ReviewListLesson[];
  items: ReviewListItem[];
  /** Сколько отзывов ждут переноса в уроки (у всех проверяющих). */
  pending: number;
}

/** Один отзыв на слово. */
export interface ReviewEntry {
  reviewer: number;
  reviewerName: string | null;
  verdict: ReviewVerdict;
  fixes: Record<string, string>;
  comment: string;
  /** Секунды Unix. */
  at: number;
  /** Отзыв относится к текущей версии слова (ещё не перенесён); иначе это история. */
  current: boolean;
  mine: boolean;
}

export interface ReviewItemResponse {
  item: StudyItem;
  lessonId: string;
  lessonTitle: string;
  /** Отпечаток текущей версии: его приложение присылает вместе с отзывом. */
  version: string;
  reviews: ReviewEntry[];
}

/** Выгрузка для переноса в уроки (только администраторы): отзывы на текущие версии слов. */
export interface ReviewExportItem {
  itemId: string;
  lessonId: string;
  version: string;
  reviewer: number;
  reviewerName: string | null;
  verdict: ReviewVerdict;
  fixes: Record<string, string>;
  comment: string;
  /** Дата отзыва по Иерусалиму, `YYYY-MM-DD`: она пойдёт в `reviewed.at`. */
  date: string;
}

export interface ReviewExportResponse {
  /** Секунды Unix. */
  exportedAt: number;
  items: ReviewExportItem[];
}

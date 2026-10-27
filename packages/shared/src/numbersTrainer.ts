// Тренажёр «Числа на слух» (docs/SPEC.md, «Тренажёр «Числа на слух»»): уровни, задания, проверка набранного и сказанного.
// Как и «Практика форм», тренажёр ничего не сохраняет и не меняет очки, цель дня, ритм, бейджи и статус. Логика чистая
// (случайность подставляется снаружи), чтобы проверять её тестами без браузера.
import { normalizeWords, speechMatchDetail } from "./hebrew";
import { shuffle, type Random } from "./formsPractice";
import {
  MAX_SPOKEN_NUMBER,
  TIME_MINUTES,
  numberPiece,
  spellAge,
  spellDigits,
  spellFloor,
  spellNumber,
  spellNumberIds,
  spellPrice,
  spellPriceIds,
  spellTime,
  spellTimeIds,
  type SpokenNumber,
} from "./numbers";

/** Заданий в одном подходе. */
export const NUMBERS_ROUND = 10;
/** Какие по счёту (с нуля) задания подхода «сказать вслух», если микрофон включён: 3, 6 и 9-е. */
export const NUMBERS_SAY_SLOTS: readonly number[] = [2, 5, 8];
/** Попыток на задание «сказать вслух». */
export const NUMBERS_SAY_ATTEMPTS = 2;
/** Сколько раз в день сервер проверяет речь в тренажёре (сверх общего лимита `speech`; квота Whisper, вопрос 91). */
export const NUMBERS_SPEECH_PER_DAY = 30;

export type NumberLevelId = "basic" | "tens" | "hundreds" | "thousands" | "price" | "time" | "phone" | "life";

/** Что называют: число само по себе, цену, время, номер телефона, этаж или возраст. */
export type NumberScene = "number" | "price" | "time" | "phone" | "floor" | "age";

export interface NumberLevel {
  id: NumberLevelId;
  title: string;
  /** Одна строка: что тренируем. */
  hint: string;
  /** Есть ли в уровне задания «сказать вслух» (номер телефона вслух не проверяем). */
  canSay: boolean;
}

/** Уровни в рекомендуемом порядке; открыты все сразу, порядок только подсказка (решение 27.10). */
export const NUMBER_LEVELS: readonly NumberLevel[] = [
  { id: "basic", title: "От 0 до 10", hint: "Счёт без предмета: 0, 1, 2 … 10", canSay: true },
  { id: "tens", title: "От 11 до 99", hint: "Числа 11–19 и десятки с единицами: 47, 62, 15", canSay: true },
  { id: "hundreds", title: "Сотни", hint: "Числа от 100 до 999: 125, 300, 870", canSay: true },
  { id: "thousands", title: "Тысячи", hint: "Числа от 1000 до 9999: 1500, 2024, 7300", canSay: true },
  { id: "price", title: "Сколько стоит?", hint: "Цены в шекелях. Числа при мужском слове «шекель» звучат в мужском роде", canSay: true },
  { id: "time", title: "Который час?", hint: "Время: три с половиной, без четверти пять", canSay: true },
  { id: "phone", title: "Номер телефона", hint: "Цифры по одной, группами, женским счётом", canSay: false },
  { id: "life", title: "Этаж и возраст", hint: "«На каком этаже?» и «Сколько вам лет?»", canSay: true },
];

export const numberLevel = (id: NumberLevelId): NumberLevel => NUMBER_LEVELS.find((l) => l.id === id)!;

/** Что назвали. У времени час 1–12 и минуты кратные пяти; у телефона цифры без дефисов. */
export type NumberTarget =
  | { scene: "number" | "price" | "floor" | "age"; value: number }
  | { scene: "time"; hour: number; minute: number }
  | { scene: "phone"; digits: string };

export interface NumberTask {
  /** `hear`: услышать и набрать цифрами; `say`: увидеть цифры и сказать вслух. */
  mode: "hear" | "say";
  level: NumberLevelId;
  target: NumberTarget;
  /** У возраста: «בן» или «בת». */
  who?: "ben" | "bat";
}

// ---------- Что показать ----------

/** Цифры для показа: «1,250», «47 ₪», «3:35», «054-123-4567». */
export function formatTarget(target: NumberTarget): string {
  switch (target.scene) {
    case "time":
      return `${target.hour}:${String(target.minute).padStart(2, "0")}`;
    case "phone":
      return `${target.digits.slice(0, 3)}-${target.digits.slice(3, 6)}-${target.digits.slice(6)}`;
    case "price":
      return `${group(target.value)} ₪`;
    default:
      return group(target.value);
  }
}

/** Тысячи через запятую: 1250 → «1,250». */
function group(n: number): string {
  return n >= 1000 ? `${Math.floor(n / 1000)},${String(n % 1000).padStart(3, "0")}` : String(n);
}

/** Какими кусками и словами называется задание. */
export function spokenTarget(task: Pick<NumberTask, "target" | "who">): SpokenNumber {
  const { target } = task;
  switch (target.scene) {
    case "number":
      return spellNumber(target.value, "f");
    case "price":
      return spellPrice(target.value);
    case "time":
      return spellTime(target.hour, target.minute);
    case "phone":
      return spellDigits(target.digits);
    case "floor":
      return spellFloor(target.value);
    case "age":
      return spellAge(target.value, task.who ?? "ben");
  }
}

/** Вопрос на экране. */
export function sceneQuestion(task: Pick<NumberTask, "mode" | "target">): string {
  const say = task.mode === "say";
  switch (task.target.scene) {
    case "price":
      return say ? "Назовите цену вслух" : "Продавец называет цену. Сколько стоит?";
    case "time":
      return say ? "Скажите вслух, сколько времени" : "Который час?";
    case "phone":
      return "Вам диктуют номер телефона. Запишите его";
    case "floor":
      return say ? "Скажите вслух номер этажа" : "На каком этаже?";
    case "age":
      return say ? "Скажите вслух возраст" : "Сколько ему (ей) лет?";
    default:
      return say ? "Скажите число вслух" : "Какое это число?";
  }
}

/** Сколько знаков в ответе, который набирают (кнопки цифр заблокируются дальше). */
export function answerMaxLength(target: NumberTarget): number {
  switch (target.scene) {
    case "time":
      return 5;
    case "phone":
      return 10;
    default:
      return 4;
  }
}

/** Как называется род числа в подсказке под ответом: коротко, для объяснения «почему так звучит». */
export function genderNote(target: NumberTarget): string | null {
  switch (target.scene) {
    case "price":
      return "«Шекель» мужского рода, поэтому числа 1–10 и 11–19 звучат в мужском роде (шлоша шекалим). Сотни и тысячи не меняются.";
    case "number":
    case "phone":
    case "time":
    case "floor":
    case "age":
      return "Счёт без предмета, время, возраст и этаж говорят женским счётом (шалош, а не шлоша).";
  }
}

// ---------- Проверка набранного ----------

/**
 * Набранный ответ верный? Лишние пробелы, запятые и дефисы не мешают, у обычных чисел ведущие нули тоже
 * (047 это 47). Время: «3:35» и «15:35» оба верны для 3:35 (на слух неважно, до обеда или после), номер телефона точно.
 */
export function checkTyped(target: NumberTarget, typed: string): boolean {
  const cleaned = typed.replace(/[\s, -]/g, "");
  if (!cleaned) return false;
  if (target.scene === "time") {
    const m = cleaned.match(/^(\d{1,2})[:.](\d{2})$/);
    if (!m) return false;
    const hour = Number(m[1]);
    const minute = Number(m[2]);
    return hour <= 23 && minute <= 59 && hour % 12 === target.hour % 12 && minute === target.minute;
  }
  if (!/^\d+$/.test(cleaned)) return false;
  if (target.scene === "phone") return cleaned === target.digits;
  return Number(cleaned) === target.value;
}

// ---------- Проверка сказанного ----------

/** Соседние числа, которые легко принять за это: ±1, ±10, 13 и 30, 15 и 50. Услышанное, которое ближе к соседу, не засчитывается. */
export function confusableValues(value: number): number[] {
  const out = new Set<number>([value - 1, value + 1, value - 10, value + 10]);
  if (value >= 11 && value <= 19) out.add((value - 10) * 10);
  if (value >= 20 && value <= 90 && value % 10 === 0) out.add(value / 10 + 10);
  out.delete(value);
  return [...out].filter((n) => n >= 0 && n <= MAX_SPOKEN_NUMBER);
}

const phrase = (ids: readonly string[]): string => ids.map((id) => numberPiece(id).he).join(" ");

/** Как верно сказать число: оба рода (разговорная речь путает их, и это не ошибка слуха). */
function numberPhrases(value: number): string[] {
  return [...new Set([phrase(spellNumberIds(value, "f")), phrase(spellNumberIds(value, "m"))])];
}

/**
 * Ивритские фразы, которые засчитываются за ответ, и фразы-соседи, которые нет.
 * Сосед, который целиком входит в верную фразу («ארבע בלי עשרים» в «ארבע בלי עשרים וחמש»), не считается: иначе верный ответ
 * содержал бы «чужую» фразу и отвергался.
 */
export function expectedPhrases(target: NumberTarget): { ok: string[]; rivals: string[] } {
  let ok: string[];
  let rivals: string[];
  if (target.scene === "phone") return { ok: [], rivals: [] };
  if (target.scene === "time") {
    ok = [phrase(spellTimeIds(target.hour, target.minute, { hashaa: false }))];
    rivals = [];
    for (const minute of [target.minute - 5, target.minute + 5]) {
      if (TIME_MINUTES.includes(minute)) rivals.push(phrase(spellTimeIds(target.hour, minute, { hashaa: false })));
    }
    for (const hour of [target.hour === 1 ? 12 : target.hour - 1, target.hour === 12 ? 1 : target.hour + 1]) {
      rivals.push(phrase(spellTimeIds(hour, target.minute, { hashaa: false })));
    }
  } else {
    ok = numberPhrases(target.value);
    // Цену говорят со словом «шекелей» и с формой перед существительным («שני שקלים», «עשרים ושני»): всё это верно.
    if (target.scene === "price") {
      const ids = spellPriceIds(target.value);
      ok = [...new Set([phrase(ids), phrase(ids.slice(0, -1)), ...ok, ...(target.value === 1 ? ["שקל"] : [])])];
    }
    rivals = confusableValues(target.value).flatMap(numberPhrases);
  }
  const glued = (text: string) => normalizeWords(text).replaceAll(" ", "");
  const okKeys = ok.map(glued);
  return { ok, rivals: rivals.filter((r) => !okKeys.some((key) => key.includes(glued(r)))) };
}

export interface NumberSpeechVerdict {
  match: boolean;
  /** Засчитано по цифрам: Whisper записал число цифрами. */
  digits?: true;
}

/** Цифры из услышанного: «1,250» и «1 250» склеиваются в 1250. */
function digitGroups(heard: string): string[] {
  return heard.replace(/(\d)[,  ](?=\d{3}(?!\d))/g, "$1").match(/\d+/g) ?? [];
}

/**
 * Сказанное вслух засчитывается, если Whisper записал число цифрами (или время как «3:35») или ивритом словами,
 * близкими по звучанию к одному из верных вариантов, а не к соседнему числу.
 */
export function checkSpoken(target: NumberTarget, heard: string): NumberSpeechVerdict {
  if (target.scene === "phone") return { match: false };
  if (target.scene === "time") {
    for (const m of heard.matchAll(/(\d{1,2})\s*[:.]\s*(\d{2})/g)) {
      const hour = Number(m[1]);
      const minute = Number(m[2]);
      if (hour <= 23 && minute <= 59 && hour % 12 === target.hour % 12 && minute === target.minute) return { match: true, digits: true };
    }
  } else if (digitGroups(heard).some((d) => Number(d) === target.value)) {
    return { match: true, digits: true };
  }
  const { ok, rivals } = expectedPhrases(target);
  return { match: ok.some((expected) => speechMatchDetail(heard, expected, rivals).match) };
}

// ---------- Составление подхода ----------

const randomInt = (rng: Random, min: number, max: number): number => min + Math.floor(rng() * (max - min + 1));

/** Ещё не использованное число из выбора `pick`; после десяти неудач берёт последнее (диапазон мал). */
function unique<T>(pick: () => T, used: Set<string>, key: (v: T) => string): T {
  let v = pick();
  for (let i = 0; i < 20 && used.has(key(v)); i++) v = pick();
  used.add(key(v));
  return v;
}

const MOBILE_PREFIX = [0, 2, 3, 4, 5, 8];

function makeTargets(level: NumberLevelId, rng: Random): { target: NumberTarget; who?: "ben" | "bat" }[] {
  const used = new Set<string>();
  const out: { target: NumberTarget; who?: "ben" | "bat" }[] = [];
  const add = (t: NumberTarget, who?: "ben" | "bat") => out.push({ target: t, ...(who ? { who } : {}) });
  const num = (scene: "number" | "price", pick: () => number) => add({ scene, value: unique(pick, used, String) });
  switch (level) {
    case "basic":
      for (const value of shuffle([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10], rng).slice(0, NUMBERS_ROUND)) add({ scene: "number", value });
      break;
    case "tens":
      for (let i = 0; i < 3; i++) num("number", () => randomInt(rng, 11, 19));
      for (let i = 0; i < 7; i++) num("number", () => randomInt(rng, 20, 99));
      break;
    case "hundreds":
      for (let i = 0; i < 2; i++) num("number", () => randomInt(rng, 1, 9) * 100);
      for (let i = 0; i < 8; i++) num("number", () => randomInt(rng, 101, 999));
      break;
    case "thousands":
      for (let i = 0; i < 2; i++) num("number", () => randomInt(rng, 1, 9) * 1000);
      for (let i = 0; i < 8; i++) num("number", () => randomInt(rng, 1001, MAX_SPOKEN_NUMBER));
      break;
    case "price":
      for (let i = 0; i < 6; i++) num("price", () => randomInt(rng, 3, 99));
      for (let i = 0; i < 4; i++) num("price", () => randomInt(rng, 100, 999));
      break;
    case "time":
      for (let i = 0; i < NUMBERS_ROUND; i++) {
        const t = unique(
          () => ({ hour: randomInt(rng, 1, 12), minute: TIME_MINUTES[randomInt(rng, 0, TIME_MINUTES.length - 1)]! }),
          used,
          (v) => `${v.hour}:${v.minute}`,
        );
        add({ scene: "time", ...t });
      }
      break;
    case "phone":
      for (let i = 0; i < NUMBERS_ROUND; i++) {
        const digits = unique(
          () => `05${MOBILE_PREFIX[randomInt(rng, 0, MOBILE_PREFIX.length - 1)]}${String(randomInt(rng, 0, 9_999_999)).padStart(7, "0")}`,
          used,
          String,
        );
        add({ scene: "phone", digits });
      }
      break;
    case "life":
      for (let i = 0; i < 5; i++) add({ scene: "floor", value: unique(() => randomInt(rng, 1, 25), used, (v) => `f${v}`) });
      for (let i = 0; i < 5; i++) add({ scene: "age", value: unique(() => randomInt(rng, 5, 95), used, (v) => `a${v}`) }, rng() < 0.5 ? "ben" : "bat");
      break;
  }
  return out;
}

/**
 * Подход из десяти заданий. При включённом микрофоне 3-е, 6-е и 9-е задания «сказать вслух» (кроме телефона), остальные «услышать
 * и набрать». Без микрофона все задания на слух. Порядок перемешан.
 */
export function buildNumbersRound(level: NumberLevelId, rng: Random, options: { speech: boolean }): NumberTask[] {
  const targets = shuffle(makeTargets(level, rng), rng);
  const say = options.speech && numberLevel(level).canSay;
  return targets.map(({ target, who }, index) => ({
    mode: say && NUMBERS_SAY_SLOTS.includes(index) ? "say" : "hear",
    level,
    target,
    ...(who ? { who } : {}),
  }));
}

/** Короткий вывод по итогу подхода. */
export function numbersVerdict(right: number, total: number): string {
  if (total === 0) return "";
  if (right === total) return "Без ошибок. Так и слышат израильтяне!";
  if (right / total >= 0.8) return "Очень хорошо. Разберите ошибки и можно дальше.";
  if (right / total >= 0.5) return "Неплохо. Послушайте числа, где ошиблись, и повторите подход.";
  return "Пока трудно, это нормально. Попробуйте уровень полегче или послушайте числа ещё раз.";
}

/** Адрес запроса проверки речи для задания: обратное к `parseNumberTarget`. Телефон вслух не проверяется. */
export function numberTargetQuery(target: NumberTarget): string {
  if (target.scene === "time") return `scene=time&hour=${target.hour}&minute=${target.minute}`;
  if (target.scene === "phone") throw new Error("Номер телефона вслух не проверяется");
  return `scene=${target.scene}&value=${target.value}`;
}

/** Проверка запроса к серверу: что присланное задание допустимо (границы чисел, цифры телефона). */
export function parseNumberTarget(scene: string | undefined, value: string | undefined, hour?: string, minute?: string): NumberTarget | null {
  if (scene === "time") {
    const h = Number(hour);
    const m = Number(minute);
    if (!Number.isInteger(h) || h < 1 || h > 12 || !TIME_MINUTES.includes(m)) return null;
    return { scene: "time", hour: h, minute: m };
  }
  if (scene === "number" || scene === "price" || scene === "floor" || scene === "age") {
    if (!/^\d{1,4}$/.test(value ?? "")) return null;
    const n = Number(value);
    if (n > MAX_SPOKEN_NUMBER || (scene === "price" && n < 1)) return null;
    return { scene, value: n };
  }
  return null;
}

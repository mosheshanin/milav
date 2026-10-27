import { describe, expect, it } from "vitest";
import {
  NUMBERS_ROUND,
  NUMBERS_SAY_SLOTS,
  NUMBERS_SPEECH_PER_DAY,
  NUMBER_LEVELS,
  answerMaxLength,
  buildNumbersRound,
  checkSpoken,
  checkTyped,
  confusableValues,
  expectedPhrases,
  formatTarget,
  numberTargetQuery,
  numbersVerdict,
  parseNumberTarget,
  sceneQuestion,
  spokenTarget,
  type NumberLevelId,
  type NumberTarget,
} from "./numbersTrainer";
import { RATE_LIMITS } from "./constants";

/** Предсказуемый «случайный» источник (линейный конгруэнтный), чтобы подходы были воспроизводимы. */
const seeded = (seed: number) => {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
};

const num = (value: number): NumberTarget => ({ scene: "number", value });
const time = (hour: number, minute: number): NumberTarget => ({ scene: "time", hour, minute });

describe("лимиты тренажёра", () => {
  it("суточный потолок проверок речи в RATE_LIMITS совпадает с константой", () => {
    expect(RATE_LIMITS.numbers.perDay).toBe(NUMBERS_SPEECH_PER_DAY);
  });
});

describe("показ цифр", () => {
  it("тысячи через запятую, цена с шекелем, время, телефон группами", () => {
    expect(formatTarget(num(47))).toBe("47");
    expect(formatTarget(num(1250))).toBe("1,250");
    expect(formatTarget(num(2005))).toBe("2,005");
    expect(formatTarget({ scene: "price", value: 35 })).toBe("35 ₪");
    expect(formatTarget(time(3, 5))).toBe("3:05");
    expect(formatTarget({ scene: "phone", digits: "0541234567" })).toBe("054-123-4567");
  });

  it("слова задания совпадают со сценой", () => {
    expect(spokenTarget({ target: { scene: "age", value: 35 }, who: "bat" }).he).toBe("בת שלושים וחמש");
    expect(spokenTarget({ target: { scene: "floor", value: 3 } }).he).toBe("קומה שלוש");
    expect(spokenTarget({ target: { scene: "price", value: 35 } }).he).toBe("שלושים וחמישה שקלים");
  });

  it("у каждой сцены есть вопрос, а у «сказать» свой", () => {
    for (const target of [num(5), time(3, 0), { scene: "price", value: 5 }, { scene: "floor", value: 2 }, { scene: "age", value: 9 }, { scene: "phone", digits: "0541234567" }] as NumberTarget[]) {
      expect(sceneQuestion({ mode: "hear", target })).toBeTruthy();
      expect(sceneQuestion({ mode: "say", target })).toBeTruthy();
    }
    expect(sceneQuestion({ mode: "hear", target: time(3, 0) })).toBe("Который час?");
  });

  it("длина ответа по сцене", () => {
    expect(answerMaxLength(num(5))).toBe(4);
    expect(answerMaxLength(time(3, 0))).toBe(5);
    expect(answerMaxLength({ scene: "phone", digits: "0541234567" })).toBe(10);
  });
});

describe("проверка набранного", () => {
  it("число: пробелы, запятые и ведущие нули не мешают", () => {
    expect(checkTyped(num(47), "47")).toBe(true);
    expect(checkTyped(num(47), " 47 ")).toBe(true);
    expect(checkTyped(num(47), "047")).toBe(true);
    expect(checkTyped(num(1250), "1,250")).toBe(true);
    expect(checkTyped(num(1250), "1250")).toBe(true);
    expect(checkTyped(num(47), "74")).toBe(false);
    expect(checkTyped(num(47), "")).toBe(false);
    expect(checkTyped(num(47), "4a")).toBe(false);
    expect(checkTyped(num(0), "0")).toBe(true);
  });

  it("время: двоеточие обязательно, 12 и 24 часа одинаково верны", () => {
    expect(checkTyped(time(3, 35), "3:35")).toBe(true);
    expect(checkTyped(time(3, 35), "15:35")).toBe(true);
    expect(checkTyped(time(3, 35), "03:35")).toBe(true);
    expect(checkTyped(time(3, 35), "335")).toBe(false);
    expect(checkTyped(time(3, 35), "3:36")).toBe(false);
    expect(checkTyped(time(3, 35), "4:35")).toBe(false);
    expect(checkTyped(time(12, 0), "0:00")).toBe(true);
    expect(checkTyped(time(12, 0), "12:00")).toBe(true);
    expect(checkTyped(time(3, 35), "27:35")).toBe(false);
  });

  it("телефон: точно, с дефисами и пробелами", () => {
    const phone: NumberTarget = { scene: "phone", digits: "0541234567" };
    expect(checkTyped(phone, "0541234567")).toBe(true);
    expect(checkTyped(phone, "054-123-4567")).toBe(true);
    expect(checkTyped(phone, "054 123 4567")).toBe(true);
    expect(checkTyped(phone, "0541234568")).toBe(false);
    expect(checkTyped(phone, "541234567")).toBe(false);
  });
});

describe("проверка сказанного", () => {
  it("цифрами: число находится в тексте, запятые тысяч склеиваются", () => {
    expect(checkSpoken(num(47), "47")).toEqual({ match: true, digits: true });
    expect(checkSpoken(num(1250), "1,250")).toEqual({ match: true, digits: true });
    expect(checkSpoken({ scene: "price", value: 35 }, "35 ₪")).toEqual({ match: true, digits: true });
    expect(checkSpoken(num(47), "74").match).toBe(false);
    expect(checkSpoken(num(47), "").match).toBe(false);
  });

  it("словами: оба рода верны, лишние слова вокруг не мешают", () => {
    expect(checkSpoken(num(47), "ארבעים ושבע").match).toBe(true);
    expect(checkSpoken(num(47), "ארבעים ושבעה").match).toBe(true);
    expect(checkSpoken({ scene: "price", value: 35 }, "שלושים וחמישה שקלים").match).toBe(true);
    expect(checkSpoken({ scene: "price", value: 35 }, "זה עולה שלושים וחמש").match).toBe(true);
    expect(checkSpoken(num(0), "אפס").match).toBe(true);
    expect(checkSpoken(num(125), "מאה עשרים וחמש").match).toBe(true);
  });

  it("соседнее число не засчитывается: 13 и 30, 47 и 46, 15 и 50", () => {
    expect(checkSpoken(num(13), "שלושים").match).toBe(false);
    expect(checkSpoken(num(30), "שלוש עשרה").match).toBe(false);
    expect(checkSpoken(num(47), "ארבעים ושש").match).toBe(false);
    expect(checkSpoken(num(15), "חמישים").match).toBe(false);
    expect(checkSpoken(num(50), "חמש עשרה").match).toBe(false);
    expect(checkSpoken(num(47), "ארבעים ושמונה").match).toBe(false);
  });

  it("время: «3:35» и слова, соседние минуты и часы нет", () => {
    expect(checkSpoken(time(3, 35), "3:35")).toEqual({ match: true, digits: true });
    expect(checkSpoken(time(3, 35), "15:35").match).toBe(true);
    expect(checkSpoken(time(3, 35), "ארבע בלי עשרים וחמש").match).toBe(true);
    expect(checkSpoken(time(3, 35), "השעה ארבע בלי עשרים וחמש").match).toBe(true);
    expect(checkSpoken(time(3, 35), "3:40").match).toBe(false);
    expect(checkSpoken(time(3, 35), "ארבע בלי עשרים").match).toBe(false);
    expect(checkSpoken(time(3, 30), "שלוש וחצי").match).toBe(true);
    expect(checkSpoken(time(3, 30), "ארבע וחצי").match).toBe(false);
  });

  it("телефон вслух не проверяется", () => {
    expect(checkSpoken({ scene: "phone", digits: "0541234567" }, "0541234567").match).toBe(false);
  });

  it("соседи для числа: ±1, ±10, 13↔30, 30↔13", () => {
    expect(confusableValues(13)).toEqual(expect.arrayContaining([12, 14, 3, 23, 30]));
    expect(confusableValues(30)).toEqual(expect.arrayContaining([29, 31, 20, 40, 13]));
    expect(confusableValues(0)).toEqual([1, 10]);
    expect(expectedPhrases({ scene: "phone", digits: "0541234567" }).ok).toEqual([]);
  });
});

describe("состав подхода", () => {
  const key = (t: { target: NumberTarget }) => JSON.stringify(t.target);

  it("десять заданий, значения не повторяются, на каждом уровне", () => {
    for (const level of NUMBER_LEVELS) {
      const round = buildNumbersRound(level.id, seeded(7), { speech: true });
      expect(round, level.id).toHaveLength(NUMBERS_ROUND);
      expect(new Set(round.map(key)).size, `${level.id}: без повторов`).toBe(NUMBERS_ROUND);
      for (const task of round) expect(task.level).toBe(level.id);
    }
  });

  it("с микрофоном 3-е, 6-е и 9-е задания «сказать», без микрофона и у телефона все «услышать»", () => {
    const round = buildNumbersRound("tens", seeded(3), { speech: true });
    expect(round.map((t) => t.mode === "say")).toEqual(Array.from({ length: NUMBERS_ROUND }, (_, i) => NUMBERS_SAY_SLOTS.includes(i)));
    expect(buildNumbersRound("tens", seeded(3), { speech: false }).every((t) => t.mode === "hear")).toBe(true);
    expect(buildNumbersRound("phone", seeded(3), { speech: true }).every((t) => t.mode === "hear")).toBe(true);
  });

  it("диапазоны уровней", () => {
    const values = (level: NumberLevelId) =>
      buildNumbersRound(level, seeded(11), { speech: false }).map((t) => (t.target.scene === "time" || t.target.scene === "phone" ? 0 : t.target.value));
    expect(values("basic").every((v) => v >= 0 && v <= 10)).toBe(true);
    expect(values("tens").every((v) => v >= 11 && v <= 99)).toBe(true);
    expect(values("tens").filter((v) => v <= 19)).toHaveLength(3);
    expect(values("hundreds").every((v) => v >= 100 && v <= 999)).toBe(true);
    expect(values("thousands").every((v) => v >= 1000 && v <= 9999)).toBe(true);
    expect(values("price").every((v) => v >= 3 && v <= 999)).toBe(true);
  });

  it("время: час 1–12, минуты кратные пяти; телефон: израильский мобильный из десяти цифр; этаж и возраст вместе", () => {
    for (const t of buildNumbersRound("time", seeded(5), { speech: false })) {
      expect(t.target.scene).toBe("time");
      if (t.target.scene === "time") {
        expect(t.target.hour).toBeGreaterThanOrEqual(1);
        expect(t.target.hour).toBeLessThanOrEqual(12);
        expect(t.target.minute % 5).toBe(0);
      }
    }
    for (const t of buildNumbersRound("phone", seeded(5), { speech: false })) {
      expect(t.target.scene === "phone" && /^05[023458]\d{7}$/.test(t.target.digits)).toBe(true);
    }
    const life = buildNumbersRound("life", seeded(5), { speech: false });
    expect(life.filter((t) => t.target.scene === "floor")).toHaveLength(5);
    expect(life.filter((t) => t.target.scene === "age")).toHaveLength(5);
    expect(life.filter((t) => t.target.scene === "age").every((t) => t.who === "ben" || t.who === "bat")).toBe(true);
  });

  it("каждое задание можно произнести кусками и проверить собственным ответом", () => {
    for (let seed = 1; seed <= 30; seed++) {
      for (const level of NUMBER_LEVELS) {
        for (const task of buildNumbersRound(level.id, seeded(seed), { speech: true })) {
          expect(spokenTarget(task).ids.length).toBeGreaterThan(0);
          expect(checkTyped(task.target, formatTarget(task.target).replace(" ₪", ""))).toBe(true);
          if (task.mode === "say") {
            const { ok } = expectedPhrases(task.target);
            expect(checkSpoken(task.target, ok[0]!).match, `${level.id}: ${formatTarget(task.target)} словами`).toBe(true);
          }
        }
      }
    }
  });

  it("разные зёрна дают разные подходы", () => {
    const a = buildNumbersRound("hundreds", seeded(1), { speech: false }).map(key).join();
    const b = buildNumbersRound("hundreds", seeded(2), { speech: false }).map(key).join();
    expect(a).not.toBe(b);
  });
});

describe("разбор запроса к серверу", () => {
  it("число, цена, этаж, возраст", () => {
    expect(parseNumberTarget("number", "47")).toEqual({ scene: "number", value: 47 });
    expect(parseNumberTarget("price", "999")).toEqual({ scene: "price", value: 999 });
    expect(parseNumberTarget("price", "0")).toBeNull();
    expect(parseNumberTarget("number", "10000")).toBeNull();
    expect(parseNumberTarget("number", "-1")).toBeNull();
    expect(parseNumberTarget("number", "4.5")).toBeNull();
    expect(parseNumberTarget("number", undefined)).toBeNull();
    expect(parseNumberTarget("phone", "0541234567")).toBeNull();
    expect(parseNumberTarget(undefined, "5")).toBeNull();
  });
  it("время", () => {
    expect(parseNumberTarget("time", undefined, "3", "35")).toEqual({ scene: "time", hour: 3, minute: 35 });
    expect(parseNumberTarget("time", undefined, "13", "0")).toBeNull();
    expect(parseNumberTarget("time", undefined, "3", "7")).toBeNull();
    expect(parseNumberTarget("time", undefined, undefined, undefined)).toBeNull();
  });
});

describe("итог подхода", () => {
  it("слова по доле верных", () => {
    expect(numbersVerdict(10, 10)).toContain("Без ошибок");
    expect(numbersVerdict(8, 10)).toContain("Очень хорошо");
    expect(numbersVerdict(5, 10)).toContain("Неплохо");
    expect(numbersVerdict(1, 10)).toContain("трудно");
    expect(numbersVerdict(0, 0)).toBe("");
  });
});

describe("проверка цены словами", () => {
  it("«שני שקלים», «שקל אחד», «שלושה שקלים» и просто число засчитываются, соседняя цена нет", () => {
    const price = (value: number) => ({ scene: "price", value }) as const;
    expect(checkSpoken(price(2), "שני שקלים").match).toBe(true);
    expect(checkSpoken(price(2), "שניים").match).toBe(true);
    expect(checkSpoken(price(1), "שקל אחד").match).toBe(true);
    expect(checkSpoken(price(1), "שקל").match).toBe(true);
    expect(checkSpoken(price(3), "שלושה שקלים").match).toBe(true);
    expect(checkSpoken(price(22), "עשרים ושני שקלים").match).toBe(true);
    expect(checkSpoken(price(3), "שני שקלים").match).toBe(false);
    expect(checkSpoken(price(2), "שלושה שקלים").match).toBe(false);
  });
});

describe("адрес проверки речи", () => {
  it("обратен к parseNumberTarget", () => {
    const targets = [
      { scene: "number", value: 35 },
      { scene: "price", value: 120 },
      { scene: "floor", value: 7 },
      { scene: "age", value: 41 },
      { scene: "time", hour: 3, minute: 35 },
    ] as const;
    for (const t of targets) {
      const q = Object.fromEntries(numberTargetQuery(t).split("&").map((pair) => pair.split("=") as [string, string]));
      expect(parseNumberTarget(q.scene, q.value, q.hour, q.minute)).toEqual(t);
    }
    expect(() => numberTargetQuery({ scene: "phone", digits: "0541234567" })).toThrow();
  });
});

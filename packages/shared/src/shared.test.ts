import { describe, expect, it } from "vitest";
import {
  HEBREW_LETTERS,
  consonantSkeleton,
  isSpeechMatch,
  normalizeHebrew,
  speechMatchDetail,
  statusForPassedLessons,
} from "./index";

describe("статусы по сданным урокам", () => {
  const cases: [number, string][] = [
    [0, "Пешка"], [5, "Пешка"], [6, "Конь"], [20, "Конь"], [21, "Слон"],
    [50, "Слон"], [51, "Ладья"], [100, "Ладья"], [101, "Ферзь"], [300, "Ферзь"],
    [301, "Король"], [500, "Король"], [900, "Король"],
  ];
  it.each(cases)("%i сданных уроков -> %s", (n, name) => {
    expect(statusForPassedLessons(n).name).toBe(name);
  });

  it("показывает, сколько уроков до следующего статуса", () => {
    expect(statusForPassedLessons(3).nextAt).toBe(6);
    expect(statusForPassedLessons(400).nextAt).toBeNull();
  });

  it("отрицательные и дробные значения не ломают расчёт", () => {
    expect(statusForPassedLessons(-4).name).toBe("Пешка");
    expect(statusForPassedLessons(5.9).name).toBe("Пешка");
  });
});

describe("нормализация иврита", () => {
  it("убирает огласовки и знаки, конечные формы приводит к обычным", () => {
    expect(normalizeHebrew("צִפּוֹר.")).toBe("צפור");
    expect(normalizeHebrew("שלום!")).toBe("שלומ");
  });

  it("согласный скелет не зависит от ו и י", () => {
    expect(consonantSkeleton("ציפור")).toBe(consonantSkeleton("צפור"));
  });

  it("в алфавите ровно 27 форм без повторов", () => {
    expect(HEBREW_LETTERS.length).toBe(27);
    expect(new Set(HEBREW_LETTERS).size).toBe(27);
  });
});

describe("сравнение произнесённого слова", () => {
  it("принимает точное совпадение и неполное написание", () => {
    expect(isSpeechMatch("ציפור", "ציפור")).toBe(true);
    expect(isSpeechMatch("צפור", "ציפור")).toBe(true);
    expect(isSpeechMatch("צִפּוֹר.", "ציפור")).toBe(true);
  });

  it("находит слово среди лишних слов", () => {
    expect(isSpeechMatch("זה ציפור", "ציפור")).toBe(true);
  });

  it("прощает одну ошибку только в длинных словах", () => {
    expect(isSpeechMatch("ארנה", "ארנב")).toBe(true);
    expect(isSpeechMatch("דה", "דג")).toBe(false);
    expect(isSpeechMatch("כלב", "סוס")).toBe(false);
  });

  it("не принимает пустой и нерелевантный результат", () => {
    expect(isSpeechMatch("", "ציפור")).toBe(false);
    expect(isSpeechMatch("hello", "ציפור")).toBe(false);
    expect(isSpeechMatch("חתול", "ציפור")).toBe(false);
  });
});

describe("сравнение по звучанию", () => {
  it("принимает א как гласный: פארה это «пара» (корова)", () => {
    expect(isSpeechMatch("פארה", "פרה")).toBe(true);
    expect(isSpeechMatch("פרה", "פארה")).toBe(true);
    expect(isSpeechMatch("פרא", "פרה")).toBe(true);
    expect(isSpeechMatch("פארה.", "פרה")).toBe(true);
    expect(isSpeechMatch("זאת פארה", "פרה")).toBe(true);
  });

  it("принимает одинаково звучащие буквы в коротких словах", () => {
    expect(isSpeechMatch("טה", "תה")).toBe(true); // ת и ט: «т»
    expect(isSpeechMatch("קר", "כר")).toBe(true); // ק и כ: «к»
    expect(isSpeechMatch("עם", "אם")).toBe(true); // ע и א тихие
  });

  it("ח не равна ни כ, ни ק: собака не молоко", () => {
    expect(isSpeechMatch("חר", "קר")).toBe(false);
    expect(isSpeechMatch("כלב", "חלב")).toBe(false);
    expect(isSpeechMatch("חלב", "כלב")).toBe(false);
  });

  it("ס, ש, ב и פ остаются разными звуками", () => {
    expect(isSpeechMatch("שר", "סר")).toBe(false);
    expect(isSpeechMatch("בר", "פר")).toBe(false);
  });

  it("не принимает другое слово из-за тихих букв", () => {
    expect(isSpeechMatch("אמא", "מה")).toBe(false);
    expect(isSpeechMatch("מה", "אמא")).toBe(false);
    expect(isSpeechMatch("דה", "דג")).toBe(false);
    expect(isSpeechMatch("בית", "אבא")).toBe(false);
    expect(isSpeechMatch("כלב", "סוס")).toBe(false);
  });

  it("слова без опорных согласных принимает только при точном совпадении", () => {
    expect(isSpeechMatch("או", "או")).toBe(true);
    expect(isSpeechMatch("אי", "או")).toBe(true); // י и ו бесплатны, как и раньше
    expect(isSpeechMatch("ב", "או")).toBe(false);
    expect(isSpeechMatch("אבא", "או")).toBe(false);
  });

  it("не склеивает слова, которые различаются настоящими буквами на конце или двумя мягкими правками", () => {
    // Род важен в уроках: ילד и ילדה, דוד и דודה, איש и אשה не равны.
    expect(isSpeechMatch("ילד", "ילדה")).toBe(false);
    expect(isSpeechMatch("ילדה", "ילד")).toBe(false);
    expect(isSpeechMatch("דוד", "דודה")).toBe(false);
    expect(isSpeechMatch("איש", "אשה")).toBe(false);
    expect(isSpeechMatch("אף", "פה")).toBe(false);
    expect(isSpeechMatch("דם", "אדם")).toBe(false); // א в начале слова настоящая
    expect(isSpeechMatch("שן", "שעון")).toBe(false); // ע настоящая
    expect(isSpeechMatch("כיסא", "כוס")).toBe(false);
    expect(isSpeechMatch("ריק", "ארוך")).toBe(false); // тихая א и כ/ק вместе: две правки
    expect(isSpeechMatch("לאהוב", "להביא")).toBe(false); // два лишних א: другое слово
  });

  it("слово из трёх букв с одной настоящей ошибкой не принимает", () => {
    expect(isSpeechMatch("פלה", "פרה")).toBe(false);
    expect(isSpeechMatch("דק", "דג")).toBe(false);
  });

  it("разбор сравнения показывает расстояние и ближайший вариант", () => {
    const d = speechMatchDetail("זאת פארה", "פרה");
    expect(d).toMatchObject({ match: true, expected: "פרה", closest: "פארה" });
    expect(d.cost).toBeLessThanOrEqual(d.budget);
    const far = speechMatchDetail("כלב", "פרה");
    expect(far).toMatchObject({ match: false, closest: "כלב" });
    expect(far.cost).toBeGreaterThan(far.budget);
    expect(speechMatchDetail("", "פרה")).toMatchObject({ match: false, cost: null });
  });
});

describe("соседние слова темы", () => {
  const family = ["סבא", "סבתא", "נכד", "נכדה"];

  it("не засчитывает другое слово темы, даже близкое по звучанию", () => {
    expect(isSpeechMatch("סבתא", "סבא", family)).toBe(false);
    expect(isSpeechMatch("סבא", "סבתא", family)).toBe(false); // допуск слова от 4 букв прощал бы одну ошибку
    expect(isSpeechMatch("נכדה", "נכד", family)).toBe(false);
    expect(isSpeechMatch("להסתיר", "להסביר", ["להסביר", "להסתיר", "להפסיק"])).toBe(false);
  });

  it("отказывает и при равном расстоянии, если услышано ровно соседнее слово (י и ו бесплатны)", () => {
    expect(isSpeechMatch("עוגה", "עוגייה", ["עוגה", "עוגייה"])).toBe(false);
    expect(isSpeechMatch("עוגייה", "עוגה", ["עוגה", "עוגייה"])).toBe(false);
    expect(isSpeechMatch("יקר", "קר", ["קר", "יקר"])).toBe(false);
    expect(isSpeechMatch("להראות", "להיראות", ["להראות", "להיראות"])).toBe(false);
    expect(isSpeechMatch("עוגה", "עוגה", ["עוגה", "עוגייה"])).toBe(true);
    expect(isSpeechMatch("קר", "קר", ["קר", "יקר"])).toBe(true);
  });

  it("слово по-прежнему засчитывается, если сказано верно или с допустимой правкой", () => {
    expect(isSpeechMatch("סבא", "סבא", family)).toBe(true);
    expect(isSpeechMatch("סבתא", "סבתא", family)).toBe(true);
    expect(isSpeechMatch("זה סבא", "סבא", family)).toBe(true);
    expect(isSpeechMatch("סבא סבתא", "סבא", family)).toBe(true); // сказал и нужное слово тоже
    expect(isSpeechMatch("פארה", "פרה", ["פרה", "כלב", "סוס"])).toBe(true);
  });

  it("без списка соседей поведение прежнее", () => {
    expect(isSpeechMatch("סבא", "סבתא")).toBe(true);
    expect(isSpeechMatch("סבא", "סבתא", [])).toBe(true);
  });

  it("то же написание в списке соседей и само ожидаемое слово не мешают", () => {
    expect(isSpeechMatch("כלב", "כלב", ["כלב", "חתול"])).toBe(true);
  });

  it("разбор называет слово, из-за которого отказано", () => {
    expect(speechMatchDetail("סבא", "סבתא", family)).toMatchObject({ match: false, rival: "סבא" });
    expect(speechMatchDetail("סבא", "סבא", family).rival).toBeUndefined();
    expect(speechMatchDetail("כלב", "סבא", family).rival).toBeUndefined(); // далеко от всех: это просто ошибка
  });
});

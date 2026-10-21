import { describe, expect, it } from "vitest";
import {
  HEBREW_LETTERS,
  consonantSkeleton,
  isSpeechMatch,
  latinSounds,
  isPhrase,
  normalizeHebrew,
  normalizeWords,
  spacedTyped,
  speechMatchDetail,
  statusForPassedLessons,
  typedLetters,
  typedPartLengths,
  wordLetterGroups,
  wordLetters,
  wordParts,
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

describe("иврит, записанный латиницей", () => {
  it("раскладывает латиницу на согласные звуки без гласных", () => {
    expect(latinSounds("akhbar")).toEqual(["כח", "ב", "ר"]);
    expect(latinSounds("Akh-bar.")).toEqual(["כח", "ב", "ר"]);
    expect(latinSounds("shalom")).toEqual(["ש", "ל", "מ"]);
    expect(latinSounds("kelev")).toEqual(["כק", "ל", "בו"]);
    expect(latinSounds("mamma")).toEqual(["מ", "מ"]); // через гласную это два звука
    expect(latinSounds("bba")).toEqual(["ב"]); // удвоенная согласная подряд один звук
    expect(latinSounds("dod")).toEqual(["ד", "ד"]);
    expect(latinSounds("עכבר")).toEqual([]);
  });

  it("засчитывает слово, которое Whisper услышал верно, но записал латиницей: «мышь» akhbar", () => {
    expect(isSpeechMatch("akhbar", "עכבר")).toBe(true);
    expect(isSpeechMatch("Akhbar.", "עכבר")).toBe(true);
    expect(isSpeechMatch("achbar", "עכבר")).toBe(true);
    expect(isSpeechMatch("kelev", "כלב")).toBe(true);
    expect(isSpeechMatch("halav", "חלב")).toBe(true);
    expect(isSpeechMatch("para", "פרה")).toBe(true);
    expect(speechMatchDetail("akhbar", "עכבר")).toMatchObject({ match: true, cost: 0, latin: true });
  });

  it("не путает слова с похожим набором согласных и не принимает мусор", () => {
    expect(isSpeechMatch("kelev", "חלב")).toBe(false);
    expect(isSpeechMatch("halav", "כלב")).toBe(false);
    expect(isSpeechMatch("hello", "ציפור")).toBe(false);
    expect(isSpeechMatch("thank you", "ציפור")).toBe(false);
    expect(isSpeechMatch("bye", "דג")).toBe(false);
    expect(isSpeechMatch("you", "עכבר")).toBe(false);
  });

  it("слова с одной опорной согласной латиницей не проверяются", () => {
    expect(isSpeechMatch("ma", "מה")).toBe(false);
    expect(isSpeechMatch("my name", "מה")).toBe(false);
  });

  it("при точном совпадении звуков с соседним словом отказывает: без гласных קר и יקר не различить", () => {
    expect(speechMatchDetail("kar", "קר", ["יקר"])).toMatchObject({ match: false, rival: "יקר" });
    expect(isSpeechMatch("kar", "קר")).toBe(true);
    expect(isSpeechMatch("tov", "טוב", ["איטי"])).toBe(true); // сосед с одной опорной согласной не мешает
  });

  it("окончание различает слова без гласных: ילד кончается согласной, ילדה гласной", () => {
    expect(isSpeechMatch("yeled", "ילד", ["ילדה"])).toBe(true);
    expect(isSpeechMatch("yalda", "ילדה", ["ילד"])).toBe(true);
    expect(isSpeechMatch("kos", "כוס", ["כיסא"])).toBe(true);
    expect(isSpeechMatch("kise", "כיסא", ["כוס"])).toBe(true);
    expect(isSpeechMatch("yalda", "ילד", ["ילדה"])).toBe(false); // гласная на конце, а слово кончается согласной
    expect(isSpeechMatch("yeled", "ילדה", ["ילד"])).toBe(false);
  });

  it("одинаковые согласные через гласную это два звука: dod, gag, sus", () => {
    expect(isSpeechMatch("dod", "דוד")).toBe(true);
    expect(isSpeechMatch("gag", "גג")).toBe(true);
    expect(isSpeechMatch("sus", "סוס")).toBe(true);
    expect(isSpeechMatch("mayim", "מים")).toBe(true);
  });

  it("ивритский ответ по-прежнему главный: при ивритских буквах латиница не нужна", () => {
    expect(speechMatchDetail("עכבר", "עכבר").latin).toBeUndefined();
    expect(isSpeechMatch("akhbar עכבר", "עכבר")).toBe(true);
  });
});

describe("слово урока из нескольких слов иврита (фраза, 21.10)", () => {
  it("делится на части по пробелу; у обычного слова одна часть", () => {
    expect(wordParts("אחר כך")).toEqual(["אחר", "כך"]);
    expect(wordParts("כמה זה עולה")).toEqual(["כמה", "זה", "עולה"]);
    expect(wordParts("ציפור")).toEqual(["ציפור"]);
    expect(isPhrase("בית ספר")).toBe(true);
    expect(isPhrase("ציפור")).toBe(false);
  });

  it("буквы для «пиши» и «печатай» без пробела, клетки по словам", () => {
    expect(wordLetters("אחר כך")).toEqual(["א", "ח", "ר", "כ", "ך"]);
    expect(typedLetters("אחר כך").join("")).toBe("אחרכך");
    expect(wordLetterGroups("אחר כך")).toEqual([["א", "ח", "ר"], ["כ", "ך"]]);
    expect(wordLetterGroups("ציפור")).toEqual([["צ", "י", "פ", "ו", "ר"]]);
    expect(typedPartLengths("בית ספר")).toEqual([3, 3]);
  });

  it("набранное показывается с пробелом, который ставит приложение", () => {
    const he = "אחר כך";
    expect(spacedTyped([], he)).toBe("");
    expect(spacedTyped(["א", "ח"], he)).toBe("אח");
    expect(spacedTyped(["א", "ח", "ר"], he)).toBe("אחר");
    expect(spacedTyped(["א", "ח", "ר", "כ"], he)).toBe("אחר כ");
    expect(spacedTyped([..."אחרכך"], he)).toBe("אחר כך");
    expect(spacedTyped([..."אחרכךא"], he)).toBe("אחר כךא");
    expect(spacedTyped([..."ציפ"], "ציפור")).toBe("ציפ");
  });

  it("нормализует слова по отдельности: огласовки, конечные формы, дефис и макаф", () => {
    expect(normalizeWords("אַחַר כָּךְ.")).toBe("אחר ככ");
    expect(normalizeWords("אחת-עשרה")).toBe("אחת עשרה");
    expect(normalizeWords("בֵּית\u05BEסֵפֶר")).toBe("בית ספר");
  });

  it("фразу засчитывает целиком, с паузой или без, и с лишним словом рядом", () => {
    expect(isSpeechMatch("אחר כך", "אחר כך")).toBe(true);
    expect(isSpeechMatch("אחרכך", "אחר כך")).toBe(true); // Whisper склеил слова
    expect(isSpeechMatch("אחר, כך.", "אחר כך")).toBe(true);
    expect(isSpeechMatch("אחת-עשרה", "אחת עשרה")).toBe(true);
    expect(isSpeechMatch("טוב, אחר כך", "אחר כך")).toBe(true);
    expect(isSpeechMatch("בית ספר גדול", "בית ספר")).toBe(true);
    expect(isSpeechMatch("כמה זה עולה?", "כמה זה עולה")).toBe(true);
  });

  it("одно слово фразы не засчитывается за всю фразу", () => {
    expect(isSpeechMatch("אחר", "אחר כך")).toBe(false);
    expect(isSpeechMatch("כך", "אחר כך")).toBe(false);
    expect(isSpeechMatch("בית", "בית ספר")).toBe(false);
    expect(isSpeechMatch("עשרה", "אחת עשרה")).toBe(false);
  });

  it("одна ошибка на всю фразу прощается, две нет (решение владельца: один допуск)", () => {
    expect(isSpeechMatch("בית ספרים", "בית ספר")).toBe(true); // лишняя буква с י: י бесплатна, ם настоящая: одна ошибка
    expect(isSpeechMatch("בית ספרה", "בית ספר")).toBe(true);
    expect(isSpeechMatch("בת ספרה", "בית ספר")).toBe(true); // י бесплатна
    expect(isSpeechMatch("בית סיפרה", "בית ספר")).toBe(true);
    expect(isSpeechMatch("פית ספרה", "בית ספר")).toBe(false); // две ошибки
    expect(speechMatchDetail("בית ספר", "בית ספר").budget).toBe(3);
  });

  it("тихая א в начале второго слова настоящая, как в начале слова", () => {
    // «עשרים ואחד»: א после ו, в начале слова «אחד», в склейке оказалась бы в середине и стала бы «мягкой».
    expect(isSpeechMatch("עשרים ואחד", "עשרים ואחד")).toBe(true);
    expect(speechMatchDetail("אף פעם", "אף פעם").expected).toBe("אפ פעמ");
  });

  it("числа цифрами засчитываются по значению слова", () => {
    expect(speechMatchDetail("11", "אחת עשרה", [], 11)).toMatchObject({ match: true, cost: 0, digits: true, closest: "11" });
    expect(isSpeechMatch("11.", "אחת עשרה")).toBe(false); // без значения цифры не разбираются
    expect(speechMatchDetail("12", "אחת עשרה", [], 11).match).toBe(false);
    expect(speechMatchDetail("1", "אחת", [], 1).match).toBe(true);
    expect(speechMatchDetail("11", "אחת", [], 1).match).toBe(false);
    expect(speechMatchDetail("מספר 7", "שבע", [], 7).match).toBe(true);
    expect(speechMatchDetail("100", "מאה", [], 100).match).toBe(true);
  });

  it("соседа-фразу целиком не засчитывает за слово внутри неё", () => {
    const numbers = ["אחד", "עשר", "אחד עשר", "אחת עשרה", "שמונה עשר", "שמונה עשרה", "שמונה"];
    expect(speechMatchDetail("אחד עשר", "אחד", numbers)).toMatchObject({ match: false, rival: "אחד עשר" });
    expect(isSpeechMatch("אחד עשר", "עשר", numbers)).toBe(false);
    expect(isSpeechMatch("שמונה עשרה", "שמונה עשר", numbers)).toBe(false); // 18 ж. вместо 18 м.
    expect(isSpeechMatch("שמונה עשר", "שמונה עשרה", numbers)).toBe(false);
    expect(isSpeechMatch("שמונה עשר", "שמונה", numbers)).toBe(false);
    expect(isSpeechMatch("אחד", "אחד", numbers)).toBe(true);
    expect(isSpeechMatch("ילד אחד", "אחד", numbers)).toBe(true); // лишнее слово не сосед
    expect(isSpeechMatch("אחד עשר", "אחד עשר", numbers)).toBe(true);
    expect(isSpeechMatch("שמונה עשרה", "שמונה עשרה", numbers)).toBe(true);
  });

  it("латиница для фразы: звуки обоих слов", () => {
    expect(isSpeechMatch("achar kach", "אחר כך")).toBe(true);
    expect(isSpeechMatch("beit sefer", "בית ספר")).toBe(true);
    expect(isSpeechMatch("achar", "אחר כך")).toBe(false);
  });
});

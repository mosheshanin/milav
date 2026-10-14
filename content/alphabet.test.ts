import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  ALPHABET_GROUPS,
  HEBREW_LETTERS,
  LETTER_KEYS,
  LETTER_NAMES,
  type AlphabetLesson,
  type Letter,
} from "@milav/shared";
import { alphabetLessons, lessons } from "./index";
import { ALPHABET_RULES, alphabetProblems, crossProblems } from "./rules";

const publicFile = (path: string) => new URL(`../apps/web/public${path}`, import.meta.url);

describe("уроки алфавита (настоящие данные)", () => {
  it("есть хотя бы один урок алфавита, и он первый по порядку", () => {
    expect(alphabetLessons.length).toBeGreaterThan(0);
    expect(alphabetLessons.map((l) => l.number)).toEqual(alphabetLessons.map((_, i) => i + 1));
  });

  for (const rule of ALPHABET_RULES) {
    it(rule.name, () => {
      expect(rule.check(alphabetLessons)).toEqual([]);
    });
  }

  it("id уроков, слов и букв не совпадают ни у каких двух элементов", () => {
    expect(crossProblems(lessons, alphabetLessons)).toEqual([]);
  });

  it("когда уроки алфавита готовы все, в первых пяти все 27 форм по одному разу, а в шестом три формы с гереш", () => {
    if (alphabetLessons.length < ALPHABET_GROUPS.length) return;
    expect(alphabetLessons.slice(0, 5).flatMap((l) => l.letters.map((x) => x.he))).toEqual([...HEBREW_LETTERS]);
    expect(alphabetLessons[5]!.letters.map((x) => x.he)).toEqual(["ג׳", "ז׳", "צ׳"]);
  });

  it("урок со звуками дж, ж, ч: слова-примеры с гереш, названия «<буква> с апострофом»", () => {
    const lesson = alphabetLessons.find((l) => l.number === 6);
    if (!lesson) return;
    for (const x of lesson.letters) {
      expect(x.example.he.startsWith(x.he), x.id).toBe(true);
      expect(x.name.ru, x.id).toMatch(/ с апострофом$/);
    }
  });

  for (const lesson of alphabetLessons) {
    describe(lesson.id, () => {
      for (const letter of lesson.letters) {
        it(`буква ${letter.he} (${letter.id}): файлы картинки и озвучки существуют`, () => {
          for (const path of [letter.audio, letter.example.audio, letter.example.image]) {
            if (path) expect(existsSync(publicFile(path)), `нет файла ${path}`).toBe(true);
          }
        });

        it(`буква ${letter.he} (${letter.id}): заполнены название, звук и пример`, () => {
          expect(letter.name.he.length).toBeGreaterThan(0);
          expect(letter.sound.length).toBeGreaterThan(0);
          expect(letter.example.he.length).toBeGreaterThan(0);
          expect(letter.example.ru.length).toBeGreaterThan(0);
        });
      }
    });
  }
});

/** Урок 3 целиком: обычные буквы и конечные формы, примеры настоящие (их же можно взять в наполнение). */
function lesson3(): AlphabetLesson {
  const make = (he: string, name: [string, string], sound: string, example: [string, string, string, string]): Letter => ({
    id: `alphabet-3-${LETTER_KEYS[he]}`,
    he,
    name: { he: name[0], niqqud: name[1], ru: LETTER_NAMES[he]! },
    sound,
    example: { he: example[0], niqqud: example[1], translit: example[2], ru: example[3] },
    reviewed: false,
  });
  return {
    id: "alphabet-3",
    topicId: "alphabet",
    section: "alphabet",
    topic: "Алфавит",
    number: 3,
    free: true,
    title: "Урок 3",
    letters: [
      make("כ", ["כף", "כָּף"], "к или х", ["כלב", "כֶּלֶב", "ке́лев", "собака"]),
      make("ך", ["כף סופית", "כָּף סוֹפִית"], "х (в конце слова)", ["מלך", "מֶלֶךְ", "ме́лех", "король"]),
      make("ל", ["למד", "לָמֶד"], "л", ["לימון", "לִימוֹן", "лимо́н", "лимон"]),
      make("מ", ["מם", "מֵם"], "м", ["מיטה", "מִיטָּה", "мита́", "кровать"]),
      make("ם", ["מם סופית", "מֵם סוֹפִית"], "м (в конце слова)", ["שלום", "שָׁלוֹם", "шало́м", "привет"]),
    ],
  };
}

/** Нарушения одного урока. Правило нумерации не берём: образец это «урок 3» без уроков 1 и 2. */
function problemsOf(lesson: AlphabetLesson): string {
  return ALPHABET_RULES.filter((r) => !r.name.startsWith("номера уроков"))
    .flatMap((r) => r.check([lesson]).map((p) => `${r.name}: ${p}`))
    .join("\n");
}

describe("правила алфавита ловят нарушения", () => {
  it("образец с обычными и конечными формами без замечаний", () => {
    expect(problemsOf(lesson3())).toBe("");
  });

  it("урок не бесплатный", () => {
    expect(problemsOf({ ...lesson3(), free: false })).toContain("алфавит полностью бесплатный");
  });

  it("id урока не по номеру и чужая тема", () => {
    expect(problemsOf({ ...lesson3(), id: "alphabet-7" })).toContain("ожидался id alphabet-3");
    expect(problemsOf({ ...lesson3(), topicId: "animals" })).toContain("ожидался alphabet");
  });

  it("пропуск в номерах и лишний урок", () => {
    expect(alphabetProblems([lesson3()]).join("\n")).toContain("ожидались подряд с 1");
    const seven = [1, 2, 3, 4, 5, 6, 7].map((n) => ({ ...lesson3(), id: `alphabet-${n}`, number: n }));
    expect(alphabetProblems(seven).join("\n")).toContain("уроков 7, а групп букв 6");
  });

  it("не те буквы в уроке", () => {
    const l = lesson3();
    const swapped = { ...l, letters: [l.letters[1]!, l.letters[0]!, ...l.letters.slice(2)] };
    expect(problemsOf(swapped)).toContain("ожидались «כךלמם»");
  });

  it("id буквы не по ключу", () => {
    const l = lesson3();
    const bad = { ...l, letters: l.letters.map((x, i) => (i === 0 ? { ...x, id: "alphabet-3-kaph" } : x)) };
    expect(problemsOf(bad)).toContain("ожидался alphabet-3-kaf");
  });

  it("русское название не как в LETTER_NAMES", () => {
    const l = lesson3();
    const bad = { ...l, letters: l.letters.map((x, i) => (i === 0 ? { ...x, name: { ...x.name, ru: "каф-каф" } } : x)) };
    expect(problemsOf(bad)).toContain("ожидалось «каф»");
  });

  it("огласовки названия от другого слова", () => {
    const l = lesson3();
    const bad = { ...l, letters: l.letters.map((x, i) => (i === 0 ? { ...x, name: { ...x.name, niqqud: "בֵּית" } } : x)) };
    expect(problemsOf(bad)).toContain("не совпадает с");
  });

  it("слово-пример начинается не с буквы", () => {
    const l = lesson3();
    const bad = { ...l, letters: l.letters.map((x, i) => (i === 2 ? { ...x, example: { ...x.example, he: "מלך", niqqud: "מֶלֶךְ", translit: "ме́лех" } } : x)) };
    expect(problemsOf(bad)).toContain("должно начинаться с ל");
  });

  it("слово-пример конечной формы заканчивается не ею", () => {
    const l = lesson3();
    const bad = { ...l, letters: l.letters.map((x, i) => (i === 1 ? { ...x, example: { ...x.example, he: "כלב", niqqud: "כֶּלֶב", translit: "ке́лев" } } : x)) };
    expect(problemsOf(bad)).toContain("должно заканчиваться на ך");
  });

  it("конечная буква не в конце слова-примера и обычная форма в конце", () => {
    const l = lesson3();
    const middle = { ...l, letters: l.letters.map((x, i) => (i === 4 ? { ...x, he: "ם", example: { ...x.example, he: "שםלו", niqqud: "שָׁםלוֹ", translit: "шамло́" } } : x)) };
    expect(problemsOf(middle)).toContain("конечная ם не в конце");
    const regular = { ...l, letters: l.letters.map((x, i) => (i === 2 ? { ...x, example: { ...x.example, he: "לכ", niqqud: "לֶכ", translit: "ле́к" } } : x)) };
    expect(problemsOf(regular)).toContain("в конце нужна конечная форма");
  });

  it("транскрипция примера без ударения и с лишней согласной", () => {
    const l = lesson3();
    const noStress = { ...l, letters: l.letters.map((x, i) => (i === 0 ? { ...x, example: { ...x.example, translit: "келев" } } : x)) };
    expect(problemsOf(noStress)).toContain("нужен ровно один знак ударения");
    const wrong = { ...l, letters: l.letters.map((x, i) => (i === 0 ? { ...x, example: { ...x.example, translit: "ге́лев" } } : x)) };
    expect(problemsOf(wrong)).toContain("нет подходящей");
  });

  it("огласовки примера от другого слова", () => {
    const l = lesson3();
    const bad = { ...l, letters: l.letters.map((x, i) => (i === 0 ? { ...x, example: { ...x.example, niqqud: "מֶלֶךְ" } } : x)) };
    expect(problemsOf(bad)).toContain("не совпадают с");
  });

  it("одно слово-пример у двух букв и повтор буквы", () => {
    const l = lesson3();
    const same = { ...l, letters: l.letters.map((x, i) => (i === 3 ? { ...x, example: l.letters[4]!.example } : x)) };
    expect(problemsOf(same)).toContain("слово-пример שלום у alphabet-3-mem и у alphabet-3-mem-final");
    const twice = { ...l, letters: [...l.letters.slice(0, 4), { ...l.letters[3]!, id: "alphabet-3-mem" }] };
    expect(problemsOf(twice)).toContain("буква מ повторяется");
  });
});

describe("связи алфавита с остальными уроками", () => {
  it("совпадение id буквы с id слова ловится", () => {
    const l = lesson3();
    const clash: AlphabetLesson = { ...l, letters: l.letters.map((x, i) => (i === 0 ? { ...x, id: lessons[0]!.words[0]!.id } : x)) };
    expect(crossProblems(lessons, [clash]).join("\n")).toContain(lessons[0]!.words[0]!.id);
  });

  it("совпадение id урока алфавита с id обычного урока ловится", () => {
    expect(crossProblems(lessons, [{ ...lesson3(), id: lessons[0]!.id }]).join("\n")).toContain(lessons[0]!.id);
  });
});

describe("правила алфавита: формы с гереш (дж, ж, ч)", () => {
  const real = alphabetLessons.find((l) => l.number === 6)!;
  const edit = (i: number, patch: Partial<Letter>): AlphabetLesson => ({ ...real, letters: real.letters.map((x, n) => (n === i ? { ...x, ...patch } : x)) });

  it("настоящий урок без замечаний", () => {
    expect(problemsOf(real)).toBe("");
  });

  it("слово-пример без гереш не подходит: это другое слово", () => {
    const bad = edit(0, { example: { ...real.letters[0]!.example, he: "גינס", niqqud: "גִּינְס" } });
    expect(problemsOf(bad)).toContain("должно начинаться с ג׳");
  });

  it("русское название формы с гереш: «<название> с апострофом»", () => {
    expect(problemsOf(edit(1, { name: { ...real.letters[1]!.name, ru: "зайин" } }))).toContain("ожидалось «зайин с апострофом»");
  });

  it("формы с гереш и обычные буквы в одном уроке не смешиваются", () => {
    const mixed = { ...real, letters: [...real.letters.slice(0, 2), { ...lesson3().letters[2]! }] };
    expect(problemsOf(mixed)).toContain("форм с «׳»");
  });

  it("id формы по ключу", () => {
    expect(problemsOf(edit(2, { id: "alphabet-6-tsadi" }))).toContain("ожидался alphabet-6-tsadi-geresh");
  });
});

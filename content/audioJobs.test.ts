import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { VERB_FORMS_TOTAL, VERB_TENSES, verbFormAudioPath, type VerbData } from "@milav/shared";
// @ts-expect-error модуль на чистом JS (tools/*.mjs), деклараций типов нет
import { ALL_KINDS, VERB_TENSE_ORDER, buildJobs } from "../tools/audio-jobs.mjs";
import { KATAV, katavWord } from "./verbFixture";

interface Job {
  kind: string;
  voice: string;
  id: string;
  name: string;
  niqqud: string;
  set: (path: string) => void;
  has: string | undefined;
}

/** Глагол «писать» с id: у образца в verbFixture его нет. */
const katav = () => ({ ...katavWord(), id: "paal-1-write", verb: structuredClone(KATAV) as VerbData });

const lessonWith = (word: unknown) => [{ file: "paal-1.json", data: { words: [word] } }];
const jobsOf = (word: unknown, options?: { kinds?: string[]; only?: string[] }): Job[] => buildJobs(lessonWith(word), options);

describe("озвучка: формы глагола", () => {
  it("времена в скрипте те же и в том же порядке, что в приложении", () => {
    expect(VERB_TENSE_ORDER).toEqual([...VERB_TENSES]);
  });

  it("один файл на слово, 27 файлов на формы и по файлу на мужскую фразу и её женский вариант", () => {
    const jobs = jobsOf(katav());
    expect(jobs.filter((j) => j.kind === "word")).toHaveLength(1);
    expect(jobs.filter((j) => j.kind === "form")).toHaveLength(VERB_FORMS_TOTAL);
    expect(jobs.filter((j) => j.kind === "phrase").map((j) => j.name)).toEqual(["paal-1-write-phrase-m", "paal-1-write-phrase-f"]);
  });

  it("имя файла совпадает с путём, который знает приложение (verbFormAudioPath)", () => {
    const word = katav();
    const names = jobsOf(word)
      .filter((j) => j.kind === "form")
      .map((j) => `/audio/${j.name}.mp3`);
    const expected = VERB_TENSES.flatMap((tense) =>
      Object.keys((word.verb![tense] ?? {}) as Record<string, unknown>).map((key) => verbFormAudioPath(word.id, tense, key)),
    );
    expect(names).toEqual(expected);
    expect(new Set(names).size).toBe(names.length);
    expect(names).toContain(`/audio/${word.id}-form-past-3ms.mp3`);
  });

  it("в синтезатор уходит форма с огласовками", () => {
    const word = katav();
    const job = jobsOf(word).find((j) => j.name === `${word.id}-form-past-3ms`)!;
    expect(job.niqqud).toBe(word.verb!.past["3ms"].niqqud);
    expect(job.niqqud).not.toBe(word.verb!.past["3ms"].he);
  });

  it("set записывает путь в поле audio именно этой формы", () => {
    const word = katav();
    const job = jobsOf(word).find((j) => j.name === `${word.id}-form-future-3fp`)!;
    expect(job.has).toBeUndefined();
    job.set(`/audio/${job.name}.mp3`);
    expect(word.verb!.future["3fp"].audio).toBe(`/audio/${word.id}-form-future-3fp.mp3`);
    expect(word.verb!.future["3mp"].audio).toBeUndefined();
  });

  it("без повелительного наклонения файлов 23", () => {
    const word = katav();
    delete (word.verb as { imperative?: unknown }).imperative;
    expect(jobsOf(word).filter((j) => j.kind === "form")).toHaveLength(VERB_FORMS_TOTAL - 4);
  });

  it("--kinds word отдаёт только инфинитив, --only пропускает чужие слова", () => {
    const word = katav();
    expect(jobsOf(word, { kinds: ["word"] }).map((j) => j.name)).toEqual([word.id]);
    expect(jobsOf(word, { only: ["other"] })).toEqual([]);
    expect(jobsOf(word, { only: [word.id], kinds: ["form"] })).toHaveLength(VERB_FORMS_TOTAL);
  });

  it("имена всех заданий уникальны", () => {
    const names = jobsOf(katav()).map((j) => j.name);
    expect(new Set(names).size).toBe(names.length);
  });
});

describe("озвучка: прежние виды не изменились", () => {
  it("у прилагательного формы f, mp, fp называются <id>-form-<ключ>", () => {
    const word = {
      id: "colors-1-red",
      he: "אדום",
      niqqud: "אָדוֹם",
      forms: { f: { he: "אדומה", niqqud: "אֲדֻמָּה" }, mp: { he: "אדומים" }, fp: { he: "אדומות" } },
    };
    const forms = jobsOf(word).filter((j) => j.kind === "form");
    expect(forms.map((j) => j.name)).toEqual(["colors-1-red-form-f", "colors-1-red-form-mp", "colors-1-red-form-fp"]);
    expect(forms[1]!.niqqud).toBe("אדומים");
  });

  it("у существительного слово и фраза", () => {
    const word = { id: "animals-1-dog", he: "כלב", niqqud: "כֶּלֶב", example: { he: "זה כלב" } };
    expect(jobsOf(word).map((j) => j.name)).toEqual(["animals-1-dog", "animals-1-dog-phrase"]);
  });

  it("буква: название и слово-пример без своего файла", () => {
    const letters = [{ file: "alphabet-1.json", data: { letters: [{ id: "alef", name: { he: "אלף", niqqud: "אָלֶף" }, example: { he: "אריה", niqqud: "אַרְיֵה" } }] } }];
    const jobs: Job[] = buildJobs(letters);
    expect(jobs.map((j) => [j.kind, j.name])).toEqual([
      ["letter", "alef"],
      ["example", "alef-example"],
    ]);
  });

  it("у нейтральной фразы основной голос", () => {
    const word = { id: "animals-1-dog", he: "כלב", niqqud: "כֶּלֶב", example: { he: "זה כלב" } };
    expect(jobsOf(word).find((j) => j.kind === "phrase")!.voice).toBe("main");
  });

  it("виды озвучки перечислены целиком", () => {
    expect(ALL_KINDS).toEqual(["word", "form", "phrase", "letter", "example"]);
  });
});

describe("озвучка: фразы от первого лица (docs/CONTENT.md, «Фразы от первого лица»)", () => {
  const word = () => ({
    id: "weak-1-want",
    he: "לרצות",
    example: {
      he: "אני רוצה מים",
      translit: "ани роце маим",
      ru: "Я хочу воды",
      speaker: "m",
      female: { he: "אני רוצה מים", niqqud: "אני רוֹצָה מים", translit: "ани роца маим", ru: "Я хочу воды" },
    } as Record<string, unknown> & { female: Record<string, unknown> },
  });

  it("мужская фраза мужским голосом в <id>-phrase-m, женский вариант основным (женским) в <id>-phrase-f", () => {
    const jobs = jobsOf(word()).filter((j) => j.kind === "phrase");
    expect(jobs.map((j) => [j.name, j.voice])).toEqual([
      ["weak-1-want-phrase-m", "male"],
      ["weak-1-want-phrase-f", "main"],
    ]);
  });

  it("в синтезатор уходят огласовки варианта, если они есть", () => {
    const jobs = jobsOf(word()).filter((j) => j.kind === "phrase");
    expect(jobs[0]!.niqqud).toBe("אני רוצה מים");
    expect(jobs[1]!.niqqud).toBe("אני רוֹצָה מים");
  });

  it("set пишет путь в поле audio своего варианта", () => {
    const w = word();
    const [male, female] = jobsOf(w).filter((j) => j.kind === "phrase");
    male!.set("/audio/weak-1-want-phrase-m.mp3");
    female!.set("/audio/weak-1-want-phrase-f.mp3");
    expect(w.example.audio).toBe("/audio/weak-1-want-phrase-m.mp3");
    expect(w.example.female.audio).toBe("/audio/weak-1-want-phrase-f.mp3");
  });

  it("фраза, которую говорит женщина без варианта (слово «אני מצטערת»), основным голосом в <id>-phrase", () => {
    const w = { id: "phrases-2-im-sorry-f", he: "אני מצטערת", example: { he: "אני מצטערת על זה", speaker: "f" } };
    expect(jobsOf(w).filter((j) => j.kind === "phrase").map((j) => [j.name, j.voice])).toEqual([["phrases-2-im-sorry-f-phrase", "main"]]);
  });

  it("во всех уроках озвучка фраз лежит под именем, которое даёт задание (голос не перепутан)", () => {
    const dir = new URL("./lessons/", import.meta.url);
    const lessons = readdirSync(dir)
      .filter((f) => f.endsWith(".json"))
      .map((file) => ({ file, data: JSON.parse(readFileSync(new URL(file, dir), "utf8")) }));
    const wrong = (buildJobs(lessons, { kinds: ["phrase"] }) as Job[]).filter((j) => j.has !== undefined && j.has !== `/audio/${j.name}.mp3`);
    expect(wrong.map((j) => `${j.name}: ${j.has}`)).toEqual([]);
  });
});

import { describe, expect, it } from "vitest";
import { VERB_FORMS_TOTAL, VERB_TENSES, verbFormAudioPath, type VerbData } from "@milav/shared";
// @ts-expect-error модуль на чистом JS (tools/*.mjs), деклараций типов нет
import { ALL_KINDS, VERB_TENSE_ORDER, buildJobs } from "../tools/audio-jobs.mjs";
import { KATAV, katavWord } from "./verbFixture";

interface Job {
  kind: string;
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

  it("один файл на слово и 27 файлов на формы", () => {
    const jobs = jobsOf(katav());
    expect(jobs.filter((j) => j.kind === "word")).toHaveLength(1);
    expect(jobs.filter((j) => j.kind === "form")).toHaveLength(VERB_FORMS_TOTAL);
    expect(jobs.filter((j) => j.kind === "phrase")).toHaveLength(1);
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

  it("виды озвучки перечислены целиком", () => {
    expect(ALL_KINDS).toEqual(["word", "form", "phrase", "letter", "example"]);
  });
});

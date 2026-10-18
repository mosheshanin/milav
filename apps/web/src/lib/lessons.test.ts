import { describe, expect, it, vi } from "vitest";
import { alphabetAll, alphabetLessons, allLessons } from "@milav/content";
import { ALPHABET_ALL_ID, type AnyLesson } from "@milav/shared";
import {
  MAX_SAVED_LESSONS,
  UnknownLessonError,
  alphabetAllLessonIds,
  alphabetMetas,
  catalog,
  createLessonLoader,
  getLessonMeta,
  lessonMetas,
  readSaved,
  savedKey,
  withAlphabetAll,
  wordMetas,
  writeSaved,
  type LessonStore,
} from "./lessons";

function memoryStore(): LessonStore & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  };
}

const lesson = allLessons.find((l) => l.section === "nouns")!;
const meta = { id: lesson.id, v: "v1" };

describe("манифест в приложении", () => {
  it("те же уроки, что в контенте, алфавит первым", () => {
    expect(lessonMetas.map((l) => l.id)).toEqual(allLessons.map((l) => l.id));
    expect(alphabetMetas.every((l) => l.section === "alphabet")).toBe(true);
    expect(wordMetas.some((l) => l.section === "alphabet")).toBe(false);
    expect(alphabetMetas.length + wordMetas.length).toBe(lessonMetas.length);
    expect(getLessonMeta(lesson.id)?.title).toBe(lesson.title);
    expect(getLessonMeta("nope")).toBeUndefined();
  });

  it("каталог бейджей не пустой", () => {
    expect(catalog.badges.length).toBeGreaterThan(5);
  });
});

describe("сохранённые копии уроков", () => {
  it("сохраняется и читается по версии", () => {
    const store = memoryStore();
    writeSaved(store, meta, lesson);
    expect(readSaved(store, meta)).toEqual(lesson);
    expect(readSaved(store, { ...meta, v: "v2" })).toBeNull();
  });

  it("новая версия урока вытесняет старую", () => {
    const store = memoryStore();
    writeSaved(store, meta, lesson);
    writeSaved(store, { ...meta, v: "v2" }, lesson);
    expect(store.data.has(savedKey(meta))).toBe(false);
    expect(store.data.has(savedKey({ ...meta, v: "v2" }))).toBe(true);
  });

  it("хранится не больше MAX_SAVED_LESSONS уроков, удаляются самые давние", () => {
    const store = memoryStore();
    const ids = Array.from({ length: MAX_SAVED_LESSONS + 3 }, (_, i) => `l-${i}`);
    for (const id of ids) writeSaved(store, { id, v: "x" }, { ...lesson, id });
    const saved = [...store.data.keys()].filter((k) => k.startsWith("milav:lesson:"));
    expect(saved.length).toBe(MAX_SAVED_LESSONS);
    expect(store.data.has(savedKey({ id: "l-0", v: "x" }))).toBe(false);
    expect(store.data.has(savedKey({ id: ids.at(-1)!, v: "x" }))).toBe(true);
  });

  it("испорченная или чужая копия не используется", () => {
    const store = memoryStore();
    store.setItem(savedKey(meta), "{не json");
    expect(readSaved(store, meta)).toBeNull();
    store.setItem(savedKey(meta), JSON.stringify({ id: "other", words: [] }));
    expect(readSaved(store, meta)).toBeNull();
  });

  it("хранилище, которое бросает исключения, не ломает загрузку", () => {
    const broken: LessonStore = {
      getItem: () => {
        throw new Error("denied");
      },
      setItem: () => {
        throw new Error("quota");
      },
      removeItem: () => undefined,
    };
    expect(() => writeSaved(broken, meta, lesson)).not.toThrow();
    expect(readSaved(broken, meta)).toBeNull();
  });
});

describe("загрузка урока", () => {
  const metaOf = (id: string) => (id === lesson.id ? meta : undefined);

  it("первый раз с сервера, потом из памяти, одновременные запросы сливаются", async () => {
    const fetchLesson = vi.fn(async () => lesson as AnyLesson);
    const loader = createLessonLoader(fetchLesson, memoryStore(), metaOf);
    expect(loader.cached(lesson.id)).toBeUndefined();
    const [a, b] = await Promise.all([loader.load(lesson.id), loader.load(lesson.id)]);
    expect(a).toBe(b);
    expect(await loader.load(lesson.id)).toBe(a);
    expect(loader.cached(lesson.id)).toBe(a);
    expect(fetchLesson).toHaveBeenCalledTimes(1);
  });

  it("после перезапуска приложения берёт копию с устройства без запроса", async () => {
    const store = memoryStore();
    await createLessonLoader(async () => lesson, store, metaOf).load(lesson.id);
    const fetchLesson = vi.fn(async () => lesson as AnyLesson);
    const fresh = createLessonLoader(fetchLesson, store, metaOf);
    expect(fresh.cached(lesson.id)).toEqual(lesson);
    expect(await fresh.load(lesson.id)).toEqual(lesson);
    expect(fetchLesson).not.toHaveBeenCalled();
  });

  it("ошибка сервера доходит до экрана, а следующая попытка снова идёт на сервер", async () => {
    const fetchLesson = vi.fn().mockRejectedValueOnce(new Error("subscription_required")).mockResolvedValueOnce(lesson);
    const loader = createLessonLoader(fetchLesson, null, metaOf);
    await expect(loader.load(lesson.id)).rejects.toThrow("subscription_required");
    expect(await loader.load(lesson.id)).toBe(lesson);
    expect(fetchLesson).toHaveBeenCalledTimes(2);
  });

  it("урока нет в манифесте: сервер не спрашиваем", async () => {
    const fetchLesson = vi.fn(async () => lesson as AnyLesson);
    const loader = createLessonLoader(fetchLesson, null, metaOf);
    await expect(loader.load("nope-1")).rejects.toBeInstanceOf(UnknownLessonError);
    expect(fetchLesson).not.toHaveBeenCalled();
  });
});

describe("общая викторина по всем буквам", () => {
  const realIds = alphabetLessons.filter((l) => l.letters.length >= 5).map((l) => l.id);

  it("в неё входят уроки алфавита 1–5, урок со звуками дж, ж, ч нет", () => {
    expect(alphabetAllLessonIds()).toEqual(realIds);
    expect(alphabetAllLessonIds()).toHaveLength(5);
    expect(alphabetAllLessonIds()).not.toContain(alphabetLessons.at(-1)!.id);
  });

  it("«урок» собирается из загруженных уроков алфавита и совпадает с серверным", async () => {
    const fetchLesson = vi.fn(async (id: string) => allLessons.find((l) => l.id === id)!);
    const loader = withAlphabetAll(createLessonLoader(fetchLesson, null));
    expect(loader.cached(ALPHABET_ALL_ID)).toBeUndefined();
    const all = await loader.load(ALPHABET_ALL_ID);
    expect(all).toEqual(alphabetAll);
    // Каждый урок алфавита запрошен один раз, запроса «alphabet-all» к серверу нет.
    expect(fetchLesson.mock.calls.map(([id]) => id).sort()).toEqual([...realIds].sort());
    // Дальше всё из памяти.
    expect(loader.cached(ALPHABET_ALL_ID)).toEqual(alphabetAll);
    await loader.load(ALPHABET_ALL_ID);
    expect(fetchLesson).toHaveBeenCalledTimes(5);
  });

  it("обычные уроки идут как раньше, неизвестный урок не спрашивает сервер", async () => {
    const fetchLesson = vi.fn(async (id: string) => allLessons.find((l) => l.id === id)!);
    const loader = withAlphabetAll(createLessonLoader(fetchLesson, null));
    expect((await loader.load(lesson.id)).id).toBe(lesson.id);
    await expect(loader.load("nope")).rejects.toBeInstanceOf(UnknownLessonError);
    expect(fetchLesson).toHaveBeenCalledTimes(1);
  });

  it("ошибка загрузки одного из уроков алфавита доходит до экрана", async () => {
    const loader = withAlphabetAll(createLessonLoader(async () => Promise.reject(new Error("network")), null));
    await expect(loader.load(ALPHABET_ALL_ID)).rejects.toThrow("network");
  });
});

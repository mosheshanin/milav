// Уроки в приложении. Здесь только манифест (content/manifest.json): названия, темы, число слов, этапы. Слова урока
// приложение получает по API (GET /api/lessons/:id) с проверкой доступа, поэтому платных слов в файлах приложения нет.
// Загруженный урок хранится в памяти и в localStorage (по версии из манифеста), чтобы повторное открытие было мгновенным.
// Подробно: docs/CONTENT.md, «Манифест и выдача уроков».
import { manifest } from "@milav/content/manifest";
import { ALPHABET_SECTION, buildCatalog, type AnyLesson, type Catalog, type LessonMeta } from "@milav/shared";

/** Все уроки без слов: сначала алфавит по номеру, потом остальные. */
export const lessonMetas: readonly LessonMeta[] = manifest.lessons;
export const alphabetMetas: readonly LessonMeta[] = lessonMetas.filter((l) => l.section === ALPHABET_SECTION);
/** Уроки обычных разделов (слова). */
export const wordMetas: readonly LessonMeta[] = lessonMetas.filter((l) => l.section !== ALPHABET_SECTION);

export function getLessonMeta(id: string): LessonMeta | undefined {
  return lessonMetas.find((l) => l.id === id);
}

/** Каталог бейджей: тот же, что считает сервер (это проверяет тест content/manifest.test.ts). */
export const catalog: Catalog = buildCatalog(manifest.info);

// ---- Сохранённые копии уроков ----

/** Хранилище копий (localStorage или подмена в тестах). */
export interface LessonStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const KEY_PREFIX = "milav:lesson:";
/** Список сохранённых ключей, от старых к новым: по нему удаляются лишние копии. */
const INDEX_KEY = "milav:lessons";
/** Сколько уроков хранить на устройстве. Урок глаголов около 40 КБ, так что это меньше 0,5 МБ. */
export const MAX_SAVED_LESSONS = 12;

export function savedKey(meta: Pick<LessonMeta, "id" | "v">): string {
  return `${KEY_PREFIX}${meta.id}:${meta.v}`;
}

function readIndex(store: LessonStore): string[] {
  try {
    const raw: unknown = JSON.parse(store.getItem(INDEX_KEY) ?? "[]");
    return Array.isArray(raw) ? raw.filter((k): k is string => typeof k === "string" && k.startsWith(KEY_PREFIX)) : [];
  } catch {
    return [];
  }
}

/** Похоже ли сохранённое на урок с этим id (копию могли испортить или оставить старая версия приложения). */
function looksLikeLesson(value: unknown, id: string): value is AnyLesson {
  if (typeof value !== "object" || value === null) return false;
  const lesson = value as { id?: unknown; words?: unknown; letters?: unknown };
  return lesson.id === id && (Array.isArray(lesson.words) || Array.isArray(lesson.letters));
}

/** Сохранённая копия урока этой версии или null. */
export function readSaved(store: LessonStore | null, meta: Pick<LessonMeta, "id" | "v">): AnyLesson | null {
  if (!store) return null;
  try {
    const raw = store.getItem(savedKey(meta));
    if (!raw) return null;
    const value: unknown = JSON.parse(raw);
    return looksLikeLesson(value, meta.id) ? value : null;
  } catch {
    return null;
  }
}

/** Сохраняет урок. Старые версии этого урока и самые давние копии сверх MAX_SAVED_LESSONS удаляются. */
export function writeSaved(store: LessonStore | null, meta: Pick<LessonMeta, "id" | "v">, lesson: AnyLesson): void {
  if (!store) return;
  const key = savedKey(meta);
  const sameLesson = `${KEY_PREFIX}${meta.id}:`;
  const index = readIndex(store);
  const drop = index.filter((k) => k !== key && k.startsWith(sameLesson));
  const kept = [...index.filter((k) => k !== key && !k.startsWith(sameLesson)), key];
  while (kept.length > MAX_SAVED_LESSONS) drop.push(kept.shift()!);
  try {
    for (const k of drop) store.removeItem(k);
    store.setItem(key, JSON.stringify(lesson));
    store.setItem(INDEX_KEY, JSON.stringify(kept));
  } catch {
    // Место кончилось или хранилище недоступно: урок просто загрузится из сети в следующий раз.
  }
}

/** localStorage, если он есть и работает (в части окружений обращение к нему бросает исключение). */
export function browserLessonStore(): LessonStore | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export interface LessonLoader {
  /** Урок, если он уже есть в памяти или на устройстве (без запроса к серверу). */
  cached(id: string): AnyLesson | undefined;
  /** Урок из памяти, с устройства или с сервера. Одновременные запросы одного урока сливаются в один. */
  load(id: string): Promise<AnyLesson>;
}

/** Урока нет в манифесте этой версии приложения. */
export class UnknownLessonError extends Error {
  constructor(readonly lessonId: string) {
    super("lesson_not_found");
  }
}

export function createLessonLoader(
  fetchLesson: (id: string) => Promise<AnyLesson>,
  store: LessonStore | null,
  metaOf: (id: string) => Pick<LessonMeta, "id" | "v"> | undefined = getLessonMeta,
): LessonLoader {
  const memory = new Map<string, AnyLesson>();
  const pending = new Map<string, Promise<AnyLesson>>();

  function cached(id: string): AnyLesson | undefined {
    const inMemory = memory.get(id);
    if (inMemory) return inMemory;
    const meta = metaOf(id);
    const saved = meta ? readSaved(store, meta) : null;
    if (saved) memory.set(id, saved);
    return saved ?? undefined;
  }

  function load(id: string): Promise<AnyLesson> {
    const meta = metaOf(id);
    if (!meta) return Promise.reject(new UnknownLessonError(id));
    const ready = cached(id);
    if (ready) return Promise.resolve(ready);
    const inFlight = pending.get(id);
    if (inFlight) return inFlight;
    const request = fetchLesson(id)
      .then((lesson) => {
        memory.set(id, lesson);
        writeSaved(store, meta, lesson);
        return lesson;
      })
      .finally(() => pending.delete(id));
    pending.set(id, request);
    return request;
  }

  return { cached, load };
}

// Повторение слов (задача 10, docs/SPEC.md «Повторение»): коробки Лейтнера, подход «Повторить», «Мои слова».
//
// Состояние слова живёт в repeat_state и появляется при первом ответе. Пока строки нет, слово в первой коробке и его
// пора повторить на следующий день после изучения (initialRepeatState). Ответ проверяет сервер: выбор сверяет
// с id слова, набор с написанием. Повторённое слово засчитывается в цель дня и ритм, очков не даёт (решение владельца),
// поэтому накручивать нечего; к тому же одно слово можно повторить не чаще раза в день (после ответа оно не «пора»).
import { Hono } from "hono";
import { lessons } from "@milav/content";
import {
  PAID_LESSONS_OPEN,
  REPEAT_TYPES,
  applyRepeatAnswer,
  chooseRepeatWords,
  initialRepeatState,
  isRepeatDue,
  lessonOpenWithoutPurchase,
  localEpochDay,
  parseDbTime,
  repeatDueIn,
  repeatSummary,
  repeatTypesFor,
  utcEpochDay,
  type Lesson,
  type MyWordsResponse,
  type RepeatAnswerResponse,
  type RepeatQuestion,
  type RepeatSessionResponse,
  type RepeatState,
  type RepeatSummary,
  type RepeatType,
  type RepeatWord,
  type Word,
} from "@milav/shared";
import { requireUser } from "./auth";
import { parseJson, readBodyLimited } from "./body";
import type { AppEnv } from "./env";
import { nowSeconds, repeatOn, statsFor } from "./play";
import { secureRandom, type Rng } from "./quizGen";
import { rateLimit } from "./rateLimit";
import { verifyTyped } from "./stageProof";
import { recordRepeatAnswer } from "./stats";
import { logEvent } from "./telemetry";

/** Слова по id: поиск за один шаг (findWord перебирает все уроки, а слов будет 2000). */
const WORDS = new Map<string, { lesson: Lesson; word: Word }>(
  lessons.flatMap((lesson) => lesson.words.map((word) => [word.id, { lesson, word }] as const)),
);

/** Слово доступно для повторения: оно есть в контенте и урок открыт (платные уроки после Stars, задача 8). */
function repeatable(wordId: string): { lesson: Lesson; word: Word } | undefined {
  const found = WORDS.get(wordId);
  return found && lessonOpenWithoutPurchase(found.lesson, PAID_LESSONS_OPEN) ? found : undefined;
}

export function toRepeatWord(lesson: Lesson, w: Word): RepeatWord {
  return {
    id: w.id,
    lessonId: lesson.id,
    he: w.he,
    translit: w.translit,
    ru: w.ru,
    ...(w.niqqud ? { niqqud: w.niqqud } : {}),
    ...(w.audio ? { audio: w.audio } : {}),
  };
}

interface LearnedRow {
  word_id: string;
  completed_at: string;
  box: number | null;
  due_day: number | null;
  best_box: number | null;
  reps: number | null;
  lapses: number | null;
}

export interface LearnedItem extends RepeatState {
  wordId: string;
  lesson: Lesson;
  word: Word;
  /** Строка в repeat_state уже есть (иначе состояние начальное). */
  stored: boolean;
}

const LEARNED_SQL = `
SELECT wp.word_id, wp.completed_at, r.box, r.due_day, r.best_box, r.reps, r.lapses
FROM word_progress wp LEFT JOIN repeat_state r ON r.user_id = wp.user_id AND r.word_id = wp.word_id
WHERE wp.user_id = ? AND wp.completed_at IS NOT NULL AND wp.lesson_id NOT LIKE 'alphabet-%'`;

function toItem(row: LearnedRow): LearnedItem | null {
  const found = repeatable(row.word_id);
  if (!found) return null;
  const ms = parseDbTime(row.completed_at);
  const state: RepeatState =
    row.box !== null && row.due_day !== null
      ? { box: row.box, dueDay: row.due_day, bestBox: row.best_box ?? row.box, reps: row.reps ?? 0, lapses: row.lapses ?? 0 }
      : initialRepeatState(Number.isNaN(ms) ? 0 : utcEpochDay(ms));
  return { wordId: row.word_id, lesson: found.lesson, word: found.word, stored: row.box !== null, ...state };
}

/** Все выученные слова пользователя (буквы алфавита не повторяются) с их коробками. Один запрос. */
export async function loadLearned(db: D1Database, userId: number, wordId?: string): Promise<LearnedItem[]> {
  const sql = wordId ? `${LEARNED_SQL} AND wp.word_id = ?` : LEARNED_SQL;
  const stmt = wordId ? db.prepare(sql).bind(userId, wordId) : db.prepare(sql).bind(userId);
  const { results } = await stmt.all<LearnedRow>();
  return results.map(toItem).filter((i): i is LearnedItem => i !== null);
}

/** Сводка для главной (/api/home). */
export async function repeatSummaryFor(db: D1Database, userId: number, tz: string, now: number): Promise<RepeatSummary> {
  return repeatSummary(await loadLearned(db, userId), localEpochDay(tz, now * 1000));
}

/**
 * Сколько слов пора повторить у нескольких учеников, одним запросом SQL (для напоминаний бота: за один запуск таймера
 * число обращений к базе ограничено). У каждого свой местный день. У слова без строки повторения день считается так же,
 * как в initialRepeatState: день изучения по UTC плюс один. Доступ к платным урокам здесь не проверяется: для текста
 * напоминания это неважно. Не больше 45 учеников за раз (в D1 до 100 параметров в запросе).
 */
export async function countDueForReminders(db: D1Database, list: readonly { userId: number; day: number }[]): Promise<Map<number, number>> {
  const out = new Map<number, number>();
  if (list.length === 0) return out;
  const values = list.map(() => "(?, ?)").join(", ");
  const { results } = await db
    .prepare(
      `WITH t(uid, day) AS (VALUES ${values})
       SELECT t.uid AS uid, COUNT(*) AS n
       FROM t JOIN word_progress wp ON wp.user_id = t.uid
         LEFT JOIN repeat_state r ON r.user_id = wp.user_id AND r.word_id = wp.word_id
       WHERE wp.completed_at IS NOT NULL AND wp.lesson_id NOT LIKE 'alphabet-%'
         AND COALESCE(r.due_day, CAST(julianday(wp.completed_at) - 2440587.5 AS INTEGER) + 1) <= t.day
       GROUP BY t.uid`,
    )
    .bind(...list.flatMap((x) => [x.userId, x.day]))
    .all<{ uid: number; n: number }>();
  for (const r of results) out.set(r.uid, r.n);
  return out;
}

function shuffle<T>(items: T[], rng: Rng): T[] {
  const a = items.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

/**
 * Подход «Повторить»: до REPEAT_SESSION_SIZE слов, которые пора повторить, по одному упражнению на слово.
 * Неверные варианты берутся из того же урока (слова одной темы, как в викторине).
 */
export function buildRepeatSession(items: readonly LearnedItem[], today: number, rng: Rng = secureRandom): Omit<RepeatSessionResponse, "summary"> {
  const chosen = chooseRepeatWords(items, today);
  const types = repeatTypesFor(chosen.length, rng);
  const words: Record<string, RepeatWord> = {};
  const questions: RepeatQuestion[] = chosen.map((item, i) => {
    const type = types[i]!;
    words[item.wordId] = toRepeatWord(item.lesson, item.word);
    if (type === "type") return { wordId: item.wordId, type, options: [] };
    const distractors = shuffle(
      item.lesson.words.filter((w) => w.id !== item.wordId && w.ru !== item.word.ru && w.he !== item.word.he),
      rng,
    ).slice(0, 3);
    for (const d of distractors) words[d.id] = toRepeatWord(item.lesson, d);
    return { wordId: item.wordId, type, options: shuffle([item.wordId, ...distractors.map((d) => d.id)], rng) };
  });
  return { questions, words };
}

async function readJson<T>(request: Request): Promise<T | null> {
  const bytes = await readBodyLimited(request, 8 * 1024);
  return bytes ? parseJson<T>(bytes) : null;
}

export const repeatRoutes = new Hono<AppEnv>();

// Функция выключена в панели («Повторение слов»): маршруты отвечают 403, приложение прячет карточку.
repeatRoutes.use("/api/repeat/*", requireUser, async (c, next) => {
  if (!(await repeatOn(c.env, c.get("user").id))) return c.json({ error: "feature_off" }, 403);
  await next();
});

// Новый подход: слова, которые пора повторить, и упражнения к ним. Ничего не пишет (кроме ленивой строки счётчиков).
repeatRoutes.get("/api/repeat/session", async (c) => {
  const user = c.get("user");
  const now = nowSeconds();
  const stats = await statsFor(c.env, user, now);
  const today = localEpochDay(stats.tz, now * 1000);
  const items = await loadLearned(c.env.DB, user.id);
  const body: RepeatSessionResponse = { ...buildRepeatSession(items, today), summary: repeatSummary(items, today) };
  if (body.questions.length > 0) logEvent("repeat_start", { uid: user.id, words: body.questions.length });
  return c.json(body);
});

// Ответ на одно слово: { wordId, type, choice | typed | giveUp }.
repeatRoutes.post("/api/repeat/answer", rateLimit("repeat"), async (c) => {
  const user = c.get("user");
  const body = await readJson<{ wordId?: unknown; type?: unknown; choice?: unknown; typed?: unknown; giveUp?: unknown }>(c.req.raw);
  if (!body || typeof body.wordId !== "string" || !REPEAT_TYPES.includes(body.type as RepeatType)) {
    return c.json({ error: "bad_request" }, 400);
  }
  const type = body.type as RepeatType;
  const found = WORDS.get(body.wordId);
  if (!found) return c.json({ error: "word_not_found" }, 404);
  if (!repeatable(body.wordId)) return c.json({ error: "subscription_required" }, 403);

  let correct: boolean;
  if (body.giveUp === true) correct = false;
  else if (type === "type") {
    const proof = verifyTyped(found.word, body.typed);
    if (!proof.ok && proof.status === 400) return c.json({ error: "proof_required" }, 400);
    correct = proof.ok;
  } else {
    if (typeof body.choice !== "string" || body.choice.length > 128) return c.json({ error: "bad_choice" }, 400);
    correct = body.choice === body.wordId;
  }

  const now = nowSeconds();
  const stats = await statsFor(c.env, user, now);
  const today = localEpochDay(stats.tz, now * 1000);
  const [item] = await loadLearned(c.env.DB, user.id, body.wordId);
  if (!item) return c.json({ error: "not_learned" }, 409);
  if (!isRepeatDue(item, today)) return c.json({ error: "not_due", dueIn: repeatDueIn(item.dueDay, today) }, 409);

  const { state, mastered } = applyRepeatAnswer(item, correct, today);
  const db = c.env.DB;
  // Запись со сравнением: параллельный ответ на то же слово не засчитается дважды. Счётчики для бейджей растут
  // в том же пакете и только если ответ записан (changes() относится к предыдущему оператору).
  const write = item.stored
    ? db
        .prepare(
          `UPDATE repeat_state SET box = ?, due_day = ?, best_box = ?, reps = ?, lapses = ?, last_day = ?
           WHERE user_id = ? AND word_id = ? AND box = ? AND due_day = ? AND reps = ? AND lapses = ?`,
        )
        .bind(state.box, state.dueDay, state.bestBox, state.reps, state.lapses, today, user.id, item.wordId, item.box, item.dueDay, item.reps, item.lapses)
    : db
        .prepare(
          `INSERT OR IGNORE INTO repeat_state (user_id, word_id, lesson_id, box, due_day, best_box, reps, lapses, last_day)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(user.id, item.wordId, item.lesson.id, state.box, state.dueDay, state.bestBox, state.reps, state.lapses, today);
  const delta = { repeats: correct ? 1 : 0, mastered: mastered ? 1 : 0 };
  const [written] = await db.batch([
    write,
    db
      .prepare("UPDATE user_stats SET repeats_done = repeats_done + ?, words_mastered = words_mastered + ? WHERE user_id = ? AND changes() > 0")
      .bind(delta.repeats, delta.mastered, user.id),
  ]);
  if ((written?.meta?.changes ?? 0) === 0) return c.json({ error: "answer_conflict" }, 409);

  const play = await recordRepeatAnswer(db, stats, delta, now);
  logEvent("repeat_answer", { uid: user.id, word: item.wordId, type, correct, box: state.box });
  const response: RepeatAnswerResponse = { correct, box: state.box, dueIn: repeatDueIn(state.dueDay, today), play };
  return c.json(response);
});

// «Мои слова»: все выученные слова с коробками, сначала те, что пора повторить.
repeatRoutes.get("/api/repeat/words", async (c) => {
  const user = c.get("user");
  const now = nowSeconds();
  const stats = await statsFor(c.env, user, now);
  const today = localEpochDay(stats.tz, now * 1000);
  const items = await loadLearned(c.env.DB, user.id);
  const body: MyWordsResponse = {
    items: items
      .map((i) => ({ word: toRepeatWord(i.lesson, i.word), box: i.box, dueIn: repeatDueIn(i.dueDay, today), reps: i.reps, lapses: i.lapses }))
      .sort((a, b) => a.dueIn - b.dueIn || a.box - b.box || a.word.ru.localeCompare(b.word.ru, "ru")),
    summary: repeatSummary(items, today),
  };
  return c.json(body);
});

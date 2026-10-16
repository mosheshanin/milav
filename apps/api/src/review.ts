// Проверка слов носителем (панель, этап 3: docs/ADMIN.md, «Этап 3: как сделано»).
//
// Маршруты /api/review/* открыты всей команде (администраторам и проверяющим). Отзывы пишутся в content_reviews
// и уроки не меняют: правки переносит Claude (`npm run content:reviews`), после чего у слова меняется отпечаток,
// и отзыв перестаёт «ждать переноса». Выгрузка для переноса открыта только администраторам.
import { Hono } from "hono";
import { allLessons } from "@milav/content";
import {
  LEADERBOARD_TZ,
  checkReview,
  epochDayToIso,
  isAlphabetLesson,
  isLetter,
  localEpochDay,
  reviewFingerprint,
  reviewStatusOf,
  type AnyLesson,
  type ReviewEntry,
  type ReviewExportResponse,
  type ReviewItemResponse,
  type ReviewListResponse,
  type ReviewSaveRequest,
  type ReviewVerdict,
  type StudyItem,
} from "@milav/shared";
import { logStatement, requireStaff } from "./admin";
import { requireUser } from "./auth";
import { parseJson, readBodyLimited } from "./body";
import type { AppEnv } from "./env";
import { rateLimit } from "./rateLimit";
import { logEvent } from "./telemetry";

const nowSeconds = () => Math.floor(Date.now() / 1000);

interface Indexed {
  item: StudyItem;
  lesson: AnyLesson;
}

/** Все слова и буквы по id, в порядке уроков. Строится один раз на экземпляр Worker. */
let index: Map<string, Indexed> | null = null;
const fingerprints = new Map<string, string>();

function itemIndex(): Map<string, Indexed> {
  if (index) return index;
  index = new Map();
  for (const lesson of allLessons) {
    const items: StudyItem[] = isAlphabetLesson(lesson) ? lesson.letters : lesson.words;
    for (const item of items) index.set(item.id, { item, lesson });
  }
  return index;
}

/** Отпечаток слова (считается один раз: контент меняется только с выкладкой). */
function versionOf(item: StudyItem): string {
  let v = fingerprints.get(item.id);
  if (!v) {
    v = reviewFingerprint(item);
    fingerprints.set(item.id, v);
  }
  return v;
}

const lessonTitle = (lesson: AnyLesson) => `${lesson.topic} · ${lesson.number}. ${lesson.title}`;

interface ReviewRow {
  item_id: string;
  reviewer: number;
  lesson_id: string;
  version: string;
  verdict: ReviewVerdict;
  fixes: string;
  comment: string;
  updated_at: number;
  first_name?: string | null;
}

function parseFixes(text: string): Record<string, string> {
  try {
    const value = JSON.parse(text) as unknown;
    return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, string>) : {};
  } catch {
    return {};
  }
}

/** Отзыв, который ещё относится к текущей версии слова (не перенесён и слово с тех пор не меняли). */
function isCurrent(row: Pick<ReviewRow, "item_id" | "version">): boolean {
  const found = itemIndex().get(row.item_id);
  return !!found && versionOf(found.item) === row.version;
}

const parseItemId = (value: string | undefined) => (value && /^[a-z0-9-]{1,80}$/.test(value) ? value : null);

export const reviewRoutes = new Hono<AppEnv>();

reviewRoutes.use("/api/review/*", requireUser, requireStaff, rateLimit("review"));

// Список всех слов и букв с состоянием проверки. Отзывов немного (слова × проверяющие), читаются одним запросом.
reviewRoutes.get("/api/review/items", async (c) => {
  const me = c.get("user").id;
  const { results } = await c.env.DB.prepare("SELECT item_id, reviewer, version, verdict FROM content_reviews").all<ReviewRow>();
  const current = new Map<string, ReviewVerdict[]>();
  const mine = new Map<string, ReviewVerdict>();
  let pending = 0;
  for (const row of results) {
    if (!isCurrent(row)) continue;
    pending += 1;
    current.set(row.item_id, [...(current.get(row.item_id) ?? []), row.verdict]);
    if (row.reviewer === me) mine.set(row.item_id, row.verdict);
  }

  const body: ReviewListResponse = {
    lessons: allLessons.map((l) => ({ id: l.id, title: lessonTitle(l) })),
    items: [...itemIndex().values()].map(({ item, lesson }) => {
      const letter = isLetter(item);
      return {
        id: item.id,
        kind: letter ? "letter" : "word",
        lessonId: lesson.id,
        he: item.he,
        // У буквы главное название («алеф»), под ним звук.
        translit: letter ? item.sound : item.translit,
        ru: letter ? item.name.ru : item.ru,
        hasImage: !!(letter ? item.example.image : item.image),
        status: reviewStatusOf(item.reviewed, current.get(item.id) ?? []),
        mine: mine.get(item.id) ?? null,
        reviewed: item.reviewed,
      };
    }),
    pending,
  };
  return c.json(body);
});

// Слово или буква целиком, отпечаток версии и все отзывы на него (текущие и история).
reviewRoutes.get("/api/review/items/:id", async (c) => {
  const id = parseItemId(c.req.param("id"));
  const found = id ? itemIndex().get(id) : undefined;
  if (!found) return c.json({ error: "not_found" }, 404);
  const me = c.get("user").id;
  const { results } = await c.env.DB
    .prepare(
      `SELECT r.item_id, r.reviewer, r.lesson_id, r.version, r.verdict, r.fixes, r.comment, r.updated_at, u.first_name
       FROM content_reviews r LEFT JOIN users u ON u.id = r.reviewer WHERE r.item_id = ? ORDER BY r.updated_at DESC`,
    )
    .bind(found.item.id)
    .all<ReviewRow>();
  const version = versionOf(found.item);
  const reviews: ReviewEntry[] = results.map((r) => ({
    reviewer: r.reviewer,
    reviewerName: r.first_name ?? null,
    verdict: r.verdict,
    fixes: parseFixes(r.fixes),
    comment: r.comment,
    at: r.updated_at,
    current: r.version === version,
    mine: r.reviewer === me,
  }));
  const body: ReviewItemResponse = { item: found.item, lessonId: found.lesson.id, lessonTitle: lessonTitle(found.lesson), version, reviews };
  return c.json(body);
});

// Поставить «верно» или замечания: { verdict, fixes, comment, version }. Повторный отзыв заменяет прежний.
reviewRoutes.put("/api/review/items/:id", async (c) => {
  const id = parseItemId(c.req.param("id"));
  const found = id ? itemIndex().get(id) : undefined;
  if (!found) return c.json({ error: "not_found" }, 404);
  // У глагола до 81 поля, по 200 знаков каждое (в UTF-8 до 4 байт на знак).
  const bytes = await readBodyLimited(c.req.raw, 96 * 1024);
  const body = bytes ? parseJson<Partial<ReviewSaveRequest>>(bytes) : null;
  if (!body || typeof body !== "object" || Array.isArray(body)) return c.json({ error: "bad_body" }, 400);
  const version = versionOf(found.item);
  // Слово поменяли (например, перенесли чужие правки), пока проверяющий смотрел старую версию.
  if (body.version !== version) return c.json({ error: "stale" }, 409);
  const check = checkReview(found.item, body);
  if (!check.ok) return c.json({ error: check.error }, 400);

  const actor = c.get("user").id;
  const old = await c.env.DB
    .prepare("SELECT verdict, fixes, comment, version FROM content_reviews WHERE item_id = ? AND reviewer = ?")
    .bind(found.item.id, actor)
    .first<Pick<ReviewRow, "verdict" | "fixes" | "comment" | "version">>();
  const next = { verdict: check.verdict, fixes: check.fixes, comment: check.comment };
  const fixesText = JSON.stringify(check.fixes);
  if (old && old.version === version && old.verdict === check.verdict && old.fixes === fixesText && old.comment === check.comment) {
    return c.json({ ok: true, changed: false });
  }

  const now = nowSeconds();
  await c.env.DB.batch([
    c.env.DB
      .prepare(
        `INSERT INTO content_reviews (item_id, reviewer, lesson_id, version, verdict, fixes, comment, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
         ON CONFLICT (item_id, reviewer) DO UPDATE SET lesson_id = excluded.lesson_id, version = excluded.version,
           verdict = excluded.verdict, fixes = excluded.fixes, comment = excluded.comment, updated_at = excluded.updated_at`,
      )
      .bind(found.item.id, actor, found.lesson.id, version, check.verdict, fixesText, check.comment, now),
    logStatement(
      c.env.DB,
      actor,
      "review.set",
      found.item.id,
      old ? { verdict: old.verdict, fixes: parseFixes(old.fixes), comment: old.comment } : undefined,
      next,
      now,
    ),
  ]);
  logEvent("review_set", { uid: actor, item: found.item.id, verdict: check.verdict, fixes: Object.keys(check.fixes).length });
  return c.json({ ok: true, changed: true });
});

// Отозвать свой отзыв.
reviewRoutes.delete("/api/review/items/:id", async (c) => {
  const id = parseItemId(c.req.param("id"));
  if (!id) return c.json({ error: "not_found" }, 404);
  const actor = c.get("user").id;
  const old = await c.env.DB
    .prepare("SELECT verdict, fixes, comment FROM content_reviews WHERE item_id = ? AND reviewer = ?")
    .bind(id, actor)
    .first<Pick<ReviewRow, "verdict" | "fixes" | "comment">>();
  if (!old) return c.json({ error: "not_found" }, 404);
  const now = nowSeconds();
  await c.env.DB.batch([
    c.env.DB.prepare("DELETE FROM content_reviews WHERE item_id = ? AND reviewer = ?").bind(id, actor),
    logStatement(c.env.DB, actor, "review.remove", id, { verdict: old.verdict, fixes: parseFixes(old.fixes), comment: old.comment }, undefined, now),
  ]);
  logEvent("review_remove", { uid: actor, item: id });
  return c.json({ ok: true });
});

// Выгрузка отзывов, которые ждут переноса в уроки (только администраторы). Её читает `npm run content:reviews`.
reviewRoutes.get("/api/review/export", async (c) => {
  if (c.get("staff")?.role !== "admin") return c.json({ error: "forbidden" }, 403);
  const { results } = await c.env.DB
    .prepare(
      `SELECT r.item_id, r.reviewer, r.lesson_id, r.version, r.verdict, r.fixes, r.comment, r.updated_at, u.first_name
       FROM content_reviews r LEFT JOIN users u ON u.id = r.reviewer ORDER BY r.item_id, r.updated_at`,
    )
    .all<ReviewRow>();
  const body: ReviewExportResponse = {
    exportedAt: nowSeconds(),
    items: results.filter(isCurrent).map((r) => ({
      itemId: r.item_id,
      lessonId: itemIndex().get(r.item_id)!.lesson.id,
      version: r.version,
      reviewer: r.reviewer,
      reviewerName: r.first_name ?? null,
      verdict: r.verdict,
      fixes: parseFixes(r.fixes),
      comment: r.comment,
      date: epochDayToIso(localEpochDay(LEADERBOARD_TZ, r.updated_at * 1000)),
    })),
  };
  return c.json(body);
});

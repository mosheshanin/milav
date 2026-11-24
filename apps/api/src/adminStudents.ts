// Разделы панели «Аналитика» (этап 4) и «Ученики» (этап 5), 24.11.2026, docs/ADMIN.md.
// «Ученики»: список с поиском по имени, username или Telegram id, карточка ученика и одно действие: убрать из таблицы
// лидеров (флаг lb_banned, например за оскорбительное имя) или вернуть. Что видит команда, сказано в политике
// конфиденциальности (packages/shared/src/privacy.ts, «Кто видит ваши данные»).
import { catalog, getAnyLesson } from "@milav/content";
import {
  ALPHABET_ALL_ID,
  epochDayToIso,
  statusForPassedLessons,
  type AdminStudentResponse,
  type AdminStudentsResponse,
  type StaffRole,
  type StudentRow,
} from "@milav/shared";
import { adminRoutes, logStatement, ownerIds, readJson } from "./admin";
import { buildAnalytics, lessonLabel } from "./adminAnalytics";
import { nowSeconds } from "./play";
import { logEvent } from "./telemetry";

/** Учеников на странице списка. */
export const STUDENTS_PAGE = 30;
/** Последних попыток викторины в карточке. */
const ATTEMPTS_SHOWN = 15;

const ROW_SELECT = `
  SELECT u.id AS id, u.first_name AS first, u.last_name AS last, u.username AS username,
         u.created_at AS created, u.last_seen_at AS seen,
         COALESCE(s.words_done + s.letters_done, 0) AS points, COALESCE(s.passed_lessons, 0) AS passed,
         COALESCE(s.lb_optin, 0) AS optin, COALESCE(s.lb_banned, 0) AS banned,
         (SELECT COUNT(*) FROM user_badges b WHERE b.user_id = u.id) AS badges,
         COALESCE((SELECT r.enabled FROM reminders r WHERE r.user_id = u.id), 0) AS reminders
  FROM users u LEFT JOIN user_stats s ON s.user_id = u.id`;

type Row = Record<string, unknown>;

function toStudentRow(r: Row): StudentRow {
  const passed = Number(r.passed ?? 0);
  return {
    id: Number(r.id),
    name: [r.first, r.last].filter((x) => typeof x === "string" && x.trim()).join(" ") || "Без имени",
    username: typeof r.username === "string" && r.username ? r.username : null,
    createdAt: String(r.created),
    lastSeenAt: String(r.seen),
    points: Number(r.points ?? 0),
    passedLessons: passed,
    statusName: statusForPassedLessons(passed).name,
    badges: Number(r.badges ?? 0),
    leaderboard: !!r.optin,
    banned: !!r.banned,
    reminders: !!r.reminders,
  };
}

/**
 * Условие поиска: число ищется как Telegram id, текст как часть имени, фамилии или username (без учёта регистра
 * для латиницы; кириллицу SQLite сравнивает как есть). Знаки `%` и `_` в запросе экранируются.
 */
export function studentFilter(query: string): { where: string; params: (string | number)[] } {
  const q = query.trim().replace(/^@/, "").slice(0, 64);
  if (!q) return { where: "", params: [] };
  if (/^\d{1,15}$/.test(q)) return { where: " WHERE u.id = ?", params: [Number(q)] };
  const like = `%${q.replace(/[\\%_]/g, (ch) => `\\${ch}`)}%`;
  return {
    where: " WHERE u.first_name LIKE ?1 ESCAPE '\\' OR u.last_name LIKE ?1 ESCAPE '\\' OR u.username LIKE ?1 ESCAPE '\\'",
    params: [like],
  };
}

// Аналитика: удержание, воронка, уроки, трудные слова, произношение (adminAnalytics.ts).
adminRoutes.get("/api/admin/analytics", async (c) => c.json(await buildAnalytics(c.env.DB, Date.now())));

// Список учеников: сначала те, кто заходил недавно.
adminRoutes.get("/api/admin/students", async (c) => {
  const offset = Math.max(0, Math.min(1_000_000, Number.parseInt(c.req.query("offset") ?? "0", 10) || 0));
  const { where, params } = studentFilter(c.req.query("q") ?? "");
  // Номера параметров: у поиска ?1, у страницы следующие.
  const n = params.length;
  const [list, total] = await c.env.DB.batch([
    c.env.DB
      .prepare(`${ROW_SELECT}${where} ORDER BY u.last_seen_at DESC, u.id LIMIT ?${n + 1} OFFSET ?${n + 2}`)
      .bind(...params, STUDENTS_PAGE + 1, offset),
    c.env.DB.prepare(`SELECT COUNT(*) AS n FROM users u${where}`).bind(...params),
  ]);
  const found = (list?.results ?? []) as Row[];
  const body: AdminStudentsResponse = {
    items: found.slice(0, STUDENTS_PAGE).map(toStudentRow),
    total: Number(((total?.results ?? [])[0] as Row | undefined)?.n ?? 0),
    nextOffset: found.length > STUDENTS_PAGE ? offset + STUDENTS_PAGE : null,
  };
  return c.json(body);
});

// Карточка ученика: прогресс, настройки, сданные уроки, последние попытки, бейджи, напоминания, роль.
adminRoutes.get("/api/admin/students/:id", async (c) => {
  const id = Number.parseInt(c.req.param("id"), 10);
  if (!Number.isSafeInteger(id) || id <= 0) return c.json({ error: "bad_id" }, 400);
  const db = c.env.DB;
  const [rowRes, statsRes, passedRes, attemptsRes, badgesRes, reminderRes, staffRes] = await db.batch([
    db.prepare(`${ROW_SELECT} WHERE u.id = ?`).bind(id),
    db.prepare("SELECT * FROM user_stats WHERE user_id = ?").bind(id),
    db.prepare("SELECT lesson_id, first_passed_at FROM lesson_passed WHERE user_id = ? ORDER BY first_passed_at DESC").bind(id),
    db
      .prepare("SELECT lesson_id, correct, total, passed, created_at FROM quiz_attempts WHERE user_id = ? ORDER BY created_at DESC, id DESC LIMIT ?")
      .bind(id, ATTEMPTS_SHOWN),
    db.prepare("SELECT badge_id, earned_at FROM user_badges WHERE user_id = ? ORDER BY earned_at DESC").bind(id),
    db.prepare("SELECT enabled, minute, blocked FROM reminders WHERE user_id = ?").bind(id),
    db.prepare("SELECT role FROM staff WHERE user_id = ?").bind(id),
  ]);
  const row = (rowRes?.results ?? [])[0] as Row | undefined;
  if (!row) return c.json({ error: "not_found" }, 404);
  const s = ((statsRes?.results ?? [])[0] ?? {}) as Row;
  const reminder = (reminderRes?.results ?? [])[0] as Row | undefined;
  const staffRow = (staffRes?.results ?? [])[0] as Row | undefined;
  const staffRole: StaffRole | null = ownerIds(c.env).has(id) ? "admin" : staffRow ? (String(staffRow.role) as StaffRole) : null;
  const title = (lessonId: string) => lessonLabel(getAnyLesson(lessonId), lessonId);
  const lastDay = Number(s.last_day ?? 0);
  const body: AdminStudentResponse = {
    student: toStudentRow(row),
    settings: {
      dailyGoal: Number(s.daily_goal ?? 0),
      gender: String(s.gender ?? "m"),
      tz: String(s.tz ?? ""),
      cohortExcluded: !!s.cohort_excluded,
    },
    progress: {
      words: Number(s.words_done ?? 0),
      letters: Number(s.letters_done ?? 0),
      activeDays: Number(s.active_days ?? 0),
      rhythmWeeks: Number(s.rhythm_weeks ?? 0),
      goalDays: Number(s.goal_days ?? 0),
      repeats: Number(s.repeats_done ?? 0),
      mastered: Number(s.words_mastered ?? 0),
      lastDay: lastDay > 0 ? epochDayToIso(lastDay) : null,
    },
    lessons: ((passedRes?.results ?? []) as Row[]).map((r) => ({
      lessonId: String(r.lesson_id),
      title: title(String(r.lesson_id)),
      passedAt: String(r.first_passed_at),
    })),
    attempts: ((attemptsRes?.results ?? []) as Row[]).map((r) => ({
      lessonId: String(r.lesson_id),
      title: String(r.lesson_id) === ALPHABET_ALL_ID ? "Общая викторина по алфавиту" : title(String(r.lesson_id)),
      correct: Number(r.correct),
      total: Number(r.total),
      passed: !!r.passed,
      at: String(r.created_at),
    })),
    badges: ((badgesRes?.results ?? []) as Row[]).map((r) => ({
      id: String(r.badge_id),
      title: catalog.byId.get(String(r.badge_id))?.title ?? String(r.badge_id),
      earnedAt: Number(r.earned_at),
    })),
    reminder: reminder ? { enabled: !!reminder.enabled, minute: Number(reminder.minute), blocked: !!reminder.blocked } : null,
    staffRole,
  };
  return c.json(body);
});

// Убрать ученика из таблицы лидеров или вернуть (lb_banned). Имя пропадает сразу: таблица фильтрует участников при чтении.
adminRoutes.put("/api/admin/students/:id/leaderboard", async (c) => {
  const id = Number.parseInt(c.req.param("id"), 10);
  const body = await readJson<{ banned?: unknown }>(c.req.raw);
  if (!Number.isSafeInteger(id) || id <= 0 || typeof body?.banned !== "boolean") return c.json({ error: "bad_request" }, 400);
  const banned = body.banned;
  const current = await c.env.DB.prepare("SELECT lb_banned FROM user_stats WHERE user_id = ?").bind(id).first<{ lb_banned: number }>();
  if (!current) return c.json({ error: "not_found" }, 404);
  if (!!current.lb_banned === banned) return c.json({ ok: true, changed: false });
  const actor = c.get("user").id;
  const now = nowSeconds();
  await c.env.DB.batch([
    c.env.DB.prepare("UPDATE user_stats SET lb_banned = ? WHERE user_id = ?").bind(banned ? 1 : 0, id),
    logStatement(c.env.DB, actor, "student.leaderboard", String(id), !banned, banned, now),
  ]);
  logEvent("admin_student", { uid: actor, target: id, banned });
  return c.json({ ok: true, changed: true });
});

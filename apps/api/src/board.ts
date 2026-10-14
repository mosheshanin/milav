// Таблица лидеров: снимки в D1 и ответ API (docs/GAMIFICATION.md, раздел 8).
//
// Таблицу нельзя считать на каждый просмотр, поэтому участники собираются в снимок (одна строка board_snapshots),
// который обновляется лениво не чаще раза в BOARD_TTL_SECONDS одним обновителем (аренда lease_until). Имена и согласие
// проверяются в момент чтения, поэтому вышедший из таблицы исчезает сразу, не дожидаясь нового снимка.
import {
  BOARD_LEASE_SECONDS,
  BOARD_TTL_SECONDS,
  LEADERBOARD_AROUND,
  LEADERBOARD_TOP,
  LEADERBOARD_TZ,
  cleanDisplayName,
  epochDayToIso,
  localEpochDay,
  ranksOf,
  sortBoard,
  weekIndex,
  weekStartDay,
  type BoardRow,
  type LeaderboardResponse,
} from "@milav/shared";
import type { Stats } from "./stats";

export type Board = "week" | "all";

/** Номер недели таблицы (одна для всех, по Иерусалиму). */
export function boardWeekNow(now: number): number {
  return weekIndex(localEpochDay(LEADERBOARD_TZ, now * 1000));
}

interface Snapshot {
  weekIdx: number;
  builtAt: number;
  /** Участники по порядку мест: [id, очки]. */
  entries: [number, number][];
}

async function readSnapshot(db: D1Database, board: Board): Promise<Snapshot | null> {
  const row = await db
    .prepare("SELECT week_idx, built_at, data FROM board_snapshots WHERE board = ?")
    .bind(board)
    .first<{ week_idx: number; built_at: number; data: string }>();
  if (!row) return null;
  return { weekIdx: row.week_idx, builtAt: row.built_at, entries: JSON.parse(row.data) as [number, number][] };
}

const WEEK_QUERY =
  "SELECT user_id AS id, lb_week_points AS points, lb_updated_at AS at FROM user_stats " +
  "WHERE lb_optin = 1 AND lb_banned = 0 AND lb_week_idx = ? AND lb_week_points > 0";
const ALL_QUERY =
  "SELECT user_id AS id, words_done + letters_done AS points, lb_updated_at AS at FROM user_stats " +
  "WHERE lb_optin = 1 AND lb_banned = 0 AND words_done + letters_done > 0";

/** Снимок: свежий, пересобранный или (если пересобирает другой запрос) прежний. */
export async function ensureSnapshot(db: D1Database, board: Board, now: number): Promise<Snapshot> {
  const week = boardWeekNow(now);
  const snap = await readSnapshot(db, board);
  const stale = !snap || now - snap.builtAt > BOARD_TTL_SECONDS[board] || (board === "week" && snap.weekIdx !== week);
  if (!stale) return snap;

  await db
    .prepare("INSERT OR IGNORE INTO board_snapshots (board, week_idx, built_at, lease_until, data) VALUES (?, ?, 0, 0, '[]')")
    .bind(board, week)
    .run();
  // Аренда: пересобирает тот запрос, который первым записал lease_until. Остальные показывают прежний снимок.
  const lease = await db
    .prepare("UPDATE board_snapshots SET lease_until = ?1 WHERE board = ?2 AND lease_until <= ?3")
    .bind(now + BOARD_LEASE_SECONDS, board, now)
    .run();
  if ((lease.meta?.changes ?? 0) === 0) {
    // Прежний снимок прошлой недели показывать нельзя: очки там уже не те.
    return snap && !(board === "week" && snap.weekIdx !== week) ? snap : { weekIdx: week, builtAt: 0, entries: [] };
  }

  const query = board === "week" ? db.prepare(WEEK_QUERY).bind(week) : db.prepare(ALL_QUERY);
  const { results } = await query.all<{ id: number; points: number; at: number }>();
  const entries = sortBoard(results).map((r): [number, number] => [r.id, r.points]);
  await db
    .prepare("UPDATE board_snapshots SET week_idx = ?, built_at = ?, lease_until = 0, data = ? WHERE board = ?")
    .bind(week, now, JSON.stringify(entries), board)
    .run();
  return { weekIdx: week, builtAt: now, entries };
}

/** Имена тех, кто сейчас согласен участвовать (и не заблокирован). Остальные в таблице не показываются. */
async function participantNames(db: D1Database, ids: number[]): Promise<Map<number, string>> {
  if (ids.length === 0) return new Map();
  const marks = ids.map(() => "?").join(", ");
  const { results } = await db
    .prepare(
      `SELECT u.id AS id, u.first_name AS name FROM users u JOIN user_stats s ON s.user_id = u.id
       WHERE u.id IN (${marks}) AND s.lb_optin = 1 AND s.lb_banned = 0`,
    )
    .bind(...ids)
    .all<{ id: number; name: string }>();
  return new Map(results.map((r) => [r.id, cleanDisplayName(r.name)]));
}

export async function buildLeaderboard(db: D1Database, board: Board, viewer: Stats, now: number): Promise<LeaderboardResponse> {
  const snap = await ensureSnapshot(db, board, now);
  const week = boardWeekNow(now);
  const ranks = ranksOf(snap.entries.map(([, points]) => points));
  const participating = viewer.lbOptin && !viewer.lbBanned;
  const viewerIndex = participating ? snap.entries.findIndex(([id]) => id === viewer.userId) : -1;

  const topIdx = Array.from({ length: Math.min(LEADERBOARD_TOP, snap.entries.length) }, (_, i) => i);
  const aroundIdx: number[] = [];
  if (viewerIndex >= LEADERBOARD_TOP) {
    const from = Math.max(LEADERBOARD_TOP, viewerIndex - LEADERBOARD_AROUND);
    const to = Math.min(snap.entries.length - 1, viewerIndex + LEADERBOARD_AROUND);
    for (let i = from; i <= to; i++) aroundIdx.push(i);
  }

  const names = await participantNames(db, [...new Set([...topIdx, ...aroundIdx].map((i) => snap.entries[i]![0]))]);
  const rowAt = (i: number): BoardRow | null => {
    const [id, points] = snap.entries[i]!;
    const name = names.get(id);
    if (name === undefined) return null;
    return { rank: ranks[i]!, name, points, ...(id === viewer.userId ? { me: true as const } : {}) };
  };
  const rows = (indexes: number[]) => indexes.map(rowAt).filter((r): r is BoardRow => r !== null);

  const livePoints = board === "week" ? (viewer.lbWeekIdx === week ? viewer.lbWeekPoints : 0) : viewer.wordsDone + viewer.lettersDone;
  return {
    board,
    weekEndsOn: board === "week" ? epochDayToIso(weekStartDay(week) + 6) : null,
    participating,
    total: snap.entries.length,
    top: rows(topIdx),
    me: participating
      ? { rank: viewerIndex >= 0 ? ranks[viewerIndex]! : null, points: livePoints, around: rows(aroundIdx) }
      : null,
    asOf: snap.builtAt,
  };
}

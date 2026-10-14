// Сравнение с теми, кто пришёл в одно время (docs/GAMIFICATION.md, раздел 7.3): только агрегаты, ни имён, ни id.
import { COHORT_MIN_SIZE, COHORT_TTL_SECONDS, COHORT_WINDOW_WEEKS, quartiles, type CohortResponse, type Quartiles } from "@milav/shared";
import type { Stats } from "./stats";

type Group = ({ size: number } & Quartiles) | null;
interface CohortData {
  week: Group;
  window: Group;
}

function group(values: number[]): Group {
  return values.length >= COHORT_MIN_SIZE ? { size: values.length, ...quartiles(values) } : null;
}

/** Снимок квантилей группы, обновляется не чаще раза в сутки. В группу входят начавшие (хотя бы одно очко) и не отказавшиеся. */
async function cohortData(db: D1Database, cohortWeek: number, now: number): Promise<CohortData> {
  const key = `c:${cohortWeek}`;
  const snap = await db.prepare("SELECT built_at, data FROM cohort_snapshots WHERE cohort = ?").bind(key).first<{ built_at: number; data: string }>();
  if (snap && now - snap.built_at <= COHORT_TTL_SECONDS) return JSON.parse(snap.data) as CohortData;

  const { results } = await db
    .prepare(
      `SELECT cohort_week AS week, words_done + letters_done AS points FROM user_stats
       WHERE cohort_week BETWEEN ?1 AND ?2 AND cohort_excluded = 0 AND words_done + letters_done > 0`,
    )
    .bind(cohortWeek - COHORT_WINDOW_WEEKS, cohortWeek + COHORT_WINDOW_WEEKS)
    .all<{ week: number; points: number }>();
  const data: CohortData = {
    week: group(results.filter((r) => r.week === cohortWeek).map((r) => r.points)),
    window: group(results.map((r) => r.points)),
  };
  await db
    .prepare("INSERT OR REPLACE INTO cohort_snapshots (cohort, built_at, data) VALUES (?, ?, ?)")
    .bind(key, now, JSON.stringify(data))
    .run();
  return data;
}

export async function buildCohort(db: D1Database, viewer: Stats, now: number): Promise<CohortResponse> {
  const mine = viewer.wordsDone + viewer.lettersDone;
  if (viewer.cohortExcluded) return { level: "none", size: 0, mine, excluded: true };
  const data = await cohortData(db, viewer.cohortWeek, now);
  const pick = data.week ? { level: "week" as const, g: data.week } : data.window ? { level: "window" as const, g: data.window } : null;
  if (!pick) return { level: "none", size: 0, mine, excluded: false };
  return { level: pick.level, size: pick.g.size, p25: pick.g.p25, p50: pick.g.p50, p75: pick.g.p75, mine, excluded: false };
}

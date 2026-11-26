// Учёт рассылок (26.11.2026, docs/REMINDERS.md, «Учёт рассылок»): журнал напоминаний reminder_sends и отчёт.
//
// - Каждое ежедневное напоминание, ушедшее или нарочно не отправленное (контроль), даёт строку журнала.
// - Открытие приложения в течение суток (и нажатие «Продолжить» под напоминанием) отмечается из /api/me.
// - Занятие в течение суток отмечается при первом выученном или повторённом слове за местный день (stats.ts):
//   одна запись на ученика в день, без чтения журнала при каждом слове.
// - Отчёт для панели считает только напоминания старше суток: у свежих итог ещё неизвестен.
import {
  REMINDER_GROUPS,
  REMINDER_WINDOW_SECONDS,
  reminderLift,
  type ReminderGroup,
  type ReminderReport,
  type ReminderReportRow,
  type SourceRow,
} from "@milav/shared";

/** Строка журнала: напоминание ушло (или не ушло нарочно, `grp = 'control'`). */
export function sendLogStatement(db: D1Database, userId: number, textId: number | null, grp: ReminderGroup, now: number): D1PreparedStatement {
  return db.prepare("INSERT INTO reminder_sends (user_id, text_id, grp, sent_at) VALUES (?, ?, ?, ?)").bind(userId, textId, grp, now);
}

/** Отметка у ученика: последняя строка журнала от `now`, открытие ещё не отмечено. */
export function sendMarkStatement(db: D1Database, userId: number, now: number): D1PreparedStatement {
  return db.prepare("UPDATE reminders SET send_at = ?, send_open = 0 WHERE user_id = ?").bind(now, userId);
}

/** Последняя строка журнала ученика, если она моложе суток (подзапрос по индексу user_id, sent_at). */
const LATEST_SEND = "id = (SELECT id FROM reminder_sends WHERE user_id = ? ORDER BY sent_at DESC LIMIT 1) AND sent_at >= ?";

/**
 * Приложение открыто. Пишем только при первом открытии в течение суток после напоминания и при нажатии
 * «Продолжить» (оно бывает и после обычного открытия). Остальные запуски базу не трогают.
 */
export async function noteSendOpen(
  db: D1Database,
  row: { user_id: number; send_at: number; send_open: number } | null,
  now: number,
  fromReminder: boolean,
): Promise<boolean> {
  if (!row || !row.send_at || now - row.send_at > REMINDER_WINDOW_SECONDS) return false;
  if (row.send_open && !fromReminder) return false;
  const since = now - REMINDER_WINDOW_SECONDS;
  await db.batch([
    db
      .prepare(
        `UPDATE reminder_sends SET opened_at = COALESCE(opened_at, ?),
           clicked_at = CASE WHEN ? = 1 THEN COALESCE(clicked_at, ?) ELSE clicked_at END
         WHERE ${LATEST_SEND}`,
      )
      .bind(now, fromReminder ? 1 : 0, now, row.user_id, since),
    db.prepare("UPDATE reminders SET send_open = 1 WHERE user_id = ?").bind(row.user_id),
  ]);
  return true;
}

/**
 * Ученик позанимался (первое выученное или повторённое слово за местный день): отмечаем последнее напоминание
 * моложе суток. Если такого нет, запрос ничего не меняет.
 */
export function noteStudiedStatement(db: D1Database, userId: number, now: number): D1PreparedStatement {
  return db
    .prepare(`UPDATE reminder_sends SET studied_at = ? WHERE ${LATEST_SEND} AND studied_at IS NULL`)
    .bind(now, userId, now - REMINDER_WINDOW_SECONDS);
}

interface CountRow {
  grp: ReminderGroup;
  text_id: number | null;
  sends: number;
  clicked: number;
  opened: number;
  studied: number;
}

const emptyRow = (): ReminderReportRow => ({ sends: 0, clicked: 0, opened: 0, studied: 0 });

function add(into: ReminderReportRow, r: ReminderReportRow): void {
  into.sends += r.sends;
  into.clicked += r.clicked;
  into.opened += r.opened;
  into.studied += r.studied;
}

/** Ограничение периода отчёта (дней). */
export const REPORT_DAYS = [7, 30, 90] as const;

/**
 * Отчёт за `days` дней до `now`: напоминания старше суток по группам и текстам, разница с контролем,
 * и откуда пришли новые ученики за тот же период. Читает только строки журнала за период (индекс по sent_at).
 */
export async function reminderReport(db: D1Database, now: number, days: number): Promise<ReminderReport> {
  const from = now - days * 86_400;
  const closed = now - REMINDER_WINDOW_SECONDS;
  const fromText = new Date(from * 1000).toISOString().slice(0, 19).replace("T", " ");
  const [counts, pending, sources] = await db.batch([
    db
      .prepare(
        `SELECT grp, text_id, COUNT(*) AS sends, COUNT(clicked_at) AS clicked, COUNT(opened_at) AS opened, COUNT(studied_at) AS studied
         FROM reminder_sends WHERE sent_at >= ? AND sent_at < ? GROUP BY grp, text_id`,
      )
      .bind(from, closed),
    db.prepare("SELECT COUNT(*) AS n FROM reminder_sends WHERE sent_at >= ?").bind(closed),
    // Новые ученики периода по метке запуска: выучили ли хоть одно слово или букву, заходили ли в другой день.
    db
      .prepare(
        `SELECT COALESCE(u.source, '') AS source, COUNT(*) AS users,
                SUM(CASE WHEN COALESCE(s.words_done, 0) + COALESCE(s.letters_done, 0) > 0 THEN 1 ELSE 0 END) AS learned,
                SUM(CASE WHEN date(u.last_seen_at) > date(u.created_at) THEN 1 ELSE 0 END) AS returned
         FROM users u LEFT JOIN user_stats s ON s.user_id = u.id
         WHERE u.created_at >= ? AND u.source IS NOT NULL
         GROUP BY COALESCE(u.source, '') ORDER BY users DESC LIMIT 30`,
      )
      .bind(fromText),
  ]);

  const sent = emptyRow();
  const control = emptyRow();
  const groups = new Map<ReminderGroup, ReminderReportRow>();
  const texts = new Map<number, ReminderReportRow>();
  for (const r of (counts?.results ?? []) as CountRow[]) {
    const row: ReminderReportRow = { sends: Number(r.sends), clicked: Number(r.clicked), opened: Number(r.opened), studied: Number(r.studied) };
    add(r.grp === "control" ? control : sent, row);
    if (!groups.has(r.grp)) groups.set(r.grp, emptyRow());
    add(groups.get(r.grp)!, row);
    if (r.text_id !== null && r.grp !== "control") {
      if (!texts.has(r.text_id)) texts.set(r.text_id, emptyRow());
      add(texts.get(r.text_id)!, row);
    }
  }
  return {
    days,
    pending: Number(((pending?.results ?? [])[0] as { n?: number } | undefined)?.n ?? 0),
    sent,
    control,
    lift: reminderLift(sent, control),
    groups: REMINDER_GROUPS.filter((g) => groups.has(g)).map((group) => ({ group, ...groups.get(group)! })),
    texts: [...texts.entries()].map(([textId, row]) => ({ textId, ...row })).sort((a, b) => b.sends - a.sends),
    sources: ((sources?.results ?? []) as SourceRow[]).map((s) => ({
      source: String(s.source ?? ""),
      users: Number(s.users),
      learned: Number(s.learned ?? 0),
      returned: Number(s.returned ?? 0),
    })),
  };
}

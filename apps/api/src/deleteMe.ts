// Удаление данных ученика по его просьбе («Настройки» → «Приватность» → «Удалить мои данные», решение владельца 24.11,
// docs/SPEC.md, «Приватность и удаление данных»). Удаляется всё, что относится к человеку как к ученику, одним пакетом:
// либо всё, либо ничего. Что остаётся и почему, написано в политике (packages/shared/src/privacy.ts):
// - работа команды: записи журнала панели (admin_log), отзывы о словах (content_reviews), шаблоны букв, роль в staff;
// - обезличенное: статистика вопросов (question_stats), дневные итоги «Обзора» (daily_stats), снимки сравнения;
// - счётчики лимитов (rate_limits): только число запросов за минуту и день, чтобы удаление нельзя было использовать для обхода лимитов.
// Снимки таблицы лидеров (board_snapshots) хранят id мест, поэтому сбрасываются и пересобираются при следующем чтении.

/** Таблицы ученика, по порядку удаления (сначала зависимые, users в конце: внешние ключи). */
export const USER_TABLES = [
  "word_progress",
  "quiz_attempts",
  "lesson_passed",
  "quiz_sessions",
  "user_badges",
  "repeat_state",
  "reminders",
  "activity_days",
  "user_stats",
] as const;

export async function deleteUserData(db: D1Database, userId: number): Promise<void> {
  await db.batch([
    ...USER_TABLES.map((table) => db.prepare(`DELETE FROM ${table} WHERE user_id = ?`).bind(userId)),
    db.prepare("DELETE FROM board_snapshots"),
    db.prepare("DELETE FROM users WHERE id = ?").bind(userId),
  ]);
}

// Подписи отчёта «Учёт рассылок» в панели (раздел «Напоминания», docs/REMINDERS.md, «Учёт рассылок»).
import { REPORT_MIN_CONTROL, percentOf, type ReminderReport, type ReminderReportRow } from "@milav/shared";

/** «12 из 40 (30%)»; при нуле в знаменателе «—». */
export function shareText(part: number, whole: number): string {
  return whole > 0 ? `${part} из ${whole} (${percentOf(part, whole)}%)` : "—";
}

/** Доля в процентах для таблицы: «30%» или «—». */
export function cellText(part: number, row: ReminderReportRow): string {
  return row.sends > 0 ? `${percentOf(part, row.sends)}%` : "—";
}

/** Главный вывод отчёта простыми словами: помогают ли напоминания. */
export function liftText(report: ReminderReport): string {
  if (report.sent.sends === 0) return "Итогов пока нет: напоминания старше суток ещё не накопились.";
  if (report.lift === null) {
    return `Контрольная группа пока мала (${report.control.sends} из нужных ${REPORT_MIN_CONTROL}), поэтому честной разницы ещё нет. Она появится, когда контроль наберёт ${REPORT_MIN_CONTROL} напоминаний.`;
  }
  if (report.lift > 0) {
    return `Напоминания помогают: из каждых 100 примерно ${report.lift} человек позанимались благодаря напоминанию (сверх тех, кто занялся бы и без него).`;
  }
  if (report.lift === 0) return "Разницы с контролем нет: после напоминания занимаются так же часто, как без него.";
  return `После напоминания занимаются реже, чем без него (на ${-report.lift} из 100). Стоит пересмотреть тексты или время.`;
}

/** Метка ссылки запуска для таблицы источников. */
export function sourceTitle(source: string): string {
  if (source === "") return "без метки";
  if (source === "record") return "запись шаблонов (команда)";
  return source;
}

/** Доля в процентах для узкой таблицы: «25%»; при нуле в знаменателе «—». */
export function percentText(part: number, whole: number): string {
  return whole > 0 ? `${percentOf(part, whole)}%` : "—";
}

/** Метка для новой ссылки поста в канал: post-ГГГГММДД по дате. */
export function postLabel(date: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `post-${date.getFullYear()}${p(date.getMonth() + 1)}${p(date.getDate())}`;
}

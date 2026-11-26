// «Учёт рассылок» (раздел «Напоминания», docs/REMINDERS.md, «Учёт рассылок»): помогают ли напоминания.
// Сравнение с контрольной группой (часть напоминаний нарочно не уходит), группы текстов, каждый текст.
import { useState } from "react";
import {
  REMINDER_GROUP_TITLES,
  type ReminderReport,
  type ReminderReportRow,
  type ReminderTextItem,
} from "@milav/shared";
import { api } from "../../api";
import { Button, Card } from "../../components/ui";
import { cellText, liftText, shareText } from "../../lib/reminderReport";
import { LoadView, useLoad } from "./load";

const PERIODS = [7, 30, 90] as const;

/** Короткие подписи групп для узкой таблицы (полные: REMINDER_GROUP_TITLES, в пояснении под таблицей). */
const SHORT_TITLES = { joke: "шутки", progress: "прогресс", repeat: "повторение", control: "контроль" } as const;

export function ReminderReportSection({ texts }: { texts: ReminderTextItem[] }) {
  const [days, setDays] = useState<number>(30);
  return (
    <section className="flex flex-col gap-2" data-testid="reminders-report">
      <h2 className="text-lg font-bold">Учёт рассылок</h2>
      <p className="text-sm text-ink-soft">
        Что было в течение суток после ежедневного напоминания: нажали «Продолжить», открыли приложение (любым путём),
        позанимались (выучили или повторили слово). «Контроль»: часть напоминаний нарочно не отправлена (настройка
        «Контрольная группа напоминаний» в «Сообщениях бота»); разница с ним показывает, сколько людей вернули именно
        напоминания. Учёт идёт с 26.11.2026.
      </p>
      <div className="flex gap-2" role="group" aria-label="Период">
        {PERIODS.map((d) => (
          <Button
            key={d}
            variant={d === days ? "secondary" : "ghost"}
            className="min-h-10"
            aria-pressed={d === days}
            onClick={() => setDays(d)}
            data-testid={`reminders-report-${d}`}
          >
            {d} дн.
          </Button>
        ))}
      </div>
      <Loaded key={days} days={days} texts={texts} />
    </section>
  );
}

function Loaded({ days, texts }: { days: number; texts: ReminderTextItem[] }) {
  const [value, reload] = useLoad(() => api.admin.remindersReport(days));
  return <LoadView value={value} reload={reload}>{(report) => <ReportView report={report} texts={texts} />}</LoadView>;
}

function ReportView({ report, texts }: { report: ReminderReport; texts: ReminderTextItem[] }) {
  const byId = new Map(texts.map((t) => [t.id, t.text]));
  return (
    <>
      <Card className="flex flex-col gap-2" data-testid="reminders-report-summary">
        <p className="font-semibold">{liftText(report)}</p>
        <p className="text-sm text-ink-soft">
          За {report.days} дн. отправлено <b>{report.sent.sends}</b>, в контроле <b>{report.control.sends}</b>.
          {report.pending > 0 && <> Ещё идут сутки у {report.pending}: их итог появится завтра.</>}
        </p>
      </Card>
      {(report.sent.sends > 0 || report.control.sends > 0) && (
        <Card className="overflow-x-auto p-0">
          <table className="w-full text-sm" data-testid="reminders-report-table">
            <thead className="text-ink-soft">
              <tr className="border-b border-line">
                <th className="px-3 py-2 text-left font-semibold" />
                <th className="px-2 py-2 text-right font-semibold" title="Позанимались">Учились</th>
                <th className="px-3 py-2 text-right font-semibold" title="Открыли приложение">Открыли</th>
              </tr>
            </thead>
            <tbody>
              <Row title="Отправлено" row={report.sent} strong clicks />
              {report.groups
                .filter((g) => g.group !== "control")
                .map((g) => (
                  <Row key={g.group} title={SHORT_TITLES[g.group]} row={g} indent />
                ))}
              <Row title="Контроль" row={report.control} strong />
            </tbody>
          </table>
        </Card>
      )}
      {(report.sent.sends > 0 || report.control.sends > 0) && (
        <p className="text-sm text-ink-soft">
          «Учились»: выучили или повторили слово; «Открыли»: открыли приложение любым путём; «кнопка»: нажали «Продолжить»
          под напоминанием. Отправленные делятся на {REMINDER_GROUP_TITLES.joke.toLowerCase()},{" "}
          {REMINDER_GROUP_TITLES.progress.toLowerCase()} (тексты с числами ученика) и{" "}
          {REMINDER_GROUP_TITLES.repeat.toLowerCase()}. «Контроль»: напоминания, которые нарочно не отправлены; сравнивайте
          «Учились» у отправленных и у контроля.
        </p>
      )}
      {report.texts.length > 0 && (
        <div className="flex flex-col gap-2" data-testid="reminders-report-texts">
          <h3 className="font-bold">По текстам</h3>
          {report.texts.map((t) => (
            <Card key={t.textId} className="flex flex-col gap-1">
              <p className="line-clamp-2 text-sm">{byId.get(t.textId) ?? `Текст №${t.textId} (удалён)`}</p>
              <p className="text-sm text-ink-soft">
                Отправлено {t.sends}; нажали {shareText(t.clicked, t.sends)}; учились {shareText(t.studied, t.sends)}.
              </p>
            </Card>
          ))}
          <p className="text-sm text-ink-soft">
            У одного текста за день набирается всего несколько отправок, поэтому разница между текстами становится
            заметной только через несколько недель. Надёжнее сравнивать группы в таблице выше.
          </p>
        </div>
      )}
    </>
  );
}

function Row({
  title,
  row,
  strong = false,
  indent = false,
  clicks = false,
}: {
  title: string;
  row: ReminderReportRow;
  strong?: boolean;
  indent?: boolean;
  /** Показать долю нажавших «Продолжить» (у контроля кнопки не было). */
  clicks?: boolean;
}) {
  return (
    <tr className={`border-b border-line last:border-0 ${strong ? "font-semibold" : ""}`}>
      <td className={`py-2 pr-3 ${indent ? "pl-6" : "pl-3"}`}>
        {title}
        <span className="block text-sm font-normal text-ink-soft">
          {row.sends} шт.{clicks ? `, кнопка ${cellText(row.clicked, row)}` : ""}
        </span>
      </td>
      <td className="px-2 py-2 text-right">{cellText(row.studied, row)}</td>
      <td className="px-3 py-2 text-right">{cellText(row.opened, row)}</td>
    </tr>
  );
}

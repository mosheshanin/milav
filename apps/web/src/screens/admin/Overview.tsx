// «Обзор»: сегодня, 7 дней против прошлых 7, последние 14 дней. Дни по Иерусалиму.
import { api } from "../../api";
import type { AdminOverviewResponse, DayNumbers } from "@milav/shared";
import { Card } from "../../components/ui";
import { dayText, deltaText, deltaTone } from "../../lib/adminText";
import { LoadView, useLoad } from "./load";

const METRICS: { key: keyof DayNumbers; title: string }[] = [
  { key: "newUsers", title: "Новые ученики" },
  { key: "active", title: "Открывали" },
  { key: "learned", title: "Выучено слов и букв" },
  { key: "quizzesPassed", title: "Сдано викторин" },
];

export function Overview() {
  const [value, reload] = useLoad(() => api.admin.overview());
  return <LoadView value={value} reload={reload}>{(data) => <OverviewView data={data} />}</LoadView>;
}

function OverviewView({ data }: { data: AdminOverviewResponse }) {
  return (
    <>
      <section className="flex flex-col gap-2" data-testid="overview-today">
        <h2 className="text-lg font-bold">Сегодня, {dayText(data.today.date)}</h2>
        <div className="grid grid-cols-2 gap-2">
          {METRICS.map((m) => (
            <Tile key={m.key} title={m.title} value={data.today[m.key]} />
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-2" data-testid="overview-week">
        <h2 className="text-lg font-bold">7 дней</h2>
        <p className="text-sm text-ink-soft">Сегодня и 6 дней до него; в скобках разница с предыдущими 7 днями.</p>
        <div className="grid grid-cols-2 gap-2">
          {METRICS.map((m) => (
            <Tile key={m.key} title={m.title} value={data.week[m.key]} before={data.prevWeek[m.key]} />
          ))}
        </div>
        <p className="text-sm text-ink-soft">
          Всего учеников: <b>{data.totalUsers}</b>. «Открывали за 7 дней» это разные люди, а не сумма по дням.
          {data.activeSince && <> Посещения считаются с {dayText(data.activeSince)}.</>}
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-bold">По дням</h2>
        <Card className="overflow-x-auto p-0">
          <table className="w-full text-sm" data-testid="overview-days">
            <thead className="text-ink-soft">
              <tr className="border-b border-line">
                <th className="px-3 py-2 text-left font-semibold">День</th>
                <th className="px-2 py-2 text-right font-semibold" title="Новые ученики">Нов.</th>
                <th className="px-2 py-2 text-right font-semibold" title="Открывали">Откр.</th>
                <th className="px-2 py-2 text-right font-semibold" title="Выучено слов и букв">Слов</th>
                <th className="px-3 py-2 text-right font-semibold" title="Сдано викторин">Викт.</th>
              </tr>
            </thead>
            <tbody>
              {data.days.map((d) => (
                <tr key={d.date} className="border-b border-line last:border-0">
                  <td className="whitespace-nowrap px-3 py-2">{dayText(d.date)}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{d.newUsers}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{d.active}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{d.learned}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{d.quizzesPassed}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </section>
    </>
  );
}

function Tile({ title, value, before }: { title: string; value: number; before?: number }) {
  const tone = before === undefined ? "same" : deltaTone(value, before);
  const toneClass = tone === "up" ? "text-success" : tone === "down" ? "text-danger" : "text-ink-soft";
  return (
    <Card className="flex flex-col gap-1 p-3">
      <span className="text-sm text-ink-soft">{title}</span>
      <span className="text-2xl font-bold tabular-nums">
        {value}
        {before !== undefined && <span className={`ml-2 text-base font-semibold ${toneClass}`}>({deltaText(value, before)})</span>}
      </span>
    </Card>
  );
}

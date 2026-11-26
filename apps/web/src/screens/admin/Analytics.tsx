// «Аналитика» (этап 4, docs/ADMIN.md «Аналитика: как сделано»): удержание, воронка, уроки, трудные слова, произношение.
import { useState } from "react";
import type { AdminAnalyticsResponse, HardItem, LessonAnalytics, RetentionCohort } from "@milav/shared";
import { api } from "../../api";
import { Button, Card } from "../../components/ui";
import { dayText } from "../../lib/adminText";
import { percentText, sourceTitle } from "../../lib/reminderReport";
import { LoadView, useLoad } from "./load";

/** Доля в процентах без дробей: «42%»; null — «рано». */
export const pct = (share: number | null) => (share === null ? "—" : `${Math.round(share * 100)}%`);
/** Доля a из b: «3 из 10 (30%)». */
const ofText = (a: number, b: number) => (b > 0 ? `${a} (${Math.round((a / b) * 100)}%)` : String(a));

export function Analytics() {
  const [value, reload] = useLoad(() => api.admin.analytics());
  return <LoadView value={value} reload={reload}>{(data) => <AnalyticsView data={data} />}</LoadView>;
}

function AnalyticsView({ data }: { data: AdminAnalyticsResponse }) {
  return (
    <>
      <Retention cohorts={data.retention} since={data.activeSince} />
      <Funnel data={data} />
      <Sources />
      <Lessons lessons={data.lessons} />
      <Hard title="Трудные слова" hint={`Где чаще всего ошибаются в викторинах (слово спрошено этим типом вопроса не меньше ${data.hardMinAsked} раз). Заодно ловит плохую озвучку и неудачные варианты ответа.`} items={data.hardItems} testId="analytics-hard" />
      <section className="flex flex-col gap-2" data-testid="analytics-speech">
        <h2 className="text-lg font-bold">Произношение</h2>
        <Card className="flex flex-col gap-1">
          <p>
            Вопросы «Произнеси» в викторинах: засчитано <b>{ofText(data.speech.correct, data.speech.asked)}</b> из {data.speech.asked}.
          </p>
          <p className="text-sm text-ink-soft">После двух попыток. Если слово часто не засчитывают, проверьте озвучку и допуск сравнения (журнал speech в Cloudflare).</p>
        </Card>
        {data.speech.hardest.length > 0 && <HardList items={data.speech.hardest} />}
      </section>
    </>
  );
}

function Retention({ cohorts, since }: { cohorts: RetentionCohort[]; since: string | null }) {
  return (
    <section className="flex flex-col gap-2" data-testid="analytics-retention">
      <h2 className="text-lg font-bold">Удержание</h2>
      <p className="text-sm text-ink-soft">
        Какая доля новичков недели снова открыла приложение через 1, 7 и 30 дней и позже. «—»: прошло меньше дней.
        {since && <> Посещения записываются с {dayText(since)}.</>}
      </p>
      {cohorts.length === 0 ? (
        <Card><p className="text-ink-soft">Пока нет данных.</p></Card>
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="text-ink-soft">
              <tr className="border-b border-line">
                <th className="px-3 py-2 text-left font-semibold">Неделя</th>
                <th className="px-2 py-2 text-right font-semibold" title="Новичков">Нов.</th>
                <th className="px-2 py-2 text-right font-semibold">1 д.</th>
                <th className="px-2 py-2 text-right font-semibold">7 д.</th>
                <th className="px-3 py-2 text-right font-semibold">30 д.</th>
              </tr>
            </thead>
            <tbody>
              {cohorts.map((c) => (
                <tr key={c.week} className="border-b border-line last:border-0">
                  <td className="whitespace-nowrap px-3 py-2">с {dayText(c.week)}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{c.size}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{c.size ? pct(c.d1) : "—"}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{c.size ? pct(c.d7) : "—"}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{c.size ? pct(c.d30) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </section>
  );
}

function Funnel({ data }: { data: AdminAnalyticsResponse }) {
  const first = data.funnel[0]?.users ?? 0;
  return (
    <section className="flex flex-col gap-2" data-testid="analytics-funnel">
      <h2 className="text-lg font-bold">Воронка</h2>
      <p className="text-sm text-ink-soft">Сколько учеников дошли до каждого шага (за всё время), в скобках доля от открывших.</p>
      <Card className="flex flex-col gap-3">
        {data.funnel.map((step) => {
          const share = first > 0 ? step.users / first : 0;
          return (
            <div key={step.key} className="flex flex-col gap-1">
              <div className="flex justify-between gap-2 text-sm">
                <span>{step.title}</span>
                <span className="font-semibold tabular-nums">{ofText(step.users, first)}</span>
              </div>
              <div className="h-2 rounded-full bg-page">
                <div className="h-2 rounded-full bg-accent" style={{ width: `${Math.round(share * 100)}%` }} />
              </div>
            </div>
          );
        })}
      </Card>
    </section>
  );
}

/** Уроки: сначала 10 с наибольшим числом начавших, кнопка показывает все. */
function Lessons({ lessons }: { lessons: LessonAnalytics[] }) {
  const [all, setAll] = useState(false);
  const sorted = [...lessons].sort((a, b) => b.started - a.started);
  const shown = all ? lessons : sorted.slice(0, 10);
  return (
    <section className="flex flex-col gap-2" data-testid="analytics-lessons">
      <h2 className="text-lg font-bold">Уроки</h2>
      <p className="text-sm text-ink-soft">
        Начали (хотя бы один этап) → прошли все слова → сдали викторину. Большой разрыв показывает, где бросают. Попытки: все
        законченные викторины, средний результат в процентах.
      </p>
      {lessons.length === 0 && <Card><p className="text-ink-soft">Пока никто не начинал уроки.</p></Card>}
      {shown.map((l) => (
        <Card key={l.lessonId} className="flex flex-col gap-1 p-3" data-testid={`analytics-lesson-${l.lessonId}`}>
          <div className="font-semibold">{l.title}</div>
          <div className="text-sm tabular-nums">
            Начали {l.started} · все слова {l.learnedAll} · сдали {l.passedUsers}
          </div>
          <div className="text-sm text-ink-soft tabular-nums">
            Попыток {l.attempts}, сдано {l.passedAttempts}
            {l.avgPercent !== null && <>, средний результат {l.avgPercent}%</>}
          </div>
        </Card>
      ))}
      {lessons.length > 10 && (
        <Button variant="ghost" block onClick={() => setAll(!all)} data-testid="analytics-lessons-all">
          {all ? "Только 10 самых популярных" : `Все уроки (${lessons.length}) по порядку`}
        </Button>
      )}
    </section>
  );
}

function Hard({ title, hint, items, testId }: { title: string; hint: string; items: HardItem[]; testId: string }) {
  return (
    <section className="flex flex-col gap-2" data-testid={testId}>
      <h2 className="text-lg font-bold">{title}</h2>
      <p className="text-sm text-ink-soft">{hint}</p>
      {items.length === 0 ? <Card><p className="text-ink-soft">Пока мало ответов.</p></Card> : <HardList items={items} />}
    </section>
  );
}

function HardList({ items }: { items: HardItem[] }) {
  return (
    <Card className="flex flex-col gap-3">
      {items.map((h) => (
        <div key={`${h.itemId}:${h.questionType}`} className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div>
              <span dir="rtl" lang="he" className="font-hebrew text-lg font-semibold">{h.he}</span> — {h.ru}
            </div>
            <div className="text-sm text-ink-soft">
              {h.questionTitle}. {h.lessonTitle}
            </div>
          </div>
          <div className="shrink-0 text-right text-sm tabular-nums">
            <div className="font-semibold text-danger">{pct(1 - h.correct / h.asked)} ошибок</div>
            <div className="text-ink-soft">из {h.asked}</div>
          </div>
        </div>
      ))}
    </Card>
  );
}

/** Откуда пришли новые ученики за 30 дней: метка ссылки запуска (startapp=<метка>), записывается с 26.11.2026. */
function Sources() {
  const [value, reload] = useLoad(() => api.admin.remindersReport(30));
  return (
    <section className="flex flex-col gap-2" data-testid="analytics-sources">
      <h2 className="text-lg font-bold">Откуда пришли</h2>
      <p className="text-sm text-ink-soft">
        Новые ученики за 30 дней по метке ссылки, которой они впервые открыли приложение (…?startapp=метка). Ссылка поста
        в канал получает метку сама (post-дата); «без метки»: кнопка бота, поиск, пересланная ссылка. «Учились»: выучили хоть
        одну букву или слово, «Верн.»: заходили в другой день. Учёт с 26.11.2026; кто пришёл раньше, здесь не считается.
      </p>
      <LoadView value={value} reload={reload}>
        {(report) =>
          report.sources.length === 0 ? (
            <Card><p className="text-ink-soft">Пока нет данных.</p></Card>
          ) : (
            <Card className="overflow-x-auto p-0">
              <table className="w-full text-sm">
                <thead className="text-ink-soft">
                  <tr className="border-b border-line">
                    <th className="px-3 py-2 text-left font-semibold">Метка</th>
                    <th className="px-2 py-2 text-right font-semibold" title="Пришли">Шт.</th>
                    <th className="px-2 py-2 text-right font-semibold" title="Выучили хоть одно слово или букву">Учились</th>
                    <th className="px-3 py-2 text-right font-semibold" title="Заходили в другой день">Верн.</th>
                  </tr>
                </thead>
                <tbody>
                  {report.sources.map((s) => (
                    <tr key={s.source} className="border-b border-line last:border-0">
                      <td className="px-3 py-2 [overflow-wrap:anywhere]">{sourceTitle(s.source)}</td>
                      <td className="px-2 py-2 text-right">{s.users}</td>
                      <td className="px-2 py-2 text-right">{percentText(s.learned, s.users)}</td>
                      <td className="px-3 py-2 text-right">{percentText(s.returned, s.users)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )
        }
      </LoadView>
    </section>
  );
}

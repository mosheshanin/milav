// «Ученики» (этап 5, docs/ADMIN.md «Ученики: как сделано»): список с поиском, карточка ученика, убрать из таблицы лидеров.
import { useEffect, useState } from "react";
import { LEARNER_GENDER_TITLES, STAFF_ROLE_TITLES, minuteText, type AdminStudentResponse, type StudentRow } from "@milav/shared";
import { api } from "../../api";
import { Button, Card, Chip } from "../../components/ui";
import { adminErrorText, dateTimeText, dayText } from "../../lib/adminText";
import { confirmAction } from "../../telegram";
import { LoadView, useLoad } from "./load";

/** Время базы (`YYYY-MM-DD HH:MM:SS`, UTC) по часам телефона: «15.10, 23:50». */
export function dbTimeText(value: string): string {
  const ms = Date.parse(`${value.replace(" ", "T")}Z`);
  return Number.isNaN(ms) ? value : dateTimeText(Math.floor(ms / 1000));
}

export function Students({ openId, onOpen }: { openId: number | null; onOpen: (id: number | null) => void }) {
  if (openId !== null) return <StudentCard id={openId} />;
  return <StudentList onOpen={onOpen} />;
}

function StudentList({ onOpen }: { onOpen: (id: number) => void }) {
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<StudentRow[]>([]);
  const [total, setTotal] = useState(0);
  const [next, setNext] = useState<number | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState("");

  async function load(q: string, offset: number) {
    setState("loading");
    try {
      const res = await api.admin.students(q, offset);
      setItems((prev) => (offset === 0 ? res.items : [...prev, ...res.items]));
      setTotal(res.total);
      setNext(res.nextOffset);
      setState("ready");
    } catch (e) {
      setError(adminErrorText(e));
      setState("error");
    }
  }

  // Поиск с небольшой паузой после ввода, чтобы не дёргать сервер на каждую букву.
  useEffect(() => {
    const timer = setTimeout(() => void load(query, 0), query ? 350 : 0);
    return () => clearTimeout(timer);
  }, [query]);

  return (
    <>
      <label className="flex flex-col gap-1">
        <span className="text-sm text-ink-soft">Поиск по имени, username или Telegram id</span>
        <input
          type="search"
          autoComplete="off"
          className="min-h-12 rounded-control border border-line bg-page px-3 text-ink"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          data-testid="students-search"
        />
      </label>
      <p className="text-sm text-ink-soft" data-testid="students-total">
        {state === "loading" && items.length === 0 ? "Загрузка…" : `Найдено: ${total}. Сначала те, кто заходил недавно.`}
      </p>
      {state === "error" && (
        <Card className="flex flex-col items-start gap-2">
          <p role="alert">{error}</p>
          <Button variant="ghost" onClick={() => void load(query, 0)}>
            Повторить
          </Button>
        </Card>
      )}
      <div className="flex flex-col gap-2">
        {items.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => onOpen(s.id)}
            data-testid={`student-${s.id}`}
            className="flex w-full flex-col gap-1 rounded-card border border-line bg-surface p-3 text-left active:bg-page"
          >
            <span className="flex flex-wrap items-center gap-2">
              <span className="font-semibold">{s.name}</span>
              {s.username && <span className="text-sm text-ink-soft">@{s.username}</span>}
              {s.banned && <Chip tone="danger">вне таблицы</Chip>}
            </span>
            <span className="text-sm tabular-nums">
              {s.statusName} · уроков {s.passedLessons} · очков {s.points} · бейджей {s.badges}
            </span>
            <span className="text-sm text-ink-soft">Заходил {dbTimeText(s.lastSeenAt)} · id {s.id}</span>
          </button>
        ))}
      </div>
      {next !== null && (
        <Button variant="ghost" block disabled={state === "loading"} onClick={() => void load(query, next)} data-testid="students-more">
          {state === "loading" ? "Загрузка…" : "Показать ещё"}
        </Button>
      )}
    </>
  );
}

function StudentCard({ id }: { id: number }) {
  const [value, reload] = useLoad(() => api.admin.student(id));
  return <LoadView value={value} reload={reload}>{(data) => <StudentView data={data} reload={reload} />}</LoadView>;
}

function Line({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3 text-sm">
      <span className="text-ink-soft">{title}</span>
      <span className="text-right font-semibold tabular-nums">{children}</span>
    </div>
  );
}

function StudentView({ data, reload }: { data: AdminStudentResponse; reload: () => void }) {
  const s = data.student;
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function toggleBoard() {
    const banned = !s.banned;
    const question = banned
      ? `Убрать ${s.name} из таблицы лидеров? Имя сразу пропадёт из таблицы, вернуться сам ученик не сможет.`
      : `Вернуть ${s.name} в таблицу лидеров? Если ученик согласен участвовать, имя снова появится.`;
    if (!(await confirmAction(question))) return;
    setBusy(true);
    setMessage(null);
    try {
      await api.admin.setStudentLeaderboard(s.id, banned);
      setMessage(banned ? "Убран из таблицы лидеров." : "Возвращён в таблицу лидеров.");
      reload();
    } catch (e) {
      setMessage(adminErrorText(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-section" data-testid="student-card">
      <Card className="flex flex-col gap-2">
        <div>
          <div className="text-xl font-bold">{s.name}</div>
          <div className="text-sm text-ink-soft">
            {s.username && <>@{s.username} · </>}id {s.id}
            {data.staffRole && <> · {STAFF_ROLE_TITLES[data.staffRole].toLowerCase()}</>}
          </div>
        </div>
        <Line title="Пришёл">{dbTimeText(s.createdAt)}</Line>
        <Line title="Последний вход">{dbTimeText(s.lastSeenAt)}</Line>
        <Line title="Последний день занятий">{data.progress.lastDay ? dayText(data.progress.lastDay) : "—"}</Line>
        <Line title="Статус">{s.statusName}</Line>
      </Card>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-bold">Прогресс</h2>
        <Card className="flex flex-col gap-2">
          <Line title="Очки">{s.points}</Line>
          <Line title="Слов выучено">{data.progress.words}</Line>
          <Line title="Букв выучено">{data.progress.letters}</Line>
          <Line title="Уроков сдано">{s.passedLessons}</Line>
          <Line title="Дней занятий">{data.progress.activeDays}</Line>
          <Line title="Недель ритма">{data.progress.rhythmWeeks}</Line>
          <Line title="Цель дня выполнена">{data.progress.goalDays} раз</Line>
          <Line title="Повторений (вспомнил)">{data.progress.repeats}</Line>
          <Line title="Прочно выучено">{data.progress.mastered}</Line>
        </Card>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-bold">Настройки</h2>
        <Card className="flex flex-col gap-2">
          <Line title="Цель дня">{data.settings.dailyGoal ? `${data.settings.dailyGoal} сл.` : "Выкл."}</Line>
          <Line title="Фразы от лица">
            {LEARNER_GENDER_TITLES[data.settings.gender as keyof typeof LEARNER_GENDER_TITLES] ?? data.settings.gender}
          </Line>
          <Line title="Часовой пояс">{data.settings.tz || "—"}</Line>
          <Line title="Напоминания">
            {data.reminder?.enabled ? `в ${minuteText(data.reminder.minute)}${data.reminder.blocked ? ", бот заблокирован" : ""}` : "выкл."}
          </Line>
          <Line title="Таблица лидеров">{s.banned ? "убран командой" : s.leaderboard ? "участвует" : "не участвует"}</Line>
          <Line title="Сравнение">{data.settings.cohortExcluded ? "не учитывается" : "учитывается"}</Line>
        </Card>
        <Button variant="ghost" block disabled={busy} onClick={() => void toggleBoard()} data-testid="student-board">
          {s.banned ? "Вернуть в таблицу лидеров" : "Убрать из таблицы лидеров"}
        </Button>
        {message && (
          <p className="text-sm" role="status">
            {message}
          </p>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-bold">Последние викторины</h2>
        {data.attempts.length === 0 ? (
          <Card><p className="text-ink-soft">Ещё не заканчивал викторины.</p></Card>
        ) : (
          <Card className="flex flex-col gap-2" data-testid="student-attempts">
            {data.attempts.map((a, i) => (
              <div key={`${a.lessonId}-${a.at}-${i}`} className="flex justify-between gap-3 text-sm">
                <span>
                  {a.title}
                  <span className="block text-ink-soft">{dbTimeText(a.at)}</span>
                </span>
                <span className={`shrink-0 font-semibold tabular-nums ${a.passed ? "text-success" : "text-danger"}`}>
                  {a.correct} из {a.total}
                </span>
              </div>
            ))}
          </Card>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-bold">Сданные уроки ({data.lessons.length})</h2>
        {data.lessons.length > 0 && (
          <Card className="flex flex-col gap-1">
            {data.lessons.map((l) => (
              <div key={l.lessonId} className="flex justify-between gap-3 text-sm">
                <span>{l.title}</span>
                <span className="shrink-0 text-ink-soft">{dbTimeText(l.passedAt)}</span>
              </div>
            ))}
          </Card>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-bold">Бейджи ({data.badges.length})</h2>
        {data.badges.length > 0 && (
          <Card className="flex flex-wrap gap-2">
            {data.badges.map((b) => (
              <Chip key={b.id}>{b.title}</Chip>
            ))}
          </Card>
        )}
      </section>
    </div>
  );
}

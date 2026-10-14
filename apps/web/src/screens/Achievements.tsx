import { useEffect, useMemo, useState } from "react";
import { catalog } from "@milav/content";
import {
  DAILY_GOAL_OPTIONS,
  RARITY_TITLES,
  countByRarity,
  type AchievementsResponse,
  type BadgeDef,
  type CohortResponse,
  type SettingsRequest,
} from "@milav/shared";
import { api } from "../api";
import { useApp } from "../AppContext";
import { BadgeDetails, BadgeTile, GoalRing, StatusPathBar, WeekCard } from "../components/play";
import { Header } from "../components/Header";
import { Button, Card, Chip } from "../components/ui";
import { saveErrorText } from "../lib/apiErrors";
import { hapticsEnabled, setHapticsEnabled } from "../lib/haptic";
import { cohortText, groupBadges, plural, type BadgeView } from "../lib/play";
import { useBackButton } from "../lib/useBackButton";

/** Достижения: путь к следующему статусу, ритм недели, цель дня, бейджи и настройки. */
export function Achievements({ onBack, onLeaderboard }: { onBack: () => void; onLeaderboard: () => void }) {
  const { me, refresh } = useApp();
  const [data, setData] = useState<AchievementsResponse | null>(null);
  const [error, setError] = useState(false);
  const [cohort, setCohort] = useState<CohortResponse | null>(null);
  const [open, setOpen] = useState<BadgeView | null>(null);
  const play = me.play;
  useBackButton(onBack);

  useEffect(() => {
    let alive = true;
    api.achievements().then(
      (res) => {
        if (!alive) return;
        setData(res);
        const fresh = res.earned.filter((e) => !e.seen).map((e) => e.id);
        if (fresh.length > 0) void api.seen(fresh).then(() => refresh(), () => undefined);
      },
      () => alive && setError(true),
    );
    api.cohort().then((c) => alive && setCohort(c), () => undefined);
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const groups = useMemo(() => groupBadges(catalog, data), [data]);
  const earnedCount = data?.earned.length ?? 0;
  const byRarity = useMemo(() => {
    const ids = new Set((data?.earned ?? []).map((e) => e.id));
    return countByRarity(catalog.badges.filter((b: BadgeDef) => ids.has(b.id)));
  }, [data]);

  return (
    <>
      <Header title="Достижения" onBack={onBack} />
      <main className="mx-auto flex max-w-md flex-col gap-section p-block pb-section" data-testid="achievements">
        <Card className="flex flex-col gap-3">
          <StatusPathBar path={play.statusPath} />
        </Card>

        {play.goal && (
          <Card className="flex items-center gap-block" data-testid="goal-card">
            <GoalRing done={play.goal.done} target={play.goal.target} />
            <div>
              <div className="font-semibold">Цель дня</div>
              <div className="text-sm text-ink-soft" data-testid="goal-text">
                {play.goal.met
                  ? "Выполнена! Можно заниматься дальше."
                  : `Выучить слов сегодня: ${play.goal.done} из ${play.goal.target}`}
              </div>
            </div>
          </Card>
        )}

        <section className="flex flex-col gap-2">
          <h2 className="text-lg font-bold">Ритм</h2>
          <WeekCard play={play} />
          <p className="text-sm text-ink-soft" data-testid="rhythm-text">
            Ритмичных недель: {play.week.rhythmWeeks}. Неделя ритмичная, если вы занимались {play.week.target} дня и больше.
            Пропуск ничего не обнуляет.
          </p>
          <p className="text-sm text-ink-soft">Дней занятий всего: {play.activeDays}.</p>
        </section>

        {cohort && cohortText(cohort) && !cohort.excluded && (
          <Card data-testid="cohort-card">
            <h2 className="mb-1 font-semibold">Среди тех, кто пришёл в одно время</h2>
            <p className="text-sm text-ink-soft">{cohortText(cohort)}</p>
          </Card>
        )}

        <section className="flex flex-col gap-block">
          <div className="flex items-baseline justify-between">
            <h2 className="text-lg font-bold">Бейджи</h2>
            <span className="text-sm text-ink-soft" data-testid="badge-count">
              {earnedCount} из {catalog.badges.length}
            </span>
          </div>
          {earnedCount > 0 && (
            <div className="flex flex-wrap gap-2">
              {(Object.keys(byRarity) as (keyof typeof byRarity)[])
                .filter((r) => byRarity[r] > 0)
                .map((r) => (
                  <Chip key={r}>
                    {RARITY_TITLES[r]}: {byRarity[r]}
                  </Chip>
                ))}
            </div>
          )}
          {error && <p className="text-danger">Не удалось загрузить бейджи. Проверьте интернет и откройте экран ещё раз.</p>}
          {!data && !error && <p className="text-ink-soft">Загрузка…</p>}
          {groups.map((g) => {
            const got = g.badges.filter((b) => b.earned).length;
            return (
              <div key={g.key} className="flex flex-col gap-2" data-testid={`badge-group-${g.key}`}>
                <h3 className="font-semibold text-ink-soft">
                  {g.title} · {got} из {g.badges.length}
                </h3>
                <div className="grid grid-cols-3 gap-2">
                  {g.badges.map((b) => (
                    <BadgeTile key={b.def.id} view={b} onOpen={() => setOpen(b)} />
                  ))}
                </div>
              </div>
            );
          })}
        </section>

        {play.features.leaderboard && (
          <Button variant="ghost" block onClick={onLeaderboard} data-testid="open-leaderboard">
            Таблица лидеров
          </Button>
        )}

        <Settings />
      </main>
      {open && <BadgeDetails view={open} tz={play.tz} onClose={() => setOpen(null)} />}
    </>
  );
}

function Settings() {
  const { me, applyPlay } = useApp();
  const { settings, features } = me.play;
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [vibration, setVibration] = useState(hapticsEnabled);

  async function change(body: SettingsRequest) {
    if (busy) return;
    setBusy(true);
    setMessage(null);
    try {
      const res = await api.settings(body);
      applyPlay(res.play);
    } catch (e) {
      setMessage(saveErrorText(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="flex flex-col gap-block" data-testid="settings">
      <h2 className="text-lg font-bold">Настройки</h2>
      <Card className="flex flex-col gap-block">
        <div>
          <div className="mb-2 font-semibold">Цель дня</div>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Цель дня">
            {DAILY_GOAL_OPTIONS.map((n) => (
              <button
                key={n}
                type="button"
                role="radio"
                aria-checked={settings.dailyGoal === n}
                data-testid={`goal-${n}`}
                disabled={busy}
                onClick={() => void change({ dailyGoal: n })}
                className={`min-h-10 rounded-full px-4 font-semibold ${
                  settings.dailyGoal === n ? "bg-accent text-white" : "bg-line text-ink-soft"
                }`}
              >
                {n === 0 ? "Выкл." : `${n} ${plural(n, "слово", "слова", "слов")}`}
              </button>
            ))}
          </div>
        </div>
        {features.leaderboard && (
          <Toggle
            label="Показывать меня в таблице лидеров"
            hint="Другие увидят ваше имя из Telegram (без фамилии и имени пользователя) и очки."
            checked={settings.leaderboard}
            disabled={busy}
            testId="toggle-leaderboard"
            onChange={(v) => void change({ leaderboard: v })}
          />
        )}
        <Toggle
          label="Учитывать меня в сравнении"
          hint="Ваши очки попадают в общую картину «как у тех, кто пришёл в одно время». Имя не показывается."
          checked={!settings.cohortExcluded}
          disabled={busy}
          testId="toggle-cohort"
          onChange={(v) => void change({ cohortExcluded: !v })}
        />
        <Toggle
          label="Вибрация"
          hint="Лёгкий отклик на телефоне при получении бейджа. Настройка хранится только на этом устройстве."
          checked={vibration}
          testId="toggle-haptics"
          onChange={(v) => {
            setHapticsEnabled(v);
            setVibration(v);
          }}
        />
        {message && <p className="text-danger">{message}</p>}
      </Card>
    </section>
  );
}

function Toggle({
  label,
  hint,
  checked,
  disabled,
  testId,
  onChange,
}: {
  label: string;
  hint: string;
  checked: boolean;
  disabled?: boolean;
  testId: string;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex items-start gap-3">
      <input
        type="checkbox"
        role="switch"
        className="mt-1 size-5 shrink-0 accent-accent"
        checked={checked}
        disabled={disabled}
        data-testid={testId}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span>
        <span className="block font-semibold">{label}</span>
        <span className="block text-sm text-ink-soft">{hint}</span>
      </span>
    </label>
  );
}

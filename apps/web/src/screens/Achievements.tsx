import { useEffect, useMemo, useState } from "react";
import { catalog } from "@milav/content";
import {
  RARITY_TITLES,
  countByRarity,
  type AchievementsResponse,
  type BadgeDef,
  type CohortResponse,
} from "@milav/shared";
import { api } from "../api";
import { useApp } from "../AppContext";
import { BadgeDetails, BadgeTile, GoalRing, StatusPathBar, WeekCard } from "../components/play";
import { Header } from "../components/Header";
import { Button, Card, Chip } from "../components/ui";
import { cohortText, groupBadges, type BadgeView } from "../lib/play";
import { useBackButton } from "../lib/useBackButton";

/** Достижения: путь к следующему статусу, ритм недели, цель дня и бейджи. Настройки на отдельном экране. */
export function Achievements({
  onBack,
  onLeaderboard,
  onSettings,
}: {
  onBack: () => void;
  onLeaderboard: () => void;
  onSettings: () => void;
}) {
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

        <Button variant="ghost" block onClick={onSettings} data-testid="open-settings">
          Настройки
        </Button>
      </main>
      {open && <BadgeDetails view={open} tz={play.tz} onClose={() => setOpen(null)} />}
    </>
  );
}

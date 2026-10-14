// Общие части геймификации: значок бейджа, плитка, кольцо цели, точки недели, полоса пути, поздравление.
// Анимации только прозрачность и сдвиг (классы animate-* в index.css), inline-стилей нет: CSP их запрещает.
import { useEffect } from "react";
import { Flame, Share2, Target, X } from "lucide-react";
import { catalog } from "@milav/content";
import {
  RARITY_TITLES,
  shareText as badgeShareText,
  type BadgeDef,
  type PlayEvent,
  type PlayInfo,
  type StatusPath,
} from "@milav/shared";
import { api } from "../api";
import { BADGE_ICON_COMPONENTS } from "../lib/badgeIcons";
import { haptic } from "../lib/haptic";
import { RARITY_CLASSES, formatEarnedDate, statusPathText, weekdayLabels, type BadgeView } from "../lib/play";
import { shareText } from "../lib/share";
import { Button, Card } from "./ui";

export function BadgeIconView({ badge, className = "size-icon-lg" }: { badge: BadgeDef; className?: string }) {
  const Icon = BADGE_ICON_COMPONENTS[badge.icon];
  return <Icon className={`${className} ${RARITY_CLASSES[badge.rarity].icon}`} aria-hidden />;
}

/** Плитка бейджа на экране «Достижения». Неполученный бейдж серый, с прогрессом. */
export function BadgeTile({ view, onOpen }: { view: BadgeView; onOpen: (badge: BadgeDef) => void }) {
  const { def, earned } = view;
  return (
    <button
      type="button"
      onClick={() => onOpen(def)}
      data-testid={`badge-${def.id}`}
      data-earned={earned ? "1" : "0"}
      aria-label={`${def.title}${earned ? ", получен" : ", не получен"}`}
      className={`relative flex min-h-24 flex-col items-center justify-start gap-1 rounded-card border p-2 text-center active:opacity-80 ${
        earned ? `${RARITY_CLASSES[def.rarity].soft} border-transparent` : "border-line bg-surface"
      }`}
    >
      <span className={earned ? "" : "opacity-30 grayscale"}>
        <BadgeIconView badge={def} />
      </span>
      <span className={`text-xs font-semibold leading-tight ${earned ? "text-ink" : "text-ink-soft"}`}>{def.title}</span>
      {!earned && view.progress && (
        <span className="text-xs text-ink-soft">
          {view.progress.value} из {view.progress.target}
        </span>
      )}
      {view.fresh && (
        <span className="absolute right-1 top-1 size-2 rounded-full bg-danger" aria-label="Новый" data-testid="badge-fresh" />
      )}
    </button>
  );
}

/** Подробности бейджа: что за что дают, редкость, дата, «Поделиться». */
export function BadgeDetails({ view, tz, onClose }: { view: BadgeView; tz?: string; onClose: () => void }) {
  const { def, earned } = view;
  return (
    <Overlay onClose={onClose} label={def.title}>
      <div className="flex flex-col items-center gap-3 text-center">
        <span className={`flex size-20 items-center justify-center rounded-full ${earned ? RARITY_CLASSES[def.rarity].soft : "bg-page"}`}>
          <span className={earned ? "" : "opacity-30 grayscale"}>
            <BadgeIconView badge={def} className="size-10" />
          </span>
        </span>
        <h2 className="text-xl font-bold">{def.title}</h2>
        <p className="text-ink-soft">{def.description}</p>
        <p className="text-sm text-ink-soft">{RARITY_TITLES[def.rarity]}</p>
        {earned && view.earnedAt !== null && (
          <p className="text-sm text-success">
            Получен {formatEarnedDate(view.earnedAt, tz)}
            {view.retro ? " (найден при пересчёте)" : ""}
          </p>
        )}
        {!earned && view.progress && (
          <p className="text-sm text-ink-soft">
            Прогресс: {view.progress.value} из {view.progress.target}
          </p>
        )}
        {earned && (
          <Button variant="secondary" block onClick={() => shareText(badgeShareText(def))}>
            <Share2 className="size-icon" aria-hidden />
            Поделиться
          </Button>
        )}
        <Button variant="ghost" block onClick={onClose}>
          Закрыть
        </Button>
      </div>
    </Overlay>
  );
}

/** Затемнение и нижний лист. Закрывается кнопкой, крестиком и касанием фона. */
export function Overlay({ children, onClose, label }: { children: React.ReactNode; onClose: () => void; label: string }) {
  return (
    <div className="fixed inset-0 z-30 flex items-end justify-center bg-ink/40" role="dialog" aria-modal="true" aria-label={label}>
      <button type="button" aria-label="Закрыть" className="absolute inset-0 cursor-default" onClick={onClose} tabIndex={-1} />
      <div className="animate-sheet relative max-h-[90%] w-full max-w-md overflow-y-auto rounded-t-card bg-surface p-section">
        <button
          type="button"
          onClick={onClose}
          aria-label="Закрыть"
          className="absolute right-2 top-2 flex size-10 items-center justify-center rounded-control text-ink-soft active:bg-page"
        >
          <X className="size-icon" aria-hidden />
        </button>
        {children}
      </div>
    </div>
  );
}

const RING = { r: 28, c: 2 * Math.PI * 28 };

/** Кольцо цели дня. */
export function GoalRing({ done, target }: { done: number; target: number }) {
  const filled = Math.min(1, target > 0 ? done / target : 0) * RING.c;
  return (
    <svg viewBox="0 0 64 64" className="size-16 shrink-0 -rotate-90" role="img" aria-label={`Цель дня: ${Math.min(done, target)} из ${target}`}>
      <circle cx="32" cy="32" r={RING.r} fill="none" strokeWidth="6" className="stroke-line" />
      <circle
        cx="32"
        cy="32"
        r={RING.r}
        fill="none"
        strokeWidth="6"
        strokeLinecap="round"
        strokeDasharray={`${filled} ${RING.c}`}
        className={done >= target ? "stroke-success" : "stroke-accent"}
      />
    </svg>
  );
}

/** Семь дней недели с воскресенья: заполнен день, когда были занятия, сегодня обведён. */
export function WeekDots({ week }: { week: PlayInfo["week"] }) {
  const labels = weekdayLabels();
  return (
    <ol className="flex justify-between" data-testid="week-dots" aria-label="Дни недели">
      {week.days.map((active, i) => (
        <li key={labels[i]} className="flex flex-col items-center gap-1 text-xs text-ink-soft">
          <span
            data-active={active ? "1" : "0"}
            className={`flex size-8 items-center justify-center rounded-full ${
              active ? "bg-success text-white" : "bg-line"
            } ${i === week.todayIndex ? "ring-2 ring-accent ring-offset-2" : ""}`}
          >
            {active && <Flame className="size-4" aria-hidden />}
          </span>
          {labels[i]}
        </li>
      ))}
    </ol>
  );
}

/** Путь от текущего статуса к следующему: фигуры и полоса. */
export function StatusPathBar({ path }: { path: StatusPath }) {
  const text = statusPathText(path);
  return (
    <div className="flex flex-col gap-2" data-testid="status-path">
      <div className="flex items-center justify-between gap-2">
        <span className="text-2xl" aria-hidden>
          {path.symbol}
        </span>
        <span className="font-semibold">{text.title}</span>
        <span className="text-2xl" aria-hidden>
          {path.next?.symbol ?? path.symbol}
        </span>
      </div>
      <svg viewBox="0 0 100 4" preserveAspectRatio="none" className="h-2 w-full" role="img" aria-label={text.progress}>
        <rect width="100" height="4" rx="2" className="fill-line" />
        <rect width={Math.max(path.fraction, path.fraction > 0 ? 0.04 : 0) * 100} height="4" rx="2" className="fill-accent" />
      </svg>
      <div className="text-sm text-ink-soft">{text.progress}</div>
    </div>
  );
}

/** Карточка недели: точки и подпись про ритм. */
export function WeekCard({ play }: { play: PlayInfo }) {
  const { week } = play;
  return (
    <Card className="flex flex-col gap-3">
      <WeekDots week={week} />
      <p className="text-sm text-ink-soft" data-testid="week-text">
        {week.daysThisWeek} из {week.target} дней на этой неделе
        {week.daysThisWeek >= week.target ? ": неделя в ритме!" : "."}
      </p>
    </Card>
  );
}

function badgeById(id: string): BadgeDef | undefined {
  return catalog.byId.get(id);
}

/** Тост в уроке: не мешает занятию, исчезает сам. */
export function PlayToast({ event, onDone }: { event: PlayEvent; onDone: () => void }) {
  const badges = event.newBadges.map(badgeById).filter((b): b is BadgeDef => !!b);
  useEffect(() => {
    haptic("success");
    if (event.newBadges.length > 0) void api.seen(event.newBadges).catch(() => undefined);
    const t = window.setTimeout(onDone, 4500);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div
      role="status"
      data-testid="play-toast"
      className="animate-sheet pointer-events-none fixed inset-x-block bottom-block z-20 mx-auto flex max-w-md items-center gap-3 rounded-card border border-line bg-surface p-block shadow-lg"
    >
      {badges[0] ? <BadgeIconView badge={badges[0]} /> : <Target className="size-icon-lg text-success" aria-hidden />}
      <div className="min-w-0 flex-1 text-sm">
        {badges.map((b) => (
          <div key={b.id} className="font-semibold">
            Новый бейдж: {b.title}
          </div>
        ))}
        {event.goalMet && <div className="font-semibold text-success">Цель дня выполнена!</div>}
      </div>
      <button type="button" onClick={onDone} aria-label="Закрыть" className="pointer-events-auto flex size-10 items-center justify-center text-ink-soft">
        <X className="size-icon" aria-hidden />
      </button>
    </div>
  );
}

/** Нужен ли тост по событию. */
export function eventHasNews(event: PlayEvent | undefined): event is PlayEvent {
  return !!event && (event.newBadges.length > 0 || event.goalMet);
}

const SHEET_BADGES = 3;

/**
 * Лист поздравления: бейджи (до трёх подряд, остальные «в Достижениях»), смена статуса, цель дня, «Поделиться».
 * `title` задаёт заголовок (например, «Мы нашли N ваших достижений»).
 */
export function CelebrationSheet({
  badgeIds,
  goalMet = false,
  status,
  title,
  onClose,
}: {
  badgeIds: string[];
  goalMet?: boolean;
  /** Новый статус, если он изменился. */
  status?: { name: string; symbol: string };
  title?: string;
  onClose: () => void;
}) {
  const badges = badgeIds.map(badgeById).filter((b): b is BadgeDef => !!b);
  const shown = badges.slice(0, SHEET_BADGES);

  useEffect(() => {
    haptic("success");
    if (badgeIds.length > 0) void api.seen(badgeIds).catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const heading = title ?? (status ? "Новый статус!" : badges.length > 0 ? "Новые достижения!" : "Цель дня выполнена!");
  const shareLine = status
    ? `Я получил(а) статус «${status.name}» в Milav`
    : shown[0]
      ? badgeShareText(shown[0])
      : null;

  return (
    <Overlay onClose={onClose} label={heading}>
      <div className="flex flex-col items-center gap-4 text-center" data-testid="celebration">
        {status && (
          <div className="flex flex-col items-center gap-1" data-testid="celebration-status">
            <span className="animate-pop text-6xl" aria-hidden>
              {status.symbol}
            </span>
            <span className="font-semibold">{status.name}</span>
          </div>
        )}
        <h2 className="px-8 text-xl font-bold">{heading}</h2>
        {shown.map((b) => (
          <div key={b.id} className="flex w-full items-center gap-3 text-left" data-testid={`celebrate-${b.id}`}>
            <span className={`animate-pop flex size-14 shrink-0 items-center justify-center rounded-full ${RARITY_CLASSES[b.rarity].soft}`}>
              <BadgeIconView badge={b} className="size-8" />
            </span>
            <span>
              <span className="block font-semibold">{b.title}</span>
              <span className="block text-sm text-ink-soft">{b.description}</span>
            </span>
          </div>
        ))}
        {badges.length > shown.length && (
          <p className="text-sm text-ink-soft">И ещё {badges.length - shown.length}: смотрите в «Достижениях».</p>
        )}
        {goalMet && <p className="font-semibold text-success">Цель дня выполнена!</p>}
        {shareLine && (
          <Button variant="secondary" block onClick={() => shareText(shareLine)} data-testid="celebration-share">
            <Share2 className="size-icon" aria-hidden />
            Поделиться
          </Button>
        )}
        <Button block onClick={onClose} data-testid="celebration-close">
          Отлично
        </Button>
      </div>
    </Overlay>
  );
}

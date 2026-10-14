import { ArrowLeft, Star } from "lucide-react";
import { useApp } from "../AppContext";
import { Chip } from "./ui";

export function Header({
  title,
  subtitle,
  onBack,
  onStatus,
}: {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  /** Если задан, фигура статуса становится кнопкой (на главной ведёт к достижениям). */
  onStatus?: () => void;
}) {
  const { me } = useApp();
  return (
    <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-line bg-surface px-block py-3">
      {onBack ? (
        <button
          type="button"
          onClick={onBack}
          aria-label="Назад"
          className="flex size-10 items-center justify-center rounded-control active:bg-page"
        >
          <ArrowLeft className="size-icon" />
        </button>
      ) : (
        <img src="/logo.png" alt="Milav" className="h-8" />
      )}
      <div className="min-w-0 flex-1">
        <h1 className="truncate font-bold leading-tight">{title}</h1>
        {subtitle && <p className="truncate text-sm text-ink-soft">{subtitle}</p>}
      </div>
      <Chip tone="accent">
        <Star className="size-4 fill-brand-yellow text-brand-yellow" aria-hidden />
        <span data-testid="points">{me.points}</span>
      </Chip>
      {onStatus ? (
        <button
          type="button"
          onClick={onStatus}
          title={me.status.name}
          aria-label={`Статус: ${me.status.name}. Открыть достижения`}
          data-testid="status-button"
          className="relative flex size-10 items-center justify-center rounded-full bg-accent-soft text-2xl leading-none active:opacity-80"
        >
          {me.status.symbol}
          {me.play.unseenBadges > 0 && (
            <span className="absolute right-0 top-0 size-3 rounded-full bg-danger" data-testid="unseen-dot" aria-hidden />
          )}
        </button>
      ) : (
        <span
          title={me.status.name}
          aria-label={`Статус: ${me.status.name}`}
          className="flex size-10 items-center justify-center rounded-full bg-accent-soft text-2xl leading-none"
        >
          {me.status.symbol}
        </span>
      )}
    </header>
  );
}

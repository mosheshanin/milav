import { CircleCheck, Keyboard, Mic, PenTool, Volume2, type LucideIcon } from "lucide-react";
import { STAGES, STAGE_TITLES, type Stage, type WordProgress } from "@milav/shared";

/** Значок этапа, как на карточках прошлой версии: динамик, микрофон, перо, клавиатура. */
export const STAGE_ICONS: Record<Stage, LucideIcon> = {
  listen: Volume2,
  speak: Mic,
  write: PenTool,
  type: Keyboard,
};

/**
 * Этапы слова (четыре) или буквы (три, без «говори»). Этап доступен, когда пройдены предыдущие
 * (этап «говори», который пользователь пропустил, считается пройденным только для открытия следующих).
 * Плитка: крупный значок сверху, подпись снизу. Текущий этап синий, пройденный зелёный с галочкой,
 * закрытый бледный.
 */
export function StageTabs({
  progress,
  current,
  skipped,
  onSelect,
  stages = STAGES,
}: {
  progress: WordProgress;
  current: Stage;
  skipped: boolean;
  onSelect: (stage: Stage) => void;
  stages?: readonly Stage[];
}) {
  const firstOpen = stages.findIndex((s) => !progress[s] && !(s === "speak" && skipped));
  const unlockedUpTo = firstOpen === -1 ? stages.length - 1 : firstOpen;

  return (
    <div className={`grid gap-2 ${stages.length === 3 ? "grid-cols-3" : "grid-cols-4"}`} role="tablist">
      {stages.map((stage, i) => {
        const locked = i > unlockedUpTo;
        const done = progress[stage];
        const active = stage === current;
        const Icon = done ? CircleCheck : STAGE_ICONS[stage];
        return (
          <button
            key={stage}
            type="button"
            role="tab"
            aria-selected={active}
            disabled={locked}
            data-testid={`tab-${stage}`}
            data-state={done ? "done" : locked ? "locked" : "open"}
            onClick={() => onSelect(stage)}
            className={`flex min-h-20 flex-col items-center justify-center gap-1.5 rounded-control border-2 px-1 text-xs font-semibold transition ${
              active
                ? done
                  ? "border-success/60 bg-success-soft text-success"
                  : "border-accent/50 bg-accent-soft text-accent"
                : done
                  ? "border-success/25 bg-success-soft text-success"
                  : locked
                    ? "border-line bg-page text-ink-soft opacity-50"
                    : "border-line bg-surface text-ink"
            }`}
          >
            <Icon className="size-icon-lg" strokeWidth={1.75} aria-hidden />
            {STAGE_TITLES[stage]}
          </button>
        );
      })}
    </div>
  );
}

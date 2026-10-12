import { Check, Lock } from "lucide-react";
import { STAGES, STAGE_TITLES, type Stage, type WordProgress } from "@milav/shared";

/**
 * Четыре этапа слова. Этап доступен, когда пройдены предыдущие
 * (этап «говори», который пользователь пропустил, считается пройденным только для открытия следующих).
 */
export function StageTabs({
  progress,
  current,
  skipped,
  onSelect,
}: {
  progress: WordProgress;
  current: Stage;
  skipped: boolean;
  onSelect: (stage: Stage) => void;
}) {
  const firstOpen = STAGES.findIndex((s) => !progress[s] && !(s === "speak" && skipped));
  const unlockedUpTo = firstOpen === -1 ? STAGES.length - 1 : firstOpen;

  return (
    <div className="grid grid-cols-4 gap-2" role="tablist">
      {STAGES.map((stage, i) => {
        const locked = i > unlockedUpTo;
        const done = progress[stage];
        const active = stage === current;
        return (
          <button
            key={stage}
            type="button"
            role="tab"
            aria-selected={active}
            disabled={locked}
            data-testid={`tab-${stage}`}
            onClick={() => onSelect(stage)}
            className={`flex min-h-14 flex-col items-center justify-center gap-0.5 rounded-control border text-sm font-semibold transition ${
              active
                ? "border-accent bg-accent text-white"
                : done
                  ? "border-success-soft bg-success-soft text-success"
                  : "border-line bg-surface text-ink"
            } ${locked ? "opacity-40" : ""}`}
          >
            {done ? <Check className="size-4" aria-hidden /> : locked ? <Lock className="size-4" aria-hidden /> : <span className="size-4" />}
            {STAGE_TITLES[stage]}
          </button>
        );
      })}
    </div>
  );
}

import { useEffect, useRef, type ReactNode } from "react";
import { AUTO_NEXT_MS, autoNextElapsed, autoNextShare } from "../lib/autoNext";
import { Button } from "./ui";

type Tone = "primary" | "success";

const SOFT: Record<Tone, string> = {
  primary: "bg-accent-soft text-accent",
  success: "bg-success-soft text-success",
};
const SOLID: Record<Tone, string> = {
  primary: "bg-accent text-white",
  success: "bg-success text-white",
};

/**
 * Кнопка «Дальше» с автопереходом. Пока `running`, за AUTO_NEXT_MS кнопка заливается слева направо
 * (видно, сколько осталось), и в конце сама вызывает `onNext`. Нажатие раньше переходит сразу.
 * Пока приложение свёрнуто, отсчёт стоит. Без `running` это обычная кнопка.
 */
export function AutoNextButton({
  running,
  onNext,
  tone = "primary",
  disabled = false,
  testId,
  children,
}: {
  running: boolean;
  onNext: () => void;
  tone?: Tone;
  disabled?: boolean;
  testId?: string;
  children: ReactNode;
}) {
  const fill = useRef<HTMLSpanElement>(null);
  // Свежий обработчик без перезапуска отсчёта при каждой перерисовке родителя.
  const next = useRef(onNext);
  next.current = onNext;

  useEffect(() => {
    if (!running || disabled) return;
    let elapsed = 0;
    let last: number | null = null;
    let frame = 0;
    const tick = (now: number) => {
      elapsed = autoNextElapsed(elapsed, last === null ? 0 : now - last);
      last = now;
      const share = autoNextShare(elapsed);
      // Залитая часть показана через обрезку верхнего слоя: справа отрезается то, что ещё не залито.
      if (fill.current) fill.current.style.clipPath = `inset(0 ${(1 - share) * 100}% 0 0)`;
      if (elapsed >= AUTO_NEXT_MS) {
        next.current();
        return;
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [running, disabled]);

  if (!running) {
    return (
      <Button variant={tone} onClick={onNext} disabled={disabled} data-testid={testId}>
        {children}
      </Button>
    );
  }

  return (
    <button
      type="button"
      onClick={onNext}
      disabled={disabled}
      data-testid={testId}
      data-auto-next="running"
      className={`relative inline-flex min-h-12 items-center justify-center overflow-hidden rounded-control px-block font-semibold transition-opacity active:opacity-80 disabled:opacity-40 ${SOFT[tone]}`}
    >
      <span className="inline-flex items-center gap-2">{children}</span>
      <span
        ref={fill}
        aria-hidden
        className={`absolute inset-0 inline-flex items-center justify-center gap-2 px-block ${SOLID[tone]}`}
        style={{ clipPath: "inset(0 100% 0 0)" }}
      >
        {children}
      </span>
    </button>
  );
}

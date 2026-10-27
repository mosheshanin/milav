import { Delete } from "lucide-react";
import { Button } from "./ui";

/** Разбивает набранные цифры телефона на группы 3-3-4 для показа. */
export function formatDigits(value: string, sizes: readonly number[] = [3, 3, 4]): string {
  const parts: string[] = [];
  let at = 0;
  for (const size of sizes) {
    if (at >= value.length) break;
    parts.push(value.slice(at, at + size));
    at += size;
  }
  if (at < value.length) parts.push(value.slice(at));
  return parts.join("-");
}

/**
 * Клавиатура цифр для ответов тренажёра чисел: свои кнопки вместо системной клавиатуры, чтобы на телефоне не прыгала раскладка
 * и не открывалась лишняя строка ввода. `colon` добавляет двоеточие для времени. Показывает набранное крупно слева направо
 * (цифры не зависят от направления письма).
 */
export function DigitPad({
  value,
  maxLength,
  colon = false,
  disabled = false,
  placeholder = "Введите ответ",
  format,
  onChange,
  onSubmit,
}: {
  value: string;
  maxLength: number;
  colon?: boolean;
  disabled?: boolean;
  placeholder?: string;
  /** Как показать набранное (например, телефон группами). */
  format?: (value: string) => string;
  onChange: (value: string) => void;
  onSubmit: () => void;
}) {
  const full = value.length >= maxLength;
  const key = "h-14 rounded-control border border-line bg-surface text-2xl font-semibold transition active:bg-accent-soft disabled:opacity-40";
  return (
    <div className="flex flex-col gap-2" data-testid="digit-pad">
      <div
        dir="ltr"
        data-testid="num-display"
        aria-live="polite"
        className={`flex min-h-14 items-center justify-center rounded-control bg-page px-3 text-3xl font-bold tracking-wider ${value ? "" : "text-lg font-normal text-ink-soft"}`}
      >
        {value ? (format ? format(value) : value) : placeholder}
      </div>
      <div className="grid grid-cols-3 gap-2" dir="ltr">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
          <button key={d} type="button" disabled={disabled || full} onClick={() => onChange(value + d)} data-testid={`num-key-${d}`} className={key}>
            {d}
          </button>
        ))}
        {colon ? (
          <button
            type="button"
            disabled={disabled || full || value === "" || value.includes(":")}
            onClick={() => onChange(`${value}:`)}
            data-testid="num-key-colon"
            aria-label="Двоеточие"
            className={key}
          >
            :
          </button>
        ) : (
          <span aria-hidden />
        )}
        <button type="button" disabled={disabled || full} onClick={() => onChange(`${value}0`)} data-testid="num-key-0" className={key}>
          0
        </button>
        <button
          type="button"
          disabled={disabled || value === ""}
          onClick={() => onChange(value.slice(0, -1))}
          data-testid="num-key-back"
          aria-label="Стереть"
          className={`${key} flex items-center justify-center`}
        >
          <Delete className="size-icon" aria-hidden />
        </button>
      </div>
      <Button onClick={onSubmit} disabled={disabled || value === ""} data-testid="num-submit">
        Проверить
      </Button>
    </div>
  );
}

// Общие элементы экранов настроек: раздел-карточка, выбор одного варианта («таблетки»), переключатель.
// Ими пользуются «Настройки» ученика и «Настройки приложения» в панели администратора.
import type { ReactNode } from "react";
import { Card } from "./ui";

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-lg font-bold">{title}</h2>
      <Card className="flex flex-col gap-block">{children}</Card>
    </section>
  );
}

/** Выбор одного варианта из нескольких: кнопки-«таблетки» (как у цели дня). */
export function Choice<T extends string | number>({
  label,
  hint,
  options,
  value,
  disabled,
  testId,
  onChange,
}: {
  label: string;
  hint?: string;
  options: { value: T; title: string }[];
  value: T;
  disabled?: boolean;
  testId: string;
  onChange: (value: T) => void;
}) {
  return (
    <div>
      <div className="font-semibold">{label}</div>
      {hint && <p className="mb-2 text-sm text-ink-soft">{hint}</p>}
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={label}>
        {options.map((o) => (
          <button
            key={String(o.value)}
            type="button"
            role="radio"
            aria-checked={value === o.value}
            data-testid={`${testId}-${o.value}`}
            disabled={disabled}
            onClick={() => onChange(o.value)}
            className={`min-h-10 rounded-full px-4 font-semibold ${
              value === o.value ? "bg-accent text-white" : "bg-line text-ink-soft"
            }`}
          >
            {o.title}
          </button>
        ))}
      </div>
    </div>
  );
}

export function Toggle({
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

import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "secondary" | "success" | "ghost";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-accent text-white active:opacity-80",
  secondary: "bg-accent-soft text-accent active:opacity-80",
  success: "bg-success text-white active:opacity-80",
  ghost: "bg-surface text-ink border border-line active:bg-page",
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  block?: boolean;
}

export function Button({ variant = "primary", block = false, className = "", ...rest }: ButtonProps) {
  return (
    <button
      type="button"
      {...rest}
      className={`inline-flex min-h-12 items-center justify-center gap-2 rounded-control px-block font-semibold transition disabled:opacity-40 ${
        block ? "w-full" : ""
      } ${VARIANTS[variant]} ${className}`}
    />
  );
}

export function Card({
  children,
  className = "",
  ...rest
}: { children: ReactNode; className?: string } & Omit<HTMLAttributes<HTMLElement>, "className" | "children">) {
  return (
    <section {...rest} className={`rounded-card border border-line bg-surface p-block ${className}`}>
      {children}
    </section>
  );
}

/**
 * Плашка-метка. `raised`: метка стоит на цветном фоне (сданный или начатый урок на главной), и её мягкий фон слился бы
 * с ним, поэтому фон берётся от карточки, а цвет текста остаётся по тону.
 */
export function Chip({
  children,
  tone = "neutral",
  raised = false,
}: {
  children: ReactNode;
  tone?: "neutral" | "accent" | "success" | "danger";
  raised?: boolean;
}) {
  const tones = {
    neutral: ["bg-line", "text-ink-soft"],
    accent: ["bg-accent-soft", "text-accent"],
    success: ["bg-success-soft", "text-success"],
    danger: ["bg-danger-soft", "text-danger"],
  };
  const [bg, text] = tones[tone];
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-sm font-semibold ${raised ? "bg-surface" : bg} ${text}`}>
      {children}
    </span>
  );
}

/** Сообщение на весь экран: загрузка, ошибка, «откройте в Telegram». */
export function Notice({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <main className="mx-auto flex min-h-full max-w-md flex-col items-center justify-center gap-block p-section text-center">
      <img src="/logo.png" alt="Milav" className="h-14" />
      <h1 className="text-xl font-bold">{title}</h1>
      {children && <div className="text-ink-soft">{children}</div>}
    </main>
  );
}

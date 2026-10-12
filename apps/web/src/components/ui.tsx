import type { ButtonHTMLAttributes, ReactNode } from "react";

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

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-card border border-line bg-surface p-block ${className}`}>{children}</section>;
}

export function Chip({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "accent" | "success" | "danger";
}) {
  const tones = {
    neutral: "bg-line text-ink-soft",
    accent: "bg-accent-soft text-accent",
    success: "bg-success-soft text-success",
    danger: "bg-danger-soft text-danger",
  };
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-sm font-semibold ${tones[tone]}`}>
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

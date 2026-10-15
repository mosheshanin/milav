import { Component, type ErrorInfo, type ReactNode } from "react";
import { reportError, reportEvent } from "../lib/telemetry";
import { Button } from "./ui";

/**
 * Если отрисовка упала, вместо белого экрана показываем понятное сообщение и кнопку перезапуска,
 * а ошибку отправляем в журнал (lib/telemetry.ts). Прогресс хранится на сервере, поэтому перезапуск ничего не теряет.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  componentDidCatch(error: unknown, info: ErrorInfo): void {
    // Стек компонентов показывает, какой экран упал: добавляем его к стеку ошибки.
    const err = error instanceof Error ? error : new Error(String(error));
    if (info.componentStack) err.stack = `${err.stack ?? ""}\nКомпоненты:${info.componentStack}`;
    reportError("render", err);
    reportEvent("app_crash");
  }

  render(): ReactNode {
    if (!this.state.failed) return this.props.children;
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-block bg-page px-block text-center text-ink">
        <p className="text-lg font-semibold">Что-то пошло не так</p>
        <p className="text-sm text-ink-soft">Мы уже получили сообщение об ошибке. Ваш прогресс сохранён.</p>
        <Button onClick={() => window.location.reload()}>Перезапустить</Button>
      </main>
    );
  }
}

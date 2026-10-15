// Загрузка раздела панели: «Загрузка…», ошибка с кнопкой «Повторить», готовые данные.
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Button, Card } from "../../components/ui";
import { adminErrorText } from "../../lib/adminText";

export type Loaded<T> = { state: "loading" } | { state: "error"; text: string } | { state: "ready"; data: T };

export function useLoad<T>(load: () => Promise<T>): [Loaded<T>, () => void] {
  const [value, setValue] = useState<Loaded<T>>({ state: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setValue({ state: "loading" });
    load().then(
      (data) => !cancelled && setValue({ state: "ready", data }),
      (e) => !cancelled && setValue({ state: "error", text: adminErrorText(e) }),
    );
    return () => {
      cancelled = true;
    };
    // load намеренно не в зависимостях: раздел загружается при открытии и по «Повторить».
  }, [attempt]);

  const reload = useCallback(() => setAttempt((n) => n + 1), []);
  return [value, reload];
}

/** Показывает загрузку или ошибку, а готовые данные отдаёт `children`. */
export function LoadView<T>({ value, reload, children }: { value: Loaded<T>; reload: () => void; children: (data: T) => ReactNode }) {
  if (value.state === "loading") return <p className="text-center text-ink-soft">Загрузка…</p>;
  if (value.state === "error") {
    return (
      <Card className="flex flex-col items-start gap-2">
        <p role="alert">{value.text}</p>
        <Button variant="ghost" onClick={reload}>
          Повторить
        </Button>
      </Card>
    );
  }
  return <>{children(value.data)}</>;
}

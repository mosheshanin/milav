import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { MeResponse } from "@milav/shared";
import { ApiError, api } from "./api";
import { authHeader } from "./telegram";

type Load =
  | { state: "loading" }
  | { state: "no-auth" }
  | { state: "error"; code: string }
  | { state: "ready"; me: MeResponse };

interface AppValue {
  me: MeResponse;
  /** Обновляет очки после ответа сервера. */
  setPoints: (points: number) => void;
  /** Заново читает профиль (например, после сданной викторины). */
  refresh: () => Promise<void>;
}

const Ctx = createContext<AppValue | null>(null);

export function useApp(): AppValue {
  const value = useContext(Ctx);
  if (!value) throw new Error("useApp вызван вне AppProvider");
  return value;
}

/** Загружает профиль и показывает экран ожидания или ошибки, пока он не готов. */
export function AppProvider({
  children,
  fallback,
}: {
  children: ReactNode;
  fallback: (load: Exclude<Load, { state: "ready" }>) => ReactNode;
}) {
  const [load, setLoad] = useState<Load>(() => (authHeader() ? { state: "loading" } : { state: "no-auth" }));

  const fetchMe = useCallback(async () => {
    try {
      setLoad({ state: "ready", me: await api.me() });
    } catch (e) {
      setLoad({ state: "error", code: e instanceof ApiError ? e.code : "error" });
    }
  }, []);

  useEffect(() => {
    if (authHeader()) void fetchMe();
  }, [fetchMe]);

  const value = useMemo<AppValue | null>(
    () =>
      load.state === "ready"
        ? {
            me: load.me,
            setPoints: (points) => setLoad({ state: "ready", me: { ...load.me, points } }),
            refresh: fetchMe,
          }
        : null,
    [load, fetchMe],
  );

  if (!value || load.state !== "ready") return <>{fallback(load as Exclude<Load, { state: "ready" }>)}</>;
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

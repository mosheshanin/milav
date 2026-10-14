import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { MeResponse, PlayInfo } from "@milav/shared";
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
  /** То же, но только если профиль читали давно (при возврате на главную, чтобы не делать лишний запрос). */
  refreshIfStale: () => Promise<void>;
  /** Подставляет новую цель дня и счётчик непросмотренных после ответа сервера. */
  applyPlay: (play: PlayInfo) => void;
}

/** Профиль считается свежим столько миллисекунд после чтения. */
const STALE_MS = 5000;

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

  const fetchedAt = useRef(0);

  const fetchMe = useCallback(async () => {
    try {
      const me = await api.me();
      fetchedAt.current = Date.now();
      setLoad({ state: "ready", me });
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
            refreshIfStale: async () => {
              if (Date.now() - fetchedAt.current > STALE_MS) await fetchMe();
            },
            applyPlay: (play) => setLoad({ state: "ready", me: { ...load.me, play } }),
          }
        : null,
    [load, fetchMe],
  );

  if (!value || load.state !== "ready") return <>{fallback(load as Exclude<Load, { state: "ready" }>)}</>;
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

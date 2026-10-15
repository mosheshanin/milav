import { useCallback, useEffect, useRef, useState } from "react";
import type { PlayHooks } from "./audio";

/**
 * Состояние кнопки «послушать».
 * - `idle`: ничего не играет.
 * - `pending`: нажали, звук ещё не пошёл, но прошло меньше `LOADING_DELAY_MS`: выглядит как обычная кнопка,
 *   чтобы при быстром отклике индикатор не мигал.
 * - `loading`: звук всё ещё не пошёл, показываем загрузку.
 * - `playing`: звук звучит.
 */
export type PlaybackState = "idle" | "pending" | "loading" | "playing";

/** Через сколько миллисекунд без звука показывать загрузку. */
export const LOADING_DELAY_MS = 150;

type Play = (hooks: PlayHooks) => Promise<boolean>;

/**
 * Проигрывает `play` и сообщает смену состояний через `setState`. Без React, чтобы проверять тестами.
 * Возвращает результат `play` (false, если звук не удалось воспроизвести).
 */
export async function runPlayback(
  play: Play,
  setState: (state: PlaybackState) => void,
  delayMs = LOADING_DELAY_MS,
): Promise<boolean> {
  let started = false;
  setState("pending");
  const timer = setTimeout(() => {
    if (!started) setState("loading");
  }, delayMs);
  try {
    return await play({
      onStart: () => {
        started = true;
        clearTimeout(timer);
        setState("playing");
      },
    });
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
    setState("idle");
  }
}

/** Хук для кнопок: повторное нажатие, пока звук не закончился, ничего не делает (возвращает null). */
export function usePlayback() {
  const [state, setState] = useState<PlaybackState>("idle");
  const busy = useRef(false);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const run = useCallback(async (play: Play): Promise<boolean | null> => {
    if (busy.current) return null;
    busy.current = true;
    try {
      return await runPlayback(play, (next) => {
        if (alive.current) setState(next);
      });
    } finally {
      busy.current = false;
    }
  }, []);

  return { state, run, busy: state !== "idle" };
}

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PlayHooks } from "./audio";
import { LOADING_DELAY_MS, runPlayback, type PlaybackState } from "./usePlayback";

/** Проигрывание, которым управляет тест: `start()` звук пошёл, `finish(ok)` закончился. */
function controlled() {
  let hooks: PlayHooks = {};
  let done: (ok: boolean) => void = () => undefined;
  const play = (h: PlayHooks) => {
    hooks = h;
    return new Promise<boolean>((resolve) => {
      done = resolve;
    });
  };
  return { play, start: () => hooks.onStart?.(), finish: (ok: boolean) => done(ok) };
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("runPlayback", () => {
  it("быстрый звук: загрузка не показывается, сразу «играет», потом обычное состояние", async () => {
    const states: PlaybackState[] = [];
    const c = controlled();
    const result = runPlayback(c.play, (s) => states.push(s));
    await vi.advanceTimersByTimeAsync(LOADING_DELAY_MS - 50);
    c.start();
    await vi.advanceTimersByTimeAsync(500);
    c.finish(true);
    expect(await result).toBe(true);
    expect(states).toEqual(["pending", "playing", "idle"]);
  });

  it("медленный звук: после задержки показывается загрузка, затем «играет»", async () => {
    const states: PlaybackState[] = [];
    const c = controlled();
    const result = runPlayback(c.play, (s) => states.push(s));
    await vi.advanceTimersByTimeAsync(LOADING_DELAY_MS + 10);
    expect(states).toEqual(["pending", "loading"]);
    c.start();
    c.finish(true);
    await result;
    expect(states).toEqual(["pending", "loading", "playing", "idle"]);
  });

  it("звук не воспроизвёлся: загрузка снимается, результат false", async () => {
    const states: PlaybackState[] = [];
    const c = controlled();
    const result = runPlayback(c.play, (s) => states.push(s));
    await vi.advanceTimersByTimeAsync(1000);
    c.finish(false);
    expect(await result).toBe(false);
    expect(states).toEqual(["pending", "loading", "idle"]);
  });

  it("ошибка внутри проигрывания не роняет кнопку", async () => {
    const states: PlaybackState[] = [];
    const result = runPlayback(() => Promise.reject(new Error("сбой")), (s) => states.push(s));
    expect(await result).toBe(false);
    expect(states.at(-1)).toBe("idle");
    // Таймер загрузки снят: состояние больше не меняется.
    await vi.advanceTimersByTimeAsync(1000);
    expect(states.at(-1)).toBe("idle");
  });
});

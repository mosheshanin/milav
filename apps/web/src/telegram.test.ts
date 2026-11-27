import { afterEach, describe, expect, it, vi } from "vitest";
import { lockVerticalSwipes } from "./telegram";

/** Имитация Telegram WebApp в окне (тесты идут в node, окна нет). */
function fakeTelegram(version: string) {
  const tg = {
    isVersionAtLeast: (v: string) => Number(version) >= Number(v),
    disableVerticalSwipes: vi.fn(),
    enableVerticalSwipes: vi.fn(),
  };
  vi.stubGlobal("window", { Telegram: { WebApp: tg } });
  return tg;
}

afterEach(() => vi.unstubAllGlobals());

describe("свайп вниз Telegram на холсте", () => {
  it("выключается, пока холст на экране, и включается после", () => {
    const tg = fakeTelegram("8.0");
    const unlock = lockVerticalSwipes();
    expect(tg.disableVerticalSwipes).toHaveBeenCalledTimes(1);
    expect(tg.enableVerticalSwipes).not.toHaveBeenCalled();
    unlock();
    expect(tg.enableVerticalSwipes).toHaveBeenCalledTimes(1);
  });

  it("новый холст до ухода старого: свайп не включается между ними", () => {
    const tg = fakeTelegram("8.0");
    const first = lockVerticalSwipes();
    const second = lockVerticalSwipes();
    first();
    first();
    expect(tg.enableVerticalSwipes).not.toHaveBeenCalled();
    second();
    expect(tg.enableVerticalSwipes).toHaveBeenCalledTimes(1);
    expect(tg.disableVerticalSwipes).toHaveBeenCalledTimes(1);
  });

  it("старый Telegram (до 7.7) и запуск вне Telegram пропускаются молча", () => {
    const tg = fakeTelegram("7.0");
    lockVerticalSwipes()();
    expect(tg.disableVerticalSwipes).not.toHaveBeenCalled();
    vi.stubGlobal("window", {});
    expect(() => lockVerticalSwipes()()).not.toThrow();
  });
});

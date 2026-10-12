import { describe, expect, it } from "vitest";
import { SilenceDetector } from "./silence";

/** Прогоняет громкость по шагам 50 мс; возвращает момент остановки или null. */
function run(levels: (t: number) => number, until = 5000): number | null {
  const d = new SilenceDetector();
  for (let t = 0; t <= until; t += 50) if (d.push(levels(t), t)) return t;
  return null;
}

describe("определение конца речи по паузе", () => {
  it("тишина без речи не останавливает запись", () => {
    expect(run(() => 0.005)).toBeNull();
  });

  it("после речи и паузы останавливает через длину паузы", () => {
    // тишина 0-400, речь 400-1000, потом тишина
    const stop = run((t) => (t >= 400 && t < 1000 ? 0.2 : 0.005));
    expect(stop).not.toBeNull();
    expect(stop!).toBeGreaterThanOrEqual(1000 + 600);
    expect(stop!).toBeLessThanOrEqual(1000 + 800);
  });

  it("короткая пауза внутри слова не останавливает", () => {
    const stop = run((t) => (t >= 400 && t < 600) || (t >= 900 && t < 1300) ? 0.2 : 0.005, 1600);
    expect(stop).toBeNull();
  });

  it("одиночный щелчок короче минимума речи не считается речью", () => {
    expect(run((t) => (t === 500 ? 0.4 : 0.005))).toBeNull();
  });

  it("постоянный шум комнаты не считается речью, но речь громче шума распознаётся", () => {
    const noise = 0.04;
    expect(run(() => noise)).toBeNull();
    const stop = run((t) => (t >= 400 && t < 1000 ? 0.3 : noise));
    expect(stop).not.toBeNull();
  });

  it("человек заговорил сразу с начала записи", () => {
    const stop = run((t) => (t < 800 ? 0.3 : 0.005));
    expect(stop).not.toBeNull();
  });
});

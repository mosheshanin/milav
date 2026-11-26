import { describe, expect, it, vi } from "vitest";
import { spellDigits, spellNumber, spellTime } from "@milav/shared";
import { NUMBER_GAPS, claimPlayback, contextForGesture, planPlayback, settleWithin, speechRange } from "./numberAudio";
import { formatDigits } from "../components/DigitPad";

describe("порядок и паузы проигрыша числа", () => {
  it("куски идут в порядке числа, у первого нет паузы, между словами короткая", () => {
    const plan = planPlayback(spellNumber(125));
    expect(plan.map((s) => s.id)).toEqual(["h1", "t20", "vf5"]);
    expect(plan.map((s) => s.gapBefore)).toEqual([0, NUMBER_GAPS.normal.word, NUMBER_GAPS.normal.word]);
  });

  it("«медленнее» разводит слова дольше", () => {
    const slow = planPlayback(spellTime(3, 35), true);
    expect(slow.map((s) => s.gapBefore).slice(1).every((g) => g === NUMBER_GAPS.slow.word)).toBe(true);
    expect(NUMBER_GAPS.slow.word).toBeGreaterThan(NUMBER_GAPS.normal.word);
  });

  it("телефон: длинная пауза после каждой группы 3-3-4", () => {
    const plan = planPlayback(spellDigits("0541234567"));
    expect(plan).toHaveLength(10);
    const long = plan.map((s, i) => (s.gapBefore === NUMBER_GAPS.normal.group ? i : -1)).filter((i) => i >= 0);
    expect(long).toEqual([3, 6]);
    expect(plan.filter((s) => s.gapBefore === NUMBER_GAPS.normal.word)).toHaveLength(7);
  });
});

describe("участок речи в записи куска", () => {
  const rate = 1000;
  it("обрезает тишину по краям, оставляя небольшой запас", () => {
    const samples = new Float32Array(1000);
    samples.fill(0.5, 200, 700);
    const { offset, duration } = speechRange(samples, rate, 0.01, 0.01);
    expect(offset).toBeCloseTo(0.19, 5);
    expect(duration).toBeCloseTo(0.52, 5);
  });

  it("запас не выходит за границы записи", () => {
    const samples = new Float32Array(100).fill(0.5);
    expect(speechRange(samples, rate, 0.01, 0.05)).toEqual({ offset: 0, duration: 0.1 });
  });

  it("полная тишина воспроизводится целиком (ничего не режем)", () => {
    expect(speechRange(new Float32Array(500), rate)).toEqual({ offset: 0, duration: 0.5 });
  });
});

describe("номер телефона на экране", () => {
  it("группы 3-3-4 по мере набора", () => {
    expect(formatDigits("")).toBe("");
    expect(formatDigits("05")).toBe("05");
    expect(formatDigits("054")).toBe("054");
    expect(formatDigits("0541")).toBe("054-1");
    expect(formatDigits("0541234")).toBe("054-123-4");
    expect(formatDigits("0541234567")).toBe("054-123-4567");
  });
});

describe("звук на телефоне (вопрос 146)", () => {
  it("прерванный или закрытый движок заменяется новым, приостановленный возобновляется", () => {
    expect(contextForGesture({ state: "running" })).toBe("keep");
    expect(contextForGesture({ state: "suspended" })).toBe("resume");
    expect(contextForGesture({ state: "interrupted" })).toBe("replace");
    expect(contextForGesture({ state: "closed" })).toBe("replace");
    expect(contextForGesture(null)).toBe("replace");
  });

  it("беззвучный режим iPhone: на время числа режим «проигрывание», потом снова «авто»", () => {
    const session = { type: "auto" as const } as { type: "auto" | "playback" | "play-and-record" };
    const restore = claimPlayback(session as never, false);
    expect(session.type).toBe("playback");
    restore();
    expect(session.type).toBe("auto");
  });

  it("при открытом микрофоне и чужом режиме ничего не трогаем, без Audio Session API тоже", () => {
    const session = { type: "auto" } as { type: string };
    claimPlayback(session as never, true)();
    expect(session.type).toBe("auto");
    const recording = { type: "play-and-record" } as { type: string };
    claimPlayback(recording as never, false)();
    expect(recording.type).toBe("play-and-record");
    expect(() => claimPlayback(undefined, false)()).not.toThrow();
  });

  it("не ждём запуска движка дольше срока и не падаем на ошибке", async () => {
    vi.useFakeTimers();
    try {
      let done = false;
      void settleWithin(new Promise(() => undefined), 1500).then(() => (done = true));
      await vi.advanceTimersByTimeAsync(1499);
      expect(done).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      expect(done).toBe(true);
    } finally {
      vi.useRealTimers();
    }
    await expect(settleWithin(Promise.reject(new Error("x")), 10)).resolves.toBeUndefined();
  });
});

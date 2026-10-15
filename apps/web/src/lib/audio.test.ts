import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PRIMED_LIMIT, playWord, primeAudio, primedSources, resetPrimedAudio } from "./audio";

/** Поддельный элемент <audio>: `play()` сразу «играет» и через тик заканчивает, если `fail` не задан. */
class FakeAudio {
  static created: FakeAudio[] = [];
  static fail = false;
  src = "";
  preload = "";
  paused = true;
  currentTime = 5;
  error: { code: number } | null = null;
  private listeners = new Map<string, Set<() => void>>();
  constructor(src?: string) {
    if (src) this.src = src;
    FakeAudio.created.push(this);
  }
  addEventListener(name: string, fn: () => void) {
    if (!this.listeners.has(name)) this.listeners.set(name, new Set());
    this.listeners.get(name)!.add(fn);
  }
  removeEventListener(name: string, fn: () => void) {
    this.listeners.get(name)?.delete(fn);
  }
  emit(name: string) {
    for (const fn of [...(this.listeners.get(name) ?? [])]) fn();
  }
  play() {
    if (FakeAudio.fail) return Promise.reject(new Error("NotAllowedError"));
    this.paused = false;
    setTimeout(() => {
      this.emit("playing");
      this.paused = true;
      this.emit("ended");
    }, 0);
    return Promise.resolve();
  }
}

beforeEach(() => {
  FakeAudio.created = [];
  FakeAudio.fail = false;
  resetPrimedAudio();
  vi.stubGlobal("Audio", FakeAudio);
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("playWord", () => {
  it("сообщает о начале звука и возвращает true", async () => {
    const onStart = vi.fn();
    expect(await playWord({ he: "חתול", audio: "/audio/a.mp3" }, { onStart })).toBe(true);
    expect(onStart).toHaveBeenCalledTimes(1);
  });

  it("играет заранее подгруженный элемент с начала, а не создаёт новый", async () => {
    primeAudio("/audio/a.mp3");
    expect(FakeAudio.created).toHaveLength(1);
    const primed = FakeAudio.created[0]!;
    expect(primed.preload).toBe("auto");
    await playWord({ he: "חתול", audio: "/audio/a.mp3" });
    expect(FakeAudio.created).toHaveLength(1);
    expect(primed.currentTime).toBe(0);
  });

  it("если подгрузка сорвалась, играет новым элементом", async () => {
    primeAudio("/audio/a.mp3");
    FakeAudio.created[0]!.error = { code: 2 };
    expect(await playWord({ he: "חתול", audio: "/audio/a.mp3" })).toBe(true);
    expect(FakeAudio.created).toHaveLength(2);
    expect(primedSources()).toEqual([]);
  });

  it("файл не играет и голоса устройства нет: false", async () => {
    FakeAudio.fail = true;
    vi.stubGlobal("speechSynthesis", undefined);
    const onStart = vi.fn();
    expect(await playWord({ he: "חתול", audio: "/audio/a.mp3" }, { onStart })).toBe(false);
    expect(onStart).not.toHaveBeenCalled();
  });

  it("без файла говорит голос устройства и тоже сообщает о начале звука", async () => {
    const speak = vi.fn((u: { onstart?: () => void; onend?: () => void }) => {
      u.onstart?.();
      u.onend?.();
    });
    vi.stubGlobal("speechSynthesis", { cancel: vi.fn(), speak, getVoices: () => [] });
    vi.stubGlobal(
      "SpeechSynthesisUtterance",
      class {
        lang = "";
        rate = 1;
        constructor(public text: string) {}
      },
    );
    const onStart = vi.fn();
    expect(await playWord({ he: "חתול" }, { onStart })).toBe(true);
    expect(speak).toHaveBeenCalledTimes(1);
    expect(onStart).toHaveBeenCalledTimes(1);
  });
});

describe("primeAudio", () => {
  it("один файл подгружается один раз, пустой адрес пропускается", () => {
    primeAudio("/audio/a.mp3");
    primeAudio("/audio/a.mp3");
    primeAudio(undefined);
    primeAudio("");
    expect(FakeAudio.created).toHaveLength(1);
  });

  it(`держит не больше ${PRIMED_LIMIT} файлов и вытесняет давно не нужные`, () => {
    for (let i = 0; i < PRIMED_LIMIT; i++) primeAudio(`/audio/${i}.mp3`);
    primeAudio("/audio/0.mp3"); // снова понадобился: становится свежим
    primeAudio("/audio/new.mp3");
    const list = primedSources();
    expect(list).toHaveLength(PRIMED_LIMIT);
    expect(list).not.toContain("/audio/1.mp3");
    expect(list).toContain("/audio/0.mp3");
    expect(list.at(-1)).toBe("/audio/new.mp3");
  });
});

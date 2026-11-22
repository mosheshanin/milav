// Микрофон на iPhone (22.11.2026): со второго слова запись не шла. Проверяем, что поток не выключается между записями,
// анализатор создаётся один раз вместе с потоком, мёртвый поток создаётся заново, а звуковой движок запускается по нажатию.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

class FakeTrack {
  readyState: "live" | "ended" = "live";
  muted = false;
  enabled = true;
  stop() {
    this.readyState = "ended";
  }
}

class FakeStream {
  constructor(readonly track = new FakeTrack()) {}
  getTracks() {
    return [this.track];
  }
  getAudioTracks() {
    return [this.track];
  }
}

class FakeContext {
  static made = 0;
  state: "running" | "suspended" | "closed" = "suspended";
  sampleRate = 44100;
  sources: FakeStream[] = [];
  resumed = 0;
  constructor() {
    FakeContext.made++;
  }
  resume() {
    this.resumed++;
    this.state = "running";
    return Promise.resolve();
  }
  close() {
    this.state = "closed";
    return Promise.resolve();
  }
  createMediaStreamSource(s: FakeStream) {
    this.sources.push(s);
    return { connect: () => undefined, disconnect: () => undefined };
  }
  createAnalyser() {
    return { fftSize: 0, smoothingTimeConstant: 0, frequencyBinCount: 256 };
  }
}

let streams: FakeStream[] = [];
let mic: typeof import("./mic");

beforeEach(async () => {
  vi.resetModules();
  streams = [];
  FakeContext.made = 0;
  vi.stubGlobal("MediaRecorder", class {});
  vi.stubGlobal("navigator", {
    mediaDevices: {
      getUserMedia: async () => {
        const s = new FakeStream();
        streams.push(s);
        return s;
      },
    },
    permissions: { query: async () => ({ state: "prompt" }) },
  });
  vi.stubGlobal("window", { AudioContext: FakeContext });
  vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => undefined });
  vi.useFakeTimers();
  mic = await import("./mic");
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("микрофон между записями (iPhone)", () => {
  it("второй раз тот же поток и тот же анализатор, дорожка не выключается", async () => {
    const first = await mic.acquireMic();
    mic.recordingDone();
    expect(streams[0]!.track.enabled).toBe(true);
    const second = await mic.acquireMic();
    expect(second.stream).toBe(first.stream);
    expect(second.analyser).toBe(first.analyser);
    expect(streams).toHaveLength(1);
    expect(FakeContext.made).toBe(1);
  });

  it("анализатор подключается к потоку сразу, один раз на поток", async () => {
    mic.primeAudio();
    await mic.acquireMic();
    await mic.acquireMic();
    const ctx = (globalThis as any).window.AudioContext as typeof FakeContext;
    expect(ctx.made).toBe(1);
    const { analyser } = await mic.acquireMic();
    expect(analyser).not.toBeNull();
  });

  it("звуковой движок запускается по нажатию (primeAudio) и возобновляется, если был приостановлен", async () => {
    mic.primeAudio();
    const first = await mic.acquireMic();
    expect(first.sampleRate).toBe(44100);
    expect(FakeContext.made).toBe(1);
  });

  it("дорожка закончилась или заглушена системой: следующее нажатие берёт новый поток", async () => {
    await mic.acquireMic();
    streams[0]!.track.muted = true;
    const again = await mic.acquireMic();
    expect(streams).toHaveLength(2);
    expect(again.stream).toBe(streams[1]);
    expect(streams[0]!.track.readyState).toBe("ended");

    streams[1]!.track.readyState = "ended";
    await mic.acquireMic();
    expect(streams).toHaveLength(3);
  });

  it("без записей минуту микрофон отпускается, потом создаётся заново", async () => {
    await mic.acquireMic();
    mic.recordingDone();
    vi.advanceTimersByTime(mic.IDLE_RELEASE_MS - 1);
    expect(streams[0]!.track.readyState).toBe("live");
    vi.advanceTimersByTime(1);
    expect(streams[0]!.track.readyState).toBe("ended");
    await mic.acquireMic();
    expect(streams).toHaveLength(2);
  });

  it("новая запись отменяет отпускание по простою", async () => {
    await mic.acquireMic();
    mic.recordingDone();
    vi.advanceTimersByTime(mic.IDLE_RELEASE_MS - 1000);
    await mic.acquireMic();
    vi.advanceTimersByTime(5000);
    expect(streams[0]!.track.readyState).toBe("live");
  });

  it("releaseMic: поток остановлен, следующий раз новый поток и новый движок", async () => {
    await mic.acquireMic();
    mic.releaseMic();
    expect(streams[0]!.track.readyState).toBe("ended");
    await mic.acquireMic();
    expect(streams).toHaveLength(2);
    expect(FakeContext.made).toBe(2);
  });

  it("отказ в доступе", async () => {
    (globalThis as any).navigator.mediaDevices.getUserMedia = async () => {
      throw new Error("NotAllowedError");
    };
    await expect(mic.acquireMic()).rejects.toMatchObject({ problem: "denied" });
  });

  it("usableStream", () => {
    expect(mic.usableStream(null)).toBe(false);
    const s = new FakeStream();
    expect(mic.usableStream(s as unknown as MediaStream)).toBe(true);
    s.track.muted = true;
    expect(mic.usableStream(s as unknown as MediaStream)).toBe(false);
  });
});

describe("мёртвая тишина (FlatSignal)", () => {
  it("ровный ноль за 5 снимков и больше: мёртвый вход; малейший шум: живой", async () => {
    const { FlatSignal } = await import("./recorder");
    const flat = new FlatSignal();
    for (let i = 0; i < 4; i++) flat.push(new Uint8Array(512).fill(128));
    expect(flat.flat()).toBe(false);
    flat.push(new Uint8Array(512).fill(128));
    expect(flat.flat()).toBe(true);

    const alive = new FlatSignal();
    const noise = new Uint8Array(512).fill(128);
    noise[100] = 129;
    for (let i = 0; i < 10; i++) alive.push(i === 7 ? noise : new Uint8Array(512).fill(128));
    expect(alive.flat()).toBe(false);
  });
});

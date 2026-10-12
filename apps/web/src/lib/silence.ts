export interface SilenceOptions {
  /** Пауза после речи, после которой запись считается законченной, мс. */
  silenceMs: number;
  /** Сколько речи нужно услышать, чтобы считать, что человек заговорил, мс. */
  minSpeechMs: number;
  /** Сколько первых миллисекунд уходит на оценку фонового шума. */
  calibrationMs: number;
  /** Порог громкости не ниже этого значения (громкость 0..1, среднеквадратичная). */
  minThreshold: number;
}

const MAX_NOISE = 0.03;

export const DEFAULT_SILENCE: SilenceOptions = {
  silenceMs: 700,
  minSpeechMs: 120,
  calibrationMs: 250,
  minThreshold: 0.03,
};

/**
 * Определяет конец фразы по громкости: после того как человек заговорил, пауза нужной длины значит «закончил».
 * Пока речи не было, никогда не просит остановку (до речи может быть любая тишина).
 * Фоновый шум оценивается по первым миллисекундам (самая тихая доля), порог = max(minThreshold, шум × 3).
 */
export class SilenceDetector {
  private noiseFloor = Infinity;
  private threshold: number;
  private voiceMs = 0;
  private lastSample: number | null = null;
  private lastVoiceAt: number | null = null;
  private spoke = false;

  constructor(private readonly options: SilenceOptions = DEFAULT_SILENCE) {
    this.threshold = options.minThreshold;
  }

  /** Принимает громкость `level` (0..1) в момент `t` (мс от начала записи). Возвращает true, когда пора остановить запись. */
  push(level: number, t: number): boolean {
    const dt = this.lastSample === null ? 0 : Math.max(0, t - this.lastSample);
    this.lastSample = t;

    if (t < this.options.calibrationMs) {
      // Шум берём как самую тихую долю за время калибровки: если человек заговорил сразу, это не завысит порог.
      // Шум выше MAX_NOISE порог не поднимает: в очень шумной комнате запись закончится по максимальному времени.
      this.noiseFloor = Math.min(this.noiseFloor, level);
      const noise = Math.min(this.noiseFloor, MAX_NOISE);
      this.threshold = Math.max(this.options.minThreshold, noise * 3);
      return false;
    }

    if (level > this.threshold) {
      this.voiceMs += dt;
      this.lastVoiceAt = t;
      if (this.voiceMs >= this.options.minSpeechMs) this.spoke = true;
      return false;
    }
    return this.spoke && this.lastVoiceAt !== null && t - this.lastVoiceAt >= this.options.silenceMs;
  }
}

import { SPEAK_MAX_MS, SPEAK_SILENCE_MS } from "@milav/shared";
import { RecorderError, acquireMic, recordingDone, releaseMic, usableStream } from "./mic";
import { DEFAULT_SILENCE, SilenceDetector } from "./silence";

export { RecorderError };

export interface ActiveRecording {
  /** Останавливает запись и возвращает звук. */
  stop(): Promise<Blob>;
  /** Звук, когда запись закончилась: по `stop()`, по паузе в речи или по максимальному времени. */
  finished: Promise<Blob>;
  /** Момент начала записи (performance.now) и максимальная длительность, мс: для индикатора времени. */
  startedAt: number;
  maxMs: number;
  /**
   * Микрофон отдавал мёртвую тишину (ровный ноль, ни одного колебания) или дорожка умерла во время записи. Так бывает
   * на iPhone, когда система отняла микрофон. Микрофон тогда уже отпущен: следующее нажатие возьмёт свежий поток.
   * Смотреть после окончания записи.
   */
  deadInput(): boolean;
  /**
   * Был ли на записи голос по громкости микрофона: true заговорили, false только тишина, null не знаем (Web Audio недоступен).
   * Смотреть после окончания записи.
   */
  voiceHeard(): boolean | null;
}

export interface RecordingOptions {
  /** Максимальная длительность, мс. */
  maxMs?: number;
  /** Пауза после речи, после которой запись останавливается сама, мс. */
  silenceMs?: number;
  /** Получает уровни звука для эквалайзера (значения 0..1) примерно 20 раз в секунду. */
  onLevels?: (bars: number[]) => void;
}

/** Сколько столбиков в эквалайзере. */
export const EQUALIZER_BARS = 16;

const MIME_TYPES = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];
/**
 * Битрейт записи. Для распознавания речи 32 кбит/с с запасом, а запись в 4 с весит около 16 КБ: сервер принимает
 * не больше 150 КБ (`MAX_AUDIO_BYTES`, вопрос 91). Без этого телефон может писать 128 кбит/с и больше.
 */
export const AUDIO_BITS_PER_SECOND = 32_000;
const TICK_MS = 50;

/**
 * Начинает запись с микрофона. Запись останавливается сама: когда человек произнёс слово и замолчал,
 * или через `maxMs`, что наступит раньше. Параллельно считает уровни звука для эквалайзера.
 */
export async function startRecording(options: RecordingOptions = {}): Promise<ActiveRecording> {
  const maxMs = options.maxMs ?? SPEAK_MAX_MS;
  const silenceMs = options.silenceMs ?? SPEAK_SILENCE_MS;

  // Поток и анализатор общие на всё время работы приложения (см. lib/mic.ts): системный запрос не повторяется,
  // а на iPhone анализатор, созданный не сразу вместе с потоком, молчит.
  const { stream, analyser, sampleRate } = await acquireMic();

  const mimeType = MIME_TYPES.find((t) => MediaRecorder.isTypeSupported(t));
  const recorder = new MediaRecorder(stream, { ...(mimeType ? { mimeType } : {}), audioBitsPerSecond: AUDIO_BITS_PER_SECOND });
  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };

  // Анализ звука: если Web Audio недоступен, запись всё равно идёт и закончится по максимальному времени.
  // Мёртвый вход: ни в одном отсчёте за всю запись ни малейшего колебания (у живого микрофона всегда есть шум).
  const level = new FlatSignal();

  let ticker: ReturnType<typeof setInterval> | undefined;
  let dead = false;
  const finished = new Promise<Blob>((resolve) => {
    recorder.onstop = () => {
      clearInterval(ticker);
      dead = (analyser !== null && level.flat()) || !usableStream(stream);
      // Мёртвый микрофон отпускаем сразу: следующее нажатие «Записать» создаст поток заново (как перезапуск приложения).
      if (dead) releaseMic();
      else recordingDone();
      options.onLevels?.(new Array<number>(EQUALIZER_BARS).fill(0));
      resolve(new Blob(chunks, { type: recorder.mimeType }));
    };
  });

  const stopRecorder = () => {
    if (recorder.state === "recording") recorder.stop();
  };

  const startedAt = performance.now();
  const detector = new SilenceDetector({ ...DEFAULT_SILENCE, silenceMs });
  const timeData = new Uint8Array(analyser?.fftSize ?? 0);
  const freqData = new Uint8Array(analyser?.frequencyBinCount ?? 0);

  recorder.start();
  ticker = setInterval(() => {
    const elapsed = performance.now() - startedAt;
    if (elapsed >= maxMs) return stopRecorder();
    if (!analyser) return;

    analyser.getByteTimeDomainData(timeData);
    level.push(timeData);
    let sum = 0;
    for (const v of timeData) sum += ((v - 128) / 128) ** 2;
    const rms = Math.sqrt(sum / timeData.length);

    analyser.getByteFrequencyData(freqData);
    options.onLevels?.(barsFromSpectrum(freqData, sampleRate));

    if (detector.push(rms, elapsed)) stopRecorder();
  }, TICK_MS);

  return {
    finished,
    startedAt,
    maxMs,
    voiceHeard: () => (analyser ? detector.heardVoice : null),
    deadInput: () => dead,
    stop: () => {
      stopRecorder();
      return finished;
    },
  };
}

/** Сводит спектр к EQUALIZER_BARS столбикам в диапазоне человеческого голоса (около 80–4000 Гц). */
export function barsFromSpectrum(spectrum: Uint8Array, sampleRate: number): number[] {
  const hzPerBin = sampleRate / 2 / spectrum.length;
  const lo = Math.max(1, Math.floor(80 / hzPerBin));
  const hi = Math.min(spectrum.length, Math.ceil(4000 / hzPerBin));
  const span = Math.max(1, hi - lo);
  const bars: number[] = [];
  for (let i = 0; i < EQUALIZER_BARS; i++) {
    const from = lo + Math.floor((i * span) / EQUALIZER_BARS);
    const to = Math.max(from + 1, lo + Math.floor(((i + 1) * span) / EQUALIZER_BARS));
    let sum = 0;
    for (let k = from; k < to && k < spectrum.length; k++) sum += spectrum[k]!;
    bars.push(Math.min(1, sum / (to - from) / 255));
  }
  return bars;
}

/**
 * Следит, был ли за запись хоть один отсчёт не на нуле (128 в байтовом представлении). Живой микрофон всегда
 * шумит хоть немного, а мёртвый (iPhone отнял микрофон, анализатор отключён) отдаёт ровно 128. Решаем только после
 * нескольких снимков, чтобы не судить по самому началу записи.
 */
export class FlatSignal {
  private frames = 0;
  private moved = false;

  push(samples: ArrayLike<number>): void {
    this.frames++;
    if (this.moved) return;
    for (let i = 0; i < samples.length; i++) {
      if (samples[i] !== 128) {
        this.moved = true;
        return;
      }
    }
  }

  /** Сигнал так и не шелохнулся за 5 снимков и больше (четверть секунды при снимке раз в 50 мс). */
  flat(): boolean {
    return this.frames >= 5 && !this.moved;
  }
}


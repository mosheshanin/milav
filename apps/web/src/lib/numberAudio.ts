// Проигрыш числа из озвученных кусков (тренажёр «Числа на слух», docs/SPEC.md). Куски лежат в /audio/num/<id>.mp3 и склеиваются
// на телефоне: Web Audio кладёт их друг за другом с точными паузами (в обычном элементе <audio> между файлами слышен провал, а на iPhone
// второй файл без нового нажатия может не заиграть). Тишина в начале и конце каждого куска обрезается, иначе слова расходились бы.
// Если Web Audio или файлы недоступны, число читает голос устройства по тексту с огласовками (как у остальных слов).
import { numberPieceAudio, type SpokenNumber } from "@milav/shared";
import { playWord, type PlayHooks } from "./audio";
import { micOpen } from "./mic";

/** Паузы между кусками, мс. «Медленно» разводит слова, а телефон делится на группы цифр по 3-3-4. */
export const NUMBER_GAPS = {
  normal: { word: 40, group: 500 },
  slow: { word: 350, group: 900 },
} as const;

export interface PlanStep {
  id: string;
  /** Пауза перед куском, мс (у первого 0). */
  gapBefore: number;
}

/** Порядок и паузы проигрыша: чистая функция, проверяется без звука. */
export function planPlayback(spoken: Pick<SpokenNumber, "ids" | "groupEnds">, slow = false): PlanStep[] {
  const gaps = slow ? NUMBER_GAPS.slow : NUMBER_GAPS.normal;
  const ends = new Set(spoken.groupEnds ?? []);
  return spoken.ids.map((id, i) => ({ id, gapBefore: i === 0 ? 0 : ends.has(i - 1) ? gaps.group : gaps.word }));
}

/** Участок буфера с речью: начало и длина в секундах без тишины по краям (с запасом, чтобы не откусить согласный). */
export function speechRange(samples: ArrayLike<number>, sampleRate: number, threshold = 0.01, padSeconds = 0.015): { offset: number; duration: number } {
  let first = 0;
  while (first < samples.length && Math.abs(samples[first]!) < threshold) first++;
  if (first >= samples.length) return { offset: 0, duration: samples.length / sampleRate };
  let last = samples.length - 1;
  while (last > first && Math.abs(samples[last]!) < threshold) last--;
  const pad = Math.round(padSeconds * sampleRate);
  const from = Math.max(0, first - pad);
  const to = Math.min(samples.length, last + 1 + pad);
  return { offset: from / sampleRate, duration: (to - from) / sampleRate };
}

interface Clip {
  buffer: AudioBuffer;
  offset: number;
  duration: number;
}

let context: AudioContext | null | undefined;
const clips = new Map<string, Promise<Clip>>();
let playing: AudioBufferSourceNode[] = [];

function audioContext(fresh = false): AudioContext | null {
  if (context !== undefined && !fresh) return context;
  try {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    const old = context;
    context = Ctor ? new Ctor() : null;
    if (old && old !== context) void old.close().catch(() => undefined);
  } catch {
    context = null;
  }
  return context;
}

/**
 * Движок, готовый звучать по этому нажатию. Вызывать синхронно в обработчике нажатия.
 * На iPhone движок бывает не только «приостановлен» (`suspended`), но и «прерван» (`interrupted`: свернули Telegram,
 * позвонили, заиграл другой звук) или закрыт. Прерванный часто не оживает от `resume()`: тогда число «играло» в
 * тишине (26.11.2026, вопрос 146). Такой движок заменяем новым прямо по нажатию; загруженные куски подходят и ему.
 */
export function contextForGesture(
  current: { state: string } | null,
): "keep" | "resume" | "replace" {
  if (!current) return "replace";
  if (current.state === "running") return "keep";
  if (current.state === "suspended") return "resume";
  return "replace";
}

type SessionType = "auto" | "playback" | "transient" | "transient-solo" | "ambient" | "play-and-record";
type AudioSessionLike = { type: SessionType };

/**
 * iPhone: Web Audio по умолчанию звучит как «фоновый» звук и молчит, когда сбоку включён беззвучный режим, а файлы
 * слов (элемент <audio>) при этом слышны. Поэтому числа «молчали» там, где слова звучат (26.11.2026, вопрос 146).
 * Пока звучит число, просим у системы режим «проигрывание» (Audio Session API, iOS 16.4+), потом возвращаем «авто».
 * Если микрофон открыт, режим не трогаем: там уже «запись и проигрывание», и переключение могло бы сломать запись.
 * Возвращает функцию, которая возвращает режим обратно.
 */
export function claimPlayback(session: AudioSessionLike | undefined, micIsOpen: boolean): () => void {
  if (!session || micIsOpen || session.type !== "auto") return () => undefined;
  try {
    session.type = "playback";
  } catch {
    return () => undefined;
  }
  return () => {
    try {
      if (session.type === "playback") session.type = "auto";
    } catch {
      // Не страшно: следующее нажатие «Записать» всё равно откроет микрофон.
    }
  };
}

/** Сколько ждать запуска движка после нажатия, мс. */
export const RESUME_WAIT_MS = 1500;

/** Ждёт обещание, но не дольше `ms`; ошибку и опоздание не бросает. */
export function settleWithin(promise: Promise<unknown>, ms: number): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    promise.then(
      () => {
        clearTimeout(timer);
        resolve();
      },
      () => {
        clearTimeout(timer);
        resolve();
      },
    );
  });
}

function audioSession(): AudioSessionLike | undefined {
  return (navigator as unknown as { audioSession?: AudioSessionLike }).audioSession;
}

function loadClip(ctx: AudioContext, id: string): Promise<Clip> {
  let clip = clips.get(id);
  if (!clip) {
    clip = fetch(numberPieceAudio(id))
      .then((res) => {
        if (!res.ok) throw new Error(`audio ${res.status}`);
        return res.arrayBuffer();
      })
      .then((data) => ctx.decodeAudioData(data))
      .then((buffer) => ({ buffer, ...speechRange(buffer.getChannelData(0), buffer.sampleRate) }));
    clips.set(id, clip);
    // Сбой не запоминаем: следующая попытка загрузит заново.
    clip.catch(() => clips.delete(id));
  }
  return clip;
}

/** Начинает загрузку кусков заранее, чтобы по нажатию число прозвучало сразу. Ошибки не важны. */
export function warmNumberAudio(spoken: Pick<SpokenNumber, "ids">): void {
  const ctx = audioContext();
  if (!ctx) return;
  for (const id of new Set(spoken.ids)) void loadClip(ctx, id).catch(() => undefined);
}

/** Останавливает звучащее число (экран закрыли или перешли к следующему заданию). */
export function stopNumberAudio(): void {
  for (const source of playing) {
    try {
      source.stop();
    } catch {
      // Уже закончил.
    }
  }
  playing = [];
}

/**
 * Проигрывает число кусками. `slow` разводит слова паузами. Возвращает false, если звук воспроизвести не удалось даже голосом устройства.
 * Вызывать из обработчика нажатия: контекст Web Audio «просыпается» только по жесту.
 */
export async function playSpokenNumber(spoken: SpokenNumber, { slow = false }: { slow?: boolean } = {}, hooks: PlayHooks = {}): Promise<boolean> {
  // Всё до первого await идёт синхронно в обработчике нажатия: иначе iPhone не даст звуку зазвучать.
  const restoreSession = claimPlayback(audioSession(), micOpen());
  try {
    return await playPieces(spoken, slow, hooks);
  } finally {
    restoreSession();
  }
}

async function playPieces(spoken: SpokenNumber, slow: boolean, hooks: PlayHooks): Promise<boolean> {
  const current = audioContext();
  const ctx = current && contextForGesture(current) === "replace" ? audioContext(true) : current;
  if (ctx) {
    try {
      // `resume()` на части телефонов не отвечает вовсе: ждём не дольше RESUME_WAIT_MS и проверяем состояние ниже.
      const resumed = ctx.state === "running" ? Promise.resolve() : settleWithin(ctx.resume(), RESUME_WAIT_MS);
      const plan = planPlayback(spoken, slow);
      const [loaded] = await Promise.all([Promise.all(plan.map((step) => loadClip(ctx, step.id))), resumed]);
      // Движок так и не запустился: не делаем вид, что играем, а читаем число голосом устройства.
      if (ctx.state !== "running") throw new Error(`audio context ${ctx.state}`);
      stopNumberAudio();
      let at = ctx.currentTime + 0.05;
      const sources: AudioBufferSourceNode[] = [];
      plan.forEach((step, i) => {
        const clip = loaded[i]!;
        const source = ctx.createBufferSource();
        source.buffer = clip.buffer;
        source.connect(ctx.destination);
        at += step.gapBefore / 1000;
        source.start(at, clip.offset, clip.duration);
        at += clip.duration;
        sources.push(source);
      });
      playing = sources;
      hooks.onStart?.();
      await new Promise<void>((resolve) => {
        const last = sources[sources.length - 1];
        if (!last) return resolve();
        last.onended = () => resolve();
        // Страховка: если событие не придёт (вкладку свернули), ждём по расчёту.
        setTimeout(resolve, Math.max(0, (at - ctx.currentTime) * 1000) + 300);
      });
      return true;
    } catch {
      // Не загрузился один из кусков или нет Web Audio: читаем целиком голосом устройства.
    }
  }
  return playWord({ he: spoken.niqqud }, hooks);
}

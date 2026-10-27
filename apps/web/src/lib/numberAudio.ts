// Проигрыш числа из озвученных кусков (тренажёр «Числа на слух», docs/SPEC.md). Куски лежат в /audio/num/<id>.mp3 и склеиваются
// на телефоне: Web Audio кладёт их друг за другом с точными паузами (в обычном элементе <audio> между файлами слышен провал, а на iPhone
// второй файл без нового нажатия может не заиграть). Тишина в начале и конце каждого куска обрезается, иначе слова расходились бы.
// Если Web Audio или файлы недоступны, число читает голос устройства по тексту с огласовками (как у остальных слов).
import { numberPieceAudio, type SpokenNumber } from "@milav/shared";
import { playWord, type PlayHooks } from "./audio";

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

function audioContext(): AudioContext | null {
  if (context !== undefined) return context;
  try {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    context = Ctor ? new Ctor() : null;
  } catch {
    context = null;
  }
  return context;
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
  const ctx = audioContext();
  if (ctx) {
    try {
      const resumed = ctx.state === "suspended" ? ctx.resume() : Promise.resolve();
      const plan = planPlayback(spoken, slow);
      const [loaded] = await Promise.all([Promise.all(plan.map((step) => loadClip(ctx, step.id))), resumed]);
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

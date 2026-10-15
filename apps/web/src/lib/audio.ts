import type { Letter } from "@milav/shared";

/** То, что можно проиграть: текст для голоса устройства и необязательный файл озвучки. */
export interface Playable {
  he: string;
  audio?: string;
}

/** `onStart` вызывается, когда звук действительно зазвучал (файл загрузился и пошёл или голос устройства начал говорить). */
export interface PlayHooks {
  onStart?: () => void;
}

/**
 * Проигрывает слово. Если у слова есть файл озвучки (Google TTS, см. docs/AUDIO.md), играет его, иначе или при
 * сбое использует голос устройства.
 * Возвращает false, если звук воспроизвести не удалось.
 */
export async function playWord(word: Playable, hooks: PlayHooks = {}): Promise<boolean> {
  if (word.audio) {
    const played = await playFile(word.audio, hooks);
    if (played) return true;
    // Файл не загрузился или не проигрался: не оставляем человека без звука.
  }
  return speakWithDevice(word.he, hooks);
}

/** Название буквы («אלף»). Голосу устройства отдаём название с огласовками, иначе он гадает. */
export const playLetterName = (letter: Letter, hooks?: PlayHooks) =>
  playWord({ he: letter.name.niqqud, audio: letter.audio }, hooks);

/** Слово-пример к букве. */
export const playLetterExample = (letter: Letter, hooks?: PlayHooks) =>
  playWord({ he: letter.example.niqqud, audio: letter.example.audio }, hooks);

/** Сколько заранее подгруженных файлов держим в памяти. Старые вытесняются. */
export const PRIMED_LIMIT = 40;
const primed = new Map<string, HTMLAudioElement>();

/**
 * Начинает загрузку файла заранее, когда кнопка «послушать» появилась на экране, чтобы по нажатию звук пошёл сразу.
 * Тот же элемент потом и играет: так `play()` вызывается прямо в обработчике нажатия, как требуют браузеры телефонов.
 * Ошибки не важны: при проигрывании файл просто загрузится заново.
 */
export function primeAudio(src: string | undefined): void {
  if (!src || typeof Audio === "undefined") return;
  const existing = primed.get(src);
  if (existing) {
    // Свежий в конце: вытесняются давно не нужные.
    primed.delete(src);
    primed.set(src, existing);
    return;
  }
  try {
    const audio = new Audio();
    audio.preload = "auto";
    audio.src = src;
    primed.set(src, audio);
    while (primed.size > PRIMED_LIMIT) {
      const oldest = primed.keys().next().value as string;
      primed.delete(oldest);
    }
  } catch {
    // Не удалось создать элемент: проигрывание создаст свой.
  }
}

/** Для тестов: очистить подгруженные файлы. */
export function resetPrimedAudio(): void {
  primed.clear();
}

/** Для тестов: какие файлы подгружены, от старых к новым. */
export function primedSources(): string[] {
  return [...primed.keys()];
}

function audioFor(src: string): HTMLAudioElement {
  const audio = primed.get(src);
  if (audio && audio.paused && !audio.error) {
    audio.currentTime = 0;
    return audio;
  }
  // Подгрузка сорвалась (например, пропала связь): пробуем заново новым элементом.
  if (audio?.error) primed.delete(src);
  return new Audio(src);
}

async function playFile(src: string, hooks: PlayHooks): Promise<boolean> {
  try {
    const audio = audioFor(src);
    const ended = new Promise<boolean>((resolve) => {
      const onPlaying = () => hooks.onStart?.();
      const finish = (ok: boolean) => {
        audio.removeEventListener("playing", onPlaying);
        audio.removeEventListener("ended", onEnded);
        audio.removeEventListener("error", onError);
        resolve(ok);
      };
      const onEnded = () => finish(true);
      const onError = () => finish(false);
      audio.addEventListener("playing", onPlaying);
      audio.addEventListener("ended", onEnded);
      audio.addEventListener("error", onError);
    });
    await audio.play();
    return await ended;
  } catch {
    return false;
  }
}

function speakWithDevice(text: string, hooks: PlayHooks): Promise<boolean> {
  if (typeof speechSynthesis === "undefined") return Promise.resolve(false);
  return new Promise((resolve) => {
    speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "he-IL";
    utterance.rate = 0.85;
    const voice = speechSynthesis.getVoices().find((v) => v.lang.toLowerCase().startsWith("he"));
    if (voice) utterance.voice = voice;
    const timer = setTimeout(() => resolve(true), 5000);
    utterance.onstart = () => hooks.onStart?.();
    utterance.onend = () => {
      clearTimeout(timer);
      resolve(true);
    };
    utterance.onerror = () => {
      clearTimeout(timer);
      resolve(false);
    };
    speechSynthesis.speak(utterance);
  });
}

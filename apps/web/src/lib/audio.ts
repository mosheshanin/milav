import type { Letter } from "@milav/shared";

/** То, что можно проиграть: текст для голоса устройства и необязательный файл озвучки. */
export interface Playable {
  he: string;
  audio?: string;
}

/**
 * Проигрывает слово. Если у слова есть файл озвучки (Google TTS, см. docs/AUDIO.md), играет его, иначе или при
 * сбое использует голос устройства.
 * Возвращает false, если звук воспроизвести не удалось.
 */
export async function playWord(word: Playable): Promise<boolean> {
  if (word.audio) {
    const played = await playFile(word.audio);
    if (played) return true;
    // Файл не загрузился или не проигрался: не оставляем человека без звука.
  }
  return speakWithDevice(word.he);
}

/** Название буквы («אלף»). Голосу устройства отдаём название с огласовками, иначе он гадает. */
export const playLetterName = (letter: Letter) => playWord({ he: letter.name.niqqud, audio: letter.audio });

/** Слово-пример к букве. */
export const playLetterExample = (letter: Letter) =>
  playWord({ he: letter.example.niqqud, audio: letter.example.audio });

async function playFile(src: string): Promise<boolean> {
  try {
    const audio = new Audio(src);
    const ended = new Promise<boolean>((resolve) => {
      audio.onended = () => resolve(true);
      audio.onerror = () => resolve(false);
    });
    await audio.play();
    return await ended;
  } catch {
    return false;
  }
}

function speakWithDevice(text: string): Promise<boolean> {
  if (typeof speechSynthesis === "undefined") return Promise.resolve(false);
  return new Promise((resolve) => {
    speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "he-IL";
    utterance.rate = 0.85;
    const voice = speechSynthesis.getVoices().find((v) => v.lang.toLowerCase().startsWith("he"));
    if (voice) utterance.voice = voice;
    const timer = setTimeout(() => resolve(true), 5000);
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

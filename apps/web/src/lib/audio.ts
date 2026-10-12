import type { Word } from "@milav/shared";

/**
 * Проигрывает слово. Если у слова есть файл озвучки (Google TTS, см. docs/AUDIO.md), играет его, иначе или при
 * сбое использует голос устройства.
 * Возвращает false, если звук воспроизвести не удалось.
 */
export async function playWord(word: Word): Promise<boolean> {
  if (word.audio) {
    const played = await playFile(word.audio);
    if (played) return true;
    // Файл не загрузился или не проигрался: не оставляем человека без звука.
  }
  return speakWithDevice(word.he);
}

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

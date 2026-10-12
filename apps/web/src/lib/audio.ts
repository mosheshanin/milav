import type { Word } from "@milav/shared";

/**
 * Проигрывает слово. Если у слова есть файл озвучки, играет его, иначе использует голос
 * устройства (временное решение, пока нет записанных файлов, см. CLAUDE.md).
 * Возвращает false, если звук воспроизвести не удалось.
 */
export async function playWord(word: Word): Promise<boolean> {
  if (word.audio) {
    try {
      const audio = new Audio(word.audio);
      await audio.play();
      await new Promise<void>((resolve) => {
        audio.onended = () => resolve();
        audio.onerror = () => resolve();
      });
      return true;
    } catch {
      return false;
    }
  }
  return speakWithDevice(word.he);
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

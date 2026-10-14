import { useState } from "react";
import { Volume2 } from "lucide-react";
import { playWord, type Playable } from "../lib/audio";

/**
 * Маленькая кнопка со значком динамика: проиграть форму слова или фразу-пример.
 * Если файла озвучки нет, играет голос устройства (см. playWord).
 */
export function SpeakerButton({ item, label, testId }: { item: Playable; label: string; testId?: string }) {
  const [playing, setPlaying] = useState(false);

  async function play() {
    if (playing) return;
    setPlaying(true);
    await playWord(item);
    setPlaying(false);
  }

  return (
    <button
      type="button"
      onClick={() => void play()}
      disabled={playing}
      aria-label={label}
      data-testid={testId}
      className="flex size-10 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent active:opacity-80 disabled:opacity-60"
    >
      <Volume2 className="size-icon" aria-hidden />
    </button>
  );
}

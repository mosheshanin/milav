import { useState } from "react";
import { Volume2 } from "lucide-react";
import type { Word } from "@milav/shared";
import { playWord } from "../lib/audio";
import { Button } from "./ui";

/** Кнопка «послушать слово». `onPlayed` вызывается, когда звук проигран. */
export function ListenButton({
  word,
  label = "Послушать",
  onPlayed,
}: {
  word: Word;
  label?: string;
  onPlayed?: () => void;
}) {
  const [playing, setPlaying] = useState(false);
  const [failed, setFailed] = useState(false);

  async function play() {
    setPlaying(true);
    setFailed(false);
    const ok = await playWord(word);
    setPlaying(false);
    setFailed(!ok);
    if (ok) onPlayed?.();
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <Button variant="secondary" onClick={() => void play()} disabled={playing} className="min-w-48" data-testid="listen">
        <Volume2 className="size-icon" aria-hidden />
        {playing ? "Играет…" : label}
      </Button>
      {failed && <p className="text-sm text-danger">Не удалось воспроизвести звук. Проверьте громкость.</p>}
    </div>
  );
}

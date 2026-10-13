import { useState } from "react";
import { Volume2 } from "lucide-react";
import { playWord, type Playable } from "../lib/audio";
import { Button } from "./ui";

/**
 * Кнопка «послушать». По умолчанию играет слово; `play` подменяет проигрывание (название буквы, слово-пример).
 * `onPlayed` вызывается, когда звук проигран.
 */
export function ListenButton({
  word,
  play: playOverride,
  label = "Послушать",
  testId = "listen",
  onPlayed,
}: {
  word?: Playable;
  play?: () => Promise<boolean>;
  label?: string;
  testId?: string;
  onPlayed?: () => void;
}) {
  const [playing, setPlaying] = useState(false);
  const [failed, setFailed] = useState(false);

  async function play() {
    setPlaying(true);
    setFailed(false);
    const ok = await (playOverride ? playOverride() : word ? playWord(word) : Promise.resolve(false));
    setPlaying(false);
    setFailed(!ok);
    if (ok) onPlayed?.();
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <Button variant="secondary" onClick={() => void play()} disabled={playing} className="min-w-48" data-testid={testId}>
        <Volume2 className="size-icon" aria-hidden />
        {playing ? "Играет…" : label}
      </Button>
      {failed && <p className="text-sm text-danger">Не удалось воспроизвести звук. Проверьте громкость.</p>}
    </div>
  );
}

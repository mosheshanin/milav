import { useEffect, useState } from "react";
import { Volume2 } from "lucide-react";
import { playWord, primeAudio, type Playable, type PlayHooks } from "../lib/audio";
import { usePlayback } from "../lib/usePlayback";
import { Button } from "./ui";

/**
 * Кнопка «послушать». По умолчанию играет слово; `play` подменяет проигрывание (название буквы, слово-пример),
 * тогда файл для заблаговременной загрузки передаётся в `preload`.
 * `onPlayed` вызывается, когда звук проигран.
 * Пока звук грузится, вместо значка крутится кольцо и подпись «Загружается…»; пока звучит, кнопка закрашена и подпись «Играет…».
 */
export function ListenButton({
  word,
  play: playOverride,
  preload,
  label = "Послушать",
  testId = "listen",
  onPlayed,
}: {
  word?: Playable;
  play?: (hooks: PlayHooks) => Promise<boolean>;
  preload?: string;
  label?: string;
  testId?: string;
  onPlayed?: () => void;
}) {
  const { state, run, busy } = usePlayback();
  const [failed, setFailed] = useState(false);
  const source = preload ?? word?.audio;

  useEffect(() => primeAudio(source), [source]);

  async function play() {
    setFailed(false);
    const ok = await run((hooks) =>
      playOverride ? playOverride(hooks) : word ? playWord(word, hooks) : Promise.resolve(false),
    );
    if (ok === null) return; // уже играет
    setFailed(!ok);
    if (ok) onPlayed?.();
  }

  const text = state === "loading" ? "Загружается…" : state === "playing" ? "Играет…" : label;

  return (
    <div className="flex flex-col items-center gap-2">
      <Button
        variant={state === "playing" ? "primary" : "secondary"}
        onClick={() => void play()}
        aria-busy={busy}
        data-state={state}
        className="min-w-48"
        data-testid={testId}
      >
        {state === "loading" ? (
          <Spinner />
        ) : (
          <Volume2 className={`size-icon ${state === "playing" ? "animate-pulse" : ""}`} aria-hidden />
        )}
        {text}
      </Button>
      {failed && <p className="text-sm text-danger">Не удалось воспроизвести звук. Проверьте громкость.</p>}
    </div>
  );
}

/** Кольцо загрузки размером со значок. */
function Spinner() {
  return (
    <svg viewBox="0 0 20 20" className="size-icon animate-ring-spin" aria-hidden data-testid="loading-ring">
      <circle cx="10" cy="10" r="8" fill="none" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2.5" />
      <circle
        cx="10"
        cy="10"
        r="8"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeDasharray="14 36"
      />
    </svg>
  );
}

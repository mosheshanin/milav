import { useEffect } from "react";
import { Volume2 } from "lucide-react";
import { playWord, primeAudio, type Playable } from "../lib/audio";
import { usePlayback } from "../lib/usePlayback";

/**
 * Маленькая круглая кнопка со значком динамика: проиграть форму слова или фразу-пример.
 * Если файла озвучки нет, играет голос устройства (см. playWord).
 * Пока звук грузится, по границе кружка бежит дуга; пока звучит, кружок закрашен и от него расходится волна.
 * Файл начинает загружаться заранее, как только кнопка появилась на экране.
 */
export function SpeakerButton({ item, label, testId }: { item: Playable; label: string; testId?: string }) {
  const { state, run, busy } = usePlayback();
  const playing = state === "playing";

  useEffect(() => primeAudio(item.audio), [item.audio]);

  return (
    <button
      type="button"
      onClick={() => void run((hooks) => playWord(item, hooks))}
      aria-label={label}
      aria-busy={busy}
      data-testid={testId}
      data-state={state}
      className={`relative flex size-10 shrink-0 items-center justify-center rounded-full transition-colors active:opacity-80 ${
        playing ? "bg-accent text-white" : "bg-accent-soft text-accent"
      }`}
    >
      {playing && (
        <span className="pointer-events-none absolute inset-0 rounded-full border-2 border-accent animate-sound-wave" aria-hidden />
      )}
      {state === "loading" && <LoadingRing />}
      <Volume2 className="size-icon" aria-hidden />
    </button>
  );
}

/** Дуга, которая бежит по границе кружка, пока звук загружается. Чуть шире кнопки, чтобы лежать по её краю. */
function LoadingRing() {
  return (
    <svg
      viewBox="0 0 44 44"
      className="pointer-events-none absolute -inset-0.5 animate-ring-spin text-accent"
      aria-hidden
      data-testid="loading-ring"
    >
      <circle cx="22" cy="22" r="20.5" fill="none" stroke="currentColor" strokeOpacity="0.2" strokeWidth="3" />
      <circle
        cx="22"
        cy="22"
        r="20.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeDasharray="32 97"
      />
    </svg>
  );
}

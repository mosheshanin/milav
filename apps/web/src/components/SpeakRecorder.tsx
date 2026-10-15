import { useEffect, useRef, useState } from "react";
import { Mic, Square } from "lucide-react";
import { ApiError } from "../api";
import { micPermission, type MicState } from "../lib/mic";
import { reportEvent } from "../lib/telemetry";
import { EQUALIZER_BARS, RecorderError, startRecording, type ActiveRecording } from "../lib/recorder";
import { MicAsk, MicDenied } from "./MicNotice";
import { Equalizer } from "./Equalizer";
import { Button } from "./ui";

/** После скольких неудач в обучении предлагаем отложить этап. */
const STUDY_FAILS_BEFORE_SKIP = 2;

type Phase = "idle" | "recording" | "checking";

/** Что сервер ответил на запись голоса. В викторине сервер сам считает попытки и говорит, были ли они последними. */
export interface SpeakVerdict {
  match: boolean;
  heard: string;
  /** Викторина: попыток больше нет, ответ засчитан неверным. */
  final?: boolean;
  /** Викторина: сколько попыток осталось. */
  attemptsLeft?: number;
}

const BLOCKED_TEXT: Record<string, { title: string; hint: string }> = {
  speech_unavailable: {
    title: "Проверка произношения сейчас недоступна.",
    hint: "Попробуйте позже.",
  },
  speech_failed: {
    title: "Не удалось распознать запись.",
    hint: "Проверьте микрофон и попробуйте ещё раз.",
  },
  network: {
    title: "Нет связи с сервером.",
    hint: "Проверьте интернет и попробуйте ещё раз.",
  },
  rate_limited: {
    title: "Слишком много проверок подряд.",
    hint: "Подождите немного и попробуйте снова.",
  },
  answer_conflict: {
    title: "Ответ не удалось принять.",
    hint: "Попробуйте ещё раз.",
  },
};

/**
 * Запись голоса и проверка на сервере (`check` отправляет запись и возвращает ответ сервера).
 * study: сервер сам отмечает этап, `onPassed` получает ответ; после нескольких неудач можно отложить (`onGiveUp`).
 * quiz: попытки считает сервер; когда они кончились, вызывается `onFailed` с ответом сервера,
 *       а `onGiveUp` вызывается, если ученик сам отказался от вопроса (нет микрофона, «Пропустить»).
 */
export function SpeakRecorder<R extends SpeakVerdict>({
  mode,
  check,
  onPassed,
  onFailed,
  onGiveUp,
}: {
  mode: "study" | "quiz";
  check: (audio: Blob) => Promise<R>;
  onPassed: (response: R) => void;
  onFailed?: (response: R) => void;
  onGiveUp: () => void;
}) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [recording, setRecording] = useState<ActiveRecording | null>(null);
  const [fails, setFails] = useState(0);
  const [heard, setHeard] = useState<string | null>(null);
  /** Квиз: сколько попыток осталось по словам сервера (null, пока не было неудачных). */
  const [attemptsLeft, setAttemptsLeft] = useState<number | null>(null);
  const [blocked, setBlocked] = useState<string | null>(null);
  const [bars, setBars] = useState<number[]>(() => new Array<number>(EQUALIZER_BARS).fill(0));
  const active = useRef<ActiveRecording | null>(null);
  const alive = useRef(true);
  const [mic, setMic] = useState<MicState | "checking">("checking");
  const [starting, setStarting] = useState(false);

  // Если экран закрыли во время записи, останавливаем её, освобождаем микрофон и ничего не отправляем.
  useEffect(() => {
    void micPermission().then((state) => alive.current && setMic(state));
  }, []);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      void active.current?.stop();
    };
  }, []);

  async function begin() {
    if (starting) return;
    setStarting(true);
    setHeard(null);
    try {
      // Запись остановится сама: после паузы в речи или через SPEAK_MAX_MS; можно и вручную.
      const rec = await startRecording({ onLevels: setBars });
      active.current = rec;
      setMic("granted");
      setRecording(rec);
      setPhase("recording");
      void finish(rec.finished);
    } catch (e) {
      const problem = e instanceof RecorderError ? e.problem : "unsupported";
      // Сколько учеников не может включить микрофон и на каких платформах: без этого этап «говори» не пройти.
      reportEvent("mic_problem", problem);
      setMic(problem);
    } finally {
      setStarting(false);
    }
  }

  async function finish(finished: Promise<Blob>) {
    const blob = await finished;
    if (!alive.current) return;
    active.current = null;
    setRecording(null);
    setPhase("checking");
    try {
      const result = await check(blob);
      if (result.match) {
        setPhase("idle");
        onPassed(result);
        return;
      }
      setHeard(result.heard);
      setFails(fails + 1);
      setAttemptsLeft(result.attemptsLeft ?? null);
      setPhase("idle");
      if (mode === "quiz" && result.final) onFailed?.(result);
    } catch (e) {
      setPhase("idle");
      setBlocked(e instanceof ApiError ? e.code : "network");
    }
  }

  const skipLabel = mode === "quiz" ? "Пропустить (засчитается как ошибка)" : "Отложить этап";

  if (mic === "denied" || mic === "unsupported") {
    return <MicDenied kind={mic} onRetry={() => void begin()} onSkip={onGiveUp} skipLabel={skipLabel} />;
  }

  // Доступ ещё не давали: сначала понятное приглашение, а системный запрос появится после нажатия.
  if (mic === "prompt" && phase === "idle" && !blocked) {
    return <MicAsk onAllow={() => void begin()} busy={starting} />;
  }

  if (blocked) {
    const text = BLOCKED_TEXT[blocked] ?? { title: "Проверка произношения не сработала.", hint: "Попробуйте ещё раз." };
    return (
      <div className="flex flex-col items-center gap-block text-center" role="alert">
        <p className="font-semibold text-danger">{text.title}</p>
        <p className="text-sm text-ink-soft">{text.hint}</p>
        <Button onClick={() => setBlocked(null)} data-testid="speak-retry">
          Попробовать снова
        </Button>
        <Button variant="ghost" onClick={onGiveUp} data-testid="speak-skip">
          {skipLabel}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-block text-center">
      {phase === "recording" && recording ? (
        <div className="flex w-full flex-col items-center gap-2" data-testid="recording">
          <Equalizer bars={bars} />
          <p className="font-semibold text-success">Идёт запись. Скажите слово.</p>
          <TimeBar maxMs={recording.maxMs} />
          <Button variant="ghost" onClick={() => void recording.stop()} data-testid="speak-stop">
            <Square className="size-icon" aria-hidden />
            Остановить
          </Button>
        </div>
      ) : (
        <Button onClick={() => void begin()} disabled={phase === "checking"} className="min-w-56" data-testid="speak-start">
          <Mic className="size-icon" aria-hidden />
          {phase === "checking" ? "Проверяем…" : fails > 0 ? "Ещё раз" : "Записать"}
        </Button>
      )}

      {heard !== null && (
        <p className="text-danger" role="status">
          Услышано: «{heard || "тишина"}». Не совпало со словом. Скажите отчётливо и не торопясь.
        </p>
      )}
      {mode === "quiz" && attemptsLeft !== null && attemptsLeft > 0 && (
        <p className="text-sm text-ink-soft">Осталась попытка: {attemptsLeft}</p>
      )}
      {mode === "study" && fails >= STUDY_FAILS_BEFORE_SKIP && (
        <Button variant="ghost" onClick={onGiveUp} data-testid="speak-skip">
          Отложить этап
        </Button>
      )}
    </div>
  );
}

/** Полоска оставшегося времени записи: плавно сжимается за maxMs. */
function TimeBar({ maxMs }: { maxMs: number }) {
  const [running, setRunning] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setRunning(true));
    return () => cancelAnimationFrame(id);
  }, []);
  return (
    <div className="h-1.5 w-48 overflow-hidden rounded-full bg-line" aria-hidden>
      <div
        className="h-full bg-success ease-linear"
        style={{ width: running ? "0%" : "100%", transition: `width ${maxMs}ms linear` }}
      />
    </div>
  );
}

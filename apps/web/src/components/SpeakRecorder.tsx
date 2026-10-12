import { useState } from "react";
import { Mic, Square } from "lucide-react";
import { SPEAK_ATTEMPTS_IN_QUIZ, type Word } from "@milav/shared";
import { ApiError, api, type SpeechResponse } from "../api";
import { RecorderError, startRecording, type ActiveRecording } from "../lib/recorder";
import { Button } from "./ui";

/** После скольких неудач в обучении предлагаем отложить этап. */
const STUDY_FAILS_BEFORE_SKIP = 2;

type Phase = "idle" | "recording" | "checking";

const BLOCKED_TEXT: Record<string, { title: string; hint: string }> = {
  unsupported: {
    title: "Проблема с микрофоном: запись голоса не поддерживается на этом устройстве.",
    hint: "Обновите Telegram или откройте приложение на другом устройстве.",
  },
  denied: {
    title: "Проблема с микрофоном: нет доступа.",
    hint: "Разрешите микрофон для Telegram в настройках телефона и нажмите «Попробовать снова».",
  },
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
};

/**
 * Запись голоса и проверка на сервере.
 * study: сервер сам отмечает этап, `onPassed` получает ответ; после нескольких неудач можно отложить (`onGiveUp`).
 * quiz: SPEAK_ATTEMPTS_IN_QUIZ попытки, затем `onGiveUp` (вопрос засчитывается неверным).
 */
export function SpeakRecorder({
  word,
  mode,
  onPassed,
  onGiveUp,
}: {
  word: Word;
  mode: "study" | "quiz";
  onPassed: (response: SpeechResponse) => void;
  onGiveUp: () => void;
}) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [recording, setRecording] = useState<ActiveRecording | null>(null);
  const [fails, setFails] = useState(0);
  const [heard, setHeard] = useState<string | null>(null);
  const [blocked, setBlocked] = useState<string | null>(null);

  async function begin() {
    setHeard(null);
    try {
      const rec = await startRecording(4000);
      setRecording(rec);
      setPhase("recording");
      // Запись закончится по кнопке или по таймеру; в любом случае отправляем результат.
      void finish(rec.finished);
    } catch (e) {
      setBlocked(e instanceof RecorderError ? e.problem : "unsupported");
    }
  }

  async function finish(finished: Promise<Blob>) {
    const blob = await finished;
    setRecording(null);
    setPhase("checking");
    try {
      const result = await api.speech(word.id, blob, mode);
      if (result.match) {
        setPhase("idle");
        onPassed(result);
        return;
      }
      setHeard(result.heard);
      const next = fails + 1;
      setFails(next);
      setPhase("idle");
      if (mode === "quiz" && next >= SPEAK_ATTEMPTS_IN_QUIZ) onGiveUp();
    } catch (e) {
      setPhase("idle");
      setBlocked(e instanceof ApiError ? e.code : "network");
    }
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
          {mode === "quiz" ? "Пропустить (засчитается как ошибка)" : "Отложить этап"}
        </Button>
      </div>
    );
  }

  const quizAttemptsLeft = SPEAK_ATTEMPTS_IN_QUIZ - fails;

  return (
    <div className="flex flex-col items-center gap-block text-center">
      {phase === "recording" ? (
        <Button variant="success" onClick={() => void recording?.stop()} className="min-w-56" data-testid="speak-stop">
          <Square className="size-icon" aria-hidden />
          Идёт запись… нажмите, чтобы закончить
        </Button>
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
      {mode === "quiz" && fails > 0 && quizAttemptsLeft > 0 && (
        <p className="text-sm text-ink-soft">Осталась попытка: {quizAttemptsLeft}</p>
      )}
      {mode === "study" && fails >= STUDY_FAILS_BEFORE_SKIP && (
        <Button variant="ghost" onClick={onGiveUp} data-testid="speak-skip">
          Отложить этап
        </Button>
      )}
    </div>
  );
}

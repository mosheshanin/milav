import { useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, Mic, Turtle, Volume2, XCircle } from "lucide-react";
import {
  NUMBERS_ROUND,
  NUMBERS_SAY_ATTEMPTS,
  NUMBER_LEVELS,
  answerMaxLength,
  buildNumbersRound,
  checkTyped,
  formatTarget,
  genderNote,
  numberLevel,
  numbersVerdict,
  sceneQuestion,
  spokenTarget,
  type NumberLevelId,
  type NumberTask,
  type SpokenNumber,
} from "@milav/shared";
import { api } from "../api";
import { AutoNextButton } from "../components/AutoNextButton";
import { DigitPad, formatDigits } from "../components/DigitPad";
import { Header } from "../components/Header";
import { SpeakRecorder, type SpeakVerdict } from "../components/SpeakRecorder";
import { Button, Card, Chip } from "../components/ui";
import { playSpokenNumber, stopNumberAudio, warmNumberAudio } from "../lib/numberAudio";
import { usePlayback } from "../lib/usePlayback";
import { useBackButton } from "../lib/useBackButton";

const SPEECH_KEY = "milav:numbers-speech";

/** Запомненный выбор «говорить вслух» (на устройстве; без хранилища по умолчанию включено). */
function loadSpeech(): boolean {
  try {
    return localStorage.getItem(SPEECH_KEY) !== "0";
  } catch {
    return true;
  }
}
function saveSpeech(on: boolean): void {
  try {
    localStorage.setItem(SPEECH_KEY, on ? "1" : "0");
  } catch {
    // Не запомнится: не страшно.
  }
}

const SCENE_CHIP: Record<NumberTask["target"]["scene"], string> = {
  number: "Число",
  price: "Цена",
  time: "Время",
  phone: "Телефон",
  floor: "Этаж",
  age: "Возраст",
};

/**
 * Тренажёр «Числа на слух» (docs/SPEC.md). Ничего не отправляет на сервер, кроме записи голоса в заданиях «скажи вслух», и не
 * меняет очки, цель дня, ритм, бейджи и результат уроков: как «Практика форм», это свободная тренировка.
 */
export function NumbersTrainer({ onBack }: { onBack: () => void }) {
  const [level, setLevel] = useState<NumberLevelId | null>(null);
  const [speech, setSpeech] = useState(loadSpeech);
  useBackButton(level ? () => setLevel(null) : onBack);

  return (
    <>
      <Header title="Числа на слух" subtitle={level ? numberLevel(level).title : "Тренажёр"} onBack={level ? () => setLevel(null) : onBack} />
      <main className="mx-auto flex max-w-md flex-col gap-block p-block pb-section">
        {level ? (
          <Session key={level} level={level} speech={speech} onExit={() => setLevel(null)} />
        ) : (
          <LevelList
            speech={speech}
            onSpeech={(on) => {
              setSpeech(on);
              saveSpeech(on);
            }}
            onPick={setLevel}
          />
        )}
      </main>
    </>
  );
}

function LevelList({ speech, onSpeech, onPick }: { speech: boolean; onSpeech: (on: boolean) => void; onPick: (id: NumberLevelId) => void }) {
  return (
    <>
      <p className="text-ink-soft">Слушайте числа так, как их говорят в Израиле, и записывайте цифрами. Уровни можно проходить в любом порядке.</p>
      <div className="flex flex-col gap-2" data-testid="numbers-levels">
        {NUMBER_LEVELS.map((level, i) => (
          <button
            key={level.id}
            type="button"
            onClick={() => onPick(level.id)}
            data-testid={`numbers-level-${level.id}`}
            className="flex w-full items-center gap-3 rounded-card border border-line bg-surface p-block text-left active:bg-page"
          >
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-accent-soft font-bold text-accent" aria-hidden>
              {i + 1}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-semibold">{level.title}</span>
              <span className="block text-sm text-ink-soft">{level.hint}</span>
            </span>
          </button>
        ))}
      </div>
      <label className="flex items-start gap-3 rounded-card border border-line bg-surface p-block" data-testid="numbers-speech-option">
        <input
          type="checkbox"
          checked={speech}
          onChange={(e) => onSpeech(e.target.checked)}
          data-testid="numbers-speech-toggle"
          className="mt-1 size-5 shrink-0 accent-accent"
        />
        <span className="text-sm">
          <span className="block font-semibold">Говорить вслух</span>
          <span className="text-ink-soft">Три задания из десяти: нужно сказать число на иврите. Нужен микрофон. Без галочки все задания на слух.</span>
        </span>
      </label>
      <p className="text-center text-sm text-ink-soft">Это тренировка: очки и результат уроков не меняются.</p>
    </>
  );
}

interface Outcome {
  task: NumberTask;
  ok: boolean;
}

/** Подход: задания одно за другим, итог, разбор ошибок. */
function Session({ level, speech, onExit }: { level: NumberLevelId; speech: boolean; onExit: () => void }) {
  const [round, setRound] = useState(0);
  /** Повтор ошибок: вместо нового набора берём эти задания. */
  const [retry, setRetry] = useState<NumberTask[] | null>(null);
  const tasks = useMemo(() => retry ?? buildNumbersRound(level, Math.random, { speech }), [level, speech, round, retry]); // eslint-disable-line react-hooks/exhaustive-deps
  const [index, setIndex] = useState(0);
  const [outcomes, setOutcomes] = useState<Outcome[]>([]);

  useEffect(() => stopNumberAudio, []);

  function again(nextRetry: NumberTask[] | null) {
    stopNumberAudio();
    setRetry(nextRetry);
    setRound((r) => r + 1);
    setIndex(0);
    setOutcomes([]);
  }

  if (index >= tasks.length) {
    const wrong = outcomes.filter((o) => !o.ok);
    return <Result total={tasks.length} wrong={wrong.map((o) => o.task)} retried={retry !== null} onRetry={() => again(wrong.map((o) => o.task))} onAgain={() => again(null)} onExit={onExit} />;
  }

  const task = tasks[index]!;
  return (
    <>
      <Progress index={index} total={tasks.length} />
      <TaskCard
        key={`${round}-${index}`}
        task={task}
        last={index === tasks.length - 1}
        onDone={(ok) => {
          stopNumberAudio();
          setOutcomes((prev) => [...prev, { task, ok }]);
          setIndex((i) => i + 1);
        }}
      />
      <p className="text-center text-sm text-ink-soft">Это тренировка: очки и результат уроков не меняются.</p>
    </>
  );
}

function Progress({ index, total }: { index: number; total: number }) {
  return (
    <div data-testid="numbers-progress">
      <div className="mb-1 text-sm text-ink-soft">
        Задание {index + 1} из {total}
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-line" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={index}>
        <div className="h-full bg-accent transition-all" style={{ width: `${(index / total) * 100}%` }} />
      </div>
    </div>
  );
}

/** Кнопки «Послушать» и «Медленнее»: число из кусков озвучки. */
function NumberPlayer({ spoken, testId, primary = true }: { spoken: SpokenNumber; testId: string; primary?: boolean }) {
  const normal = usePlayback();
  const slow = usePlayback();
  useEffect(() => warmNumberAudio(spoken), [spoken]);
  const play = (isSlow: boolean) => {
    const player = isSlow ? slow : normal;
    void player.run((hooks) => playSpokenNumber(spoken, { slow: isSlow }, hooks));
  };
  return (
    <div className="flex w-full gap-2">
      <Button
        variant={normal.state === "playing" ? "primary" : primary ? "secondary" : "ghost"}
        onClick={() => play(false)}
        aria-busy={normal.busy}
        data-testid={testId}
        className="min-w-0 flex-1 !px-2"
      >
        <Volume2 className={`size-icon ${normal.state === "playing" ? "animate-pulse" : ""}`} aria-hidden />
        {normal.state === "loading" ? "Загрузка…" : "Послушать"}
      </Button>
      <Button
        variant={slow.state === "playing" ? "primary" : "ghost"}
        onClick={() => play(true)}
        aria-busy={slow.busy}
        data-testid={`${testId}-slow`}
        className="min-w-0 flex-1 !px-2"
      >
        <Turtle className="size-icon" aria-hidden />
        {slow.state === "loading" ? "Загрузка…" : "Медленнее"}
      </Button>
    </div>
  );
}

function TaskCard({ task, last, onDone }: { task: NumberTask; last: boolean; onDone: (ok: boolean) => void }) {
  /** null, пока ответа нет. */
  const [verdict, setVerdict] = useState<{ ok: boolean; typed?: string; skipped?: boolean } | null>(null);
  const spoken = useMemo(() => spokenTarget(task), [task]);
  const say = task.mode === "say";

  return (
    <Card className="flex flex-col gap-block" data-testid="numbers-task" data-mode={task.mode} data-scene={task.target.scene}>
      <div className="flex flex-col items-center gap-2 text-center">
        <Chip tone="neutral">{SCENE_CHIP[task.target.scene]}</Chip>
        <p className="font-semibold" data-testid="numbers-question">
          {sceneQuestion(task)}
        </p>
        {say && (
          <div dir="ltr" className="text-4xl font-bold" data-testid="numbers-digits">
            {formatTarget(task.target)}
          </div>
        )}
      </div>

      {verdict === null ? (
        say ? (
          <SayAnswer task={task} onResult={(ok, skipped) => setVerdict({ ok, skipped })} />
        ) : (
          <HearAnswer task={task} spoken={spoken} onResult={(ok, typed) => setVerdict({ ok, typed })} />
        )
      ) : (
        <Feedback task={task} spoken={spoken} verdict={verdict} last={last} onNext={() => onDone(verdict.ok)} />
      )}
    </Card>
  );
}

function HearAnswer({ task, spoken, onResult }: { task: NumberTask; spoken: SpokenNumber; onResult: (ok: boolean, typed: string) => void }) {
  const [typed, setTyped] = useState("");
  const { target } = task;
  return (
    <>
      <NumberPlayer spoken={spoken} testId="numbers-listen" />
      <DigitPad
        value={typed}
        maxLength={answerMaxLength(target)}
        colon={target.scene === "time"}
        format={target.scene === "phone" ? formatDigits : undefined}
        placeholder={target.scene === "time" ? "Например, 3:35" : "Введите цифрами"}
        onChange={setTyped}
        onSubmit={() => onResult(checkTyped(target, typed), typed)}
      />
    </>
  );
}

function SayAnswer({ task, onResult }: { task: NumberTask; onResult: (ok: boolean, skipped?: boolean) => void }) {
  const attempts = useRef(0);
  async function check(audio: Blob): Promise<SpeakVerdict> {
    attempts.current += 1;
    try {
      const res = await api.numbersSpeech(task.target, audio);
      return {
        match: res.match,
        heard: res.heard,
        final: !res.match && attempts.current >= NUMBERS_SAY_ATTEMPTS,
        attemptsLeft: Math.max(0, NUMBERS_SAY_ATTEMPTS - attempts.current),
      };
    } catch (e) {
      attempts.current -= 1; // Сбой связи не тратит попытку.
      throw e;
    }
  }
  return (
    <div className="flex flex-col items-center gap-2" data-testid="numbers-say">
      <p className="flex items-center gap-1 text-sm text-ink-soft">
        <Mic className="size-4" aria-hidden />
        Скажите на иврите. Попыток: {NUMBERS_SAY_ATTEMPTS}
      </p>
      <SpeakRecorder mode="quiz" phrase check={check} onPassed={() => onResult(true)} onFailed={() => onResult(false)} onGiveUp={() => onResult(false, true)} />
    </div>
  );
}

function Feedback({
  task,
  spoken,
  verdict,
  last,
  onNext,
}: {
  task: NumberTask;
  spoken: SpokenNumber;
  verdict: { ok: boolean; typed?: string; skipped?: boolean };
  last: boolean;
  onNext: () => void;
}) {
  const { ok } = verdict;
  const note = !ok || task.target.scene === "price" ? genderNote(task.target) : null;
  return (
    <div className="flex flex-col gap-2" data-testid="numbers-feedback" data-ok={ok} role="status">
      <div className={`flex items-center gap-2 font-semibold ${ok ? "text-success" : "text-danger"}`}>
        {ok ? <CheckCircle2 className="size-icon" aria-hidden /> : <XCircle className="size-icon" aria-hidden />}
        {ok ? "Верно" : verdict.skipped ? "Пропущено" : "Неверно"}
      </div>
      <div className="flex flex-col gap-1 rounded-control bg-page p-3 text-center">
        <div dir="ltr" className="text-3xl font-bold" data-testid="numbers-answer">
          {formatTarget(task.target)}
        </div>
        {!ok && verdict.typed && (
          <div className="text-sm text-danger" dir="ltr">
            Вы ввели: {verdict.typed}
          </div>
        )}
        <div dir="rtl" lang="he" className="font-hebrew text-2xl" data-testid="numbers-he">
          {spoken.niqqud}
        </div>
        <div className="text-accent">[{spoken.translit}]</div>
      </div>
      <NumberPlayer spoken={spoken} testId="numbers-listen-answer" primary={false} />
      {note && <p className="text-sm text-ink-soft">{note}</p>}
      {/* Верный ответ: «Дальше» сама срабатывает через 2 секунды, после ошибки только по кнопке. */}
      <AutoNextButton running={ok} tone={ok ? "success" : "primary"} onNext={onNext} testId="numbers-next">
        {last ? "Результат" : "Дальше"}
      </AutoNextButton>
    </div>
  );
}

function Result({
  total,
  wrong,
  retried,
  onRetry,
  onAgain,
  onExit,
}: {
  total: number;
  wrong: NumberTask[];
  retried: boolean;
  onRetry: () => void;
  onAgain: () => void;
  onExit: () => void;
}) {
  const right = total - wrong.length;
  return (
    <>
      <Card className="flex flex-col items-center gap-2 text-center" data-testid="numbers-result">
        <div className="text-4xl font-bold" data-testid="numbers-score">
          {right} из {total}
        </div>
        <p className="font-semibold">{numbersVerdict(right, total)}</p>
        <p className="text-sm text-ink-soft">Это тренировка: очки и результат уроков не меняются.</p>
      </Card>

      {wrong.length > 0 && (
        <Card className="flex flex-col gap-2" data-testid="numbers-mistakes">
          <h2 className="font-semibold">Над чем поработать</h2>
          {wrong.map((task, i) => (
            <MistakeRow key={i} task={task} />
          ))}
        </Card>
      )}

      {wrong.length > 0 && (
        <Button onClick={onRetry} data-testid="numbers-retry">
          Повторить ошибки ({wrong.length})
        </Button>
      )}
      <Button variant={wrong.length > 0 ? "ghost" : "primary"} onClick={onAgain} data-testid="numbers-again">
        {retried ? "Новый подход" : `Ещё раз (${NUMBERS_ROUND} новых заданий)`}
      </Button>
      <Button variant="ghost" onClick={onExit} data-testid="numbers-levels-back">
        К уровням
      </Button>
    </>
  );
}

function MistakeRow({ task }: { task: NumberTask }) {
  const spoken = useMemo(() => spokenTarget(task), [task]);
  return (
    <div className="flex flex-col gap-2 border-t border-line pt-2" data-testid="numbers-mistake">
      <div className="flex items-center gap-3">
        <div dir="ltr" className="min-w-20 text-2xl font-bold">
          {formatTarget(task.target)}
        </div>
        <div className="min-w-0 flex-1 text-right">
          <div dir="rtl" lang="he" className="font-hebrew text-xl">
            {spoken.niqqud}
          </div>
          <div className="text-sm text-accent">[{spoken.translit}]</div>
        </div>
      </div>
      <NumberPlayer spoken={spoken} testId="numbers-mistake-listen" primary={false} />
    </div>
  );
}

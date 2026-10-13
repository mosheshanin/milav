import { useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle2, XCircle } from "lucide-react";
import { getLesson } from "@milav/content";
import {
  MAX_MISTAKES,
  PASS_SCORE,
  QUESTION_TITLES,
  QUIZ_SIZE,
  type Lesson,
  type QuizAnswerResponse,
  type QuizQuestion,
  type QuizResult,
  type QuizStartResponse,
  type Word,
} from "@milav/shared";
import { api } from "../api";
import { useApp } from "../AppContext";
import { Header } from "../components/Header";
import { ListenButton } from "../components/ListenButton";
import { SpeakRecorder } from "../components/SpeakRecorder";
import { WriteWord, type WriteResult } from "../components/WriteWord";
import { Button, Card, Chip, Notice } from "../components/ui";
import { isQuizSessionLost, quizErrorText, saveErrorText } from "../lib/apiErrors";
import { useBackButton } from "../lib/useBackButton";
import { confirmAction, setClosingConfirmation } from "../telegram";

/**
 * Викторина по уроку: 25 вопросов, ошибки видны сразу.
 * Вопросы выдаёт сервер, каждый ответ проверяется на сервере, итог считает и записывает сервер (apps/api/src/quizSession.ts).
 */
export function Quiz({ lessonId, onBack, onHome }: { lessonId: string; onBack: () => void; onHome: () => void }) {
  const lesson = getLesson(lessonId);
  const [round, setRound] = useState(0);
  if (!lesson) return <Notice title="Урок не найден" />;
  return <QuizRound key={round} lesson={lesson} onBack={onBack} onHome={onHome} onRestart={() => setRound(round + 1)} />;
}

type Load = { state: "loading" } | { state: "error"; message: string } | { state: "ready"; session: QuizStartResponse };

/** Просит у сервера новую викторину и показывает её, когда она пришла. */
function QuizRound({
  lesson,
  onBack,
  onHome,
  onRestart,
}: {
  lesson: Lesson;
  onBack: () => void;
  onHome: () => void;
  onRestart: () => void;
}) {
  const [load, setLoad] = useState<Load>({ state: "loading" });
  const [attempt, setAttempt] = useState(0);
  const alive = useRef(true);
  /** Номер попытки, для которой запрос уже отправлен: повторный прогон эффекта (StrictMode) не шлёт второй запрос. */
  const requested = useRef(-1);

  // Пока вопросы не пришли, «назад» ведёт в урок. Потом кнопку берёт на себя QuizPlay.
  useBackButton(load.state === "ready" ? null : onBack);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  useEffect(() => {
    if (requested.current === attempt) return;
    requested.current = attempt;
    setLoad({ state: "loading" });
    api.quizStart(lesson.id).then(
      (session) => alive.current && setLoad({ state: "ready", session }),
      (e) => alive.current && setLoad({ state: "error", message: saveErrorText(e) }),
    );
  }, [attempt, lesson.id]);

  if (load.state === "ready") {
    return <QuizPlay lesson={lesson} session={load.session} onBack={onBack} onHome={onHome} onRestart={onRestart} />;
  }
  return (
    <>
      <Header title="Викторина" subtitle={lesson.title} onBack={onBack} />
      <main className="mx-auto flex max-w-md flex-col gap-block p-block">
        <Card className="flex flex-col items-center gap-block text-center">
          {load.state === "loading" ? (
            <p className="text-ink-soft" data-testid="quiz-loading">
              Готовим вопросы…
            </p>
          ) : (
            <>
              <p role="alert" className="text-danger" data-testid="quiz-start-error">
                {load.message}
              </p>
              <Button block onClick={() => setAttempt(attempt + 1)} data-testid="quiz-start-retry">
                Повторить
              </Button>
              <Button variant="ghost" block onClick={onBack}>
                Назад к словам
              </Button>
            </>
          )}
        </Card>
      </main>
    </>
  );
}

/** Что показать после ответа: верно ли, и какое слово выбрано (для вопросов с выбором). */
type Outcome = { correct: boolean; chosen?: string };

type SendError = { message: string; retry: () => void };

function optionLabel(question: QuizQuestion, word: Word): string {
  return question.type === "ru-he" ? word.he : word.ru;
}

function QuizPlay({
  lesson,
  session,
  onBack,
  onHome,
  onRestart,
}: {
  lesson: Lesson;
  session: QuizStartResponse;
  onBack: () => void;
  onHome: () => void;
  onRestart: () => void;
}) {
  const { refresh } = useApp();
  const { sessionId, questions } = session;
  const words = lesson.words;
  const [index, setIndex] = useState(0);
  /** Верно ли ответили на каждый уже принятый вопрос (так, как решил сервер). */
  const [results, setResults] = useState<boolean[]>([]);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  /** Сервер прервал викторину: ошибок больше допустимого. */
  const [abortedByServer, setAbortedByServer] = useState(false);
  /** Итог, который посчитал и записал сервер. Приходит с ответом на последний вопрос. */
  const [result, setResult] = useState<QuizResult | null>(null);
  const [pending, setPending] = useState(false);
  const [sendError, setSendError] = useState<SendError | null>(null);
  /** Сервер больше не знает эту викторину (заменена, просрочена): остаётся начать заново. */
  const [lost, setLost] = useState(false);
  /** Защита от двойного нажатия: состояние обновится только после перерисовки, а ref сразу. */
  const sending = useRef(false);

  const mistakes = results.filter((r) => !r).length;
  const question = questions[index];
  const finished = index >= questions.length;
  const aborted = abortedByServer && !outcome;

  // Выход теряет ответы, пока викторина идёт. Готовый итог уже записан сервером, его терять нечего.
  const leaveWarning = results.length > 0 && !finished && !aborted && !lost ? "Прервать викторину? Ответы не сохранятся." : null;

  const guardedBack = useCallback(async () => {
    if (leaveWarning && !(await confirmAction(leaveWarning))) return;
    onBack();
  }, [leaveWarning, onBack]);

  // Кнопка «назад» Telegram, свайп и стрелка в шапке ведут через одно и то же подтверждение.
  useBackButton(() => void guardedBack());
  // Закрытие приложения (свайп вниз) тоже спрашивает, пока есть что терять.
  const hasUnsaved = leaveWarning !== null;
  useEffect(() => {
    setClosingConfirmation(hasUnsaved);
    return () => setClosingConfirmation(false);
  }, [hasUnsaved]);

  /** Принимает ответ сервера на вопрос. Повторный ответ на тот же вопрос (после обрыва связи) ничего не меняет. */
  function accept(res: QuizAnswerResponse) {
    setResults((prev) => (prev.length > res.index ? prev : [...prev, res.correct]));
    if (res.aborted) setAbortedByServer(true);
    if (res.result) {
      setResult(res.result);
      void refresh();
    }
  }

  /** Отправляет ответ на сервер. Если не вышло, показывает ошибку и кнопку «Повторить» с тем же ответом. */
  async function send(request: () => Promise<QuizAnswerResponse>, onAccepted: (res: QuizAnswerResponse) => void) {
    if (sending.current) return;
    sending.current = true;
    setPending(true);
    setSendError(null);
    try {
      const res = await request();
      accept(res);
      onAccepted(res);
    } catch (e) {
      if (isQuizSessionLost(e)) setLost(true);
      else setSendError({ message: quizErrorText(e), retry: () => void send(request, onAccepted) });
    } finally {
      sending.current = false;
      setPending(false);
    }
  }

  function choose(optionId: string) {
    const i = index;
    void send(
      () => api.quizAnswer({ sessionId, index: i, choice: optionId }),
      (res) => setOutcome({ correct: res.correct, chosen: optionId }),
    );
  }

  function giveUpSpeak() {
    const i = index;
    void send(
      () => api.quizAnswer({ sessionId, index: i, giveUp: true }),
      (res) => setOutcome({ correct: res.correct }),
    );
  }

  /** Запись голоса: сервер сам считает попытки. Если сессию потеряли, сообщаем об этом и передаём ошибку дальше. */
  async function checkSpeech(audio: Blob) {
    try {
      const res = await api.quizSpeech(sessionId, index, audio);
      return { ...res, match: res.correct, heard: res.heard ?? "" };
    } catch (e) {
      if (isQuizSessionLost(e)) setLost(true);
      throw e;
    }
  }

  function speechAnswered(res: QuizAnswerResponse) {
    accept(res);
    setOutcome({ correct: res.correct });
  }

  /** Вопрос с письмом сам показывает результат по буквам, поэтому после него сразу идём дальше. */
  function writeDone(written: WriteResult) {
    const i = index;
    void send(
      () => api.quizAnswer({ sessionId, index: i, strokes: written.letterStrokes }),
      () => setIndex(i + 1),
    );
  }

  function next() {
    setOutcome(null);
    setIndex(index + 1);
  }

  if (lost) {
    return (
      <>
        <Header title="Викторина устарела" subtitle={lesson.title} onBack={onBack} />
        <main className="mx-auto flex max-w-md flex-col gap-block p-block">
          <Card className="flex flex-col items-center gap-block text-center">
            <h2 className="text-xl font-bold" data-testid="quiz-lost">
              Эта викторина уже недоступна
            </h2>
            <p className="text-ink-soft">
              Возможно, вы открыли викторину на другом устройстве или оставили её слишком давно. Результат не сохранён.
              Начните заново.
            </p>
            <div className="grid w-full gap-2">
              <Button block onClick={onRestart} data-testid="quiz-restart">
                Начать заново
              </Button>
              <Button variant="ghost" block onClick={onBack}>
                Назад к словам
              </Button>
            </div>
          </Card>
        </main>
      </>
    );
  }

  if (aborted) {
    return (
      <>
        <Header title="Викторина прервана" subtitle={lesson.title} onBack={onBack} />
        <main className="mx-auto flex max-w-md flex-col gap-block p-block">
          <Card className="flex flex-col items-center gap-block text-center">
            <div className="text-5xl" aria-hidden>
              💪
            </div>
            <h2 className="text-xl font-bold" data-testid="quiz-aborted">
              Ошибок больше {MAX_MISTAKES}
            </h2>
            <p className="text-ink-soft">
              Урок в этот раз не сдан. Результат не сохранён: всё так, как будто викторина не начиналась. Повторите слова
              и попробуйте ещё раз.
            </p>
            <div className="grid w-full gap-2">
              <Button block onClick={onRestart} data-testid="quiz-restart">
                Начать заново
              </Button>
              <Button variant="secondary" block onClick={onBack}>
                Повторить слова урока
              </Button>
              <Button variant="ghost" block onClick={onHome}>
                К урокам
              </Button>
            </div>
          </Card>
        </main>
      </>
    );
  }

  if (finished) {
    return (
      <>
        <Header title="Итоги викторины" onBack={() => void guardedBack()} />
        <main className="mx-auto flex max-w-md flex-col gap-block p-block">
          {result ? <Result result={result} onHome={onHome} /> : <Notice title="Подводим итог…" />}
        </main>
      </>
    );
  }

  const word = words.find((w) => w.id === question!.wordId)!;

  return (
    <>
      <Header title="Викторина" subtitle={lesson.title} onBack={() => void guardedBack()} />
      <main className="mx-auto flex max-w-md flex-col gap-block p-block pb-section">
        <div className="flex items-center justify-between gap-2">
          <span className="font-semibold" data-testid="quiz-progress">
            Вопрос {index + 1} из {QUIZ_SIZE}
          </span>
          <Chip tone={mistakes > MAX_MISTAKES ? "danger" : mistakes > 0 ? "accent" : "neutral"}>
            <span data-testid="quiz-mistakes">
              Ошибок: {mistakes} из {MAX_MISTAKES} допустимых
            </span>
          </Chip>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-line" aria-hidden>
          <div className="h-full bg-accent transition-all" style={{ width: `${(index / QUIZ_SIZE) * 100}%` }} />
        </div>
        <Card className="flex flex-col gap-block" key={index}>
          <h2 className="text-center text-ink-soft">{QUESTION_TITLES[question!.type]}</h2>
          <QuestionBody
            question={question!}
            word={word}
            words={words}
            outcome={outcome}
            busy={pending}
            onChoose={choose}
            checkSpeech={checkSpeech}
            onSpeechAnswered={speechAnswered}
            onSpeechGiveUp={giveUpSpeak}
            onWriteDone={writeDone}
          />
          {pending && (
            <p className="text-center text-ink-soft" data-testid="quiz-sending">
              Проверяем…
            </p>
          )}
          {sendError && (
            <div className="flex flex-col items-center gap-2 text-center" role="alert">
              <p className="text-danger">{sendError.message}</p>
              <Button onClick={sendError.retry} data-testid="quiz-retry">
                Повторить
              </Button>
            </div>
          )}
          {outcome && question!.type !== "write" && (
            <Feedback outcome={outcome} word={word} showWord={question!.type === "speak"} />
          )}
          {outcome && question!.type !== "write" && (
            <Button onClick={next} data-testid="quiz-next">
              {index === questions.length - 1 ? "Завершить" : "Дальше"}
            </Button>
          )}
        </Card>
      </main>
    </>
  );
}

function Feedback({ outcome, word, showWord }: { outcome: Outcome; word: Word; showWord: boolean }) {
  return (
    <div
      role="status"
      data-testid="quiz-feedback"
      className={`flex items-center gap-2 rounded-control p-3 font-semibold ${
        outcome.correct ? "bg-success-soft text-success" : "bg-danger-soft text-danger"
      }`}
    >
      {outcome.correct ? <CheckCircle2 className="size-icon" aria-hidden /> : <XCircle className="size-icon" aria-hidden />}
      <span>
        {outcome.correct ? "Верно!" : "Неверно."}
        {(!outcome.correct || showWord) && (
          <>
            {" "}
            <span dir="rtl" lang="he" className="font-hebrew">
              {word.he}
            </span>{" "}
            [{word.translit}] — {word.ru}
          </>
        )}
      </span>
    </div>
  );
}

function QuestionBody({
  question,
  word,
  words,
  outcome,
  busy,
  onChoose,
  checkSpeech,
  onSpeechAnswered,
  onSpeechGiveUp,
  onWriteDone,
}: {
  question: QuizQuestion;
  word: Word;
  words: Word[];
  outcome: Outcome | null;
  busy: boolean;
  onChoose: (optionId: string) => void;
  checkSpeech: (audio: Blob) => Promise<QuizAnswerResponse & { match: boolean; heard: string }>;
  onSpeechAnswered: (res: QuizAnswerResponse) => void;
  onSpeechGiveUp: () => void;
  onWriteDone: (result: WriteResult) => void;
}) {
  switch (question.type) {
    case "hear-ru":
    case "he-ru":
    case "ru-he":
      return (
        <>
          {question.type === "hear-ru" && <ListenButton word={word} label="Послушать слово" />}
          {question.type === "he-ru" && (
            <div dir="rtl" lang="he" className="text-center font-hebrew text-5xl font-bold">
              {word.he}
            </div>
          )}
          {question.type === "ru-he" && (
            <div data-testid="prompt" className="text-center text-3xl font-semibold">
              {word.ru}
            </div>
          )}
          <div className="grid gap-2">
            {question.options.map((optionId) => {
              const option = words.find((w) => w.id === optionId)!;
              const isTarget = optionId === question.wordId;
              const state = !outcome ? "idle" : isTarget ? "right" : outcome.chosen === optionId ? "wrong" : "idle";
              return (
                <button
                  key={optionId}
                  type="button"
                  disabled={outcome !== null || busy}
                  data-testid="option"
                  data-correct={isTarget}
                  onClick={() => onChoose(optionId)}
                  dir={question.type === "ru-he" ? "rtl" : undefined}
                  lang={question.type === "ru-he" ? "he" : undefined}
                  className={`min-h-14 rounded-control border-2 px-block text-lg font-semibold transition ${
                    question.type === "ru-he" ? "font-hebrew text-2xl" : ""
                  } ${
                    state === "right"
                      ? "border-success bg-success-soft text-success"
                      : state === "wrong"
                        ? "border-danger bg-danger-soft text-danger"
                        : "border-line bg-surface active:bg-accent-soft"
                  }`}
                >
                  {optionLabel(question, option)}
                </button>
              );
            })}
          </div>
        </>
      );
    case "speak":
      return (
        <>
          <div data-testid="prompt" className="text-center text-3xl font-semibold">
            {word.ru}
          </div>
          {!outcome && (
            <SpeakRecorder
              mode="quiz"
              check={checkSpeech}
              onPassed={onSpeechAnswered}
              onFailed={onSpeechAnswered}
              onGiveUp={onSpeechGiveUp}
            />
          )}
        </>
      );
    case "write":
      return (
        <>
          <div data-testid="prompt" className="text-center text-3xl font-semibold">
            {word.ru}
          </div>
          <WriteWord word={word} mode="quiz" doneLabel="Дальше" onDone={onWriteDone} />
        </>
      );
  }
}

/** Итог дошедшей до конца викторины: ошибок не больше допустимого, значит урок сдан и уже записан сервером. */
function Result({ result, onHome }: { result: QuizResult; onHome: () => void }) {
  return (
    <Card className="flex flex-col items-center gap-block text-center">
      <div className="text-5xl" aria-hidden>
        🎉
      </div>
      <h2 className="text-2xl font-bold" data-testid="quiz-result">
        {result.correct} из {QUIZ_SIZE}
      </h2>
      <p className="text-ink-soft">Нужно было {PASS_SCORE}. Урок сдан!</p>
      <p className="font-semibold text-success" data-testid="quiz-saved">
        {result.firstTimePassed
          ? `Новый сданный урок! Всего сдано: ${result.passedLessons}. Статус: ${result.status.symbol} ${result.status.name}`
          : "Результат сохранён. Этот урок уже был сдан раньше, в статус он не добавляется."}
      </p>
      <Button variant="ghost" block onClick={onHome} data-testid="quiz-home">
        К урокам
      </Button>
    </Card>
  );
}

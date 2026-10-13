import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, XCircle } from "lucide-react";
import { getLesson } from "@milav/content";
import { MAX_MISTAKES, PASS_SCORE, QUESTION_TITLES, QUIZ_SIZE, type Word } from "@milav/shared";
import { ApiError, api, type QuizResponse } from "../api";
import { useApp } from "../AppContext";
import { Header } from "../components/Header";
import { ListenButton } from "../components/ListenButton";
import { SpeakRecorder } from "../components/SpeakRecorder";
import { WriteWord } from "../components/WriteWord";
import { Button, Card, Chip, Notice } from "../components/ui";
import { generateQuiz, type Question } from "../lib/quiz";
import { useBackButton } from "../lib/useBackButton";
import { confirmAction, setClosingConfirmation } from "../telegram";

/** Викторина по уроку: 25 вопросов, ошибки видны сразу. */
export function Quiz({ lessonId, onBack, onHome }: { lessonId: string; onBack: () => void; onHome: () => void }) {
  const lesson = getLesson(lessonId);
  const [round, setRound] = useState(0);
  if (!lesson) return <Notice title="Урок не найден" />;
  return <QuizRound key={round} lessonId={lessonId} words={lesson.words} title={lesson.title} onBack={onBack} onHome={onHome} onRestart={() => setRound(round + 1)} />;
}

type Outcome = { correct: boolean; chosen?: string };

function QuizRound({
  lessonId,
  words,
  title,
  onBack,
  onHome,
  onRestart,
}: {
  lessonId: string;
  words: Word[];
  title: string;
  onBack: () => void;
  onHome: () => void;
  onRestart: () => void;
}) {
  const { refresh } = useApp();
  const questions = useMemo(() => generateQuiz(words), [words]);
  const [index, setIndex] = useState(0);
  const [results, setResults] = useState<boolean[]>([]);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [submit, setSubmit] = useState<
    { state: "idle" } | { state: "sending" } | { state: "error"; code: string } | { state: "done"; result: QuizResponse }
  >({ state: "idle" });

  const mistakes = results.filter((r) => !r).length;
  const question = questions[index];
  const finished = index >= questions.length;
  const correctCount = results.filter(Boolean).length;

  // Больше допустимого числа ошибок: викторина обрывается и ничего не сохраняется (решение владельца).
  const aborted = mistakes > MAX_MISTAKES && !outcome;
  // Выход теряет ответы (идёт викторина) или готовый, но не отправленный результат: тогда спрашиваем.
  const leaveWarning =
    results.length > 0 && !finished && !aborted
      ? "Прервать викторину? Ответы не сохранятся."
      : finished && !aborted && submit.state !== "done" && submit.state !== "sending"
        ? "Результат ещё не сохранён. Выйти без сохранения?"
        : null;

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

  function answer(correct: boolean, chosen?: string) {
    if (outcome) return;
    setResults((prev) => [...prev, correct]);
    setOutcome({ correct, chosen });
  }

  /** Вопрос с письмом сам показывает результат по буквам, поэтому после него сразу идём дальше. */
  function answerAndNext(correct: boolean) {
    setResults((prev) => [...prev, correct]);
    setIndex((i) => i + 1);
  }

  function next() {
    setOutcome(null);
    setIndex(index + 1);
  }

  async function send() {
    setSubmit({ state: "sending" });
    try {
      const result = await api.submitQuiz(lessonId, correctCount);
      setSubmit({ state: "done", result });
      void refresh();
    } catch (e) {
      setSubmit({ state: "error", code: e instanceof ApiError ? e.code : "network" });
    }
  }

  if (aborted) {
    return (
      <>
        <Header title="Викторина прервана" subtitle={title} onBack={onBack} />
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
          <Result
            correct={correctCount}
            submit={submit}
            onSend={() => void send()}
            onHome={onHome}
          />
        </main>
      </>
    );
  }

  const word = words.find((w) => w.id === question!.wordId)!;

  return (
    <>
      <Header title="Викторина" subtitle={title} onBack={() => void guardedBack()} />
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
          <QuestionBody question={question!} word={word} outcome={outcome} onAnswer={answer} onWriteDone={answerAndNext} />
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
  outcome,
  onAnswer,
  onWriteDone,
}: {
  question: Question;
  word: Word;
  outcome: Outcome | null;
  onAnswer: (correct: boolean, chosen?: string) => void;
  onWriteDone: (correct: boolean) => void;
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
            {question.options.map((option) => {
              const isTarget = option.wordId === question.wordId;
              const state = !outcome ? "idle" : isTarget ? "right" : outcome.chosen === option.wordId ? "wrong" : "idle";
              return (
                <button
                  key={option.wordId}
                  type="button"
                  disabled={outcome !== null}
                  data-testid="option"
                  data-correct={isTarget}
                  onClick={() => onAnswer(isTarget, option.wordId)}
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
                  {option.label}
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
            <SpeakRecorder word={word} mode="quiz" onPassed={() => onAnswer(true)} onGiveUp={() => onAnswer(false)} />
          )}
        </>
      );
    case "write":
      return (
        <>
          <div data-testid="prompt" className="text-center text-3xl font-semibold">
            {word.ru}
          </div>
          <WriteWord word={word} mode="quiz" doneLabel="Дальше" onDone={(r) => onWriteDone(r.failedLetters === 0)} />
        </>
      );
  }
}

/** Итог дошедшей до конца викторины: ошибок не больше допустимого, значит урок сдан. */
function Result({
  correct,
  submit,
  onSend,
  onHome,
}: {
  correct: number;
  submit:
    | { state: "idle" }
    | { state: "sending" }
    | { state: "error"; code: string }
    | { state: "done"; result: QuizResponse };
  onSend: () => void;
  onHome: () => void;
}) {
  return (
    <Card className="flex flex-col items-center gap-block text-center">
      <div className="text-5xl" aria-hidden>
        🎉
      </div>
      <h2 className="text-2xl font-bold" data-testid="quiz-result">
        {correct} из {QUIZ_SIZE}
      </h2>
      <p className="text-ink-soft">Нужно было {PASS_SCORE}. Урок сдан!</p>

      {submit.state === "idle" && (
        <Button block onClick={onSend} data-testid="quiz-send">
          Сохранить результат
        </Button>
      )}
      {submit.state === "sending" && <p className="text-ink-soft">Сохраняем…</p>}
      {submit.state === "error" && (
        <>
          <p role="alert" className="text-danger">
            {submit.code === "lesson_not_completed"
              ? "Сначала пройдите все четыре этапа у всех слов урока."
              : "Не удалось сохранить результат. Проверьте интернет."}
          </p>
          <Button block onClick={onSend}>
            Повторить
          </Button>
        </>
      )}
      {submit.state === "done" && (
        <p className="font-semibold text-success" data-testid="quiz-saved">
          {submit.result.firstTimePassed
            ? `Новый сданный урок! Всего сдано: ${submit.result.passedLessons}. Статус: ${submit.result.status.symbol} ${submit.result.status.name}`
            : "Результат сохранён. Этот урок уже был сдан раньше, в статус он не добавляется."}
        </p>
      )}

      <Button variant="ghost" block onClick={onHome} data-testid="quiz-home">
        К урокам
      </Button>
    </Card>
  );
}

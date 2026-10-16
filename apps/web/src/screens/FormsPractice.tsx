import { useMemo, useState } from "react";
import { CheckCircle2, XCircle } from "lucide-react";
import { lessonItems, type AnyLesson, type Word } from "@milav/shared";
import { Header } from "../components/Header";
import { LessonGate } from "../components/LessonGate";
import { SpeakerButton } from "../components/SpeakerButton";
import { Button, Card, Chip, Notice } from "../components/ui";
import { PRACTICE_QUESTIONS, buildPractice, practiceVerdict, practiceWords, type PracticeQuestion } from "../lib/formsPractice";
import { useBackButton } from "../lib/useBackButton";

/**
 * Практика форм глагола после урока. Ничего не отправляет на сервер и не меняет очки, статус и результат урока:
 * это свободная тренировка, ошибки ничем не грозят (решение владельца 14.10, `docs/SPEC.md`).
 */
export function FormsPractice({ lessonId, onBack }: { lessonId: string; onBack: () => void }) {
  return (
    <LessonGate lessonId={lessonId} title="Практика форм" onBack={onBack}>
      {(lesson) => <LessonPractice lesson={lesson} onBack={onBack} />}
    </LessonGate>
  );
}

function LessonPractice({ lesson, onBack }: { lesson: AnyLesson; onBack: () => void }) {
  const words = useMemo(() => practiceWords(lessonItems(lesson)), [lesson]);
  useBackButton(onBack);

  if (!words.length) {
    return (
      <>
        <Header title="Практика форм" subtitle={lesson.title} onBack={onBack} />
        <Notice title="В этом уроке нет глаголов">Практика форм открывается в уроках с глаголами.</Notice>
      </>
    );
  }
  return <PracticeSession words={words} subtitle={`Урок ${lesson.number}. ${lesson.title}`} onBack={onBack} />;
}

/** Один подход за другим: вопросы, разбор ответа, итог. Вынесено отдельно, чтобы не зависеть от каталога уроков. */
export function PracticeSession({ words, subtitle, onBack }: { words: readonly Word[]; subtitle?: string; onBack: () => void }) {
  // Новый подход собирается заново (кнопка «Ещё раз»): набор вопросов зависит от номера подхода.
  const [round, setRound] = useState(0);
  const questions = useMemo(() => buildPractice(words), [words, round]); // eslint-disable-line react-hooks/exhaustive-deps
  const [index, setIndex] = useState(0);
  /** Выбранный вариант на текущем вопросе (null, пока не ответили). */
  const [chosen, setChosen] = useState<string | null>(null);
  /** Номера вопросов, на которые ответили неверно, и что именно выбрали. */
  const [mistakes, setMistakes] = useState<{ question: PracticeQuestion; chosen: string }[]>([]);

  function restart() {
    setRound((r) => r + 1);
    setIndex(0);
    setChosen(null);
    setMistakes([]);
  }

  const total = questions.length;
  const finished = index >= total;

  return (
    <>
      <Header title="Практика форм" subtitle={subtitle} onBack={onBack} />
      <main className="mx-auto flex max-w-md flex-col gap-block p-block pb-section">
        {total === 0 ? (
          <Card className="text-center text-ink-soft">Не из чего составить вопросы: у глаголов урока мало разных форм.</Card>
        ) : finished ? (
          <Result total={total} mistakes={mistakes} onAgain={restart} onBack={onBack} />
        ) : (
          <>
            <Progress index={index} total={total} />
            <QuestionCard
              key={`${round}-${index}`}
              question={questions[index]!}
              chosen={chosen}
              onChoose={(optionId) => {
                const q = questions[index]!;
                setChosen(optionId);
                if (optionId !== q.correctId) setMistakes((prev) => [...prev, { question: q, chosen: optionId }]);
              }}
              onNext={() => {
                setChosen(null);
                setIndex((i) => i + 1);
              }}
              last={index === total - 1}
            />
            <p className="text-center text-sm text-ink-soft">Это тренировка: очки и результат урока не меняются.</p>
          </>
        )}
      </main>
    </>
  );
}

function Progress({ index, total }: { index: number; total: number }) {
  return (
    <div data-testid="practice-progress">
      <div className="mb-1 text-sm text-ink-soft">
        Вопрос {index + 1} из {total}
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-line" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={index}>
        <div className="h-full bg-accent transition-all" style={{ width: `${(index / total) * 100}%` }} />
      </div>
    </div>
  );
}

function QuestionCard({
  question,
  chosen,
  onChoose,
  onNext,
  last,
}: {
  question: PracticeQuestion;
  chosen: string | null;
  onChoose: (optionId: string) => void;
  onNext: () => void;
  last: boolean;
}) {
  const answered = chosen !== null;
  const correct = chosen === question.correctId;
  const pick = question.kind === "pick";

  return (
    <Card className="flex flex-col gap-block" data-testid="practice-question" data-kind={question.kind}>
      <div className="flex flex-col items-center gap-1 text-center">
        <Chip tone="neutral">Глагол</Chip>
        <div dir="rtl" lang="he" className="font-hebrew text-3xl font-bold">
          {question.wordHe}
        </div>
        <div className="text-lg text-ink-soft">{question.wordRu}</div>
      </div>

      {pick ? (
        <div className="text-center">
          <p className="text-ink-soft">Выберите форму:</p>
          <p className="text-xl font-semibold" data-testid="practice-prompt">
            {question.slot}
          </p>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-2 text-center">
          <p className="text-ink-soft">Что это за форма?</p>
          <div className="flex items-center gap-3">
            <SpeakerButton item={{ he: question.form.niqqud, audio: question.form.audio }} label="Послушать форму" testId="practice-listen" />
            <span dir="rtl" lang="he" className="font-hebrew text-4xl font-bold" data-testid="practice-prompt">
              {question.form.niqqud}
            </span>
          </div>
        </div>
      )}

      <div className="grid gap-2">
        {question.options.map((option) => {
          const isCorrect = option.id === question.correctId;
          const state = !answered ? "idle" : isCorrect ? "right" : chosen === option.id ? "wrong" : "idle";
          return (
            <button
              key={option.id}
              type="button"
              disabled={answered}
              data-testid="practice-option"
              data-correct={isCorrect}
              onClick={() => onChoose(option.id)}
              dir={pick ? "rtl" : undefined}
              lang={pick ? "he" : undefined}
              className={`min-h-14 rounded-control border-2 px-block font-semibold transition ${pick ? "font-hebrew text-2xl" : "text-base"} ${
                state === "right"
                  ? "border-success bg-success-soft text-success"
                  : state === "wrong"
                    ? "border-danger bg-danger-soft text-danger"
                    : "border-line bg-surface active:bg-accent-soft"
              }`}
            >
              {option.text}
            </button>
          );
        })}
      </div>

      {answered && (
        <div className="flex flex-col gap-2" data-testid="practice-feedback" role="status">
          <div className={`flex items-center gap-2 font-semibold ${correct ? "text-success" : "text-danger"}`}>
            {correct ? <CheckCircle2 className="size-icon" aria-hidden /> : <XCircle className="size-icon" aria-hidden />}
            {correct ? "Верно" : "Неверно"}
          </div>
          <div className="flex items-center gap-2 rounded-control bg-page p-2">
            <SpeakerButton item={{ he: question.form.niqqud, audio: question.form.audio }} label="Послушать правильную форму" testId="practice-listen-answer" />
            <div className="min-w-0 flex-1 text-sm">
              <div className="text-ink-soft">{question.slot}</div>
              <div className="text-accent">[{question.form.translit}]</div>
            </div>
            <span dir="rtl" lang="he" className="font-hebrew text-2xl">
              {question.form.niqqud}
            </span>
          </div>
          <Button onClick={onNext} data-testid="practice-next">
            {last ? "Результат" : "Дальше"}
          </Button>
        </div>
      )}
    </Card>
  );
}

function Result({
  total,
  mistakes,
  onAgain,
  onBack,
}: {
  total: number;
  mistakes: { question: PracticeQuestion; chosen: string }[];
  onAgain: () => void;
  onBack: () => void;
}) {
  const right = total - mistakes.length;
  return (
    <>
      <Card className="flex flex-col items-center gap-2 text-center" data-testid="practice-result">
        <div className="text-4xl font-bold" data-testid="practice-score">
          {right} из {total}
        </div>
        <p className="font-semibold">{practiceVerdict(right, total)}</p>
        <p className="text-sm text-ink-soft">Это тренировка: очки и результат урока не меняются.</p>
      </Card>

      {mistakes.length > 0 && (
        <Card className="flex flex-col gap-2" data-testid="practice-mistakes">
          <h2 className="font-semibold">Над чем поработать</h2>
          {mistakes.map(({ question: q }) => (
            <div key={`${q.wordId}-${q.correctId}`} className="flex items-center gap-2 border-t border-line pt-2">
              <SpeakerButton item={{ he: q.form.niqqud, audio: q.form.audio }} label={`Послушать: ${q.slot}`} />
              <div className="min-w-0 flex-1 text-sm">
                <div>
                  {q.wordRu}: {q.slot}
                </div>
                <div className="text-accent">[{q.form.translit}]</div>
              </div>
              <span dir="rtl" lang="he" className="font-hebrew text-2xl">
                {q.form.niqqud}
              </span>
            </div>
          ))}
        </Card>
      )}

      <Button onClick={onAgain} data-testid="practice-again">
        Ещё раз ({PRACTICE_QUESTIONS} новых вопросов)
      </Button>
      <Button variant="ghost" onClick={onBack} data-testid="practice-back">
        К уроку
      </Button>
    </>
  );
}

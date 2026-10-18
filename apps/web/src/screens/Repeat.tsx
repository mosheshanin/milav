import { useCallback, useEffect, useState, type ReactNode } from "react";
import { CheckCircle2, XCircle } from "lucide-react";
import {
  GERESH,
  REPEAT_TYPE_TITLES,
  typedLetters,
  type PlayEvent,
  type RepeatAnswerRequest,
  type RepeatAnswerResponse,
  type RepeatQuestion,
  type RepeatSessionResponse,
  type RepeatWord,
} from "@milav/shared";
import { ApiError, api } from "../api";
import { useApp } from "../AppContext";
import { AutoNextButton } from "../components/AutoNextButton";
import { Header } from "../components/Header";
import { HebrewKeyboard } from "../components/HebrewKeyboard";
import { ListenButton } from "../components/ListenButton";
import { SpeakerButton } from "../components/SpeakerButton";
import { CelebrationSheet } from "../components/play";
import { Button, Card, Chip, Notice } from "../components/ui";
import { haptic } from "../lib/haptic";
import { drillQueue, localCorrect, repeatCardText, repeatVerdict, returnsText, wordsCount } from "../lib/repeat";
import { useBackButton } from "../lib/useBackButton";

type Load = { kind: "loading" } | { kind: "error" } | { kind: "ready"; session: RepeatSessionResponse };

/** Ответ без id слова и вида упражнения: их подставляет RepeatRun. */
type Answer = Omit<RepeatAnswerRequest, "wordId" | "type">;

/**
 * Подход «Повторить»: до 10 слов, которые пора повторить, по одному упражнению на слово (выбор, набор или форма глагола).
 * Каждый ответ сразу уходит на сервер: он проверяет ответ, двигает слово по коробкам и засчитывает его в цель дня.
 * В конце «Ещё раз» прогоняет забытые слова, пока все не вспомнятся: это тренировка, на сервер она ничего не пишет.
 */
export function Repeat({ onBack, onWords }: { onBack: () => void; onWords: () => void }) {
  const [load, setLoad] = useState<Load>({ kind: "loading" });
  /** Номер подхода: «Ещё подход» собирает новый с сервера. */
  const [round, setRound] = useState(0);
  /** «Ещё раз»: забытые вопросы последнего подхода (null — обычный подход). */
  const [drill, setDrill] = useState<RepeatQuestion[] | null>(null);
  useBackButton(onBack);

  useEffect(() => {
    let alive = true;
    setLoad({ kind: "loading" });
    setDrill(null);
    api.repeatSession().then(
      (session) => alive && setLoad({ kind: "ready", session }),
      () => alive && setLoad({ kind: "error" }),
    );
    return () => {
      alive = false;
    };
  }, [round]);

  if (load.kind === "loading") return <Notice title="Собираем слова…" />;
  if (load.kind === "error") {
    return (
      <>
        <Header title="Повторение" onBack={onBack} />
        <main className="mx-auto flex max-w-md flex-col gap-block p-block">
          <Card className="text-center">Не удалось загрузить слова. Проверьте интернет.</Card>
          <Button onClick={() => setRound((r) => r + 1)}>Попробовать снова</Button>
        </main>
      </>
    );
  }
  const { session } = load;
  if (session.questions.length === 0) {
    return (
      <>
        <Header title="Повторение" onBack={onBack} />
        <main className="mx-auto flex max-w-md flex-col gap-block p-block" data-testid="repeat-empty">
          <Card className="flex flex-col gap-2 text-center">
            <div className="text-lg font-semibold">Сейчас повторять нечего</div>
            <p className="text-ink-soft">
              {session.summary.total === 0
                ? "Слова появятся здесь на следующий день после того, как вы пройдёте их в уроке."
                : repeatCardText(session.summary).line}
            </p>
          </Card>
          {session.summary.total > 0 && (
            <Button variant="secondary" onClick={onWords} data-testid="repeat-open-words">
              Мои слова
            </Button>
          )}
          <Button variant="ghost" onClick={onBack}>
            На главную
          </Button>
        </main>
      </>
    );
  }
  if (drill) {
    return <DrillRun key={`drill-${round}`} questions={drill} words={session.words} onBack={onBack} onWords={onWords} />;
  }
  return (
    <RepeatRun
      key={round}
      session={session}
      onBack={onBack}
      onWords={onWords}
      onAgain={() => setRound((r) => r + 1)}
      onDrill={(forgotten) => setDrill(drillQueue(forgotten))}
    />
  );
}

interface Answered {
  question: RepeatQuestion;
  correct: boolean;
  /** Через сколько дней слово вернётся; -1, если ответ не записан (тренировка или «уже повторено»). */
  dueIn: number;
  chosen?: string;
}

function RepeatRun({
  session,
  onBack,
  onWords,
  onAgain,
  onDrill,
}: {
  session: RepeatSessionResponse;
  onBack: () => void;
  onWords: () => void;
  onAgain: () => void;
  onDrill: (forgotten: RepeatQuestion[]) => void;
}) {
  const { invalidate } = useApp();
  const total = session.questions.length;
  const [index, setIndex] = useState(0);
  const [answered, setAnswered] = useState<Answered[]>([]);
  const [current, setCurrent] = useState<Answered | null>(null);
  const [sending, setSending] = useState(false);
  const [failed, setFailed] = useState<Answer | null>(null);
  /** Бейджи и цель дня за подход: поздравление в конце, чтобы не прерывать повторение. */
  const [play, setPlay] = useState<{ newBadges: string[]; goalMet: boolean }>({ newBadges: [], goalMet: false });

  const question = session.questions[index];
  const finished = index >= total;

  const send = useCallback(
    async (answer: Answer) => {
      const q = session.questions[index]!;
      setSending(true);
      setFailed(null);
      try {
        const res: RepeatAnswerResponse = await api.repeatAnswer({
          wordId: q.wordId,
          type: q.type,
          ...(q.form ? { form: q.form.id } : {}),
          ...answer,
        });
        setCurrent({ question: q, correct: res.correct, dueIn: res.dueIn, chosen: answer.choice });
        mergePlay(setPlay, res.play);
        invalidate();
        haptic(res.correct ? "success" : "light");
      } catch (e) {
        if (e instanceof ApiError && e.status === 409) {
          // Слово уже повторено (например, в другом окне): показываем ответ без записи и идём дальше.
          setCurrent({ question: q, correct: localCorrect(q, answer, session.words), dueIn: -1, chosen: answer.choice });
        } else {
          setFailed(answer);
        }
      } finally {
        setSending(false);
      }
    },
    [index, session, invalidate],
  );

  function next() {
    if (current) setAnswered((prev) => [...prev, current]);
    setCurrent(null);
    setIndex((i) => i + 1);
  }

  if (finished) {
    return (
      <>
        <Header title="Повторение" onBack={onBack} />
        <RepeatResult
          answered={answered}
          words={session.words}
          moreDue={Math.max(0, session.summary.due - total)}
          play={play}
          onAgain={onAgain}
          onDrill={() => onDrill(answered.filter((a) => !a.correct).map((a) => a.question))}
          onWords={onWords}
          onBack={onBack}
        />
      </>
    );
  }

  return (
    <QuestionScreen
      key={index}
      question={question!}
      words={session.words}
      progress={`Слово ${index + 1} из ${total}`}
      fraction={index / total}
      busy={sending}
      current={current}
      nextLabel={index === total - 1 ? "Итог" : "Дальше"}
      note="Повторённые слова идут в цель дня."
      onAnswer={(a) => void send(a)}
      onNext={next}
      onBack={onBack}
      failed={failed && (
        <div className="flex flex-col gap-2" role="alert">
          <p className="text-center font-semibold text-danger">Ответ не отправлен: нет связи с сервером.</p>
          <Button variant="secondary" onClick={() => void send(failed)} data-testid="repeat-retry">
            Отправить ещё раз
          </Button>
        </div>
      )}
    />
  );
}

/**
 * «Ещё раз»: забытые слова подхода по кругу, пока каждое не вспомнится. Ответ проверяется на телефоне и никуда
 * не отправляется: коробки, цель дня и бейджи не меняются (решение владельца 17.10), слова всё равно вернутся завтра.
 */
function DrillRun({
  questions,
  words,
  onBack,
  onWords,
}: {
  questions: RepeatQuestion[];
  words: Record<string, RepeatWord>;
  onBack: () => void;
  onWords: () => void;
}) {
  const [queue, setQueue] = useState(questions);
  const [current, setCurrent] = useState<Answered | null>(null);
  const [rounds, setRounds] = useState(0);
  const question = queue[0];

  function next() {
    // Не вспомнил: слово уходит в конец очереди и спросится ещё раз.
    setQueue(([first, ...rest]) => (current && !current.correct && first ? [...rest, first] : rest));
    setCurrent(null);
    setRounds((r) => r + 1);
  }

  if (!question) {
    return (
      <>
        <Header title="Ещё раз" onBack={onBack} />
        <main className="mx-auto flex max-w-md flex-col gap-block p-block pb-section">
          <Card className="flex flex-col items-center gap-2 text-center" data-testid="drill-done">
            <CheckCircle2 className="size-icon text-success" aria-hidden />
            <p className="font-semibold">Все забытые слова вспомнили!</p>
            <p className="text-sm text-ink-soft">Завтра они вернутся в повторение, чтобы закрепиться.</p>
          </Card>
          <Button variant="secondary" onClick={onWords} data-testid="repeat-words">
            Мои слова
          </Button>
          <Button variant="ghost" onClick={onBack} data-testid="repeat-home">
            На главную
          </Button>
        </main>
      </>
    );
  }

  return (
    <QuestionScreen
      key={rounds}
      title="Ещё раз"
      question={question}
      words={words}
      progress={`Осталось: ${wordsCount(queue.length)}`}
      fraction={questions.length > 0 ? 1 - queue.length / questions.length : 1}
      busy={false}
      current={current}
      nextLabel="Дальше"
      note="Это тренировка: коробки и цель дня не меняются."
      onAnswer={(a) => {
        const correct = localCorrect(question, a, words);
        setCurrent({ question, correct, dueIn: -1, chosen: a.choice });
        haptic(correct ? "success" : "light");
      }}
      onNext={next}
      onBack={onBack}
    />
  );
}

function mergePlay(set: (f: (p: { newBadges: string[]; goalMet: boolean }) => { newBadges: string[]; goalMet: boolean }) => void, event: PlayEvent) {
  set((p) => ({ newBadges: [...p.newBadges, ...event.newBadges.filter((id) => !p.newBadges.includes(id))], goalMet: p.goalMet || event.goalMet }));
}

/** Экран одного вопроса: прогресс, упражнение, разбор ответа и кнопка «Дальше». Общий для подхода и «Ещё раз». */
function QuestionScreen({
  title = "Повторение",
  question,
  words,
  progress,
  fraction,
  busy,
  current,
  nextLabel,
  note,
  failed,
  onAnswer,
  onNext,
  onBack,
}: {
  title?: string;
  question: RepeatQuestion;
  words: Record<string, RepeatWord>;
  progress: string;
  fraction: number;
  busy: boolean;
  current: Answered | null;
  nextLabel: string;
  note: string;
  failed?: ReactNode;
  onAnswer: (answer: Answer) => void;
  onNext: () => void;
  onBack: () => void;
}) {
  const word = words[question.wordId]!;
  return (
    <>
      <Header title={title} subtitle={REPEAT_TYPE_TITLES[question.type]} onBack={onBack} />
      <main className="mx-auto flex max-w-md flex-col gap-block p-block pb-section">
        <div data-testid="repeat-progress">
          <div className="mb-1 text-sm text-ink-soft">{progress}</div>
          <div className="h-2 overflow-hidden rounded-full bg-line" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(fraction * 100)}>
            <div className="h-full bg-accent transition-all" style={{ width: `${fraction * 100}%` }} />
          </div>
        </div>
        <Card className="flex flex-col gap-block" data-testid="repeat-question" data-type={question.type}>
          {question.form ? (
            <FormQuestion question={question} word={word} busy={busy} answered={current} onChoose={(choice) => onAnswer({ choice })} />
          ) : question.type === "type" ? (
            <TypeQuestion
              word={word}
              busy={busy}
              answered={current}
              onSubmit={(typed) => onAnswer({ typed })}
              onGiveUp={() => onAnswer({ giveUp: true })}
            />
          ) : (
            <ChoiceQuestion question={question} words={words} busy={busy} answered={current} onChoose={(choice) => onAnswer({ choice })} />
          )}
          {failed}
          {current && (
            <>
              <Feedback answered={current} word={word} />
              {/* Верный ответ: «Дальше» сама срабатывает через 2 секунды, после ошибки только по кнопке (успеть прочитать разбор). */}
              <AutoNextButton
                running={current.correct}
                tone={current.correct ? "success" : "primary"}
                onNext={onNext}
                testId="repeat-next"
              >
                {nextLabel}
              </AutoNextButton>
            </>
          )}
        </Card>
        <p className="text-center text-sm text-ink-soft">{note}</p>
      </main>
    </>
  );
}

const optionClass = (state: "idle" | "right" | "wrong") =>
  state === "right"
    ? "border-success bg-success-soft text-success"
    : state === "wrong"
      ? "border-danger bg-danger-soft text-danger"
      : "border-line bg-surface active:bg-accent-soft";

function ChoiceQuestion({
  question,
  words,
  busy,
  answered,
  onChoose,
}: {
  question: RepeatQuestion;
  words: Record<string, RepeatWord>;
  busy: boolean;
  answered: Answered | null;
  onChoose: (wordId: string) => void;
}) {
  const word = words[question.wordId]!;
  const toHebrew = question.type === "ru-he";
  return (
    <>
      {question.type === "hear-ru" && <ListenButton word={word} label="Послушать слово" testId="repeat-listen" />}
      {question.type === "he-ru" && (
        <div dir="rtl" lang="he" className="text-center font-hebrew text-5xl font-bold" data-testid="repeat-prompt">
          {word.he}
        </div>
      )}
      {toHebrew && (
        <div className="text-center text-3xl font-semibold" data-testid="repeat-prompt">
          {word.ru}
        </div>
      )}
      <div className="grid gap-2">
        {question.options.map((id) => {
          const option = words[id]!;
          const isTarget = id === question.wordId;
          const state = !answered ? "idle" : isTarget ? "right" : answered.chosen === id ? "wrong" : "idle";
          return (
            <button
              key={id}
              type="button"
              disabled={answered !== null || busy}
              data-testid="repeat-option"
              data-correct={isTarget}
              onClick={() => onChoose(id)}
              dir={toHebrew ? "rtl" : undefined}
              lang={toHebrew ? "he" : undefined}
              className={`min-h-14 rounded-control border-2 px-block text-lg font-semibold transition ${toHebrew ? "font-hebrew text-2xl" : ""} ${optionClass(state)}`}
            >
              {toHebrew ? option.he : option.ru}
            </button>
          );
        })}
      </div>
    </>
  );
}

/**
 * Форма глагола (как в «Практике форм»): «выбери форму» (дан «Прошедшее · он», выбрать форму иврита) или
 * «что это за форма?» (дана форма, её можно послушать, выбрать «время · кто делает»).
 */
function FormQuestion({
  question,
  word,
  busy,
  answered,
  onChoose,
}: {
  question: RepeatQuestion;
  word: RepeatWord;
  busy: boolean;
  answered: Answered | null;
  onChoose: (formId: string) => void;
}) {
  const form = question.form!;
  const pick = question.type === "form-pick";
  return (
    <>
      <div className="flex flex-col items-center gap-1 text-center">
        <Chip tone="neutral">Глагол</Chip>
        <div dir="rtl" lang="he" className="font-hebrew text-3xl font-bold">
          {word.he}
        </div>
        <div className="text-lg text-ink-soft">{word.ru}</div>
      </div>
      {pick ? (
        <div className="text-center">
          <p className="text-ink-soft">Выберите форму:</p>
          <p className="text-xl font-semibold" data-testid="repeat-prompt">
            {form.slot}
          </p>
        </div>
      ) : (
        <div className="flex items-center justify-center gap-3">
          <SpeakerButton item={{ he: form.niqqud, audio: form.audio }} label="Послушать форму" testId="repeat-form-listen" />
          <span dir="rtl" lang="he" className="font-hebrew text-4xl font-bold" data-testid="repeat-prompt">
            {form.niqqud}
          </span>
        </div>
      )}
      <div className="grid gap-2">
        {form.options.map((option) => {
          const isTarget = pick ? option.text === form.niqqud : option.id === form.id;
          const state = !answered ? "idle" : isTarget ? "right" : answered.chosen === option.id ? "wrong" : "idle";
          return (
            <button
              key={option.id}
              type="button"
              disabled={answered !== null || busy}
              data-testid="repeat-option"
              data-correct={isTarget}
              onClick={() => onChoose(option.id)}
              dir={pick ? "rtl" : undefined}
              lang={pick ? "he" : undefined}
              className={`min-h-14 rounded-control border-2 px-block font-semibold transition ${pick ? "font-hebrew text-2xl" : "text-base"} ${optionClass(state)}`}
            >
              {option.text}
            </button>
          );
        })}
      </div>
    </>
  );
}

/**
 * «Напиши на иврите»: по русскому слову набрать его на клавиатуре. Ответ уходит по кнопке «Проверить», когда набрано
 * столько букв, сколько в слове (до этого можно стирать); засчитывается первая проверка. «Не помню» — сразу ответ.
 */
function TypeQuestion({
  word,
  busy,
  answered,
  onSubmit,
  onGiveUp,
}: {
  word: RepeatWord;
  busy: boolean;
  answered: Answered | null;
  onSubmit: (typed: string) => void;
  onGiveUp: () => void;
}) {
  const target = typedLetters(word.he);
  const [typed, setTyped] = useState<string[]>([]);
  const complete = typed.length === target.length;
  const locked = busy || answered !== null;
  return (
    <>
      <div className="text-center text-3xl font-semibold" data-testid="repeat-prompt">
        {word.ru}
      </div>
      <div
        dir="rtl"
        lang="he"
        data-testid="typed"
        className={`flex min-h-16 items-center justify-center rounded-card border-2 bg-surface px-block font-hebrew text-4xl font-bold ${
          answered ? (answered.correct ? "border-success text-success" : "border-danger text-danger") : "border-line"
        }`}
      >
        {typed.join("") || <span className="text-xl font-normal text-ink-soft">{`Букв в слове: ${target.length}`}</span>}
      </div>
      {!answered && (
        <>
          <HebrewKeyboard
            geresh={target.includes(GERESH)}
            onKey={(letter) => !locked && setTyped((prev) => (prev.length < target.length ? [...prev, letter] : prev))}
            onBackspace={() => !locked && setTyped((prev) => prev.slice(0, -1))}
          />
          <div className="grid grid-cols-2 gap-2">
            <Button variant="ghost" disabled={locked} onClick={onGiveUp} data-testid="repeat-give-up">
              Не помню
            </Button>
            <Button disabled={!complete || locked} onClick={() => onSubmit(typed.join(""))} data-testid="repeat-check">
              Проверить
            </Button>
          </div>
        </>
      )}
    </>
  );
}

function Feedback({ answered, word }: { answered: Answered; word: RepeatWord }) {
  const form = answered.question.form;
  return (
    <div
      role="status"
      data-testid="repeat-feedback"
      data-correct={answered.correct}
      className={`flex items-center gap-3 rounded-control p-3 ${answered.correct ? "bg-success-soft" : "bg-danger-soft"}`}
    >
      <SpeakerButton
        item={form ? { he: form.niqqud, audio: form.audio } : word}
        label={form ? "Послушать правильную форму" : "Послушать слово"}
        testId="repeat-feedback-listen"
      />
      <div className="min-w-0 flex-1">
        <div className={`flex items-center gap-1 font-semibold ${answered.correct ? "text-success" : "text-danger"}`}>
          {answered.correct ? <CheckCircle2 className="size-icon" aria-hidden /> : <XCircle className="size-icon" aria-hidden />}
          {answered.correct ? "Вспомнили!" : "Не вспомнили"}
        </div>
        {form ? (
          <div className="text-sm">
            <div className="text-ink-soft">
              {word.ru}: {form.slot}
            </div>
            <span dir="rtl" lang="he" className="font-hebrew text-lg">
              {form.niqqud}
            </span>{" "}
            <span className="text-accent">[{form.translit}]</span>
          </div>
        ) : (
          <div className="text-sm">
            <span dir="rtl" lang="he" className="font-hebrew text-lg">
              {word.he}
            </span>{" "}
            <span className="text-accent">[{word.translit}]</span> — {word.ru}
          </div>
        )}
        {answered.dueIn >= 0 && <div className="text-sm text-ink-soft">{returnsText(answered.dueIn)}</div>}
      </div>
    </div>
  );
}

function RepeatResult({
  answered,
  words,
  moreDue,
  play,
  onAgain,
  onDrill,
  onWords,
  onBack,
}: {
  answered: Answered[];
  words: Record<string, RepeatWord>;
  moreDue: number;
  play: { newBadges: string[]; goalMet: boolean };
  onAgain: () => void;
  onDrill: () => void;
  onWords: () => void;
  onBack: () => void;
}) {
  const right = answered.filter((a) => a.correct).length;
  const forgotten = answered.filter((a) => !a.correct);
  const [celebrating, setCelebrating] = useState(play.newBadges.length > 0 || play.goalMet);
  return (
    <main className="mx-auto flex max-w-md flex-col gap-block p-block pb-section">
      <Card className="flex flex-col items-center gap-2 text-center" data-testid="repeat-result">
        <div className="text-4xl font-bold" data-testid="repeat-score">
          {right} из {answered.length}
        </div>
        <p className="font-semibold">{repeatVerdict(right, answered.length)}</p>
      </Card>
      {forgotten.length > 0 && (
        <Card className="flex flex-col gap-2" data-testid="repeat-forgotten">
          <h2 className="font-semibold">Вернутся завтра</h2>
          {forgotten.map(({ question }) => {
            const w = words[question.wordId]!;
            const form = question.form;
            return (
              <div key={w.id} className="flex items-center gap-2 border-t border-line pt-2">
                <SpeakerButton item={form ? { he: form.niqqud, audio: form.audio } : w} label={`Послушать: ${w.ru}`} />
                <div className="min-w-0 flex-1 text-sm">
                  <div>{form ? `${w.ru}: ${form.slot}` : w.ru}</div>
                  <div className="text-accent">[{form ? form.translit : w.translit}]</div>
                </div>
                <span dir="rtl" lang="he" className="font-hebrew text-2xl">
                  {form ? form.niqqud : w.he}
                </span>
              </div>
            );
          })}
        </Card>
      )}
      {forgotten.length > 0 && (
        <Button onClick={onDrill} data-testid="repeat-drill">
          Ещё раз: забытые ({forgotten.length})
        </Button>
      )}
      {moreDue > 0 && (
        <Button variant={forgotten.length > 0 ? "secondary" : "primary"} onClick={onAgain} data-testid="repeat-again">
          Ещё подход (осталось {wordsCount(moreDue)})
        </Button>
      )}
      <Button variant="secondary" onClick={onWords} data-testid="repeat-words">
        Мои слова
      </Button>
      <Button variant="ghost" onClick={onBack} data-testid="repeat-home">
        На главную
      </Button>
      {celebrating && <CelebrationSheet badgeIds={play.newBadges} goalMet={play.goalMet} onClose={() => setCelebrating(false)} />}
    </main>
  );
}

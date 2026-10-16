import { useCallback, useEffect, useState } from "react";
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
import { Header } from "../components/Header";
import { HebrewKeyboard } from "../components/HebrewKeyboard";
import { ListenButton } from "../components/ListenButton";
import { SpeakerButton } from "../components/SpeakerButton";
import { CelebrationSheet } from "../components/play";
import { Button, Card, Notice } from "../components/ui";
import { haptic } from "../lib/haptic";
import { repeatCardText, repeatVerdict, returnsText, wordsCount } from "../lib/repeat";
import { useBackButton } from "../lib/useBackButton";

type Load = { kind: "loading" } | { kind: "error" } | { kind: "ready"; session: RepeatSessionResponse };

/**
 * Подход «Повторить»: до 10 слов, которые пора повторить, по одному упражнению на слово (выбор или набор).
 * Каждый ответ сразу уходит на сервер: он проверяет ответ, двигает слово по коробкам и засчитывает его в цель дня.
 */
export function Repeat({ onBack, onWords }: { onBack: () => void; onWords: () => void }) {
  const [load, setLoad] = useState<Load>({ kind: "loading" });
  /** Номер подхода: «Ещё подход» собирает новый с сервера. */
  const [round, setRound] = useState(0);
  useBackButton(onBack);

  useEffect(() => {
    let alive = true;
    setLoad({ kind: "loading" });
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
  return <RepeatRun key={round} session={session} onBack={onBack} onWords={onWords} onAgain={() => setRound((r) => r + 1)} />;
}

interface Answered {
  question: RepeatQuestion;
  correct: boolean;
  dueIn: number;
  chosen?: string;
}

function RepeatRun({
  session,
  onBack,
  onWords,
  onAgain,
}: {
  session: RepeatSessionResponse;
  onBack: () => void;
  onWords: () => void;
  onAgain: () => void;
}) {
  const { invalidate } = useApp();
  const total = session.questions.length;
  const [index, setIndex] = useState(0);
  const [answered, setAnswered] = useState<Answered[]>([]);
  const [current, setCurrent] = useState<Answered | null>(null);
  const [sending, setSending] = useState(false);
  const [failed, setFailed] = useState<RepeatAnswerRequest | null>(null);
  /** Бейджи и цель дня за подход: поздравление в конце, чтобы не прерывать повторение. */
  const [play, setPlay] = useState<{ newBadges: string[]; goalMet: boolean }>({ newBadges: [], goalMet: false });

  const question = session.questions[index];
  const finished = index >= total;

  const send = useCallback(
    async (body: RepeatAnswerRequest, chosen?: string) => {
      const q = session.questions[index]!;
      setSending(true);
      setFailed(null);
      try {
        const res: RepeatAnswerResponse = await api.repeatAnswer(body);
        setCurrent({ question: q, correct: res.correct, dueIn: res.dueIn, chosen });
        mergePlay(setPlay, res.play);
        invalidate();
        haptic(res.correct ? "success" : "light");
      } catch (e) {
        if (e instanceof ApiError && e.status === 409) {
          // Слово уже повторено (например, в другом окне): показываем ответ без записи и идём дальше.
          const correct = body.giveUp ? false : q.type === "type" ? body.typed === typedLetters(session.words[q.wordId]!.he).join("") : body.choice === q.wordId;
          setCurrent({ question: q, correct, dueIn: -1, chosen });
        } else {
          setFailed(body);
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
          onWords={onWords}
          onBack={onBack}
        />
      </>
    );
  }

  const word = session.words[question!.wordId]!;
  return (
    <>
      <Header title="Повторение" subtitle={REPEAT_TYPE_TITLES[question!.type]} onBack={onBack} />
      <main className="mx-auto flex max-w-md flex-col gap-block p-block pb-section">
        <div data-testid="repeat-progress">
          <div className="mb-1 text-sm text-ink-soft">
            Слово {index + 1} из {total}
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-line" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={index}>
            <div className="h-full bg-accent transition-all" style={{ width: `${(index / total) * 100}%` }} />
          </div>
        </div>
        <Card className="flex flex-col gap-block" data-testid="repeat-question" data-type={question!.type}>
          {question!.type === "type" ? (
            <TypeQuestion
              key={index}
              word={word}
              busy={sending}
              answered={current}
              onSubmit={(typed) => void send({ wordId: word.id, type: "type", typed })}
              onGiveUp={() => void send({ wordId: word.id, type: "type", giveUp: true })}
            />
          ) : (
            <ChoiceQuestion
              question={question!}
              words={session.words}
              busy={sending}
              answered={current}
              onChoose={(choice) => void send({ wordId: word.id, type: question!.type, choice }, choice)}
            />
          )}
          {failed && (
            <div className="flex flex-col gap-2" role="alert">
              <p className="text-center font-semibold text-danger">Ответ не отправлен: нет связи с сервером.</p>
              <Button variant="secondary" onClick={() => void send(failed, failed.choice)} data-testid="repeat-retry">
                Отправить ещё раз
              </Button>
            </div>
          )}
          {current && (
            <>
              <Feedback answered={current} word={word} />
              <Button onClick={next} data-testid="repeat-next">
                {index === total - 1 ? "Итог" : "Дальше"}
              </Button>
            </>
          )}
        </Card>
        <p className="text-center text-sm text-ink-soft">Повторённые слова идут в цель дня.</p>
      </main>
    </>
  );
}

function mergePlay(set: (f: (p: { newBadges: string[]; goalMet: boolean }) => { newBadges: string[]; goalMet: boolean }) => void, event: PlayEvent) {
  set((p) => ({ newBadges: [...p.newBadges, ...event.newBadges.filter((id) => !p.newBadges.includes(id))], goalMet: p.goalMet || event.goalMet }));
}

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
              className={`min-h-14 rounded-control border-2 px-block text-lg font-semibold transition ${toHebrew ? "font-hebrew text-2xl" : ""} ${
                state === "right"
                  ? "border-success bg-success-soft text-success"
                  : state === "wrong"
                    ? "border-danger bg-danger-soft text-danger"
                    : "border-line bg-surface active:bg-accent-soft"
              }`}
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
  return (
    <div
      role="status"
      data-testid="repeat-feedback"
      data-correct={answered.correct}
      className={`flex items-center gap-3 rounded-control p-3 ${answered.correct ? "bg-success-soft" : "bg-danger-soft"}`}
    >
      <SpeakerButton item={word} label="Послушать слово" testId="repeat-feedback-listen" />
      <div className="min-w-0 flex-1">
        <div className={`flex items-center gap-1 font-semibold ${answered.correct ? "text-success" : "text-danger"}`}>
          {answered.correct ? <CheckCircle2 className="size-icon" aria-hidden /> : <XCircle className="size-icon" aria-hidden />}
          {answered.correct ? "Вспомнили!" : "Не вспомнили"}
        </div>
        <div className="text-sm">
          <span dir="rtl" lang="he" className="font-hebrew text-lg">
            {word.he}
          </span>{" "}
          <span className="text-accent">[{word.translit}]</span> — {word.ru}
        </div>
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
  onWords,
  onBack,
}: {
  answered: Answered[];
  words: Record<string, RepeatWord>;
  moreDue: number;
  play: { newBadges: string[]; goalMet: boolean };
  onAgain: () => void;
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
            return (
              <div key={w.id} className="flex items-center gap-2 border-t border-line pt-2">
                <SpeakerButton item={w} label={`Послушать: ${w.ru}`} />
                <div className="min-w-0 flex-1 text-sm">
                  <div>{w.ru}</div>
                  <div className="text-accent">[{w.translit}]</div>
                </div>
                <span dir="rtl" lang="he" className="font-hebrew text-2xl">
                  {w.he}
                </span>
              </div>
            );
          })}
        </Card>
      )}
      {moreDue > 0 && (
        <Button onClick={onAgain} data-testid="repeat-again">
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

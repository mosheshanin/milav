import { useCallback, useEffect, useMemo, useState } from "react";
import { Lock, PartyPopper } from "lucide-react";
import {
  isAlphabetLesson,
  isLetter,
  lessonItems,
  stagesFor,
  type AnyLesson,
  type Letter,
  type PlayEvent,
  type Stage,
  type StageProof,
  type Word,
  type WordProgress,
} from "@milav/shared";
import { ApiError, api, type SpeechResponse } from "../api";
import { useApp } from "../AppContext";
import { Header } from "../components/Header";
import { LessonGate } from "../components/LessonGate";
import { PlayToast, eventHasNews } from "../components/play";
import { ReminderOffer } from "../components/ReminderOffer";
import { LetterCard } from "../components/LetterCard";
import { ListenButton } from "../components/ListenButton";
import { SpeakRecorder } from "../components/SpeakRecorder";
import { StageTabs } from "../components/StageTabs";
import { TypeWord } from "../components/TypeWord";
import { WordCard } from "../components/WordCard";
import { WriteWord } from "../components/WriteWord";
import { Button, Card, Notice } from "../components/ui";
import { saveErrorText } from "../lib/apiErrors";
import { playLetterExample, playLetterName } from "../lib/audio";
import { practiceWords } from "@milav/shared";
import { useBackButton } from "../lib/useBackButton";

type View = Stage | "end";

function firstOpenStage(stages: readonly Stage[], p: WordProgress, skippedSpeak: boolean): View {
  return stages.find((s) => !p[s] && !(s === "speak" && skippedSpeak)) ?? "end";
}

interface StudyProps {
  onBack: () => void;
  onQuiz: () => void;
  /** Открыть практику форм (только в уроках с глаголами). */
  onPractice: () => void;
}

/** Изучение урока: слова урока приходят с сервера (LessonGate), затем карточка и этапы. */
export function Study({ lessonId, ...props }: StudyProps & { lessonId: string }) {
  return (
    <LessonGate lessonId={lessonId} onBack={props.onBack}>
      {(lesson) => <StudyLesson lesson={lesson} {...props} />}
    </LessonGate>
  );
}

/** Карточка и четыре этапа слова или три этапа буквы (алфавит, без «говори»). */
function StudyLesson({ lesson, onBack, onQuiz, onPractice }: StudyProps & { lesson: AnyLesson }) {
  const items = lessonItems(lesson);
  const stages = stagesFor(lesson);
  const alphabet = isAlphabetLesson(lesson);
  const { me, setPoints, invalidate } = useApp();
  // Кнопка «назад» Telegram (и системная, и свайп) возвращает к списку уроков.
  useBackButton(onBack);
  const [progress, setProgress] = useState<WordProgress[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [index, setIndex] = useState(0);
  const [view, setView] = useState<View>("listen");
  const [skipped, setSkipped] = useState<ReadonlySet<string>>(new Set());
  const [busy, setBusy] = useState(false);
  /** Текст ошибки сохранения этапа (null, если всё в порядке). */
  const [saveError, setSaveError] = useState<string | null>(null);
  const [justEarned, setJustEarned] = useState(false);
  /** Новости геймификации после слова: бейдж или цель дня. */
  const [toast, setToast] = useState<PlayEvent | null>(null);
  /** Предложить напоминания: после выученного слова, один раз за открытие урока (сервер решает, можно ли). */
  const [offer, setOffer] = useState<"none" | "pending" | "done">("none");

  useEffect(() => {
    api.lessonProgress(lesson.id).then(
      (res) => {
        setProgress(res.words);
        const firstOpen = res.words.findIndex((w) => !w.completed);
        const i = firstOpen === -1 ? 0 : firstOpen;
        setIndex(i);
        setView(res.words[i] ? firstOpenStage(stages, res.words[i], false) : "listen");
      },
      (e) => setLoadError(e instanceof ApiError ? e.code : "network"),
    );
  }, [lesson, stages]);

  const word = items[index];
  const current = progress?.[index];

  const replace = useCallback(
    (next: WordProgress, points?: number) => {
      setProgress((prev) => prev?.map((p) => (p.wordId === next.wordId ? next : p)) ?? prev);
      if (points !== undefined) {
        setPoints(points);
        // Ритм недели и цель дня могли измениться: главная перечитает профиль.
        invalidate();
      }
    },
    [setPoints, invalidate],
  );

  const selectWord = useCallback(
    (i: number) => {
      const p = progress?.[i];
      if (!p || !items[i]) return;
      setIndex(i);
      setJustEarned(false);
      setSaveError(null);
      setView(firstOpenStage(stages, p, skipped.has(p.wordId)));
    },
    [progress, items, stages, skipped],
  );

  const advance = useCallback(
    (from: Stage, next: WordProgress, skippedSpeak: boolean) => {
      const after = stages.slice(stages.indexOf(from) + 1).find((s) => !next[s] && !(s === "speak" && skippedSpeak));
      setView(after ?? "end");
    },
    [stages],
  );

  const saveStage = useCallback(
    async (proof: StageProof) => {
      if (!word || busy) return;
      setBusy(true);
      setSaveError(null);
      try {
        const res = await api.stage(word.id, proof);
        replace(res.progress, res.points);
        if (res.pointsAwarded > 0) setJustEarned(true);
        if (res.pointsAwarded > 0 && me.reminders?.offer && offer === "none") setOffer("pending");
        if (eventHasNews(res.play)) setToast(res.play);
        advance(proof.stage, res.progress, skipped.has(word.id));
      } catch (e) {
        setSaveError(saveErrorText(e));
      } finally {
        setBusy(false);
      }
    },
    [word, busy, replace, advance, skipped, me.reminders?.offer, offer],
  );

  const onSpeakPassed = useCallback(
    (res: SpeechResponse) => {
      if (!word || !res.progress) return;
      replace(res.progress, res.points);
      if (res.pointsAwarded) setJustEarned(true);
      if (res.pointsAwarded && me.reminders?.offer && offer === "none") setOffer("pending");
      if (eventHasNews(res.play)) setToast(res.play);
      advance("speak", res.progress, skipped.has(word.id));
    },
    [word, replace, advance, skipped, me.reminders?.offer, offer],
  );

  const onSpeakSkipped = useCallback(() => {
    if (!word || !current) return;
    setSkipped((prev) => new Set(prev).add(word.id));
    advance("speak", current, true);
  }, [word, current, advance]);

  const doneCount = useMemo(() => progress?.filter((p) => p.completed).length ?? 0, [progress]);

  if (loadError) {
    return (
      <>
        <Header title={lesson.title} onBack={onBack} />
        <Notice title={loadError === "subscription_required" ? "Урок доступен по подписке" : "Не удалось загрузить урок"}>
          {loadError === "network" && "Проверьте подключение к интернету."}
        </Notice>
      </>
    );
  }
  if (!progress || !word || !current) return <Notice title="Загрузка урока…" />;

  const isSkipped = skipped.has(word.id);
  const total = items.length;
  const allDone = doneCount === total;
  const noun = alphabet ? "букв" : "слов";
  // Практика форм: только в уроках с глаголами и только когда все слова урока пройдены.
  const hasVerbs = practiceWords(items).length > 0;

  return (
    <>
      <Header title={`Урок ${lesson.number}. ${lesson.title}`} subtitle={`${lesson.topic} · ${noun} пройдено: ${doneCount} из ${total}`} onBack={onBack} />
      <main className="mx-auto flex max-w-md flex-col gap-block p-block pb-section">
        <nav
          className={alphabet ? "flex flex-wrap justify-center gap-2" : "grid grid-cols-10 gap-1"}
          aria-label={alphabet ? "Буквы урока" : "Слова урока"}
        >
          {progress.map((p, i) => (
            <button
              key={p.wordId}
              type="button"
              onClick={() => selectWord(i)}
              aria-label={`${alphabet ? "Буква" : "Слово"} ${i + 1}`}
              aria-current={i === index}
              data-testid={`dot-${i}`}
              className={`rounded-full font-semibold ${alphabet ? "size-11 font-hebrew text-xl" : "aspect-square text-xs"} ${
                i === index ? "bg-accent text-white" : p.completed ? "bg-success-soft text-success" : "bg-line text-ink-soft"
              }`}
            >
              {alphabet ? (items[i] as Letter).he : i + 1}
            </button>
          ))}
        </nav>

        {isLetter(word) ? (
          <LetterCard letter={word} compact={view === "write" || view === "type"} />
        ) : (
          <WordCard word={word} compact={view === "write" || view === "type"} />
        )}

        <StageTabs
          stages={stages}
          progress={current}
          current={view === "end" ? "type" : view}
          skipped={isSkipped}
          onSelect={(s) => {
            setSaveError(null);
            setView(s);
          }}
        />

        <Card className="flex flex-col gap-block" key={`${word.id}-${view}`}>
          {view === "listen" && (
            <ListenStage done={current.listen} onNext={() => void saveStage({ stage: "listen" })} busy={busy} item={word} />
          )}
          {view === "speak" && (
            <>
              <p className="text-center text-ink-soft">Нажмите «Записать» и скажите слово вслух.</p>
              <SpeakRecorder
                mode="study"
                check={(audio) => api.speech(word.id, audio)}
                onPassed={onSpeakPassed}
                onGiveUp={onSpeakSkipped}
              />
            </>
          )}
          {view === "write" && (
            <WriteWord
              word={word}
              mode="study"
              doneLabel="Дальше"
              onDone={(result) => void saveStage({ stage: "write", strokes: result.letterStrokes })}
            />
          )}
          {view === "type" && <TypeWord word={word} onDone={(typed) => void saveStage({ stage: "type", typed })} />}
          {view === "end" && (
            <EndPanel
              completed={current.completed}
              justEarned={justEarned}
              hasNext={!allDone}
              allDone={allDone}
              alphabet={alphabet}
              onNext={() => selectWord(nextOpenIndex(progress, index))}
              onQuiz={onQuiz}
              onBackToSpeak={() => setView("speak")}
            />
          )}
          {saveError && (
            <p role="alert" className="text-center text-danger">
              {saveError}
            </p>
          )}
        </Card>

        {allDone ? (
          view !== "end" && (
            <Button variant="success" block onClick={onQuiz} data-testid="open-quiz">
              {alphabet ? "Все буквы пройдены. К викторине" : "Все слова пройдены. К викторине"}
            </Button>
          )
        ) : (
          <div className="rounded-card border border-dashed border-line p-block text-center text-sm text-ink-soft" data-testid="quiz-locked">
            <Lock className="mx-auto mb-1 size-icon" aria-hidden />
            <b>Викторина</b> откроется, когда {alphabet ? `все ${total} букв урока будут пройдены по ${stages.length === 2 ? "двум" : "трём"} этапам` : `все ${total} слов урока будут пройдены по четырём этапам`}.
            Сейчас: {doneCount} из {total}.
          </div>
        )}

        {allDone && hasVerbs && (
          <Button variant="ghost" block onClick={onPractice} data-testid="open-practice">
            Практика форм: тренировка без очков
          </Button>
        )}
      </main>
      {toast && <PlayToast event={toast} onDone={() => setToast(null)} />}
      {/* Предложение напоминаний ждёт, пока уйдёт уведомление о бейдже или цели дня. */}
      {offer === "pending" && !toast && <ReminderOffer onClose={() => setOffer("done")} />}
    </>
  );
}

/** Ближайшее непройденное слово после текущего (по кругу). */
function nextOpenIndex(progress: WordProgress[], from: number): number {
  for (let step = 1; step <= progress.length; step++) {
    const i = (from + step) % progress.length;
    if (!progress[i]!.completed) return i;
  }
  return from;
}

function ListenStage({
  item,
  done,
  busy,
  onNext,
}: {
  item: Word | Letter;
  done: boolean;
  busy: boolean;
  onNext: () => void;
}) {
  const [played, setPlayed] = useState(done);
  if (isLetter(item)) {
    // Название буквы нужно прослушать; слово-пример можно послушать по желанию.
    return (
      <>
        <p className="text-center text-ink-soft">Послушайте название буквы и повторите про себя. Потом послушайте слово-пример.</p>
        <ListenButton
          play={(hooks) => playLetterName(item, hooks)}
          preload={item.audio}
          label="Название буквы"
          onPlayed={() => setPlayed(true)}
        />
        <ListenButton
          play={(hooks) => playLetterExample(item, hooks)}
          preload={item.example.audio}
          label="Слово-пример"
          testId="listen-example"
        />
        <Button onClick={onNext} disabled={!played || busy} data-testid="listen-next">
          Дальше
        </Button>
      </>
    );
  }
  return (
    <>
      <p className="text-center text-ink-soft">Послушайте слово и повторите про себя.</p>
      <ListenButton word={item} onPlayed={() => setPlayed(true)} />
      <Button onClick={onNext} disabled={!played || busy} data-testid="listen-next">
        Дальше
      </Button>
    </>
  );
}

function EndPanel({
  completed,
  justEarned,
  hasNext,
  allDone,
  alphabet,
  onNext,
  onQuiz,
  onBackToSpeak,
}: {
  completed: boolean;
  justEarned: boolean;
  hasNext: boolean;
  allDone: boolean;
  alphabet: boolean;
  onNext: () => void;
  onQuiz: () => void;
  onBackToSpeak: () => void;
}) {
  if (!completed) {
    return (
      <>
        <p className="text-center">Слово засчитается, когда вы пройдёте все четыре этапа. Осталось вернуться к этапу «Говори».</p>
        <Button onClick={onBackToSpeak}>Вернуться к «Говори»</Button>
      </>
    );
  }
  return (
    <>
      <div className="flex flex-col items-center gap-2 text-center" data-testid="word-complete">
        <PartyPopper className="size-icon-lg text-brand-orange" aria-hidden />
        <p className="font-semibold">{alphabet ? "Буква пройдена" : "Слово пройдено"}{justEarned ? ": +1 очко" : ""}</p>
      </div>
      {allDone ? (
        <Button variant="success" onClick={onQuiz} data-testid="to-quiz">
          {alphabet ? "Все буквы пройдены. К викторине" : "Все слова пройдены. К викторине"}
        </Button>
      ) : (
        hasNext && (
          <Button onClick={onNext} data-testid="next-word">
            {alphabet ? "Следующая буква" : "Следующее слово"}
          </Button>
        )
      )}
    </>
  );
}

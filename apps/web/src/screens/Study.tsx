import { useCallback, useEffect, useMemo, useState } from "react";
import { PartyPopper } from "lucide-react";
import { getLesson } from "@milav/content";
import { STAGES, WORDS_PER_LESSON, type Stage, type WordProgress } from "@milav/shared";
import { ApiError, api, type SpeechResponse } from "../api";
import { useApp } from "../AppContext";
import { Header } from "../components/Header";
import { ListenButton } from "../components/ListenButton";
import { SpeakRecorder } from "../components/SpeakRecorder";
import { StageTabs } from "../components/StageTabs";
import { TypeWord } from "../components/TypeWord";
import { WordCard } from "../components/WordCard";
import { WriteWord } from "../components/WriteWord";
import { Button, Card, Notice } from "../components/ui";

type View = Stage | "end";

function firstOpenStage(p: WordProgress, skippedSpeak: boolean): View {
  return STAGES.find((s) => !p[s] && !(s === "speak" && skippedSpeak)) ?? "end";
}

/** Изучение слов урока: карточка и четыре этапа. */
export function Study({
  lessonId,
  onBack,
  onQuiz,
}: {
  lessonId: string;
  onBack: () => void;
  onQuiz: () => void;
}) {
  const lesson = getLesson(lessonId);
  const { setPoints } = useApp();
  const [progress, setProgress] = useState<WordProgress[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [index, setIndex] = useState(0);
  const [view, setView] = useState<View>("listen");
  const [skipped, setSkipped] = useState<ReadonlySet<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [justEarned, setJustEarned] = useState(false);

  useEffect(() => {
    if (!lesson) return;
    api.lessonProgress(lesson.id).then(
      (res) => {
        setProgress(res.words);
        const firstOpen = res.words.findIndex((w) => !w.completed);
        const i = firstOpen === -1 ? 0 : firstOpen;
        setIndex(i);
        setView(res.words[i] ? firstOpenStage(res.words[i], false) : "listen");
      },
      (e) => setLoadError(e instanceof ApiError ? e.code : "network"),
    );
  }, [lesson]);

  const word = lesson?.words[index];
  const current = progress?.[index];

  const replace = useCallback(
    (next: WordProgress, points?: number) => {
      setProgress((prev) => prev?.map((p) => (p.wordId === next.wordId ? next : p)) ?? prev);
      if (points !== undefined) setPoints(points);
    },
    [setPoints],
  );

  const selectWord = useCallback(
    (i: number) => {
      const p = progress?.[i];
      if (!p || !lesson?.words[i]) return;
      setIndex(i);
      setJustEarned(false);
      setSaveError(false);
      setView(firstOpenStage(p, skipped.has(p.wordId)));
    },
    [progress, lesson, skipped],
  );

  const advance = useCallback(
    (from: Stage, next: WordProgress, skippedSpeak: boolean) => {
      const after = STAGES.slice(STAGES.indexOf(from) + 1).find((s) => !next[s] && !(s === "speak" && skippedSpeak));
      setView(after ?? "end");
    },
    [],
  );

  const saveStage = useCallback(
    async (stage: Exclude<Stage, "speak">) => {
      if (!word || busy) return;
      setBusy(true);
      setSaveError(false);
      try {
        const res = await api.stage(word.id, stage);
        replace(res.progress, res.points);
        if (res.pointsAwarded > 0) setJustEarned(true);
        advance(stage, res.progress, skipped.has(word.id));
      } catch {
        setSaveError(true);
      } finally {
        setBusy(false);
      }
    },
    [word, busy, replace, advance, skipped],
  );

  const onSpeakPassed = useCallback(
    (res: SpeechResponse) => {
      if (!word || !res.progress) return;
      replace(res.progress, res.points);
      if (res.pointsAwarded) setJustEarned(true);
      advance("speak", res.progress, skipped.has(word.id));
    },
    [word, replace, advance, skipped],
  );

  const onSpeakSkipped = useCallback(() => {
    if (!word || !current) return;
    setSkipped((prev) => new Set(prev).add(word.id));
    advance("speak", current, true);
  }, [word, current, advance]);

  const doneCount = useMemo(() => progress?.filter((p) => p.completed).length ?? 0, [progress]);

  if (!lesson) return <Notice title="Урок не найден" />;
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
  const allDone = doneCount === WORDS_PER_LESSON;

  return (
    <>
      <Header title={`Урок ${lesson.number}. ${lesson.title}`} subtitle={`${lesson.topic} · слов пройдено: ${doneCount} из ${WORDS_PER_LESSON}`} onBack={onBack} />
      <main className="mx-auto flex max-w-md flex-col gap-block p-block pb-section">
        <nav className="grid grid-cols-10 gap-1" aria-label="Слова урока">
          {progress.map((p, i) => (
            <button
              key={p.wordId}
              type="button"
              onClick={() => selectWord(i)}
              aria-label={`Слово ${i + 1}`}
              aria-current={i === index}
              data-testid={`dot-${i}`}
              className={`aspect-square rounded-full text-xs font-semibold ${
                i === index ? "bg-accent text-white" : p.completed ? "bg-success-soft text-success" : "bg-line text-ink-soft"
              }`}
            >
              {i + 1}
            </button>
          ))}
        </nav>

        <WordCard word={word} compact={view === "write" || view === "type"} />

        <StageTabs
          progress={current}
          current={view === "end" ? "type" : view}
          skipped={isSkipped}
          onSelect={(s) => {
            setSaveError(false);
            setView(s);
          }}
        />

        <Card className="flex flex-col gap-block" key={`${word.id}-${view}`}>
          {view === "listen" && (
            <ListenStage done={current.listen} onNext={() => void saveStage("listen")} busy={busy} word={word} />
          )}
          {view === "speak" && (
            <>
              <p className="text-center text-ink-soft">Нажмите «Записать» и скажите слово вслух.</p>
              <SpeakRecorder word={word} mode="study" onPassed={onSpeakPassed} onGiveUp={onSpeakSkipped} />
            </>
          )}
          {view === "write" && (
            <WriteWord word={word} mode="study" doneLabel="Дальше" onDone={() => void saveStage("write")} />
          )}
          {view === "type" && <TypeWord word={word} onDone={() => void saveStage("type")} />}
          {view === "end" && (
            <EndPanel
              completed={current.completed}
              justEarned={justEarned}
              hasNext={!allDone}
              allDone={allDone}
              onNext={() => selectWord(nextOpenIndex(progress, index))}
              onQuiz={onQuiz}
              onBackToSpeak={() => setView("speak")}
            />
          )}
          {saveError && (
            <p role="alert" className="text-center text-danger">
              Не удалось сохранить результат. Проверьте интернет и нажмите ещё раз.
            </p>
          )}
        </Card>

        {allDone && view !== "end" && (
          <Button variant="success" block onClick={onQuiz}>
            Все слова пройдены. К викторине
          </Button>
        )}
      </main>
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
  word,
  done,
  busy,
  onNext,
}: {
  word: Parameters<typeof ListenButton>[0]["word"];
  done: boolean;
  busy: boolean;
  onNext: () => void;
}) {
  const [played, setPlayed] = useState(done);
  return (
    <>
      <p className="text-center text-ink-soft">Послушайте слово и повторите про себя.</p>
      <ListenButton word={word} onPlayed={() => setPlayed(true)} />
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
  onNext,
  onQuiz,
  onBackToSpeak,
}: {
  completed: boolean;
  justEarned: boolean;
  hasNext: boolean;
  allDone: boolean;
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
        <p className="font-semibold">Слово пройдено{justEarned ? ": +1 очко" : ""}</p>
      </div>
      {allDone ? (
        <Button variant="success" onClick={onQuiz} data-testid="to-quiz">
          Все слова пройдены. К викторине
        </Button>
      ) : (
        hasNext && (
          <Button onClick={onNext} data-testid="next-word">
            Следующее слово
          </Button>
        )
      )}
    </>
  );
}

import { useEffect, useRef, useState } from "react";
import { CheckCircle2, ChevronRight, Lock } from "lucide-react";
import { alphabetLessons, allLessons, lessons } from "@milav/content";
import {
  ALPHABET_GROUPS,
  ALPHABET_TITLE,
  SECTION_TITLES,
  STAGE_TITLES,
  isAlphabetLesson,
  lessonItems,
  type AnyLesson,
  type Lesson,
  type Section,
} from "@milav/shared";
import { api, type LessonProgressResponse } from "../api";
import { useApp } from "../AppContext";
import { Header } from "../components/Header";
import { CelebrationSheet, GoalRing, StatusPathBar, WeekDots } from "../components/play";
import { Button, Card, Chip } from "../components/ui";
import { dismissRecap, plural, recapDismissed } from "../lib/play";
import { findResume } from "../lib/resume";

const SECTIONS: Section[] = ["nouns", "verbs", "adjectives"];

/** Уроки: сначала алфавит (с него начинает новичок), потом разделы и темы. */
export function Home({
  onOpen,
  onOpenQuiz,
  onAchievements,
  onLeaderboard,
}: {
  onOpen: (lessonId: string) => void;
  onOpenQuiz: (lessonId: string) => void;
  onAchievements: () => void;
  onLeaderboard: () => void;
}) {
  const { me, refreshIfStale } = useApp();
  const [recapHidden, setRecapHidden] = useState(false);
  /** Бейджи, о которых человек ещё не знает (найдены при пересчёте или потеряны уведомления). */
  const [unseen, setUnseen] = useState<{ ids: string[]; retro: boolean } | null>(null);
  const unseenChecked = useRef(false);

  // Ритм и цель дня могли измениться в уроке: при возврате на главную профиль перечитывается, если он устарел.
  useEffect(() => {
    void refreshIfStale();
  }, [refreshIfStale]);

  // Непросмотренные бейджи показываем один раз за открытие приложения.
  useEffect(() => {
    if (unseenChecked.current || me.play.unseenBadges === 0) return;
    unseenChecked.current = true;
    api.achievements().then(
      (res) => {
        const fresh = res.earned.filter((e) => !e.seen);
        if (fresh.length > 0) setUnseen({ ids: fresh.map((e) => e.id), retro: fresh.every((e) => e.retro) });
      },
      () => undefined,
    );
  }, [me.play.unseenBadges]);
  const [progress, setProgress] = useState<Record<string, LessonProgressResponse>>({});
  /** Сколько запросов прогресса завершилось (успешно или нет). */
  const [settled, setSettled] = useState(0);
  const freeLessons = allLessons.filter((l) => l.free);

  // Прогресс запрашивается только по доступным урокам.
  useEffect(() => {
    let alive = true;
    for (const lesson of allLessons.filter((l) => l.free)) {
      api.lessonProgress(lesson.id).then(
        (p) => alive && setProgress((prev) => ({ ...prev, [lesson.id]: p })),
        () => undefined,
      ).finally(() => alive && setSettled((n) => n + 1));
    }
    return () => {
      alive = false;
    };
  }, []);

  // Кнопка «Продолжить» появляется, когда прогресс по всем бесплатным урокам загружен: иначе она бы «прыгала».
  const resume = settled >= freeLessons.length ? findResume(allLessons, progress) : null;
  const resumeLesson = resume ? allLessons.find((l) => l.id === resume.lessonId) : undefined;
  const resumeLetters = resumeLesson ? isAlphabetLesson(resumeLesson) : false;

  return (
    <>
      <Header title="Milav" subtitle={`${me.status.name} · сдано уроков: ${me.passedLessons}`} onStatus={onAchievements} />
      <main className="mx-auto flex max-w-md flex-col gap-section p-block pb-section">
        {me.play.recap && !recapHidden && !recapDismissed(me.play.recap.weekIdx) && (
          <Card className="flex items-start gap-3" data-testid="recap">
            <div className="flex-1">
              <div className="font-semibold">Итоги прошлой недели</div>
              <div className="text-sm text-ink-soft">
                Выучено {me.play.recap.words} {plural(me.play.recap.words, "слово", "слова", "слов")}, дней занятий:{" "}
                {me.play.recap.days}.
              </div>
            </div>
            <button
              type="button"
              className="min-h-10 px-2 text-sm font-semibold text-accent"
              data-testid="recap-close"
              onClick={() => {
                dismissRecap(me.play.recap!.weekIdx);
                setRecapHidden(true);
              }}
            >
              Понятно
            </button>
          </Card>
        )}
        <Card className="flex flex-col gap-block" data-testid="my-path">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold">Мой путь</h2>
            <button
              type="button"
              onClick={onAchievements}
              data-testid="open-achievements"
              className="min-h-10 px-2 font-semibold text-accent"
            >
              Достижения{me.play.unseenBadges > 0 ? ` (+${me.play.unseenBadges})` : ""}
            </button>
          </div>
          <StatusPathBar path={me.play.statusPath} />
          <WeekDots week={me.play.week} />
          {me.play.goal && (
            <div className="flex items-center gap-3" data-testid="home-goal">
              <GoalRing done={me.play.goal.done} target={me.play.goal.target} />
              <div className="text-sm">
                <div className="font-semibold">Цель дня</div>
                <div className="text-ink-soft">
                  {me.play.goal.met ? "Выполнена!" : `Слов сегодня: ${me.play.goal.done} из ${me.play.goal.target}`}
                </div>
              </div>
            </div>
          )}
          {me.play.features.leaderboard && (
            <Button variant="ghost" block onClick={onLeaderboard} data-testid="open-leaderboard">
              Таблица лидеров
            </Button>
          )}
        </Card>
        {resume && resumeLesson && (
          <Card className="flex flex-col gap-3" >
            <div>
              <div className="text-sm text-ink-soft">
                {resume.kind === "quiz"
                  ? resumeLetters
                    ? "Все буквы пройдены"
                    : "Все слова пройдены"
                  : resume.started
                    ? "Вы остановились здесь"
                    : "Начните с первого урока"}
              </div>
              <div className="font-semibold">
                {resumeLetters ? `Алфавит. Урок ${resumeLesson.number}.` : `Урок ${resumeLesson.number}.`} {resumeLesson.title}
              </div>
              {resume.kind === "word" && (
                <div className="text-ink-soft" data-testid="continue-place">
                  {resumeLetters ? "Буква" : "Слово"} {resume.wordIndex + 1} из {lessonItems(resumeLesson).length}, этап «
                  {STAGE_TITLES[resume.stage]}»
                </div>
              )}
            </div>
            <Button
              block
              data-testid="continue"
              onClick={() => (resume.kind === "quiz" ? onOpenQuiz(resume.lessonId) : onOpen(resume.lessonId))}
            >
              {resume.kind === "quiz" ? "К викторине" : resume.started ? "Продолжить" : "Начать"}
            </Button>
          </Card>
        )}
        <section className="flex flex-col gap-block" data-testid="alphabet-section">
          <h2 className="text-lg font-bold">{ALPHABET_TITLE}</h2>
          <p className="text-sm text-ink-soft">
            27 форм букв иврита, включая 5 конечных: послушайте, напишите и наберите каждую. Весь алфавит бесплатный.
          </p>
          <div className="flex flex-col gap-2">
            {alphabetLessons.map((lesson) => (
              <LessonRow key={lesson.id} lesson={lesson} progress={progress[lesson.id]} onOpen={onOpen} />
            ))}
          </div>
          {alphabetLessons.length < ALPHABET_GROUPS.length && (
            <p className="text-ink-soft">Остальные уроки алфавита скоро появятся.</p>
          )}
        </section>
        {SECTIONS.map((section) => {
          const inSection = lessons.filter((l) => l.section === section);
          return (
            <section key={section} className="flex flex-col gap-block">
              <h2 className="text-lg font-bold">{SECTION_TITLES[section]}</h2>
              {inSection.length === 0 && <p className="text-ink-soft">Скоро здесь появятся уроки.</p>}
              {topicsOf(inSection).map(([topic, items]) => (
                <div key={topic} className="flex flex-col gap-2">
                  <h3 className="font-semibold text-ink-soft">{topic}</h3>
                  {items.map((lesson) => (
                    <LessonRow key={lesson.id} lesson={lesson} progress={progress[lesson.id]} onOpen={onOpen} />
                  ))}
                </div>
              ))}
            </section>
          );
        })}
      </main>
      {unseen && (
        <CelebrationSheet
          badgeIds={unseen.ids}
          title={unseen.retro ? `Мы нашли ${unseen.ids.length} ${plural(unseen.ids.length, "ваше достижение", "ваших достижения", "ваших достижений")}` : undefined}
          onClose={() => {
            setUnseen(null);
            void refreshIfStale();
          }}
        />
      )}
    </>
  );
}

function topicsOf(items: Lesson[]): [string, Lesson[]][] {
  const map = new Map<string, Lesson[]>();
  for (const lesson of items) map.set(lesson.topic, [...(map.get(lesson.topic) ?? []), lesson]);
  return [...map.entries()].map(([topic, list]) => [topic, list.sort((a, b) => a.number - b.number)]);
}

function LessonRow({
  lesson,
  progress,
  onOpen,
}: {
  lesson: AnyLesson;
  progress?: LessonProgressResponse;
  onOpen: (id: string) => void;
}) {
  const items = lessonItems(lesson);
  const letters = isAlphabetLesson(lesson);
  const done = progress?.words.filter((w) => w.completed).length ?? 0;
  const passed = progress?.quiz.passed ?? false;
  return (
    <Card className="p-0">
      <button
        type="button"
        onClick={() => onOpen(lesson.id)}
        data-testid={`lesson-${lesson.id}`}
        className="flex w-full items-center gap-3 rounded-card p-block text-left active:bg-page"
      >
        <div className="min-w-0 flex-1">
          <div className="font-semibold">
            Урок {lesson.number}. {lesson.title}
          </div>
          {isAlphabetLesson(lesson) && (
            <div dir="rtl" lang="he" className="font-hebrew text-xl text-ink-soft">
              {lesson.letters.map((l) => l.he).join(" ")}
            </div>
          )}
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <Chip tone={done === items.length ? "success" : "neutral"}>
              {letters ? "Букв" : "Слов"}: {done} из {items.length}
            </Chip>
            {!passed && done === items.length && <Chip tone="accent">Викторина открыта</Chip>}
            {passed && (
              <Chip tone="success">
                <CheckCircle2 className="size-4" aria-hidden />
                Сдан
              </Chip>
            )}
            {!lesson.free && (
              <Chip tone="accent">
                <Lock className="size-4" aria-hidden />
                Подписка
              </Chip>
            )}
          </div>
        </div>
        <ChevronRight className="size-icon text-ink-soft" aria-hidden />
      </button>
    </Card>
  );
}

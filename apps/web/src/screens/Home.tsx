import { useEffect, useRef, useState, type ReactNode } from "react";
import { CheckCircle2, ChevronDown, ChevronRight, Lock } from "lucide-react";
import {
  ALPHABET_GROUPS,
  ALPHABET_TITLE,
  SECTION_TITLES,
  STAGE_TITLES,
  type LessonMeta,
  type Section,
} from "@milav/shared";
import { api, type LessonProgressResponse } from "../api";
import { useApp } from "../AppContext";
import { Header } from "../components/Header";
import { prefetchLesson } from "../components/LessonGate";
import { CelebrationSheet, GoalRing, StatusPathBar, WeekDots } from "../components/play";
import { Button, Card, Chip } from "../components/ui";
import { lessonEmoji, topicEmoji } from "../lib/homeEmoji";
import { loadOpen, saveOpen, sectionKey, toggled, topicKey } from "../lib/homeFold";
import { alphabetMetas, lessonMetas, wordMetas } from "../lib/lessons";
import { dismissRecap, plural, recapDismissed } from "../lib/play";
import { findResume } from "../lib/resume";

const SECTIONS: Section[] = ["nouns", "verbs", "adjectives"];

type Progress = Record<string, LessonProgressResponse>;

/** Карточка раздела без внутреннего отступа: отступы задают заголовок и список внутри. */
const FOLD_CARD = "rounded-card border border-line bg-surface";

/** Уроки: сначала алфавит (с него начинает новичок), потом разделы и темы. Разделы и темы сворачиваются. */
export function Home({
  onOpen,
  onOpenQuiz,
  onAchievements,
  onLeaderboard,
  onSettings,
}: {
  onOpen: (lessonId: string) => void;
  onOpenQuiz: (lessonId: string) => void;
  onAchievements: () => void;
  onLeaderboard: () => void;
  onSettings: () => void;
}) {
  const { me, refreshIfStale } = useApp();
  const [recapHidden, setRecapHidden] = useState(false);
  /** Бейджи, о которых человек ещё не знает (найдены при пересчёте или потеряны уведомления). */
  const [unseen, setUnseen] = useState<{ ids: string[]; retro: boolean } | null>(null);
  const unseenChecked = useRef(false);
  /** Развёрнутые разделы и темы (по умолчанию всё свёрнуто, состояние запоминается на устройстве). */
  const [open, setOpen] = useState<Set<string>>(loadOpen);
  const toggle = (key: string) =>
    setOpen((prev) => {
      const next = toggled(prev, key);
      saveOpen(next);
      return next;
    });

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
  const [progress, setProgress] = useState<Progress>({});
  /** Запрос прогресса завершился (успешно или нет). */
  const [settled, setSettled] = useState(false);

  // Прогресс всех доступных уроков приходит одним запросом (/api/home).
  useEffect(() => {
    let alive = true;
    api.home().then(
      (res) => alive && setProgress(res.lessons),
      () => undefined,
    ).finally(() => alive && setSettled(true));
    return () => {
      alive = false;
    };
  }, []);

  // Кнопка «Продолжить» появляется, когда прогресс загружен: иначе она бы «прыгала».
  const resume = settled ? findResume(lessonMetas, progress) : null;
  const resumeLesson = resume ? lessonMetas.find((l) => l.id === resume.lessonId) : undefined;
  const resumeLetters = resumeLesson?.section === "alphabet";

  // Урок, который предлагает «Продолжить», подгружается заранее: по нажатию он откроется без ожидания.
  const resumeId = resume?.lessonId;
  useEffect(() => {
    if (resumeId) prefetchLesson(resumeId);
  }, [resumeId]);
  const alphabetOpen = open.has(sectionKey("alphabet"));

  return (
    <>
      <Header onStatus={onAchievements} onSettings={onSettings} />
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
                {lessonEmoji(resumeLesson)}{" "}
                {resumeLetters ? `Алфавит. Урок ${resumeLesson.number}.` : `Урок ${resumeLesson.number}.`} {resumeLesson.title}
              </div>
              {resume.kind === "word" && (
                <div className="text-ink-soft" data-testid="continue-place">
                  {resumeLetters ? "Буква" : "Слово"} {resume.wordIndex + 1} из {resumeLesson.count}, этап «
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
        <div className="flex flex-col gap-3" data-testid="home-lessons">
          <section className={FOLD_CARD} data-testid="alphabet-section">
            <h2>
              <FoldButton
                open={alphabetOpen}
                onToggle={() => toggle(sectionKey("alphabet"))}
                lessons={alphabetMetas}
                progress={progress}
                testId="fold-section-alphabet"
                className="px-block py-3"
              >
                <Emoji>{topicEmoji("alphabet")}</Emoji>
                <span className="text-lg font-bold" data-title>
                  {ALPHABET_TITLE}
                </span>
              </FoldButton>
            </h2>
            {alphabetOpen && (
              <div className="flex flex-col gap-2 px-3 pb-3">
                {alphabetMetas.map((lesson) => (
                  <LessonRow key={lesson.id} lesson={lesson} progress={progress[lesson.id]} onOpen={onOpen} />
                ))}
                {alphabetMetas.length < ALPHABET_GROUPS.length && (
                  <p className="text-ink-soft">Остальные уроки алфавита скоро появятся.</p>
                )}
              </div>
            )}
          </section>
          {SECTIONS.map((section) => {
            const inSection = wordMetas.filter((l) => l.section === section);
            const sectionOpen = open.has(sectionKey(section));
            return (
              <section key={section} className={FOLD_CARD} data-testid={`section-${section}`}>
                <h2>
                  <FoldButton
                    open={sectionOpen}
                    onToggle={() => toggle(sectionKey(section))}
                    lessons={inSection}
                    progress={progress}
                    testId={`fold-section-${section}`}
                    className="px-block py-3"
                  >
                    <span className="text-lg font-bold" data-title>
                      {SECTION_TITLES[section]}
                    </span>
                  </FoldButton>
                </h2>
                {sectionOpen && (
                  <div className="flex flex-col gap-2 px-3 pb-3">
                    {inSection.length === 0 && <p className="text-ink-soft">Скоро здесь появятся уроки.</p>}
                    {topicsOf(inSection).map(({ topicId, topic, items }) => {
                      const topicOpen = open.has(topicKey(topicId));
                      return (
                        <div key={topicId} className="rounded-control border border-line" data-testid={`topic-${topicId}`}>
                          <h3>
                            <FoldButton
                              open={topicOpen}
                              onToggle={() => toggle(topicKey(topicId))}
                              lessons={items}
                              progress={progress}
                              testId={`fold-topic-${topicId}`}
                              className="px-3 py-2"
                            >
                              <Emoji>{topicEmoji(topicId)}</Emoji>
                              <span className="font-semibold">{topic}</span>
                            </FoldButton>
                          </h3>
                          {topicOpen && (
                            <div className="flex flex-col gap-2 px-2 pb-2">
                              {items.map((lesson) => (
                                <LessonRow key={lesson.id} lesson={lesson} progress={progress[lesson.id]} onOpen={onOpen} />
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            );
          })}
        </div>
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

function topicsOf(items: readonly LessonMeta[]): { topicId: string; topic: string; items: LessonMeta[] }[] {
  const map = new Map<string, { topicId: string; topic: string; items: LessonMeta[] }>();
  for (const lesson of items) {
    const entry = map.get(lesson.topicId) ?? { topicId: lesson.topicId, topic: lesson.topic, items: [] };
    entry.items.push(lesson);
    map.set(lesson.topicId, entry);
  }
  return [...map.values()].map((t) => ({ ...t, items: [...t.items].sort((a, b) => a.number - b.number) }));
}

function Emoji({ children }: { children: ReactNode }) {
  return (
    <span className="text-xl leading-none" aria-hidden>
      {children}
    </span>
  );
}

/**
 * Заголовок раздела или темы, который сворачивает и разворачивает список.
 * Справа сводка: сколько уроков и сколько из них сдано, чтобы прогресс был виден и в свёрнутом виде.
 * `data-lessons` нужен сквозным тестам: по нему они находят, что развернуть, чтобы добраться до урока.
 */
function FoldButton({
  open,
  onToggle,
  lessons: items,
  progress,
  testId,
  className = "",
  children,
}: {
  open: boolean;
  onToggle: () => void;
  lessons: readonly LessonMeta[];
  progress: Progress;
  testId: string;
  className?: string;
  children: ReactNode;
}) {
  const passed = items.filter((l) => progress[l.id]?.quiz.passed).length;
  const summary =
    passed > 0 ? `сдано ${passed} из ${items.length}` : `${items.length} ${plural(items.length, "урок", "урока", "уроков")}`;
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      data-testid={testId}
      data-lessons={items.map((l) => l.id).join(" ")}
      className={`flex min-h-12 w-full items-center gap-3 rounded-card text-left active:bg-page ${className}`}
    >
      {children}
      <span className="ml-auto shrink-0 text-sm text-ink-soft">{summary}</span>
      <ChevronDown
        className={`size-icon shrink-0 text-ink-soft transition-transform ${open ? "rotate-180" : ""}`}
        aria-hidden
      />
    </button>
  );
}

function LessonRow({
  lesson,
  progress,
  onOpen,
}: {
  lesson: LessonMeta;
  progress?: LessonProgressResponse;
  onOpen: (id: string) => void;
}) {
  const total = lesson.count;
  const letters = lesson.section === "alphabet";
  const done = progress?.words.filter((w) => w.completed).length ?? 0;
  const passed = progress?.quiz.passed ?? false;
  return (
    <button
      type="button"
      onClick={() => onOpen(lesson.id)}
      data-testid={`lesson-${lesson.id}`}
      className="flex w-full items-center gap-2.5 rounded-control bg-page p-2.5 text-left active:bg-line"
    >
      <span
        className="flex size-10 shrink-0 items-center justify-center rounded-control bg-surface text-xl leading-none"
        aria-hidden
      >
        {lessonEmoji(lesson)}
      </span>
      <div className="min-w-0 flex-1">
        <div className="font-semibold">
          Урок {lesson.number}. {lesson.title}
        </div>
        {lesson.letters && (
          <div dir="rtl" lang="he" className="font-hebrew text-xl text-ink-soft">
            {lesson.letters.join(" ")}
          </div>
        )}
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <Chip tone={done === total ? "success" : "neutral"}>
            {letters ? "Букв" : "Слов"}: {done} из {total}
          </Chip>
          {!passed && done === total && <Chip tone="accent">Викторина открыта</Chip>}
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
      <ChevronRight className="size-icon shrink-0 text-ink-soft" aria-hidden />
    </button>
  );
}

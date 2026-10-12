import { useEffect, useState } from "react";
import { CheckCircle2, ChevronRight, Lock } from "lucide-react";
import { lessons } from "@milav/content";
import { SECTION_TITLES, WORDS_PER_LESSON, type Lesson, type Section } from "@milav/shared";
import { api, type LessonProgressResponse } from "../api";
import { useApp } from "../AppContext";
import { Header } from "../components/Header";
import { Card, Chip } from "../components/ui";

const SECTIONS: Section[] = ["nouns", "verbs", "adjectives"];

/** Уроки по разделам и темам. */
export function Home({ onOpen }: { onOpen: (lessonId: string) => void }) {
  const { me } = useApp();
  const [progress, setProgress] = useState<Record<string, LessonProgressResponse>>({});

  // Прогресс запрашивается только по доступным урокам.
  useEffect(() => {
    let alive = true;
    for (const lesson of lessons.filter((l) => l.free)) {
      api.lessonProgress(lesson.id).then(
        (p) => alive && setProgress((prev) => ({ ...prev, [lesson.id]: p })),
        () => undefined,
      );
    }
    return () => {
      alive = false;
    };
  }, []);

  const toNext = me.status.nextAt === null ? null : me.status.nextAt - me.passedLessons;

  return (
    <>
      <Header title="Milav" subtitle={`${me.status.name} · сдано уроков: ${me.passedLessons}`} />
      <main className="mx-auto flex max-w-md flex-col gap-section p-block pb-section">
        {toNext !== null && (
          <p className="text-sm text-ink-soft">До следующего статуса сдать уроков: {toNext}</p>
        )}
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
  lesson: Lesson;
  progress?: LessonProgressResponse;
  onOpen: (id: string) => void;
}) {
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
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <Chip tone={done === WORDS_PER_LESSON ? "success" : "neutral"}>
              Слов: {done} из {WORDS_PER_LESSON}
            </Chip>
            {!passed && done === WORDS_PER_LESSON && <Chip tone="accent">Викторина открыта</Chip>}
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

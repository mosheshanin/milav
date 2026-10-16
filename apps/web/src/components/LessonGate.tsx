import { useCallback, useEffect, useState, type ReactNode } from "react";
import type { AnyLesson } from "@milav/shared";
import { ApiError, api } from "../api";
import { UnknownLessonError, browserLessonStore, createLessonLoader, getLessonMeta } from "../lib/lessons";
import { useBackButton } from "../lib/useBackButton";
import { Header } from "./Header";
import { Button, Notice } from "./ui";

/** Один загрузчик на всё приложение: урок, открытый в «Изучении», в викторине уже не запрашивается. */
const loader = createLessonLoader(async (id) => (await api.lesson(id)).lesson, browserLessonStore());

/** Заранее подгрузить урок (например, тот, что предлагает «Продолжить»), чтобы он открылся без ожидания. */
export function prefetchLesson(id: string): void {
  loader.load(id).catch(() => undefined);
}

export type LessonLoad =
  | { state: "loading" }
  | { state: "ready"; lesson: AnyLesson }
  /** `lesson_not_found`, `subscription_required`, `network` или другой код ответа сервера. */
  | { state: "error"; code: string };

function errorCode(error: unknown): string {
  if (error instanceof UnknownLessonError) return "lesson_not_found";
  if (error instanceof ApiError) return error.status === 0 ? "network" : error.code;
  return "network";
}

/** Урок по id: сразу, если он уже загружался, иначе после запроса к серверу. `retry` пробует снова после ошибки. */
export function useLesson(lessonId: string): { load: LessonLoad; retry: () => void } {
  const initial = (): LessonLoad => {
    const lesson = loader.cached(lessonId);
    return lesson ? { state: "ready", lesson } : { state: "loading" };
  };
  const [load, setLoad] = useState<LessonLoad>(initial);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let alive = true;
    const ready = loader.cached(lessonId);
    if (ready) {
      setLoad({ state: "ready", lesson: ready });
      return;
    }
    setLoad({ state: "loading" });
    loader.load(lessonId).then(
      (lesson) => alive && setLoad({ state: "ready", lesson }),
      (error) => alive && setLoad({ state: "error", code: errorCode(error) }),
    );
    return () => {
      alive = false;
    };
  }, [lessonId, attempt]);

  const retry = useCallback(() => setAttempt((a) => a + 1), []);
  return { load, retry };
}

const ERROR_TITLES: Record<string, string> = {
  subscription_required: "Урок доступен по подписке",
  lesson_not_found: "Урок не найден",
  network: "Нет связи с сервером",
};

/**
 * Показывает экран урока, когда слова урока загружены. Пока грузится или при ошибке: шапка с названием из манифеста,
 * сообщение и кнопка «назад» (и кнопка Telegram, и стрелка в шапке).
 */
export function LessonGate({
  lessonId,
  title,
  onBack,
  children,
}: {
  lessonId: string;
  /** Название экрана в шапке, пока урок не загружен (по умолчанию название урока). */
  title?: string;
  onBack: () => void;
  children: (lesson: AnyLesson) => ReactNode;
}) {
  const { load, retry } = useLesson(lessonId);
  // Когда урок загружен, кнопку «назад» берёт на себя экран урока.
  useBackButton(load.state === "ready" ? null : onBack);
  if (load.state === "ready") return <>{children(load.lesson)}</>;

  const meta = getLessonMeta(lessonId);
  return (
    <>
      <Header title={title ?? meta?.title ?? "Урок"} subtitle={title ? meta?.title : undefined} onBack={onBack} />
      {load.state === "loading" ? (
        <Notice title="Загрузка урока…" />
      ) : (
        <Notice title={ERROR_TITLES[load.code] ?? "Не удалось загрузить урок"}>
          <div className="flex flex-col gap-2" data-testid="lesson-load-error" data-code={load.code}>
            {load.code === "network" && <p>Проверьте подключение к интернету.</p>}
            {load.code === "subscription_required" && <p>Первые уроки каждой темы бесплатные.</p>}
            {load.code !== "subscription_required" && load.code !== "lesson_not_found" && (
              <Button block onClick={retry} data-testid="lesson-load-retry">
                Повторить
              </Button>
            )}
            <Button variant="ghost" block onClick={onBack}>
              Назад
            </Button>
          </div>
        </Notice>
      )}
    </>
  );
}

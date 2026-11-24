// Заливка плашек на главной (24.11.2026, просьба владельца): сданный урок или тема выделены цветом успеха,
// начатые — фон плашки как полоса прогресса (цвет акцента, слева направо).
import type { CSSProperties } from "react";
import type { LessonMeta, LessonProgressResponse } from "@milav/shared";

/** Итог для плашки: сдано целиком или доля пройденного (0…1). */
export interface Fill {
  passed: boolean;
  ratio: number;
}

const EMPTY: Fill = { passed: false, ratio: 0 };

/**
 * Урок: сдан, когда сдана викторина. Иначе доля пройденных этапов всех слов (у слов четыре этапа, у букв три),
 * поэтому полоса двигается с каждым этапом, а не только с целым словом. Все слова пройдены, викторина не сдана:
 * полоса полная, но цвета акцента, а не успеха.
 */
export function lessonFill(lesson: Pick<LessonMeta, "count" | "stages">, progress?: LessonProgressResponse): Fill {
  if (!progress) return EMPTY;
  if (progress.quiz.passed) return { passed: true, ratio: 1 };
  const total = lesson.count * lesson.stages.length;
  if (total === 0) return EMPTY;
  let done = 0;
  for (const word of progress.words) {
    for (const stage of lesson.stages) if (word[stage]) done += 1;
  }
  return { passed: false, ratio: Math.min(1, done / total) };
}

/** Тема или раздел: сданы все уроки — цвет успеха, часть — полоса по доле сданных уроков (как подпись «сдано N из M»). */
export function groupFill(lessons: readonly Pick<LessonMeta, "id">[], progress: Record<string, LessonProgressResponse>): Fill {
  if (lessons.length === 0) return EMPTY;
  const passed = lessons.filter((l) => progress[l.id]?.quiz.passed).length;
  if (passed === lessons.length) return { passed: true, ratio: 1 };
  return { passed: false, ratio: passed / lessons.length };
}

/**
 * Классы и стиль плашки. `base` — фон без прогресса (bg-page у строки урока, bg-surface у заголовка темы).
 * Полоса рисуется утилитой `bg-progress` из index.css поверх базового фона; ширина в переменной `--fill`.
 */
export function fillLook(fill: Fill, base: string): { className: string; style?: CSSProperties; state: "passed" | "partial" | "none" } {
  if (fill.passed) return { className: "bg-success-soft", state: "passed" };
  if (fill.ratio <= 0) return { className: base, state: "none" };
  const percent = `${Math.round(fill.ratio * 1000) / 10}%`;
  return { className: `${base} bg-progress`, style: { "--fill": percent } as CSSProperties, state: "partial" };
}

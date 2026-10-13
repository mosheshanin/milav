export interface Point {
  x: number;
  y: number;
}

/** Штрих: последовательность точек одного касания. */
export type Stroke = Point[];

/** Признаки нарисованной (или шаблонной) буквы. */
export interface LetterFeatures {
  /** Облако точек, приведённое к единичному размеру и центрированное. */
  points: Point[];
  /** Ширина / высота рамки буквы. */
  aspect: number;
  /** Высота буквы относительно «строки» (высоты обычной буквы). Помогает отличить ו, י и ן. */
  heightRatio: number;
}

export interface Template extends LetterFeatures {
  letter: string;
  /** Откуда шаблон: шрифт или записанный человеком. */
  source: string;
}

export interface Ranked {
  letter: string;
  distance: number;
}

export interface LetterCheck {
  ok: boolean;
  /** Буква, на которую рисунок похож больше всего. */
  best: string;
  /** Расстояние до ожидаемой буквы (меньше значит лучше). */
  distance: number;
  ranking: Ranked[];
}

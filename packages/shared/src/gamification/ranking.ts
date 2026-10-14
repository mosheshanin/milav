// Места в таблице лидеров и квантили для сравнения с теми, кто пришёл в одно время.

export interface BoardEntry {
  id: number;
  points: number;
  /** Когда очки обновлялись в последний раз (секунды): при равенстве выше тот, кто набрал очки раньше. */
  at: number;
}

/** Порядок в таблице: больше очков выше, при равенстве раньше набравший, затем по id (id наружу не отдаётся). */
export function sortBoard<T extends BoardEntry>(entries: T[]): T[] {
  return [...entries].sort((a, b) => b.points - a.points || a.at - b.at || a.id - b.id);
}

/** Места по правилу 1, 2, 2, 4: равные очки делят место. Вход уже упорядочен по убыванию очков. */
export function ranksOf(points: number[]): number[] {
  const ranks: number[] = [];
  for (let i = 0; i < points.length; i++) {
    ranks.push(i > 0 && points[i] === points[i - 1] ? ranks[i - 1]! : i + 1);
  }
  return ranks;
}

/** Квантиль по ближайшему рангу; значения должны быть упорядочены по возрастанию, q от 0 до 1. */
export function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(q * sorted.length) - 1));
  return sorted[index]!;
}

export interface Quartiles {
  p25: number;
  p50: number;
  p75: number;
}

export function quartiles(values: number[]): Quartiles {
  const sorted = [...values].sort((a, b) => a - b);
  return { p25: quantile(sorted, 0.25), p50: quantile(sorted, 0.5), p75: quantile(sorted, 0.75) };
}

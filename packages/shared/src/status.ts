import type { StatusInfo } from "./types";
import type { StatusPath } from "./gamification/types";

/**
 * Статусы по числу сданных уроков (решение владельца, границы включительно):
 * Пешка 0–5, Конь 6–20, Слон 21–50, Ладья 51–100, Ферзь 101–300, Король 301 и больше.
 */
const LADDER: { upTo: number; key: StatusInfo["key"]; name: string; symbol: string }[] = [
  { upTo: 5, key: "pawn", name: "Пешка", symbol: "♟" },
  { upTo: 20, key: "knight", name: "Конь", symbol: "♞" },
  { upTo: 50, key: "bishop", name: "Слон", symbol: "♝" },
  { upTo: 100, key: "rook", name: "Ладья", symbol: "♜" },
  { upTo: 300, key: "queen", name: "Ферзь", symbol: "♛" },
  { upTo: Infinity, key: "king", name: "Король", symbol: "♚" },
];

export function statusForPassedLessons(passed: number): StatusInfo {
  const n = Math.max(0, Math.floor(passed));
  const step = LADDER.find((s) => n <= s.upTo) ?? LADDER[LADDER.length - 1]!;
  return {
    key: step.key,
    name: step.name,
    symbol: step.symbol,
    nextAt: Number.isFinite(step.upTo) ? step.upTo + 1 : null,
  };
}

/** Путь к следующему статусу: где человек внутри текущего и сколько уроков до следующего. */
export function statusPath(passed: number): StatusPath {
  const n = Math.max(0, Math.floor(passed));
  const index = Math.max(0, LADDER.findIndex((s) => n <= s.upTo));
  const current = LADDER[index]!;
  const next = LADDER[index + 1];
  const from = index === 0 ? 0 : LADDER[index - 1]!.upTo + 1;
  const to = next ? current.upTo + 1 : null;
  return {
    key: current.key,
    name: current.name,
    symbol: current.symbol,
    from,
    to,
    passed: n,
    fraction: to === null ? 1 : Math.min(1, (n - from) / (to - from)),
    next: next ? { key: next.key, name: next.name, symbol: next.symbol } : null,
  };
}

import type { StatusInfo } from "./types";

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

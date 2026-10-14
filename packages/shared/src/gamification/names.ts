// Имя в таблице лидеров: очищается при выводе (docs/GAMIFICATION.md, 8.1).
import { DISPLAY_NAME_FALLBACK, DISPLAY_NAME_MAX } from "./constants";

/**
 * Управляющие знаки, невидимые и двунаправленные знаки (ими прячут текст и ломают вёрстку).
 * Диапазоны заданы числами, а не символами в тексте файла: так их видно в обзоре кода.
 */
const INVISIBLE_RANGES: [number, number][] = [
  [0x0000, 0x001f],
  [0x007f, 0x009f],
  [0x00ad, 0x00ad],
  [0x200b, 0x200f],
  [0x2028, 0x202e],
  [0x2060, 0x206f],
  [0xfeff, 0xfeff],
  [0xfff9, 0xfffb],
];

function isInvisible(code: number): boolean {
  return INVISIBLE_RANGES.some(([from, to]) => code >= from && code <= to);
}

const LINK = /(?:https?:\/\/|www\.|t\.me\/|tg:\/\/)\S*/giu;

/** Имя для показа другим: без ссылок, `@`, невидимых знаков, не длиннее DISPLAY_NAME_MAX знаков. Пустое имя заменяется. */
export function cleanDisplayName(name: string | null | undefined): string {
  const visible = Array.from(name ?? "")
    .filter((ch) => !isInvisible(ch.codePointAt(0)!))
    .join("");
  const cleaned = visible.replace(LINK, "").replace(/@/g, "").replace(/\s+/gu, " ").trim();
  const clipped = Array.from(cleaned).slice(0, DISPLAY_NAME_MAX).join("").trim();
  return clipped || DISPLAY_NAME_FALLBACK;
}

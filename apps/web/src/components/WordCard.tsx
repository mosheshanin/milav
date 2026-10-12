import type { Word } from "@milav/shared";
import { Card, Chip } from "./ui";

const GENDER: Record<NonNullable<Word["gender"]>, string> = { m: "мужской род", f: "женский род" };

/** Карточка слова: печатный и рукописный иврит, транскрипция, перевод, род и фраза для запоминания. */
export function WordCard({ word, compact = false }: { word: Word; compact?: boolean }) {
  if (compact) {
    // На этапах письма и набора остаётся главное, чтобы холст и клавиатура помещались на экране.
    return (
      <Card className="flex items-center justify-between gap-3 py-3">
        <div className="min-w-0">
          <div className="text-xl font-semibold">{word.ru}</div>
          <div className="text-accent">[{word.translit}]</div>
        </div>
        <div dir="rtl" lang="he" className="font-hebrew text-4xl font-bold" data-testid="word-he">
          {word.he}
        </div>
      </Card>
    );
  }
  return (
    <Card className="flex flex-col items-center gap-2 text-center">
      <div dir="rtl" lang="he" className="font-hebrew text-5xl font-bold leading-tight" data-testid="word-he">
        {word.he}
      </div>
      <div dir="rtl" lang="he" className="font-hand text-4xl leading-tight text-ink-soft" aria-label="Рукописное начертание">
        {word.he}
      </div>
      <div className="text-lg text-accent">[{word.translit}]</div>
      <div className="text-2xl font-semibold">{word.ru}</div>
      {word.gender && <Chip tone={word.gender === "f" ? "danger" : "accent"}>{GENDER[word.gender]}</Chip>}
      {word.example && (
        <div className="mt-1 w-full rounded-control bg-page p-3">
          <div dir="rtl" lang="he" className="font-hebrew text-xl">
            {word.example.he}
          </div>
          <div className="text-sm text-ink-soft">
            {word.example.translit} — {word.example.ru}
          </div>
        </div>
      )}
    </Card>
  );
}

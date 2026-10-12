import type { Word } from "@milav/shared";
import { Card, Chip } from "./ui";

const GENDER: Record<NonNullable<Word["gender"]>, string> = { m: "мужской род", f: "женский род" };

/** Картинка слова. Если файла нет или он не загрузился, остаётся пустая рамка нужного размера. */
function WordImage({ word, className }: { word: Word; className: string }) {
  return (
    <div className={`flex shrink-0 items-center justify-center rounded-control bg-page ${className}`}>
      {word.image && <img src={word.image} alt="" className="size-4/5 object-contain" loading="eager" />}
    </div>
  );
}

/**
 * Карточка слова: слева картинка, справа весь текст (выравнивание по правому краю):
 * печатный и рукописный иврит, транскрипция, перевод, род и фраза для запоминания.
 */
export function WordCard({ word, compact = false }: { word: Word; compact?: boolean }) {
  if (compact) {
    // На этапах письма и набора остаётся главное, чтобы холст и клавиатура помещались на экране.
    return (
      <Card className="flex items-center gap-3 py-3">
        <WordImage word={word} className="size-16" />
        <div className="flex min-w-0 flex-1 items-center justify-between gap-3 text-right">
          <div className="min-w-0">
            <div className="text-xl font-semibold">{word.ru}</div>
            <div className="text-accent">[{word.translit}]</div>
          </div>
          <div dir="rtl" lang="he" className="font-hebrew text-4xl font-bold" data-testid="word-he">
            {word.he}
          </div>
        </div>
      </Card>
    );
  }
  return (
    <Card className="flex items-start gap-3">
      <WordImage word={word} className="size-28" />
      <div className="flex min-w-0 flex-1 flex-col items-end gap-1 text-right">
        <div dir="rtl" lang="he" className="font-hebrew text-5xl font-bold leading-tight" data-testid="word-he">
          {word.he}
        </div>
        <div dir="rtl" lang="he" className="font-hand text-3xl leading-tight text-ink-soft" aria-label="Рукописное начертание">
          {word.he}
        </div>
        <div className="text-lg text-accent">[{word.translit}]</div>
        <div className="text-2xl font-semibold">{word.ru}</div>
        {word.gender && <Chip tone={word.gender === "f" ? "danger" : "accent"}>{GENDER[word.gender]}</Chip>}
        {word.example && (
          <div className="mt-1 w-full border-t border-line pt-2">
            <div dir="rtl" lang="he" className="font-hebrew text-xl">
              {word.example.he}
            </div>
            <div className="text-sm text-ink-soft">
              {word.example.translit} — {word.example.ru}
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}

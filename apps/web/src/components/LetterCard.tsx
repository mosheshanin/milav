import type { Letter } from "@milav/shared";
import { isFinalForm } from "@milav/shared";
import { WordImage } from "./WordImage";
import { Card, Chip } from "./ui";

/**
 * Карточка буквы: крупная печатная и рукописная форма, название, звук и слово-пример с картинкой.
 * Конечная форма подписана, чтобы её не путали с обычной.
 * `compact`: на этапах «пиши» и «печатай» остаётся главное, чтобы холст и клавиатура помещались на экране.
 */
export function LetterCard({ letter, compact = false }: { letter: Letter; compact?: boolean }) {
  const final = isFinalForm(letter.he);
  if (compact) {
    return (
      <Card className="flex items-center justify-between gap-3 py-3">
        <div className="min-w-0 text-right">
          <div className="text-xl font-semibold">{letter.name.ru}</div>
          <div className="text-accent">{letter.sound}</div>
        </div>
        <div dir="rtl" lang="he" className="font-hebrew text-6xl font-bold leading-none" data-testid="letter-he">
          {letter.he}
        </div>
      </Card>
    );
  }
  return (
    <Card className="flex flex-col gap-block">
      <div className="flex items-center justify-center gap-6">
        <div dir="rtl" lang="he" className="font-hebrew text-8xl font-bold leading-none" data-testid="letter-he">
          {letter.he}
        </div>
        <div dir="rtl" lang="he" className="font-hand text-7xl leading-none text-ink-soft" aria-label="Рукописное начертание">
          {letter.he}
        </div>
      </div>
      <div className="flex flex-col items-center gap-1 text-center">
        <div className="text-2xl font-semibold" data-testid="letter-name">
          {letter.name.ru}
        </div>
        <div dir="rtl" lang="he" className="font-hebrew text-xl text-ink-soft">
          {letter.name.he}
        </div>
        <div className="text-lg text-accent" data-testid="letter-sound">
          Звук: {letter.sound}
        </div>
        {final && <Chip tone="accent">Конечная форма: пишется только в конце слова</Chip>}
      </div>
      <div className="flex items-center gap-3 border-t border-line pt-3" data-testid="letter-example">
        <WordImage key={letter.id} image={letter.example.image} fallback={letter.example.he} className="size-20" />
        <div className="flex min-w-0 flex-1 flex-col items-end gap-0.5 text-right">
          <div dir="rtl" lang="he" className="font-hebrew text-3xl font-bold">
            {letter.example.he}
          </div>
          <div className="text-accent">[{letter.example.translit}]</div>
          <div className="text-lg font-semibold">{letter.example.ru}</div>
        </div>
      </div>
    </Card>
  );
}

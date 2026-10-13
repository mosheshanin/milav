import { HEBREW_LETTERS, LETTER_NAMES, type TemplateItem } from "@milav/shared";
import { Button, Card } from "./ui";
import { doneTotal, letterCounts, letterStatus, nextIncompleteLetter, totalNeeded, type LetterStatus } from "../lib/recordProgress";

const STATUS_STYLES: Record<LetterStatus, string> = {
  empty: "border-line bg-surface text-ink",
  partial: "border-accent bg-accent-soft text-accent",
  done: "border-success bg-success-soft text-success",
};

/** Сетка 27 форм: видно, какие записаны полностью, какие частично, а какие ещё нет. */
export function LetterGrid({
  items,
  variants,
  onPick,
}: {
  items: TemplateItem[];
  variants: number;
  onPick: (letter: string) => void;
}) {
  const counts = letterCounts(items, variants);
  const next = nextIncompleteLetter(items, variants);
  const done = doneTotal(items, variants);
  const total = totalNeeded(variants);

  return (
    <div className="flex flex-col gap-section">
      <Card>
        <p className="font-semibold" data-testid="record-summary">
          Записано {done} из {total}
        </p>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-line" aria-hidden>
          <div className="h-full bg-success" style={{ width: `${(done / total) * 100}%` }} />
        </div>
        <p className="mt-2 text-sm text-ink-soft">
          Нарисуйте каждую форму по {variants} раза, чуть по-разному: как пишете в жизни. Рисуйте пальцем между линиями.
        </p>
        {next ? (
          <Button block className="mt-block" onClick={() => onPick(next)} data-testid="record-next">
            {done === 0 ? "Начать с «" : "Следующая незаписанная: «"}
            {next}»
          </Button>
        ) : (
          <p className="mt-block font-semibold text-success">Всё записано. Спасибо!</p>
        )}
      </Card>

      {/* Буквы идут справа налево, как в иврите. */}
      <div className="grid grid-cols-5 gap-2" dir="rtl">
        {HEBREW_LETTERS.map((letter) => {
          const count = counts.get(letter) ?? 0;
          return (
            <button
              key={letter}
              type="button"
              onClick={() => onPick(letter)}
              data-testid={`letter-${letter}`}
              data-status={letterStatus(count, variants)}
              aria-label={`${LETTER_NAMES[letter] ?? letter}: записано ${count} из ${variants}`}
              className={`flex aspect-square flex-col items-center justify-center rounded-control border-2 active:opacity-70 ${
                STATUS_STYLES[letterStatus(count, variants)]
              }`}
            >
              <span className="font-hebrew text-3xl leading-none">{letter}</span>
              <span className="mt-1 text-xs font-semibold" dir="ltr">
                {count}/{variants}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

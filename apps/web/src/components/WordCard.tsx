import { useState } from "react";
import type { Word } from "@milav/shared";
import { Card, Chip } from "./ui";

const GENDER: Record<NonNullable<Word["gender"]>, string> = { m: "мужской род", f: "женский род" };

/** Подписи форм прилагательного в порядке показа (основная форма, мужской род единственное число, это само слово). */
const FORM_LABELS = [
  ["f", "ж. р."],
  ["mp", "мн. ч., м. р."],
  ["fp", "мн. ч., ж. р."],
] as const;

/**
 * Картинка слова. Если у слова нет картинки или файл не загрузился, плитка нужного размера показывает
 * запасной вариант: первую букву слова.
 */
function WordImage({ word, className }: { word: Word; className: string }) {
  const [broken, setBroken] = useState(false);
  const showImage = word.image && !broken;
  return (
    <div className={`flex shrink-0 items-center justify-center rounded-control bg-page ${className}`}>
      {showImage ? (
        <img
          src={word.image}
          alt=""
          className="size-4/5 object-contain"
          loading="eager"
          data-testid="word-image"
          onError={() => setBroken(true)}
        />
      ) : (
        <span dir="rtl" lang="he" aria-hidden className="font-hebrew text-5xl font-bold text-accent-soft" data-testid="word-image-fallback">
          {[...word.he][0]}
        </span>
      )}
    </div>
  );
}

/**
 * Карточка слова: слева картинка, справа весь текст (выравнивание по правому краю):
 * печатный и рукописный иврит, транскрипция, перевод, род, остальные формы прилагательного и фраза для запоминания.
 */
export function WordCard({ word, compact = false }: { word: Word; compact?: boolean }) {
  if (compact) {
    // На этапах письма и набора остаётся главное, чтобы холст и клавиатура помещались на экране.
    return (
      <Card className="flex items-center gap-3 py-3">
        <WordImage key={word.id} word={word} className="size-16" />
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
      <WordImage key={word.id} word={word} className="size-28" />
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
        {word.forms && (
          <dl className="mt-1 w-full border-t border-line pt-2" data-testid="word-forms">
            {FORM_LABELS.map(([key, label]) => {
              const form = word.forms![key];
              return (
                <div key={key} className="flex items-baseline justify-between gap-2">
                  <dt className="text-xs text-ink-soft">{label}</dt>
                  <dd className="flex items-baseline gap-2">
                    <span className="text-sm text-accent">[{form.translit}]</span>
                    <span dir="rtl" lang="he" className="font-hebrew text-lg">
                      {form.he}
                    </span>
                  </dd>
                </div>
              );
            })}
          </dl>
        )}
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

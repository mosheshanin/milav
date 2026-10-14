import type { Word } from "@milav/shared";
import { SpeakerButton } from "./SpeakerButton";
import { VerbForms } from "./VerbForms";
import { WordImage } from "./WordImage";
import { Card, Chip } from "./ui";

const GENDER: Record<NonNullable<Word["gender"]>, string> = { m: "мужской род", f: "женский род" };

/** Подписи форм прилагательного в порядке показа (основная форма, мужской род единственное число, это само слово). */
const FORM_LABELS = [
  ["f", "ж. р."],
  ["mp", "мн., м. р."],
  ["fp", "мн., ж. р."],
] as const;

/**
 * Карточка слова: слева картинка, справа весь текст (выравнивание по правому краю):
 * печатный и рукописный иврит, транскрипция, перевод, род, остальные формы прилагательного и фраза для запоминания.
 */
export function WordCard({ word, compact = false }: { word: Word; compact?: boolean }) {
  if (compact) {
    // На этапах письма и набора остаётся главное, чтобы холст и клавиатура помещались на экране.
    return (
      <Card className="flex items-center gap-3 py-3">
        <WordImage key={word.id} image={word.image} fallback={word.he} className="size-16" />
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
  const phrase = word.example && (
    <div className="mt-1 flex w-full items-center gap-2 border-t border-line pt-2">
      <SpeakerButton item={{ he: word.example.he, audio: word.example.audio }} label="Послушать фразу" testId="listen-phrase" />
      <div className="min-w-0 flex-1">
        <div dir="rtl" lang="he" className="font-hebrew text-xl">
          {word.example.he}
        </div>
        <div className="text-sm text-ink-soft">
          {word.example.translit} — {word.example.ru}
        </div>
      </div>
    </div>
  );
  const head = (
    <>
      <WordImage key={word.id} image={word.image} fallback={word.he} className="size-28" />
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
                <div key={key} className="flex items-center justify-between gap-2">
                  <dt className="whitespace-nowrap text-xs text-ink-soft">{label}</dt>
                  <dd className="flex items-center gap-2">
                    <SpeakerButton item={{ he: form.niqqud, audio: form.audio }} label={`Послушать: ${label}`} testId={`listen-form-${key}`} />
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
        {!word.verb && phrase}
      </div>
    </>
  );
  if (word.verb) {
    // У глагола до 10 форм в таблице: рядом с картинкой они не помещаются, поэтому таблица и фраза идут под ней на всю ширину карточки.
    return (
      <Card className="flex flex-col gap-2">
        <div className="flex items-start gap-3">{head}</div>
        <VerbForms key={word.id} verb={word.verb} />
        {phrase}
      </Card>
    );
  }
  return <Card className="flex items-start gap-3">{head}</Card>;
}

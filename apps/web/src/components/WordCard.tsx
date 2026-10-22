import { DEFAULT_LEARNER_GENDER, isPhrase, phraseFor, type Gender, type PhraseText, type Word } from "@milav/shared";
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
 * Карточка слова: слева картинка, справа печатный и рукописный иврит, транскрипция, перевод и род (выравнивание по правому краю).
 * У существительных фраза для запоминания стоит там же, справа.
 * У прилагательных (формы) и глаголов (таблица форм) формы и фраза идут под картинкой на всю ширину карточки:
 * рядом с картинкой длинные формы (מפוספסים, כחלחלות) не помещались и давали горизонтальную прокрутку на экране 360 px.
 *
 * Фраза от первого лица показывается в роде ученика (`gender`, настройка «Фразы-примеры от лица»): «אני הולך» мужчине,
 * «אני הולכת» женщине, и озвучка голосом того же рода. Проверяющему (`bothPhrases`) видны оба варианта с подписями.
 */
export function WordCard({
  word,
  compact = false,
  gender = DEFAULT_LEARNER_GENDER,
  bothPhrases = false,
}: {
  word: Word;
  compact?: boolean;
  gender?: Gender;
  bothPhrases?: boolean;
}) {
  // Фраза из нескольких слов («תעודת זהות») крупным шрифтом не помещается рядом с картинкой на 360 px: шрифт меньше, перенос по словам.
  const manyWords = isPhrase(word.he);
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
          <div dir="rtl" lang="he" className={`min-w-0 font-hebrew font-bold ${manyWords ? "text-3xl leading-tight" : "text-4xl"}`} data-testid="word-he">
            {word.he}
          </div>
        </div>
      </Card>
    );
  }
  const example = word.example;
  const variants: { text: PhraseText; label?: string; key: string }[] = !example
    ? []
    : bothPhrases && example.female
      ? [
          { text: example, label: "говорит мужчина", key: "m" },
          { text: example.female, label: "говорит женщина", key: "f" },
        ]
      : [{ text: phraseFor(example, gender), key: "one" }];
  const phrase = variants.length > 0 && (
    <div className="mt-1 flex w-full flex-col gap-2 border-t border-line pt-2" data-testid="word-phrase">
      {variants.map(({ text, label, key }) => (
        <div key={key} className="flex w-full items-center gap-2">
          <SpeakerButton
            item={{ he: text.niqqud ?? text.he, audio: text.audio }}
            label={label ? `Послушать фразу: ${label}` : "Послушать фразу"}
            testId={label ? `listen-phrase-${key}` : "listen-phrase"}
          />
          <div className="min-w-0 flex-1 text-right">
            {label && <div className="text-xs text-ink-soft">{label}</div>}
            <div dir="rtl" lang="he" className="font-hebrew text-xl" data-testid="phrase-he">
              {text.he}
            </div>
            <div className="text-sm text-ink-soft">
              {text.translit} — {text.ru}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
  const forms = word.forms && (
    <dl className="w-full divide-y divide-line border-t border-line" data-testid="word-forms">
      {FORM_LABELS.map(([key, label]) => {
        const form = word.forms![key];
        return (
          <div key={key} className="flex items-center gap-3 py-2">
            <SpeakerButton item={{ he: form.niqqud, audio: form.audio }} label={`Послушать: ${label}`} testId={`listen-form-${key}`} />
            <dt className="flex-1 text-sm text-ink-soft">{label}</dt>
            <dd className="flex min-w-0 flex-col items-end text-right">
              <span dir="rtl" lang="he" className="font-hebrew text-xl">
                {form.he}
              </span>
              <span className="text-sm text-accent">[{form.translit}]</span>
            </dd>
          </div>
        );
      })}
    </dl>
  );
  /** Формы и фраза под картинкой на всю ширину: у глаголов и прилагательных. */
  const wide = Boolean(word.verb || word.forms);
  const head = (
    <>
      <WordImage key={word.id} image={word.image} fallback={word.he} className="size-28" />
      <div className="flex min-w-0 flex-1 flex-col items-end gap-1 text-right">
        <div dir="rtl" lang="he" className={`font-hebrew font-bold leading-tight ${manyWords ? "text-4xl" : "text-5xl"}`} data-testid="word-he">
          {word.he}
        </div>
        <div dir="rtl" lang="he" className={`font-hand leading-tight text-ink-soft ${manyWords ? "text-2xl" : "text-3xl"}`} aria-label="Рукописное начертание">
          {word.he}
        </div>
        <div className="text-lg text-accent">[{word.translit}]</div>
        <div className="text-2xl font-semibold">{word.ru}</div>
        {word.gender && <Chip tone={word.gender === "f" ? "danger" : "accent"}>{GENDER[word.gender]}</Chip>}
        {!wide && phrase}
      </div>
    </>
  );
  if (wide) {
    return (
      <Card className="flex flex-col gap-2">
        <div className="flex items-start gap-3">{head}</div>
        {word.verb && <VerbForms key={word.id} verb={word.verb} />}
        {forms}
        {phrase}
      </Card>
    );
  }
  return <Card className="flex items-start gap-3">{head}</Card>;
}

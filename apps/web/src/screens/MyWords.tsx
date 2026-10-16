import { useEffect, useState } from "react";
import { REPEAT_BOX_TITLES, REPEAT_INTERVALS, REPEAT_LAST_BOX, dueInText, type MyWordItem, type MyWordsResponse } from "@milav/shared";
import { api } from "../api";
import { Header } from "../components/Header";
import { SpeakerButton } from "../components/SpeakerButton";
import { Button, Card, Notice } from "../components/ui";
import { filterWords, repeatCardText, strengthFilled, wordsCount, type WordsFilter } from "../lib/repeat";
import { useBackButton } from "../lib/useBackButton";

type Load = { kind: "loading" } | { kind: "error" } | { kind: "ready"; data: MyWordsResponse };

const FILTERS: { key: WordsFilter; title: string }[] = [
  { key: "all", title: "Все" },
  { key: "due", title: "Пора" },
  { key: "strong", title: "Прочные" },
];

/** «Мои слова»: все выученные слова, насколько крепко помнятся и когда их повторять. */
export function MyWords({ onBack, onRepeat }: { onBack: () => void; onRepeat: () => void }) {
  const [load, setLoad] = useState<Load>({ kind: "loading" });
  const [filter, setFilter] = useState<WordsFilter>("all");
  const [attempt, setAttempt] = useState(0);
  useBackButton(onBack);

  useEffect(() => {
    let alive = true;
    api.myWords().then(
      (data) => alive && setLoad({ kind: "ready", data }),
      () => alive && setLoad({ kind: "error" }),
    );
    return () => {
      alive = false;
    };
  }, [attempt]);

  if (load.kind === "loading") return <Notice title="Загрузка…" />;
  if (load.kind === "error") {
    return (
      <>
        <Header title="Мои слова" onBack={onBack} />
        <main className="mx-auto flex max-w-md flex-col gap-block p-block">
          <Card className="text-center">Не удалось загрузить слова. Проверьте интернет.</Card>
          <Button onClick={() => setAttempt((a) => a + 1)}>Попробовать снова</Button>
        </main>
      </>
    );
  }

  const { items, summary } = load.data;
  const strong = items.filter((i) => i.box === REPEAT_LAST_BOX).length;
  const shown = filterWords(items, filter);
  const counts: Record<WordsFilter, number> = { all: items.length, due: summary.due, strong };

  return (
    <>
      <Header title="Мои слова" subtitle={items.length > 0 ? `Выучено: ${wordsCount(items.length)}` : undefined} onBack={onBack} />
      <main className="mx-auto flex max-w-md flex-col gap-block p-block pb-section">
        {items.length === 0 ? (
          <Card className="text-center text-ink-soft" data-testid="words-empty">
            Здесь будут слова, которые вы выучили: пройдите все этапы слова в уроке, и оно появится в списке.
          </Card>
        ) : (
          <>
            <Card className="flex flex-col gap-3" data-testid="words-summary">
              <div className="font-semibold">{repeatCardText(summary).line}</div>
              {summary.due > 0 && (
                <Button block onClick={onRepeat} data-testid="words-repeat">
                  Повторить
                </Button>
              )}
              <p className="text-sm text-ink-soft">
                Полоска показывает, насколько крепко слово помнится. Вспомнили при повторении: пауза растёт ({REPEAT_INTERVALS.join(", ")} дней).
                Забыли: слово вернётся завтра.
              </p>
            </Card>
            <div className="flex gap-2" role="tablist" aria-label="Какие слова показать">
              {FILTERS.map((f) => (
                <button
                  key={f.key}
                  type="button"
                  role="tab"
                  aria-selected={filter === f.key}
                  data-testid={`words-filter-${f.key}`}
                  onClick={() => setFilter(f.key)}
                  className={`min-h-10 flex-1 whitespace-nowrap rounded-full px-2 text-sm font-semibold ${
                    filter === f.key ? "bg-accent text-white" : "bg-surface text-ink-soft border border-line"
                  }`}
                >
                  {f.title} ({counts[f.key]})
                </button>
              ))}
            </div>
            <section className="rounded-card border border-line bg-surface" data-testid="words-list">
              {shown.length === 0 ? (
                <p className="p-block text-center text-ink-soft">
                  {filter === "strong" ? "Прочные слова появятся после нескольких удачных повторений." : "Сейчас повторять нечего."}
                </p>
              ) : (
                shown.map((item) => <WordRow key={item.word.id} item={item} />)
              )}
            </section>
          </>
        )}
      </main>
    </>
  );
}

function WordRow({ item }: { item: MyWordItem }) {
  const { word, box, dueIn } = item;
  const filled = strengthFilled(box);
  return (
    <div className="flex items-center gap-3 border-b border-line px-3 py-2.5 last:border-b-0" data-testid="words-row" data-box={box}>
      <SpeakerButton item={word} label={`Послушать: ${word.ru}`} />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span dir="rtl" lang="he" className="font-hebrew text-2xl font-semibold">
            {word.he}
          </span>
          <span className="truncate text-sm text-accent">[{word.translit}]</span>
        </div>
        <div className="truncate text-ink-soft">{word.ru}</div>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        <div className="flex gap-0.5" role="img" aria-label={`Сила памяти: ${REPEAT_BOX_TITLES[box] ?? ""}, ${filled} из ${REPEAT_LAST_BOX + 1}`}>
          {Array.from({ length: REPEAT_LAST_BOX + 1 }, (_, i) => (
            <span key={i} className={`h-2 w-2.5 rounded-sm ${i < filled ? "bg-accent" : "bg-line"}`} />
          ))}
        </div>
        <span className={`text-xs ${dueIn === 0 ? "font-semibold text-accent" : "text-ink-soft"}`}>{dueIn === 0 ? "пора" : dueInText(dueIn)}</span>
      </div>
    </div>
  );
}

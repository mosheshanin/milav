import { useState } from "react";
import type { VerbData, VerbTense } from "@milav/shared";
import { verbBadge, verbTabs } from "../lib/verbCard";
import { SpeakerButton } from "./SpeakerButton";
import { Chip } from "./ui";

/**
 * Блок глагола на карточке слова: бинъян и корень, вкладки времён (настоящее, прошедшее, будущее, повелительное)
 * и таблица форм с подписью («я», «ты (м.)», «она») и кнопкой «послушать» у каждой формы.
 * Состояние вкладки живёт здесь: карточка пересоздаётся для каждого слова (`key` в WordCard), и вкладка снова «Настоящее».
 */
export function VerbForms({ verb }: { verb: VerbData }) {
  const tabs = verbTabs(verb);
  const [tense, setTense] = useState<VerbTense>(tabs[0]?.tense ?? "present");
  const tab = tabs.find((t) => t.tense === tense) ?? tabs[0];
  const badge = verbBadge(verb);

  return (
    <div className="w-full border-t border-line pt-2" data-testid="verb-forms">
      <div className="flex flex-wrap items-center gap-2" data-testid="verb-badge">
        <Chip tone="accent">{badge.binyan}</Chip>
        <span className="text-xs text-ink-soft">корень</span>
        <span dir="rtl" lang="he" className="font-hebrew text-lg font-semibold">
          {badge.root}
        </span>
      </div>

      {tab && (
        <>
          <div className="mt-2 grid auto-cols-fr grid-flow-col gap-1" role="tablist" aria-label="Время глагола">
            {tabs.map((t) => (
              <button
                key={t.tense}
                type="button"
                role="tab"
                aria-selected={t.tense === tab.tense}
                aria-label={t.title}
                data-testid={`verb-tab-${t.tense}`}
                onClick={() => setTense(t.tense)}
                className={`min-h-10 rounded-control border px-1 text-xs font-semibold transition ${
                  t.tense === tab.tense ? "border-accent bg-accent text-white" : "border-line bg-surface text-ink"
                }`}
              >
                {t.short}
              </button>
            ))}
          </div>

          <div role="tabpanel" aria-label={tab.title} data-testid={`verb-panel-${tab.tense}`}>
            <div className="mt-2 text-xs font-semibold text-ink-soft">{tab.title}</div>
            <dl>
              {tab.rows.map((row) => (
                <div key={row.key} className="flex items-center justify-between gap-1.5" data-testid={`verb-row-${tab.tense}-${row.key}`}>
                  <dt className="flex min-w-0 items-baseline gap-1.5 text-xs text-ink-soft">
                    <span>{row.label}</span>
                    {row.pronoun && (
                      <span dir="rtl" lang="he" className="font-hebrew text-sm">
                        {row.pronoun}
                      </span>
                    )}
                  </dt>
                  <dd className="flex shrink-0 items-center gap-1.5">
                    <SpeakerButton
                      item={{ he: row.form.niqqud, audio: row.form.audio }}
                      label={`Послушать: ${tab.title}, ${row.label}`}
                      testId={`listen-verb-${tab.tense}-${row.key}`}
                    />
                    <span className="text-sm text-accent">[{row.form.translit}]</span>
                    <span dir="rtl" lang="he" className="font-hebrew text-lg">
                      {row.form.he}
                    </span>
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        </>
      )}
    </div>
  );
}

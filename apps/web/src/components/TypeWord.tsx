import { useState } from "react";
import type { Word } from "@milav/shared";
import { lettersOf } from "./WriteWord";
import { HebrewKeyboard } from "./HebrewKeyboard";
import { Button } from "./ui";

/** Набор слова на экранной клавиатуре. Слово видно на карточке выше. */
export function TypeWord({ word, onDone }: { word: Word; onDone: () => void }) {
  const target = lettersOf(word);
  const [typed, setTyped] = useState<string[]>([]);

  const complete = typed.length === target.length;
  const correct = complete && typed.every((ch, i) => ch === target[i]);
  const wrong = complete && !correct;

  return (
    <div className="flex flex-col gap-block">
      <div
        dir="rtl"
        lang="he"
        data-testid="typed"
        className={`flex min-h-16 items-center justify-center rounded-card border-2 bg-surface px-block font-hebrew text-4xl font-bold ${
          correct ? "border-success text-success" : wrong ? "border-danger text-danger" : "border-line"
        }`}
      >
        {typed.join("") || <span className="text-xl font-normal text-ink-soft">Наберите слово</span>}
      </div>

      {correct ? (
        <Button variant="success" onClick={onDone} data-testid="type-done">
          Верно! Дальше
        </Button>
      ) : (
        <>
          <HebrewKeyboard
            onKey={(letter) => {
              setTyped((prev) => (prev.length < target.length ? [...prev, letter] : prev));
            }}
            onBackspace={() => {
              setTyped((prev) => prev.slice(0, -1));
            }}
          />
          {wrong && (
            <p role="alert" className="text-center font-semibold text-danger">
              Не совпадает со словом. Сотрите лишнее и наберите ещё раз.
            </p>
          )}
        </>
      )}
    </div>
  );
}

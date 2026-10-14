import { useState } from "react";
import { GERESH, typedLetters } from "@milav/shared";
import type { Spelled } from "./WriteWord";
import { HebrewKeyboard } from "./HebrewKeyboard";
import { Button } from "./ui";

/**
 * Набор слова (или одной буквы) на экранной клавиатуре. Слово видно на карточке выше.
 * Звуки дж, ж, ч набирают двумя знаками: буква и гереш (ג׳); для них на клавиатуре есть клавиша ׳.
 */
export function TypeWord({ word, onDone }: { word: Spelled; onDone: (typed: string) => void }) {
  const target = typedLetters(word.he);
  const needsGeresh = target.includes(GERESH);
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
        {typed.join("") || <span className="text-xl font-normal text-ink-soft">{needsGeresh ? "Нажмите букву, затем гереш" : target.length === 1 ? "Нажмите букву" : "Наберите слово"}</span>}
      </div>

      {correct ? (
        <Button variant="success" onClick={() => onDone(typed.join(""))} data-testid="type-done">
          Верно! Дальше
        </Button>
      ) : (
        <>
          <HebrewKeyboard
            geresh={needsGeresh}
            onKey={(letter) => {
              setTyped((prev) => (prev.length < target.length ? [...prev, letter] : prev));
            }}
            onBackspace={() => {
              setTyped((prev) => prev.slice(0, -1));
            }}
          />
          {wrong && (
            <p role="alert" className="text-center font-semibold text-danger">
              {needsGeresh ? "Не совпадает. Сотрите и наберите букву и гереш ещё раз." : target.length === 1 ? "Это другая буква. Сотрите и попробуйте ещё раз." : "Не совпадает со словом. Сотрите лишнее и наберите ещё раз."}
            </p>
          )}
        </>
      )}
    </div>
  );
}

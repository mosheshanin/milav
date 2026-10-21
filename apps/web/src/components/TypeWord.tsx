import { useState } from "react";
import { GERESH, isPhrase, spacedTyped, typedLetters } from "@milav/shared";
import type { Spelled } from "./WriteWord";
import { HebrewKeyboard } from "./HebrewKeyboard";
import { AutoNextButton } from "./AutoNextButton";

/**
 * Набор слова (или одной буквы) на экранной клавиатуре. Слово видно на карточке выше.
 * Звуки дж, ж, ч набирают двумя знаками: буква и гереш (ג׳); для них на клавиатуре есть клавиша ׳.
 * Фразу («אחר כך») набирают без пробела: промежуток между словами приложение ставит само (`spacedTyped`), на сервер уходят только буквы.
 * `autoNext`: после верного набора кнопка «Дальше» сама срабатывает через 2 секунды (этапы урока).
 */
export function TypeWord({
  word,
  onDone,
  autoNext = false,
}: {
  word: Spelled;
  onDone: (typed: string) => void;
  autoNext?: boolean;
}) {
  const target = typedLetters(word.he);
  const needsGeresh = target.includes(GERESH);
  const phrase = isPhrase(word.he);
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
        {spacedTyped(typed, word.he) || (
          <span className="text-xl font-normal text-ink-soft">
            {needsGeresh ? "Нажмите букву, затем гереш" : target.length === 1 ? "Нажмите букву" : phrase ? "Наберите фразу, пробел встанет сам" : "Наберите слово"}
          </span>
        )}
      </div>

      {correct ? (
        <AutoNextButton tone="success" running={autoNext} onNext={() => onDone(typed.join(""))} testId="type-done">
          Верно! Дальше
        </AutoNextButton>
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
              {needsGeresh ? "Не совпадает. Сотрите и наберите букву и гереш ещё раз." : target.length === 1 ? "Это другая буква. Сотрите и попробуйте ещё раз." : phrase ? "Не совпадает с фразой. Сотрите лишнее и наберите ещё раз." : "Не совпадает со словом. Сотрите лишнее и наберите ещё раз."}
            </p>
          )}
        </>
      )}
    </div>
  );
}

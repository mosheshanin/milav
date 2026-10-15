import { Delete } from "lucide-react";
import { GERESH } from "@milav/shared";

/**
 * Стандартная израильская раскладка (SI-1452), ряды слева направо, как клавиши стоят на клавиатуре
 * компьютера и в ивритской раскладке телефона: верхний ряд ק…פ (клавиши E…P), средний ש…ף (A…;), нижний ז…ץ (Z….).
 * Клавиатура всегда рисуется слева направо (`dir="ltr"`), иначе ряды отражаются зеркально.
 */
export const HEBREW_KEYBOARD_ROWS = ["קראטוןםפ", "שדגכעיחלךף", "זסבהנמצתץ"] as const;

/** Ширина клавиши: десятая часть ряда за вычетом 9 промежутков по 0,375rem (gap-1.5). Ряды короче десяти клавиш центрируются. */
const KEY_WIDTH = "w-[calc((100%-3.375rem)/10)]";
const KEY_CLASS = `flex h-12 ${KEY_WIDTH} shrink-0 items-center justify-center rounded-control border border-line bg-surface active:bg-accent-soft`;

/** Экранная клавиатура иврита. Своя, потому что на телефоне у многих не установлена ивритская раскладка. */
/** `onBackspace` не нужен, когда ответ уходит сразу по нажатию (вопрос викторины «найди букву»): кнопка тогда не показывается. */
/**
 * `geresh`: добавляет клавишу ׳ (гереш, апостроф) для звуков дж, ж, ч (ג׳ ז׳ צ׳). Только в уроке, где она нужна: в словах её нет.
 * Клавиша стоит там же, где апостроф на стандартной раскладке: слева от ק. Стирание справа в верхнем ряду, как на телефоне.
 */
export function HebrewKeyboard({
  onKey,
  onBackspace,
  geresh = false,
}: {
  onKey: (letter: string) => void;
  onBackspace?: () => void;
  geresh?: boolean;
}) {
  return (
    <div dir="ltr" className="flex flex-col gap-1.5" data-testid="keyboard">
      {HEBREW_KEYBOARD_ROWS.map((row, index) => (
        <div key={row} className="flex justify-center gap-1.5" data-testid={`keyboard-row-${index + 1}`}>
          {index === 0 && geresh && (
            <button
              type="button"
              lang="he"
              onClick={() => onKey(GERESH)}
              aria-label="Гереш, апостроф"
              data-testid="key-geresh"
              className={`${KEY_CLASS} font-hebrew text-2xl`}
            >
              {GERESH}
            </button>
          )}
          {[...row].map((letter) => (
            <button
              key={letter}
              type="button"
              lang="he"
              onClick={() => onKey(letter)}
              className={`${KEY_CLASS} font-hebrew text-xl`}
            >
              {letter}
            </button>
          ))}
          {index === 0 && onBackspace && (
            <button
              type="button"
              onClick={onBackspace}
              aria-label="Стереть букву"
              data-testid="key-backspace"
              className={KEY_CLASS}
            >
              <Delete className="size-icon" aria-hidden />
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

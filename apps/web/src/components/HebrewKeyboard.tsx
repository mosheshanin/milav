import { Delete } from "lucide-react";

// Раскладка как на израильской клавиатуре. Ряды показываются справа налево.
const ROWS = ["קראטוןםפ", "שדגכעיחלךף", "זסבהנמצתץ"];

/** Экранная клавиатура иврита. Своя, потому что на телефоне у многих не установлена ивритская раскладка. */
export function HebrewKeyboard({ onKey, onBackspace }: { onKey: (letter: string) => void; onBackspace: () => void }) {
  return (
    <div dir="rtl" className="flex flex-col gap-1.5" data-testid="keyboard">
      {ROWS.map((row) => (
        <div key={row} className="flex justify-center gap-1.5">
          {[...row].map((letter) => (
            <button
              key={letter}
              type="button"
              lang="he"
              onClick={() => onKey(letter)}
              className="flex h-12 min-w-0 flex-1 items-center justify-center rounded-control border border-line bg-surface font-hebrew text-xl active:bg-accent-soft"
            >
              {letter}
            </button>
          ))}
        </div>
      ))}
      <div className="flex justify-center">
        <button
          type="button"
          onClick={onBackspace}
          aria-label="Стереть букву"
          className="flex h-12 w-24 items-center justify-center rounded-control border border-line bg-surface active:bg-accent-soft"
        >
          <Delete className="size-icon" aria-hidden />
        </button>
      </div>
    </div>
  );
}

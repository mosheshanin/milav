import { useEffect, useRef, useState } from "react";
import { Eraser } from "lucide-react";
import {
  WRITE_ATTEMPTS_PER_LETTER,
  featuresFromStrokes,
  isLetterAccepted,
  loadTemplates,
  roundStrokes,
  wordLetterGroups,
  wordLetters,
  type Stroke,
  type Template,
} from "@milav/shared";
import { DrawCanvas, type DrawHandle } from "./DrawCanvas";
import { AutoNextButton } from "./AutoNextButton";
import { Button } from "./ui";

export interface WriteResult {
  /** Сколько букв так и не получилось написать за отведённые попытки. */
  failedLetters: number;
  /**
   * Принятые штрихи каждой буквы в порядке написания (у буквы с ошибкой пустой список).
   * Их отправляют на сервер как доказательство этапа «пиши».
   */
  letterStrokes: Stroke[][];
}

type Slot = "pending" | "ok" | "fail";

/** Слово или буква: нужно только написание. */
export interface Spelled {
  he: string;
}

/** Буквы слова в порядке написания (первая буква справа). У буквы одна. */
export function lettersOf(word: Spelled): string[] {
  return wordLetters(word.he);
}

/**
 * Написание слова по буквам.
 * study: слово видно, буква подсказана бледным контуром, попыток сколько угодно.
 * quiz: слово не показано, подсказки нет, на каждую букву WRITE_ATTEMPTS_PER_LETTER попытки;
 *       если обе неудачны, буква засчитывается как ошибка, показывается верная и идём дальше.
 * `autoNext`: когда все буквы написаны без ошибок, кнопка `doneLabel` сама срабатывает через 2 секунды (этапы урока).
 */
export function WriteWord({
  word,
  mode,
  onDone,
  doneLabel,
  autoNext = false,
}: {
  word: Spelled;
  mode: "study" | "quiz";
  onDone: (result: WriteResult) => void;
  doneLabel: string;
  autoNext?: boolean;
}) {
  const letters = lettersOf(word);
  /** Клетки по словам: у фразы («אחר כך») группы с промежутком, буквы рисуют подряд, пробел не рисуют. */
  const groups = wordLetterGroups(word.he);
  const phrase = groups.length > 1;
  const canvas = useRef<DrawHandle>(null);
  /** Принятые штрихи по буквам (по индексу буквы). Хранится в ref: на отрисовку не влияет. */
  const accepted = useRef<Stroke[][]>([]);
  const [templates, setTemplates] = useState<Template[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [slots, setSlots] = useState<Slot[]>(() => letters.map(() => "pending"));
  const [index, setIndex] = useState(0);
  const [attempts, setAttempts] = useState(0);
  const [hasInk, setHasInk] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);

  useEffect(() => {
    loadTemplates().then(setTemplates, () => setLoadFailed(true));
  }, []);

  const finished = index >= letters.length;
  const current = letters[index];

  function settle(result: Slot, text: string, tone: "ok" | "bad", strokes: Stroke[] = []) {
    accepted.current[index] = strokes;
    setSlots((prev) => prev.map((s, i) => (i === index ? result : s)));
    setIndex(index + 1);
    setAttempts(0);
    setHasInk(false);
    setMessage({ tone, text });
    canvas.current?.clear();
  }

  function check() {
    if (!templates || !current || !canvas.current) return;
    // Проверяем округлённые штрихи и отправляем на сервер именно их: тогда принятое здесь примет и сервер.
    const strokes = roundStrokes(canvas.current.strokes());
    const features = featuresFromStrokes(strokes, canvas.current.lineHeight());
    if (!features) return;
    if (isLetterAccepted(features, templates, current)) {
      settle("ok", "Верно!", "ok", strokes);
      return;
    }
    const used = attempts + 1;
    if (mode === "quiz" && used >= WRITE_ATTEMPTS_PER_LETTER) {
      settle("fail", `Ошибка. Нужна буква «${current}».`, "bad");
      return;
    }
    setAttempts(used);
    setMessage({
      tone: "bad",
      text:
        mode === "quiz"
          ? `Не похоже на нужную букву. Осталась ещё ${WRITE_ATTEMPTS_PER_LETTER - used} попытка.`
          : `Не похоже на «${current}». Попробуйте ещё раз.`,
    });
    canvas.current.clear();
  }

  if (loadFailed) return <p className="text-center text-danger">Не удалось загрузить образцы букв. Проверьте интернет.</p>;

  const failedLetters = slots.filter((s) => s === "fail").length;

  return (
    <div className="flex flex-col gap-block">
      <div dir="rtl" className="flex flex-wrap justify-center gap-x-5 gap-y-2" data-testid="write-slots">
        {groups.map((group, g) => {
          const offset = groups.slice(0, g).reduce((sum, x) => sum + x.length, 0);
          return (
            <div key={g} className="flex flex-wrap justify-center gap-2" data-testid="write-group">
              {group.map((letter, k) => {
                const i = offset + k;
                return (
                  <span
                    key={i}
                    lang="he"
                    data-slot={slots[i]}
                    className={`flex items-center justify-center rounded-control border-2 font-hebrew font-bold ${
                      letters.length > 7 ? "size-10 text-xl" : "size-12 text-2xl"
                    } ${
                      slots[i] === "ok"
                        ? "border-success bg-success-soft text-success"
                        : slots[i] === "fail"
                          ? "border-danger bg-danger-soft text-danger"
                          : i === index
                            ? "border-accent bg-accent-soft"
                            : "border-line bg-surface"
                    }`}
                  >
                    {slots[i] !== "pending" || (mode === "study" && i === index) ? letter : ""}
                  </span>
                );
              })}
            </div>
          );
        })}
      </div>

      {finished ? (
        <>
          <p className={`text-center font-semibold ${failedLetters ? "text-danger" : "text-success"}`}>
            {failedLetters ? `Букв с ошибкой: ${failedLetters}` : letters.length === 1 ? "Буква написана!" : phrase ? "Фраза написана!" : "Слово написано!"}
          </p>
          <AutoNextButton
            running={autoNext && failedLetters === 0}
            onNext={() => onDone({ failedLetters, letterStrokes: letters.map((_, i) => accepted.current[i] ?? []) })}
            testId="write-done"
          >
            {doneLabel}
          </AutoNextButton>
        </>
      ) : (
        <>
          {letters.length > 1 && (
            <p className="text-center text-ink-soft">
              Буква {index + 1} из {letters.length}
            </p>
          )}
          <DrawCanvas
            key={index}
            ref={canvas}
            ghost={mode === "study" ? current : undefined}
            onInkChange={setHasInk}
            disabled={!templates}
          />
          <div className="grid grid-cols-2 gap-2">
            <Button variant="ghost" onClick={() => canvas.current?.clear()} disabled={!hasInk} data-testid="clear">
              <Eraser className="size-icon" aria-hidden />
              Стереть
            </Button>
            <Button onClick={check} disabled={!hasInk || !templates} data-testid="check">
              Проверить
            </Button>
          </div>
        </>
      )}
      {message && !finished && (
        <p role="status" className={`text-center font-semibold ${message.tone === "ok" ? "text-success" : "text-danger"}`}>
          {message.text}
        </p>
      )}
    </div>
  );
}

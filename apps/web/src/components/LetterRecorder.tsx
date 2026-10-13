import { useRef, useState } from "react";
import { LETTER_NAMES, roundStrokes, thinStrokes, type TemplateItem } from "@milav/shared";
import { api } from "../api";
import { recordErrorText } from "../lib/apiErrors";
import { firstFreeSlot, letterCounts, nextIncompleteLetter, withItem, withoutItem } from "../lib/recordProgress";
import { confirmAction } from "../telegram";
import { DrawCanvas, type DrawHandle } from "./DrawCanvas";
import { StrokePreview } from "./StrokePreview";
import { Button, Card } from "./ui";

interface Message {
  tone: "ok" | "warn" | "error";
  text: string;
}

const MESSAGE_STYLES: Record<Message["tone"], string> = {
  ok: "bg-success-soft text-success",
  warn: "bg-accent-soft text-ink",
  error: "bg-danger-soft text-danger",
};

/**
 * Карточка одной формы: пять ячеек вариантов и холст. Родитель даёт `key={letter}`, поэтому при смене буквы
 * состояние (выбранный вариант, сообщения) начинается заново.
 */
export function LetterRecorder({
  letter,
  items,
  variants,
  warnings,
  onSaved,
  onDeleted,
  onWarning,
  onPick,
  onClose,
}: {
  letter: string;
  items: TemplateItem[];
  variants: number;
  /** На какую букву рисунок похож больше, чем на ожидаемую: ключ `буква:номер`. */
  warnings: Record<string, string>;
  onSaved: (item: TemplateItem) => void;
  onDeleted: (letter: string, slot: number) => void;
  onWarning: (letter: string, slot: number, looksLike: string | null) => void;
  onPick: (letter: string) => void;
  onClose: () => void;
}) {
  const canvas = useRef<DrawHandle>(null);
  const [slot, setSlot] = useState(() => firstFreeSlot(items, letter, variants) ?? 0);
  /** Меняется при каждой очистке и смене варианта: новый ключ даёт чистый холст. */
  const [canvasKey, setCanvasKey] = useState(0);
  const [hasInk, setHasInk] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<Message | null>(null);

  const mine = items.filter((i) => i.letter === letter);
  const itemAt = (n: number) => mine.find((i) => i.slot === n);
  const current = itemAt(slot);
  const complete = (letterCounts(items, variants).get(letter) ?? 0) >= variants;
  const next = nextIncompleteLetter(items, variants, letter);

  function resetCanvas() {
    setCanvasKey((k) => k + 1);
    setHasInk(false);
  }

  function selectSlot(n: number) {
    if (busy) return;
    setSlot(n);
    setMessage(null);
    resetCanvas();
  }

  async function save() {
    const handle = canvas.current;
    if (!handle || !handle.hasInk() || busy) return;
    const strokes = roundStrokes(thinStrokes(handle.strokes()));
    setBusy(true);
    setMessage(null);
    try {
      const res = await api.templateSave({ letter, slot, strokes });
      const after = withItem(items, res.item);
      onSaved(res.item);
      onWarning(letter, slot, res.accepted ? null : res.looksLike);
      resetCanvas();
      if (!res.accepted) {
        setMessage({
          tone: "warn",
          text: `Сохранено, но рисунок больше похож на «${res.looksLike}». Если нарисовали неточно, нарисуйте этот вариант ещё раз.`,
        });
        return;
      }
      const free = firstFreeSlot(after, letter, variants);
      if (free === null) {
        setMessage({ tone: "ok", text: `Все ${variants} варианта записаны.` });
      } else {
        setSlot(free);
        setMessage({ tone: "ok", text: "Сохранено." });
      }
    } catch (e) {
      // Рисунок остаётся на холсте: его можно отправить ещё раз.
      setMessage({ tone: "error", text: recordErrorText(e) });
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!current || busy) return;
    if (!(await confirmAction(`Удалить вариант ${slot + 1} буквы «${letter}»?`))) return;
    setBusy(true);
    setMessage(null);
    try {
      await api.templateDelete(letter, slot);
      onDeleted(letter, slot);
      onWarning(letter, slot, null);
      resetCanvas();
      setMessage({ tone: "ok", text: "Удалено." });
    } catch (e) {
      setMessage({ tone: "error", text: recordErrorText(e) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-section">
      <Card className="flex items-center gap-block">
        <span className="font-hebrew text-6xl leading-none" data-testid="record-letter">
          {letter}
        </span>
        <div className="min-w-0">
          <p className="font-bold capitalize">{LETTER_NAMES[letter] ?? letter}</p>
          <p className="text-sm text-ink-soft">
            Вариант {slot + 1} из {variants}
          </p>
        </div>
      </Card>

      <div className="grid grid-cols-5 gap-2" role="group" aria-label="Варианты">
        {Array.from({ length: variants }, (_, n) => {
          const item = itemAt(n);
          const warned = !!warnings[`${letter}:${n}`];
          return (
            <button
              key={n}
              type="button"
              onClick={() => selectSlot(n)}
              data-testid={`slot-${n}`}
              data-state={item ? (warned ? "warn" : "done") : "empty"}
              aria-label={`Вариант ${n + 1}: ${item ? "записан" : "пусто"}`}
              aria-pressed={n === slot}
              className={`flex aspect-square items-center justify-center rounded-control border-2 p-1 ${
                n === slot ? "border-accent" : warned ? "border-danger" : "border-line"
              } ${item ? "bg-surface text-ink" : "bg-page text-ink-soft"}`}
            >
              {item ? <StrokePreview strokes={item.strokes} className="size-full" /> : <span className="font-semibold">{n + 1}</span>}
            </button>
          );
        })}
      </div>

      {current && (
        <p className="text-sm text-ink-soft">
          Этот вариант уже записан. Нарисуйте заново и нажмите «Сохранить», чтобы заменить, или удалите его.
        </p>
      )}

      <DrawCanvas key={canvasKey} ref={canvas} onInkChange={setHasInk} disabled={busy} />

      {message && (
        <p role="status" data-testid="record-message" className={`rounded-control px-block py-3 text-sm font-semibold ${MESSAGE_STYLES[message.tone]}`}>
          {message.text}
        </p>
      )}

      <div className="grid grid-cols-2 gap-2">
        <Button variant="ghost" onClick={resetCanvas} disabled={busy || !hasInk}>
          Стереть
        </Button>
        <Button onClick={() => void save()} disabled={busy || !hasInk} data-testid="record-save">
          {busy ? "Сохраняю…" : "Сохранить"}
        </Button>
      </div>

      {current && (
        <Button variant="ghost" onClick={() => void remove()} disabled={busy} className="text-danger">
          Удалить этот вариант
        </Button>
      )}

      {complete && (
        <Button variant="success" block onClick={() => (next ? onPick(next) : onClose())} data-testid="record-next-letter">
          {next ? `Следующая буква: «${next}»` : "К сетке букв"}
        </Button>
      )}
      <Button variant="secondary" block onClick={onClose}>
        К сетке букв
      </Button>
    </div>
  );
}

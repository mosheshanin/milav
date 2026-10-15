import { useEffect, useState } from "react";
import type { TemplateItem } from "@milav/shared";
import { ApiError, api } from "../api";
import { Header } from "../components/Header";
import { LetterGrid } from "../components/LetterGrid";
import { LetterRecorder } from "../components/LetterRecorder";
import { Button, Card, Notice } from "../components/ui";
import { withItem, withoutItem } from "../lib/recordProgress";
import { useBackButton } from "../lib/useBackButton";
import { currentUserId } from "../telegram";

type Load =
  | { state: "loading" }
  | { state: "forbidden" }
  | { state: "error" }
  | { state: "ready"; variants: number };

/**
 * Экран записи шаблонов рукописных букв (27 форм): раздел «Шаблоны букв» панели администратора, а также параметр
 * запуска `startapp=record`. Доступ проверяет сервер: только администраторы (docs/ADMIN.md).
 */
export function RecordScreen({ onBack }: { onBack: () => void }) {
  const [load, setLoad] = useState<Load>({ state: "loading" });
  const [items, setItems] = useState<TemplateItem[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  /** Предупреждения «похоже на другую букву» только на время этого открытия: ключ `буква:номер`. */
  const [warnings, setWarnings] = useState<Record<string, string>>({});
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoad({ state: "loading" });
    api.templates().then(
      (res) => {
        if (cancelled) return;
        setItems(res.items);
        setLoad({ state: "ready", variants: res.variants });
      },
      (e) => {
        if (cancelled) return;
        setLoad({ state: e instanceof ApiError && e.status === 403 ? "forbidden" : "error" });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  // Из карточки буквы «назад» ведёт к сетке, из сетки на главную.
  useBackButton(selected ? () => setSelected(null) : onBack);

  function setWarning(letter: string, slot: number, looksLike: string | null) {
    setWarnings((prev) => {
      const key = `${letter}:${slot}`;
      if (looksLike === null) {
        if (!(key in prev)) return prev;
        const { [key]: _removed, ...rest } = prev;
        return rest;
      }
      return { ...prev, [key]: looksLike };
    });
  }

  if (load.state === "loading") return <Notice title="Загрузка…" />;

  if (load.state === "forbidden") {
    const id = currentUserId();
    return (
      <Notice title="Нет доступа">
        <p>Запись шаблонов открыта только администраторам.</p>
        {id !== null && (
          <p className="mt-2 text-sm">
            Ваш Telegram id: <b data-testid="my-id">{id}</b>. Владелец может добавить вас в «Команду» панели администратора.
          </p>
        )}
        <Button className="mt-block" onClick={onBack}>
          На главную
        </Button>
      </Notice>
    );
  }

  if (load.state === "error") {
    return (
      <Notice title="Нет связи с сервером">
        <p>Проверьте интернет и попробуйте ещё раз.</p>
        <div className="mt-block flex justify-center gap-2">
          <Button onClick={() => setAttempt((n) => n + 1)}>Повторить</Button>
          <Button variant="ghost" onClick={onBack}>
            На главную
          </Button>
        </div>
      </Notice>
    );
  }

  return (
    <div className="mx-auto flex min-h-full max-w-md flex-col">
      <Header
        title="Запись букв"
        subtitle={selected ? undefined : "Для проверки письма"}
        onBack={selected ? () => setSelected(null) : onBack}
      />
      <main className="flex flex-col gap-section p-block">
        {selected ? (
          <LetterRecorder
            key={selected}
            letter={selected}
            items={items}
            variants={load.variants}
            warnings={warnings}
            onSaved={(item) => setItems((prev) => withItem(prev, item))}
            onDeleted={(letter, slot) => setItems((prev) => withoutItem(prev, letter, slot))}
            onWarning={setWarning}
            onPick={setSelected}
            onClose={() => setSelected(null)}
          />
        ) : (
          <>
            <LetterGrid items={items} variants={load.variants} onPick={setSelected} />
            <Card>
              <p className="text-sm text-ink-soft">
                Рисунки пока лежат в базе. Когда запишете все, скажите Claude: он выгрузит их в репозиторий и подберёт пороги.
              </p>
            </Card>
          </>
        )}
      </main>
    </div>
  );
}

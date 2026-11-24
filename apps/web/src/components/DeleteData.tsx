import { useState } from "react";
import { Trash2 } from "lucide-react";
import { api } from "../api";
import { saveErrorText } from "../lib/apiErrors";
import { getTelegram } from "../telegram";
import { Button, Card } from "./ui";

/** Всё, что приложение хранит на этом устройстве (тема, скорость озвучки, раскрытые разделы, кэш уроков, экран). */
export function clearDeviceData(): void {
  for (const storage of [safe(() => window.localStorage), safe(() => window.sessionStorage)]) {
    if (!storage) continue;
    try {
      const keys = Array.from({ length: storage.length }, (_, i) => storage.key(i)).filter((k): k is string => !!k && k.startsWith("milav"));
      for (const k of keys) storage.removeItem(k);
    } catch {
      // Хранилище недоступно: на устройстве нечего чистить.
    }
  }
}

function safe<T>(get: () => T): T | null {
  try {
    return get();
  } catch {
    return null;
  }
}

/**
 * «Удалить мои данные» (политика конфиденциальности, решение владельца 24.11): два шага, чтобы не удалить случайно.
 * После удаления показывается только итог: ничего больше не запрашиваем, иначе профиль создался бы заново.
 */
export function DeleteData({ onDeleted }: { onDeleted: () => void }) {
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await api.deleteMe();
      clearDeviceData();
      onDeleted();
    } catch (e) {
      setError(saveErrorText(e));
      setBusy(false);
    }
  }

  if (!asking) {
    return (
      <Button variant="ghost" block onClick={() => setAsking(true)} data-testid="delete-data">
        <Trash2 className="size-icon" aria-hidden />
        Удалить мои данные
      </Button>
    );
  }
  return (
    <div className="flex flex-col gap-2 rounded-control border border-danger p-3" data-testid="delete-confirm">
      <p className="font-semibold">Удалить все ваши данные?</p>
      <p className="text-sm text-ink-soft">
        Удалятся прогресс, результаты викторин, очки, бейджи, повторение слов, настройки и напоминания, вы пропадёте из таблицы
        лидеров. Восстановить это нельзя.
      </p>
      <Button variant="danger" block disabled={busy} onClick={() => void remove()} data-testid="delete-confirm-yes">
        {busy ? "Удаляем…" : "Да, удалить всё"}
      </Button>
      <Button variant="ghost" block disabled={busy} onClick={() => setAsking(false)} data-testid="delete-confirm-no">
        Отмена
      </Button>
      {error && (
        <p className="text-danger" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

/** Итог удаления: данные удалены, приложение можно закрыть. Если открыть снова, всё начнётся с нуля. */
export function DataDeleted() {
  const tg = getTelegram();
  return (
    <main className="mx-auto flex max-w-md flex-col gap-section p-block pb-section" data-testid="data-deleted">
      <Card className="flex flex-col gap-3 text-center">
        <h1 className="text-xl font-bold">Данные удалены</h1>
        <p className="text-ink-soft">
          Мы удалили ваш прогресс и настройки. Если снова откроете приложение, начнёте с нуля. Спасибо, что занимались с Milav!
        </p>
        {tg?.close && (
          <Button block onClick={() => tg.close?.()} data-testid="close-app">
            Закрыть приложение
          </Button>
        )}
      </Card>
    </main>
  );
}

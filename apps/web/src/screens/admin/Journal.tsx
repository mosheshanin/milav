// «Журнал»: кто, когда и что поменял в панели. Новые сверху, «Показать ещё» подгружает более старые.
import { useState } from "react";
import type { AdminLogEntry, AdminLogResponse } from "@milav/shared";
import { api } from "../../api";
import { Button, Card } from "../../components/ui";
import { adminErrorText, dateTimeText, logEntryText } from "../../lib/adminText";
import { LoadView, useLoad } from "./load";

export function Journal() {
  const [value, reload] = useLoad(() => api.admin.log());
  return <LoadView value={value} reload={reload}>{(data) => <JournalView first={data} />}</LoadView>;
}

function JournalView({ first }: { first: AdminLogResponse }) {
  const [entries, setEntries] = useState<AdminLogEntry[]>(first.entries);
  const [next, setNext] = useState(first.nextBefore);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function more() {
    if (!next || busy) return;
    setBusy(true);
    setError(null);
    try {
      const page = await api.admin.log(next);
      setEntries((prev) => [...prev, ...page.entries]);
      setNext(page.nextBefore);
    } catch (e) {
      setError(adminErrorText(e));
    } finally {
      setBusy(false);
    }
  }

  if (entries.length === 0) {
    return (
      <Card>
        <p className="text-ink-soft">Пока ничего не меняли. Здесь появятся изменения настроек и команды.</p>
      </Card>
    );
  }

  return (
    <>
      <ul className="flex flex-col gap-2" data-testid="log-list">
        {entries.map((e) => (
          <li key={e.id}>
            <Card className="flex flex-col gap-1 p-3">
              <span>{logEntryText(e)}</span>
              <span className="text-sm text-ink-soft">
                {dateTimeText(e.at)} · {e.actorName ? `${e.actorName}, ` : ""}id {e.actor}
              </span>
            </Card>
          </li>
        ))}
      </ul>
      {next && (
        <Button variant="ghost" disabled={busy} onClick={() => void more()}>
          Показать ещё
        </Button>
      )}
      {error && <p role="alert">{error}</p>}
    </>
  );
}

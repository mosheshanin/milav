// «Напоминания»: тексты сообщений бота по видам. Изменить, добавить, выключить, удалить, «Прислать мне»,
// статистика по каждому тексту (отправлено и сколько раз после него открыли приложение в течение суток).
import { useState } from "react";
import {
  KIND_PLACEHOLDERS,
  REMINDER_KINDS,
  REMINDER_KIND_HINTS,
  REMINDER_KIND_TITLES,
  REMINDER_PLACEHOLDERS,
  REMINDER_TEXT_MAX,
  checkReminderText,
  type AdminRemindersResponse,
  type ReminderKind,
  type ReminderTextItem,
} from "@milav/shared";
import { api } from "../../api";
import { Button, Card, Chip } from "../../components/ui";
import { adminErrorText, reminderTextErrorText } from "../../lib/adminText";
import { confirmAction } from "../../telegram";
import { LoadView, useLoad } from "./load";

export function Reminders() {
  const [value, reload] = useLoad(() => api.admin.reminders());
  return <LoadView value={value} reload={reload}>{(data) => <RemindersView data={data} />}</LoadView>;
}

function RemindersView({ data }: { data: AdminRemindersResponse }) {
  const [texts, setTexts] = useState(data.texts);
  const [message, setMessage] = useState<string | null>(null);
  const replace = (item: ReminderTextItem) => setTexts((prev) => prev.map((t) => (t.id === item.id ? item : t)));

  return (
    <>
      <p className="text-sm text-ink-soft" data-testid="reminders-summary">
        Включили напоминания: <b>{data.subscribers}</b>. Отключили или заблокировали бота: <b>{data.blocked}</b>. Включить
        напоминания для всех: «Настройки приложения» → «Напоминания от бота».
      </p>
      {REMINDER_KINDS.map((kind) => (
        <KindSection
          key={kind}
          kind={kind}
          texts={texts.filter((t) => t.kind === kind)}
          onChanged={replace}
          onAdded={(item) => setTexts((prev) => [...prev, item])}
          onRemoved={(id) => setTexts((prev) => prev.filter((t) => t.id !== id))}
          onMessage={setMessage}
        />
      ))}
      {message && (
        <p role="status" className="sticky bottom-2 rounded-card border border-line bg-surface p-3 shadow" data-testid="reminders-admin-message">
          {message}
        </p>
      )}
    </>
  );
}

function KindSection({
  kind,
  texts,
  onChanged,
  onAdded,
  onRemoved,
  onMessage,
}: {
  kind: ReminderKind;
  texts: ReminderTextItem[];
  onChanged: (item: ReminderTextItem) => void;
  onAdded: (item: ReminderTextItem) => void;
  onRemoved: (id: number) => void;
  onMessage: (text: string | null) => void;
}) {
  const [adding, setAdding] = useState(false);
  const active = texts.filter((t) => t.enabled).length;
  return (
    <section className="flex flex-col gap-2" data-testid={`reminder-kind-${kind}`}>
      <h2 className="text-lg font-bold">{REMINDER_KIND_TITLES[kind]}</h2>
      <p className="text-sm text-ink-soft">{REMINDER_KIND_HINTS[kind]}</p>
      <Placeholders kind={kind} />
      {active === 0 && <p className="text-sm text-danger">Все тексты этого вида выключены: такие сообщения не отправляются.</p>}
      {texts.map((t) => (
        <TextCard key={t.id} item={t} onChanged={onChanged} onRemoved={onRemoved} onMessage={onMessage} />
      ))}
      {adding ? (
        <Editor
          kind={kind}
          initial=""
          saveTitle="Добавить"
          onCancel={() => setAdding(false)}
          onSave={async (text) => {
            const res = await api.admin.addReminder(kind, text);
            onAdded(res.item);
            setAdding(false);
            onMessage("Текст добавлен и включён.");
          }}
        />
      ) : (
        <Button variant="ghost" onClick={() => setAdding(true)} data-testid={`reminder-add-${kind}`}>
          Добавить текст
        </Button>
      )}
    </section>
  );
}

function Placeholders({ kind }: { kind: ReminderKind }) {
  return (
    <details className="text-sm text-ink-soft">
      <summary className="cursor-pointer font-semibold text-ink">Подстановки</summary>
      <ul className="mt-1 flex flex-col gap-1">
        {KIND_PLACEHOLDERS[kind].map((name) => (
          <li key={name}>
            <code className="rounded bg-page px-1">{`{${name}}`}</code> — {REMINDER_PLACEHOLDERS[name]}
          </li>
        ))}
      </ul>
      <p className="mt-1">Текст с подстановкой выбирается, только когда для неё есть данные. Разметка не нужна: текст уходит как есть, эмодзи можно.</p>
    </details>
  );
}

function TextCard({
  item,
  onChanged,
  onRemoved,
  onMessage,
}: {
  item: ReminderTextItem;
  onChanged: (item: ReminderTextItem) => void;
  onRemoved: (id: number) => void;
  onMessage: (text: string | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);

  async function run(action: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    onMessage(null);
    try {
      await action();
    } catch (e) {
      onMessage(adminErrorText(e));
    } finally {
      setBusy(false);
    }
  }

  if (editing) {
    return (
      <Editor
        kind={item.kind}
        initial={item.text}
        saveTitle="Сохранить"
        onCancel={() => setEditing(false)}
        onSave={async (text) => {
          const res = await api.admin.editReminder(item.id, { text });
          onChanged(res.item);
          setEditing(false);
          onMessage("Текст сохранён.");
        }}
      />
    );
  }

  const rate = item.sent > 0 ? Math.round((item.opened / item.sent) * 100) : null;
  return (
    <Card className={`flex flex-col gap-2 ${item.enabled ? "" : "opacity-60"}`} data-testid={`reminder-${item.id}`}>
      <p className="whitespace-pre-wrap">{item.text}</p>
      <div className="flex flex-wrap items-center gap-2 text-sm text-ink-soft">
        {!item.enabled && <Chip>Выключен</Chip>}
        <span>
          Отправлено: {item.sent}
          {rate !== null ? `, открыли в течение суток: ${item.opened} (${rate}%)` : ""}
        </span>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="ghost" className="min-h-10" disabled={busy} onClick={() => setEditing(true)} data-testid={`reminder-${item.id}-edit`}>
          Изменить
        </Button>
        <Button
          variant="ghost"
          className="min-h-10"
          disabled={busy}
          data-testid={`reminder-${item.id}-send`}
          onClick={() =>
            void run(async () => {
              const res = await api.admin.sendReminderToMe(item.id);
              onMessage(res.sent ? "Отправлено вам в чат с ботом." : `Бот не настроен, текст был бы таким: ${res.text}`);
            })
          }
        >
          Прислать мне
        </Button>
        <Button
          variant="ghost"
          className="min-h-10"
          disabled={busy}
          data-testid={`reminder-${item.id}-toggle`}
          onClick={() => void run(async () => onChanged((await api.admin.editReminder(item.id, { enabled: !item.enabled })).item))}
        >
          {item.enabled ? "Выключить" : "Включить"}
        </Button>
        <Button
          variant="ghost"
          className="min-h-10 text-danger"
          disabled={busy}
          data-testid={`reminder-${item.id}-delete`}
          onClick={() =>
            void run(async () => {
              if (!(await confirmAction("Удалить текст? Его статистика пропадёт. Если нужно только убрать его из рассылки, нажмите «Выключить»."))) return;
              await api.admin.deleteReminder(item.id);
              onRemoved(item.id);
              onMessage("Текст удалён.");
            })
          }
        >
          Удалить
        </Button>
      </div>
    </Card>
  );
}

function Editor({
  kind,
  initial,
  saveTitle,
  onSave,
  onCancel,
}: {
  kind: ReminderKind;
  initial: string;
  saveTitle: string;
  onSave: (text: string) => Promise<void>;
  onCancel: () => void;
}) {
  const [text, setText] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const length = [...text.trim()].length;

  async function save() {
    const check = checkReminderText(kind, text);
    if (!check.ok) {
      setError(reminderTextErrorText(check.error, check.name));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onSave(check.text);
    } catch (e) {
      setError(adminErrorText(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="flex flex-col gap-2" data-testid="reminder-editor">
      <textarea
        className="min-h-28 w-full rounded-control border border-line bg-page p-3 text-ink"
        value={text}
        maxLength={REMINDER_TEXT_MAX + 50}
        onChange={(e) => setText(e.target.value)}
        data-testid="reminder-editor-text"
        aria-label="Текст напоминания"
      />
      <p className={`text-sm ${length > REMINDER_TEXT_MAX ? "text-danger" : "text-ink-soft"}`}>
        {length} из {REMINDER_TEXT_MAX} знаков
      </p>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button disabled={busy} onClick={() => void save()} data-testid="reminder-editor-save">
          {saveTitle}
        </Button>
        <Button variant="ghost" disabled={busy} onClick={onCancel}>
          Отмена
        </Button>
      </div>
    </Card>
  );
}

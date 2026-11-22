// «Сообщения бота»: все тексты, которые бот пишет ученику, кроме ежедневных напоминаний и подтверждений (они в «Напоминаниях»),
// и настройки отправки. Изменить, вернуть исходный, «Прислать мне». Тексты профиля и меню команд уходят в Telegram сразу.
import { useState } from "react";
import {
  BOT_CONFIG_KEYS,
  BOT_PLACEHOLDERS,
  BOT_SAMPLE_VARS,
  BOT_TEXTS,
  BOT_TEXT_GROUPS,
  checkBotText,
  renderBotText,
  type AdminBotSaveResponse,
  type BotTextDef,
  type BotTextItem,
  type BotTextKey,
  type ConfigKey,
} from "@milav/shared";
import { api } from "../../api";
import { Button, Card, Chip } from "../../components/ui";
import { adminErrorText, botTextErrorText, dateTimeText } from "../../lib/adminText";
import { confirmAction } from "../../telegram";
import { ConfigList } from "./AppSettings";
import { LoadView, useLoad } from "./load";

/** Настройки отправки в этом разделе: выключатель напоминаний и настройки группы «bot». */
const SETTINGS_KEYS: readonly ConfigKey[] = ["reminders", ...BOT_CONFIG_KEYS];

const KIND_LABELS: Record<BotTextDef["kind"], string> = {
  message: "Сообщение",
  button: "Кнопка",
  popup: "Подсказка",
  profile: "Профиль",
};

export function BotMessages({ onOpenReminders }: { onOpenReminders: () => void }) {
  const [value, reload] = useLoad(() => Promise.all([api.admin.bot(), api.admin.config()]));
  const [message, setMessage] = useState<string | null>(null);
  return (
    <LoadView value={value} reload={reload}>
      {([bot, config]) => (
        <>
          <p className="text-sm text-ink-soft">
            Всё, что бот пишет ученику. Изменения действуют без выкладки, у всех не позже чем через минуту. В фигурных скобках
            подстановки: {"{имя}"} заменится именем из Telegram, {"{время}"} временем напоминаний.
          </p>
          <Card className="flex flex-col items-start gap-2">
            <p className="text-sm">
              Тексты ежедневных напоминаний и подтверждения «Напоминания включены» (их несколько, у каждого своя статистика) — в разделе
              «Напоминания».
            </p>
            <Button variant="ghost" className="min-h-10" onClick={onOpenReminders} data-testid="bot-open-reminders">
              Открыть «Напоминания»
            </Button>
          </Card>

          <section className="flex flex-col gap-2" data-testid="bot-settings">
            <h2 className="text-lg font-bold">Настройки отправки</h2>
            <ConfigList items={config.items} keys={SETTINGS_KEYS} />
          </section>

          <Texts items={bot.items} onMessage={setMessage} />

          {message && (
            <p role="status" className="sticky bottom-2 rounded-card border border-line bg-surface p-3 shadow" data-testid="bot-message">
              {message}
            </p>
          )}
        </>
      )}
    </LoadView>
  );
}

function Texts({ items: initial, onMessage }: { items: BotTextItem[]; onMessage: (text: string | null) => void }) {
  const [items, setItems] = useState(initial);
  const replace = (item: BotTextItem) => setItems((prev) => prev.map((i) => (i.key === item.key ? item : i)));
  return (
    <>
      {BOT_TEXT_GROUPS.map((group) => (
        <section key={group.id} className="flex flex-col gap-2" data-testid={`bot-group-${group.id}`}>
          <h2 className="text-lg font-bold">{group.title}</h2>
          <p className="text-sm text-ink-soft">{group.hint}</p>
          {items
            .filter((i) => BOT_TEXTS[i.key].group === group.id)
            .map((item) => (
              <TextCard key={item.key} item={item} onChanged={replace} onMessage={onMessage} />
            ))}
        </section>
      ))}
    </>
  );
}

/** Сообщение после сохранения: у текстов профиля ещё и итог отправки в Telegram. */
function savedText(res: AdminBotSaveResponse, reset: boolean): string {
  const base = reset ? "Возвращён исходный текст." : res.changed ? "Сохранено." : "Без изменений: текст тот же.";
  if (!res.changed || !res.telegram) return base;
  if (res.telegram === "ok") return `${base} Отправлено в Telegram.`;
  if (res.telegram === "no-token") return `${base} В Telegram не отправлено: на сервере нет токена бота.`;
  return `${base} Telegram не принял изменение; попробуйте сохранить ещё раз позже.`;
}

function TextCard({
  item,
  onChanged,
  onMessage,
}: {
  item: BotTextItem;
  onChanged: (item: BotTextItem) => void;
  onMessage: (text: string | null) => void;
}) {
  const def: BotTextDef = BOT_TEXTS[item.key];
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const testId = `bot-text-${item.key.replace(/\./g, "-")}`;

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
        itemKey={item.key}
        initial={item.text}
        testId={testId}
        onCancel={() => setEditing(false)}
        onSave={async (text) => {
          const res = await api.admin.setBotText(item.key, text);
          onChanged(res.item);
          setEditing(false);
          onMessage(savedText(res, false));
        }}
      />
    );
  }

  const preview = def.placeholders.length > 0 ? renderBotText(item.text, BOT_SAMPLE_VARS) : null;
  return (
    <Card className="flex flex-col gap-2" data-testid={testId}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold">{def.title}</span>
        <Chip>{KIND_LABELS[def.kind]}</Chip>
        {!item.isDefault && <Chip>Изменён</Chip>}
      </div>
      {def.hint && <p className="text-sm text-ink-soft">{def.hint}</p>}
      <p className="whitespace-pre-wrap rounded-control bg-page p-3" data-testid={`${testId}-text`}>
        {item.text}
      </p>
      {preview !== null && preview !== item.text && (
        <p className="whitespace-pre-wrap text-sm text-ink-soft">
          <span className="font-semibold">Пример: </span>
          {preview}
        </p>
      )}
      <p className="text-sm text-ink-soft">
        {item.isDefault || item.updatedAt === null
          ? "Исходный текст."
          : `Изменено ${dateTimeText(item.updatedAt)}${item.updatedBy ? `, id ${item.updatedBy}` : ""}.`}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button variant="ghost" className="min-h-10" disabled={busy} onClick={() => setEditing(true)} data-testid={`${testId}-edit`}>
          Изменить
        </Button>
        {def.kind === "message" && (
          <Button
            variant="ghost"
            className="min-h-10"
            disabled={busy}
            data-testid={`${testId}-send`}
            onClick={() =>
              void run(async () => {
                const res = await api.admin.sendBotTextToMe(item.key);
                onMessage(res.sent ? "Отправлено вам в чат с ботом." : `Бот не настроен, сообщение было бы таким: ${res.text}`);
              })
            }
          >
            Прислать мне
          </Button>
        )}
        {!item.isDefault && (
          <Button
            variant="ghost"
            className="min-h-10"
            disabled={busy}
            data-testid={`${testId}-reset`}
            onClick={() =>
              void run(async () => {
                if (!(await confirmAction(`Вернуть исходный текст «${def.title}»? Ваш вариант пропадёт (он останется в «Журнале»).`))) return;
                const res = await api.admin.resetBotText(item.key);
                onChanged(res.item);
                onMessage(savedText(res, true));
              })
            }
          >
            Вернуть исходный
          </Button>
        )}
      </div>
    </Card>
  );
}

function Editor({
  itemKey,
  initial,
  testId,
  onSave,
  onCancel,
}: {
  itemKey: BotTextKey;
  initial: string;
  testId: string;
  onSave: (text: string) => Promise<void>;
  onCancel: () => void;
}) {
  const def: BotTextDef = BOT_TEXTS[itemKey];
  const [text, setText] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const length = [...text.trim()].length;
  const long = def.kind === "message" || itemKey === "profile.description";

  async function save() {
    const check = checkBotText(itemKey, text);
    if (!check.ok) {
      setError(botTextErrorText(check.error, def.max, check.name));
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
    <Card className="flex flex-col gap-2" data-testid={`${testId}-editor`}>
      <span className="font-semibold">{def.title}</span>
      <textarea
        className={`${long ? "min-h-40" : "min-h-16"} w-full rounded-control border border-line bg-page p-3 text-ink`}
        value={text}
        maxLength={def.max + 50}
        onChange={(e) => setText(e.target.value)}
        data-testid={`${testId}-input`}
        aria-label={def.title}
      />
      <p className={`text-sm ${length > def.max ? "text-danger" : "text-ink-soft"}`}>
        {length} из {def.max} знаков
      </p>
      {def.placeholders.length > 0 ? (
        <ul className="text-sm text-ink-soft">
          {def.placeholders.map((name) => (
            <li key={name}>
              <code className="rounded bg-page px-1">{`{${name}}`}</code> — {BOT_PLACEHOLDERS[name]}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-ink-soft">Подстановок здесь нет. Разметка не нужна: текст уходит как есть, эмодзи можно.</p>
      )}
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button disabled={busy} onClick={() => void save()} data-testid={`${testId}-save`}>
          Сохранить
        </Button>
        <Button variant="ghost" disabled={busy} onClick={onCancel}>
          Отмена
        </Button>
        {initial !== def.default && (
          <Button variant="ghost" disabled={busy} onClick={() => setText(def.default)} data-testid={`${testId}-fill-default`}>
            Подставить исходный
          </Button>
        )}
      </div>
    </Card>
  );
}

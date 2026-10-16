// «Настройки» → «Напоминания»: выключатель, время (готовые варианты или своё), подсказка про шаббат.
import { useState } from "react";
import { REMINDER_TIME_OPTIONS, minuteText } from "@milav/shared";
import { api } from "../api";
import { useApp } from "../AppContext";
import { BOT_LINK, enableReminders, openBotChat } from "../lib/reminders";
import { Choice, Section, Toggle } from "./Controls";
import { Button } from "./ui";

/** «20:30» из поля времени → минуты от полуночи, округлённые до 5 минут (сервер принимает кратные 5). */
export function minuteFromInput(value: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(value);
  if (!m) return null;
  const minute = Number(m[1]) * 60 + Number(m[2]);
  if (minute < 0 || minute >= 1440) return null;
  return (Math.round(minute / 5) * 5) % 1440;
}

const pad = (minute: number) => `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;

export function RemindersSettings() {
  const { me, applyReminders, refresh } = useApp();
  const info = me.reminders;
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [blocked, setBlocked] = useState(false);
  if (!info) return null;

  const custom = !(REMINDER_TIME_OPTIONS as readonly number[]).includes(info.minute);

  async function run(action: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setMessage(null);
    try {
      await action();
    } finally {
      setBusy(false);
    }
  }

  const toggle = (on: boolean) =>
    run(async () => {
      if (!on) {
        try {
          applyReminders((await api.reminders({ enabled: false })).reminders);
        } catch {
          setMessage("Не удалось сохранить. Проверьте интернет и попробуйте ещё раз.");
        }
        return;
      }
      const result = await enableReminders(info.minute);
      if (result.ok) {
        applyReminders(result.reminders);
        setBlocked(false);
        setMessage(`Готово! Бот прислал подтверждение. Напомню в ${minuteText(result.reminders.minute)}.`);
      } else {
        setMessage(result.text);
        setBlocked(result.reason === "blocked");
        if (result.reason === "blocked") void refresh();
      }
    });

  const setMinute = (minute: number) =>
    run(async () => {
      try {
        applyReminders((await api.reminders({ minute })).reminders);
      } catch {
        setMessage("Не удалось сохранить время. Попробуйте ещё раз.");
      }
    });

  return (
    <Section title="Напоминания">
      <Toggle
        label="Напоминать заниматься"
        hint="Бот напишет в Telegram в выбранное время, только если в этот день вы ещё не занимались. С пятницы 15:00 до конца субботы, в шаббат, не пишем."
        checked={info.enabled}
        disabled={busy}
        testId="toggle-reminders"
        onChange={(v) => void toggle(v)}
      />
      <Choice
        label="Время"
        hint="По часам вашего телефона."
        options={[
          ...REMINDER_TIME_OPTIONS.map((m) => ({ value: m as number, title: minuteText(m) })),
          ...(custom ? [{ value: info.minute, title: minuteText(info.minute) }] : []),
        ]}
        value={info.minute}
        disabled={busy}
        testId="reminder-time"
        onChange={(m) => void setMinute(m)}
      />
      <label className="flex items-center gap-3 text-sm text-ink-soft">
        Своё время:
        <input
          type="time"
          step={300}
          className="min-h-10 rounded-control border border-line bg-page px-2 text-ink"
          value={pad(info.minute)}
          disabled={busy}
          data-testid="reminder-time-custom"
          onChange={(e) => {
            const minute = minuteFromInput(e.target.value);
            if (minute !== null && minute !== info.minute) void setMinute(minute);
          }}
        />
      </label>
      {(info.blocked || blocked) && !info.enabled && (
        <div className="flex flex-col gap-2" data-testid="reminders-blocked">
          <p className="text-sm text-danger">Бот не может вам написать: откройте чат с ботом и нажмите «Старт», потом включите напоминания снова.</p>
          <Button variant="ghost" onClick={openBotChat}>
            Открыть {BOT_LINK.replace("https://t.me/", "@")}
          </Button>
        </div>
      )}
      {message && (
        <p role="status" className="text-sm" data-testid="reminders-message">
          {message}
        </p>
      )}
    </Section>
  );
}

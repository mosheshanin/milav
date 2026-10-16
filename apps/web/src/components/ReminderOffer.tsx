// Предложение включить напоминания в момент успеха: после выученного слова (docs/REMINDERS.md, «Согласие»).
import { useState } from "react";
import { BellRing } from "lucide-react";
import { DEFAULT_REMINDER_MINUTE, minuteText } from "@milav/shared";
import { api } from "../api";
import { useApp } from "../AppContext";
import { enableReminders, openBotChat } from "../lib/reminders";
import { Overlay } from "./play";
import { Button } from "./ui";

export function ReminderOffer({ onClose }: { onClose: () => void }) {
  const { me, applyReminders, refresh } = useApp();
  const minute = me.reminders?.minute ?? DEFAULT_REMINDER_MINUTE;
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string; blocked?: boolean } | null>(null);

  async function yes() {
    if (busy) return;
    setBusy(true);
    const r = await enableReminders(minute);
    setBusy(false);
    if (r.ok) {
      applyReminders(r.reminders);
      setResult({ ok: true, text: `Готово! Бот уже прислал подтверждение. Время можно поменять в «Настройках».` });
    } else {
      setResult({ ok: false, text: r.text, blocked: r.reason === "blocked" });
      if (r.reason === "blocked") void refresh();
    }
  }

  async function later() {
    // «Не сейчас»: спросим снова не раньше чем через неделю (не больше двух раз). Ошибку сети не показываем.
    try {
      applyReminders((await api.reminders({ dismissOffer: true })).reminders);
    } catch {
      // Ничего страшного: предложение просто появится ещё раз.
    }
    onClose();
  }

  return (
    <Overlay onClose={result ? onClose : () => void later()} label="Напоминания">
      <div className="flex flex-col items-center gap-4 text-center" data-testid="reminder-offer">
        <span className="flex size-14 items-center justify-center rounded-full bg-accent-soft text-accent">
          <BellRing className="size-8" aria-hidden />
        </span>
        {result ? (
          <>
            <p role="status" data-testid="reminder-offer-result">
              {result.text}
            </p>
            {result.blocked && (
              <Button variant="ghost" block onClick={openBotChat}>
                Открыть чат с ботом
              </Button>
            )}
            <Button block onClick={onClose}>
              Хорошо
            </Button>
          </>
        ) : (
          <>
            <h2 className="px-8 text-xl font-bold">Напоминать заниматься?</h2>
            <p className="text-ink-soft">
              Каждый день в {minuteText(minute)} бот напишет в Telegram, если вы ещё не занимались. Не в шаббат. Отключить можно в любой момент.
            </p>
            <Button block disabled={busy} onClick={() => void yes()} data-testid="reminder-offer-yes">
              Да, напоминать
            </Button>
            <Button variant="ghost" block disabled={busy} onClick={() => void later()} data-testid="reminder-offer-later">
              Не сейчас
            </Button>
          </>
        )}
      </div>
    </Overlay>
  );
}

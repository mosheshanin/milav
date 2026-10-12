import { Mic, MicOff, ShieldCheck, Timer, Trash2 } from "lucide-react";
import type { ReactNode } from "react";
import { micHelp } from "../lib/micHelp";
import { getTelegram } from "../telegram";
import { Button } from "./ui";

function Badge({ tone, children }: { tone: "accent" | "danger"; children: ReactNode }) {
  return (
    <div
      className={`flex size-20 items-center justify-center rounded-full ${
        tone === "accent" ? "bg-accent-soft text-accent" : "bg-danger-soft text-danger"
      }`}
    >
      {children}
    </div>
  );
}

function Fact({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <li className="flex items-start gap-3 text-left">
      <span className="mt-0.5 text-accent">{icon}</span>
      <span>{children}</span>
    </li>
  );
}

/** Приглашение разрешить микрофон: показывается до системного запроса, объясняет, зачем он нужен. */
export function MicAsk({ onAllow, busy }: { onAllow: () => void; busy: boolean }) {
  return (
    <div className="flex w-full flex-col items-center gap-block text-center" data-testid="mic-ask">
      <Badge tone="accent">
        <Mic className="size-icon-lg" aria-hidden />
      </Badge>
      <div>
        <h3 className="text-lg font-bold">Нужен доступ к микрофону</h3>
        <p className="mt-1 text-ink-soft">Приложение слушает, как вы произносите слово, и говорит, правильно ли получилось.</p>
      </div>
      <ul className="flex w-full flex-col gap-2 rounded-control bg-page p-3 text-sm">
        <Fact icon={<Timer className="size-icon" aria-hidden />}>Запись короткая: до 2,5 секунды на слово.</Fact>
        <Fact icon={<Trash2 className="size-icon" aria-hidden />}>Голос не сохраняется: он нужен только для проверки слова.</Fact>
        <Fact icon={<ShieldCheck className="size-icon" aria-hidden />}>Микрофон включается только на время записи.</Fact>
      </ul>
      <Button block onClick={onAllow} disabled={busy} data-testid="mic-allow">
        <Mic className="size-icon" aria-hidden />
        Разрешить микрофон
      </Button>
      <p className="text-xs text-ink-soft">Дальше появится системный запрос: нажмите «Разрешить».</p>
    </div>
  );
}

/** Доступ к микрофону закрыт или невозможен: объясняем, как включить. */
export function MicDenied({
  kind,
  onRetry,
  onSkip,
  skipLabel,
}: {
  kind: "denied" | "unsupported";
  onRetry: () => void;
  onSkip: () => void;
  skipLabel: string;
}) {
  const help = micHelp(getTelegram()?.platform, navigator.userAgent);
  return (
    <div className="flex w-full flex-col items-center gap-block text-center" role="alert" data-testid="mic-denied">
      <Badge tone="danger">
        <MicOff className="size-icon-lg" aria-hidden />
      </Badge>
      {kind === "denied" ? (
        <>
          <div>
            <h3 className="text-lg font-bold">Микрофон выключен</h3>
            <p className="mt-1 text-ink-soft">Без него не получится проверить произношение. Включить можно за полминуты ({help.where}):</p>
          </div>
          <ol className="flex w-full list-decimal flex-col gap-1.5 rounded-control bg-page py-3 pl-8 pr-3 text-left text-sm">
            {help.steps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
          <Button block onClick={onRetry} data-testid="speak-retry">
            Попробовать снова
          </Button>
        </>
      ) : (
        <div>
          <h3 className="text-lg font-bold">Запись голоса недоступна</h3>
          <p className="mt-1 text-ink-soft">Это устройство или версия Telegram не поддерживает запись. Обновите Telegram или откройте приложение на другом устройстве.</p>
        </div>
      )}
      <Button variant="ghost" block onClick={onSkip} data-testid="speak-skip">
        {skipLabel}
      </Button>
    </div>
  );
}

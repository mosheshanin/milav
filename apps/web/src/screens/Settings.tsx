import { useState } from "react";
import { Check, Copy, Shield } from "lucide-react";
import { DAILY_GOAL_OPTIONS, STAFF_ROLE_TITLES, type SettingsRequest } from "@milav/shared";
import { api } from "../api";
import { useApp } from "../AppContext";
import { Header } from "../components/Header";
import { Choice, Section, Toggle } from "../components/Controls";
import { Button } from "../components/ui";
import { saveErrorText } from "../lib/apiErrors";
import { hapticsEnabled, setHapticsEnabled } from "../lib/haptic";
import { plural } from "../lib/play";
import { THEME_CHOICES, THEME_TITLES, loadThemeChoice, setThemeChoice, type ThemeChoice } from "../lib/theme";
import { useBackButton } from "../lib/useBackButton";

/**
 * Настройки пользователя. Разделы: оформление (тема; позже цветовые схемы), занятия (цель дня), звук и отклик
 * (вибрация; позже выбор голоса озвучки), приватность (таблица лидеров, сравнение), внизу Telegram id и вход в панель
 * администратора (пункт панели виден только администраторам, docs/ADMIN.md).
 * Тема и вибрация хранятся на этом устройстве, остальное на сервере (PUT /api/settings).
 */
export function Settings({ onBack, onAdmin }: { onBack: () => void; onAdmin: () => void }) {
  const { me, applyPlay } = useApp();
  const { settings, features } = me.play;
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [vibration, setVibration] = useState(hapticsEnabled);
  const [theme, setTheme] = useState<ThemeChoice>(loadThemeChoice);
  useBackButton(onBack);

  async function change(body: SettingsRequest) {
    if (busy) return;
    setBusy(true);
    setMessage(null);
    try {
      const res = await api.settings(body);
      applyPlay(res.play);
    } catch (e) {
      setMessage(saveErrorText(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Header title="Настройки" onBack={onBack} />
      <main className="mx-auto flex max-w-md flex-col gap-section p-block pb-section" data-testid="settings">
        <Section title="Оформление">
          <Choice
            label="Тема"
            hint="«Как в Telegram» повторяет светлую или тёмную тему Telegram. Выбор хранится на этом устройстве."
            options={THEME_CHOICES.map((c) => ({ value: c, title: THEME_TITLES[c] }))}
            value={theme}
            testId="theme"
            onChange={(c) => {
              setThemeChoice(c);
              setTheme(c);
            }}
          />
        </Section>

        <Section title="Занятия">
          <Choice
            label="Цель дня"
            hint="Сколько слов в день выучить. Цель видна в блоке «Мой путь» на главной."
            options={DAILY_GOAL_OPTIONS.map((n) => ({
              value: n,
              title: n === 0 ? "Выкл." : `${n} ${plural(n, "слово", "слова", "слов")}`,
            }))}
            value={settings.dailyGoal}
            disabled={busy}
            testId="goal"
            onChange={(n) => void change({ dailyGoal: n })}
          />
        </Section>

        <Section title="Звук и отклик">
          <Toggle
            label="Вибрация"
            hint="Лёгкий отклик на телефоне при получении бейджа. Настройка хранится только на этом устройстве."
            checked={vibration}
            testId="toggle-haptics"
            onChange={(v) => {
              setHapticsEnabled(v);
              setVibration(v);
            }}
          />
        </Section>

        <Section title="Приватность">
          {features.leaderboard && (
            <Toggle
              label="Показывать меня в таблице лидеров"
              hint="Другие увидят ваше имя из Telegram (без фамилии и имени пользователя) и очки."
              checked={settings.leaderboard}
              disabled={busy}
              testId="toggle-leaderboard"
              onChange={(v) => void change({ leaderboard: v })}
            />
          )}
          <Toggle
            label="Учитывать меня в сравнении"
            hint="Ваши очки попадают в общую картину «как у тех, кто пришёл в одно время». Имя не показывается."
            checked={!settings.cohortExcluded}
            disabled={busy}
            testId="toggle-cohort"
            onChange={(v) => void change({ cohortExcluded: !v })}
          />
        </Section>

        <Section title="Аккаунт">
          <TelegramId id={me.user.id} />
          {me.staff && (
            <p className="text-sm text-ink-soft" data-testid="staff-role">
              Вы в команде приложения: {STAFF_ROLE_TITLES[me.staff.role].toLowerCase()}
              {me.staff.owner ? " (владелец)" : ""}.
            </p>
          )}
          {me.staff?.role === "admin" && (
            <Button variant="secondary" block onClick={onAdmin} data-testid="open-admin">
              <Shield className="size-icon" aria-hidden />
              Панель администратора
            </Button>
          )}
        </Section>

        {message && (
          <p className="text-danger" role="alert">
            {message}
          </p>
        )}
      </main>
    </>
  );
}

/** Telegram id: его называют владельцу, чтобы он добавил человека в команду (проверяющим или администратором). */
function TelegramId({ id }: { id: number }) {
  const [copied, setCopied] = useState(false);
  return (
    <div>
      <div className="font-semibold">Ваш Telegram id</div>
      <p className="mb-2 text-sm text-ink-soft">Нужен, если вас добавляют в команду приложения.</p>
      <div className="flex items-center gap-2">
        <code className="select-all rounded-control bg-page px-3 py-2 font-semibold" data-testid="my-telegram-id">
          {id}
        </code>
        <Button
          variant="ghost"
          className="min-h-10"
          onClick={() => {
            navigator.clipboard?.writeText(String(id)).then(
              () => setCopied(true),
              () => setCopied(false),
            );
          }}
        >
          {copied ? <Check className="size-icon" aria-hidden /> : <Copy className="size-icon" aria-hidden />}
          {copied ? "Скопировано" : "Скопировать"}
        </Button>
      </div>
    </div>
  );
}

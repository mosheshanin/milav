import { useState, type ReactNode } from "react";
import { DAILY_GOAL_OPTIONS, type SettingsRequest } from "@milav/shared";
import { api } from "../api";
import { useApp } from "../AppContext";
import { Header } from "../components/Header";
import { Card } from "../components/ui";
import { saveErrorText } from "../lib/apiErrors";
import { hapticsEnabled, setHapticsEnabled } from "../lib/haptic";
import { plural } from "../lib/play";
import { THEME_CHOICES, THEME_TITLES, loadThemeChoice, setThemeChoice, type ThemeChoice } from "../lib/theme";
import { useBackButton } from "../lib/useBackButton";

/**
 * Настройки пользователя. Разделы: оформление (тема; позже цветовые схемы), занятия (цель дня), звук и отклик
 * (вибрация; позже выбор голоса озвучки), приватность (таблица лидеров, сравнение).
 * Тема и вибрация хранятся на этом устройстве, остальное на сервере (PUT /api/settings).
 */
export function Settings({ onBack }: { onBack: () => void }) {
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

        {message && (
          <p className="text-danger" role="alert">
            {message}
          </p>
        )}
      </main>
    </>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-lg font-bold">{title}</h2>
      <Card className="flex flex-col gap-block">{children}</Card>
    </section>
  );
}

/** Выбор одного варианта из нескольких: кнопки-«таблетки» (как у цели дня). */
function Choice<T extends string | number>({
  label,
  hint,
  options,
  value,
  disabled,
  testId,
  onChange,
}: {
  label: string;
  hint?: string;
  options: { value: T; title: string }[];
  value: T;
  disabled?: boolean;
  testId: string;
  onChange: (value: T) => void;
}) {
  return (
    <div>
      <div className="font-semibold">{label}</div>
      {hint && <p className="mb-2 text-sm text-ink-soft">{hint}</p>}
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={label}>
        {options.map((o) => (
          <button
            key={String(o.value)}
            type="button"
            role="radio"
            aria-checked={value === o.value}
            data-testid={`${testId}-${o.value}`}
            disabled={disabled}
            onClick={() => onChange(o.value)}
            className={`min-h-10 rounded-full px-4 font-semibold ${
              value === o.value ? "bg-accent text-white" : "bg-line text-ink-soft"
            }`}
          >
            {o.title}
          </button>
        ))}
      </div>
    </div>
  );
}

function Toggle({
  label,
  hint,
  checked,
  disabled,
  testId,
  onChange,
}: {
  label: string;
  hint: string;
  checked: boolean;
  disabled?: boolean;
  testId: string;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex items-start gap-3">
      <input
        type="checkbox"
        role="switch"
        className="mt-1 size-5 shrink-0 accent-accent"
        checked={checked}
        disabled={disabled}
        data-testid={testId}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span>
        <span className="block font-semibold">{label}</span>
        <span className="block text-sm text-ink-soft">{hint}</span>
      </span>
    </label>
  );
}

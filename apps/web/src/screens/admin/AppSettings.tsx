// «Настройки приложения»: значения в базе действуют без выкладки (на всех экземплярах сервера не дольше чем за минуту).
// Каждое изменение пишется в журнал. Выключение функции для всех спрашивает подтверждение.
import { useState } from "react";
import { APP_CONFIG, FEATURE_MODES, FEATURE_MODE_TITLES, configValueTitle, type ConfigDef, type ConfigItem } from "@milav/shared";
import { api } from "../../api";
import { useApp } from "../../AppContext";
import { Choice, Section } from "../../components/Controls";
import { adminErrorText, dateTimeText } from "../../lib/adminText";
import { confirmAction } from "../../telegram";
import { LoadView, useLoad } from "./load";

export function AppSettings() {
  const [value, reload] = useLoad(() => api.admin.config());
  return <LoadView value={value} reload={reload}>{(data) => <ConfigList items={data.items} />}</LoadView>;
}

function ConfigList({ items: initial }: { items: ConfigItem[] }) {
  const { me, refresh } = useApp();
  const [items, setItems] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function change(item: ConfigItem, value: ConfigItem["value"]) {
    if (busy || value === item.value) return;
    const def: ConfigDef = APP_CONFIG[item.key];
    if (def.kind === "feature" && value === "off" && item.value === "all") {
      if (!(await confirmAction(`Выключить «${def.title}» для всех учеников?`))) return;
    }
    setBusy(true);
    setMessage(null);
    try {
      await api.admin.setConfig(item.key, value);
      setItems((prev) =>
        prev.map((i) => (i.key === item.key ? { ...i, value, isDefault: false, updatedAt: Math.floor(Date.now() / 1000), updatedBy: me.user.id } : i)),
      );
      setMessage(`Сохранено: ${def.title} — ${configValueTitle(item.key, value)}.`);
      // Своё приложение сразу видит изменение (например, кнопку «Таблица» на главной).
      void refresh();
    } catch (e) {
      setMessage(adminErrorText(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <p className="text-sm text-ink-soft">
        Изменения действуют без выкладки. Остальные ученики увидят их не позже чем через минуту, когда снова откроют приложение.
        «Команда» включает функцию только администраторам и проверяющим: так новое можно проверить на своём телефоне до открытия всем.
      </p>
      {items.map((item) => {
        const def: ConfigDef = APP_CONFIG[item.key];
        const options =
          def.kind === "feature"
            ? FEATURE_MODES.map((m) => ({ value: m as ConfigItem["value"], title: FEATURE_MODE_TITLES[m] }))
            : def.options.map((n) => ({ value: n as ConfigItem["value"], title: configValueTitle(item.key, n) }));
        return (
          <Section key={item.key} title={def.title}>
            <Choice label={def.title} hint={def.hint} options={options} value={item.value} disabled={busy} testId={`config-${item.key}`} onChange={(v) => void change(item, v)} />
            <p className="text-sm text-ink-soft" data-testid={`config-${item.key}-meta`}>
              {item.isDefault || item.updatedAt === null
                ? "Значение по умолчанию, из панели ещё не менялось."
                : `Изменено ${dateTimeText(item.updatedAt)}${item.updatedBy ? `, id ${item.updatedBy}` : ""}.`}
            </p>
          </Section>
        );
      })}
      {message && (
        <p role="status" data-testid="config-message">
          {message}
        </p>
      )}
    </>
  );
}

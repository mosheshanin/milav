// Панель администратора, этап 1 (docs/ADMIN.md). Подгружается отдельным файлом только для команды (App.tsx, lazy),
// поэтому её код не попадает к ученикам. Доступ всё равно проверяет сервер: остальным он отвечает 403.
import { useEffect, useState, type ReactNode } from "react";
import { BarChart3, BellRing, ChevronRight, History, PenLine, SlidersHorizontal, Users } from "lucide-react";
import { Header } from "../../components/Header";
import { Card } from "../../components/ui";
import { useBackButton } from "../../lib/useBackButton";
import { AppSettings } from "./AppSettings";
import { Journal } from "./Journal";
import { Overview } from "./Overview";
import { Reminders } from "./Reminders";
import { Team } from "./Team";

type Section = "overview" | "config" | "reminders" | "team" | "log";

const SECTIONS: { id: Section; title: string; hint: string; icon: ReactNode }[] = [
  { id: "overview", title: "Обзор", hint: "Новые ученики, кто занимался, слова и викторины", icon: <BarChart3 className="size-icon" aria-hidden /> },
  { id: "config", title: "Настройки приложения", hint: "Таблица лидеров, напоминания, цель дня для новых", icon: <SlidersHorizontal className="size-icon" aria-hidden /> },
  { id: "reminders", title: "Напоминания", hint: "Тексты сообщений бота и их статистика", icon: <BellRing className="size-icon" aria-hidden /> },
  { id: "team", title: "Команда", hint: "Администраторы и проверяющие", icon: <Users className="size-icon" aria-hidden /> },
  { id: "log", title: "Журнал", hint: "Кто, когда и что поменял", icon: <History className="size-icon" aria-hidden /> },
];

export default function Admin({ onBack, onRecord }: { onBack: () => void; onRecord: () => void }) {
  const [section, setSection] = useState<Section | null>(null);
  const back = section ? () => setSection(null) : onBack;
  useBackButton(back);

  // Раздел открывается сверху, а не с того места, где был прокручен список.
  useEffect(() => {
    window.scrollTo?.(0, 0);
  }, [section]);

  const current = SECTIONS.find((s) => s.id === section);
  return (
    <>
      <Header title={current?.title ?? "Панель администратора"} onBack={back} />
      <main className="mx-auto flex max-w-md flex-col gap-section p-block pb-section" data-testid={`admin-${section ?? "menu"}`}>
        {section === null && (
          <nav className="flex flex-col gap-2" aria-label="Разделы панели">
            {SECTIONS.map((s) => (
              <MenuRow key={s.id} title={s.title} hint={s.hint} icon={s.icon} testId={`admin-open-${s.id}`} onClick={() => setSection(s.id)} />
            ))}
            <MenuRow
              title="Шаблоны букв"
              hint="Запись рисунков для проверки письма"
              icon={<PenLine className="size-icon" aria-hidden />}
              testId="admin-open-record"
              onClick={onRecord}
            />
            <Card>
              <p className="text-sm text-ink-soft">
                Ошибки приложения смотрите в журналах Cloudflare: Workers → milav → Observability (docs/DEPLOY.md, «Наблюдаемость»).
              </p>
            </Card>
          </nav>
        )}
        {section === "overview" && <Overview />}
        {section === "config" && <AppSettings />}
        {section === "reminders" && <Reminders />}
        {section === "team" && <Team />}
        {section === "log" && <Journal />}
      </main>
    </>
  );
}

function MenuRow({ title, hint, icon, testId, onClick }: { title: string; hint: string; icon: ReactNode; testId: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testId}
      className="flex w-full items-center gap-3 rounded-card border border-line bg-surface p-block text-left active:bg-page"
    >
      <span className="flex size-10 shrink-0 items-center justify-center rounded-control bg-accent-soft text-accent">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block font-semibold">{title}</span>
        <span className="block text-sm text-ink-soft">{hint}</span>
      </span>
      <ChevronRight className="size-icon shrink-0 text-ink-soft" aria-hidden />
    </button>
  );
}

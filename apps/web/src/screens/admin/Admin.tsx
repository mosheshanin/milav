// Панель администратора (docs/ADMIN.md): этап 1 основа, этап 2 напоминания, этап 3 «Контент», этапы 4–5 «Аналитика» и «Ученики». Подгружается отдельным файлом только для команды (App.tsx, lazy),
// поэтому её код не попадает к ученикам. Доступ всё равно проверяет сервер: остальным он отвечает 403.
import { useEffect, useState, type ReactNode } from "react";
import { BarChart3, BellRing, BookCheck, Bot, ChevronRight, GraduationCap, History, LineChart, Megaphone, PenLine, SlidersHorizontal, Users } from "lucide-react";
import { Header } from "../../components/Header";
import { Card } from "../../components/ui";
import { useBackButton } from "../../lib/useBackButton";
import { Analytics } from "./Analytics";
import { AppSettings } from "./AppSettings";
import { BotMessages } from "./BotMessages";
import { ChannelPost } from "./ChannelPost";
import { Content } from "./Content";
import { Journal } from "./Journal";
import { Overview } from "./Overview";
import { Reminders } from "./Reminders";
import { Students } from "./Students";
import { Team } from "./Team";

type Section = "overview" | "analytics" | "students" | "config" | "bot" | "channel" | "reminders" | "content" | "team" | "log";

const SECTIONS: { id: Section; title: string; hint: string; icon: ReactNode }[] = [
  { id: "overview", title: "Обзор", hint: "Новые ученики, кто занимался, слова и викторины", icon: <BarChart3 className="size-icon" aria-hidden /> },
  { id: "analytics", title: "Аналитика", hint: "Удержание, воронка, уроки, трудные слова, произношение", icon: <LineChart className="size-icon" aria-hidden /> },
  { id: "students", title: "Ученики", hint: "Поиск, прогресс и настройки ученика, таблица лидеров", icon: <GraduationCap className="size-icon" aria-hidden /> },
  { id: "config", title: "Настройки приложения", hint: "Таблица лидеров, напоминания, цель дня для новых", icon: <SlidersHorizontal className="size-icon" aria-hidden /> },
  { id: "bot", title: "Сообщения бота", hint: "Ответы на команды, кнопки, описание бота, время и шаббат", icon: <Bot className="size-icon" aria-hidden /> },
  { id: "channel", title: "Пост в канал", hint: "Публикация в @milavnews с картинкой и кнопкой", icon: <Megaphone className="size-icon" aria-hidden /> },
  { id: "reminders", title: "Напоминания", hint: "Тексты ежедневных напоминаний и их статистика", icon: <BellRing className="size-icon" aria-hidden /> },
  { id: "content", title: "Контент", hint: "Проверка слов носителем и перенос правок в уроки", icon: <BookCheck className="size-icon" aria-hidden /> },
  { id: "team", title: "Команда", hint: "Администраторы и проверяющие", icon: <Users className="size-icon" aria-hidden /> },
  { id: "log", title: "Журнал", hint: "Кто, когда и что поменял", icon: <History className="size-icon" aria-hidden /> },
];

export default function Admin({ onBack, onRecord }: { onBack: () => void; onRecord: () => void }) {
  const [section, setSection] = useState<Section | null>(null);
  // Открытая карточка слова в «Контенте»: «назад» сначала закрывает её, потом раздел.
  const [reviewItem, setReviewItem] = useState<string | null>(null);
  // Открытая карточка ученика: «назад» сначала возвращает к списку.
  const [studentId, setStudentId] = useState<number | null>(null);
  const back = reviewItem
    ? () => setReviewItem(null)
    : studentId !== null
      ? () => setStudentId(null)
      : section
        ? () => setSection(null)
        : onBack;
  useBackButton(back);

  // Раздел открывается сверху, а не с того места, где был прокручен список.
  useEffect(() => {
    window.scrollTo?.(0, 0);
  }, [section, studentId]);

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
        {section === "analytics" && <Analytics />}
        {section === "students" && <Students openId={studentId} onOpen={setStudentId} />}
        {section === "config" && <AppSettings />}
        {section === "bot" && <BotMessages onOpenReminders={() => setSection("reminders")} />}
        {section === "channel" && <ChannelPost />}
        {section === "reminders" && <Reminders />}
        {section === "content" && <Content admin itemId={reviewItem} onItem={setReviewItem} />}
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

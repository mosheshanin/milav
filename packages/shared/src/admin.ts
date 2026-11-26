// Панель администратора (docs/ADMIN.md): роли, настройки приложения в базе, ответы API панели.
import { DAILY_GOAL_OPTIONS } from "./gamification/constants";
import { REPEAT_REMINDER_MIN } from "./repeat";
import { DEFAULT_REMINDER_MINUTE, SHABBAT_FRIDAY_FROM_MINUTE, minuteText } from "./reminders";

/** Роль в команде. Владелец задаётся секретом и всегда администратор. */
export type StaffRole = "admin" | "reviewer";
export const STAFF_ROLES: readonly StaffRole[] = ["admin", "reviewer"];
export const STAFF_ROLE_TITLES: Record<StaffRole, string> = { admin: "Администратор", reviewer: "Проверяющий" };

/** Роль текущего пользователя в ответе /api/me (только у команды). */
export interface StaffInfo {
  role: StaffRole;
  /** Владелец из секрета Cloudflare: его нельзя убрать из панели. */
  owner: boolean;
}

/** Положение новой функции: выключена, только для команды (администраторы и проверяющие), для всех. */
export type FeatureMode = "off" | "team" | "all";
export const FEATURE_MODES: readonly FeatureMode[] = ["off", "team", "all"];
export const FEATURE_MODE_TITLES: Record<FeatureMode, string> = { off: "Выкл.", team: "Команда", all: "Все" };

/** Включена ли функция для человека с такой ролью (или без роли). */
export function featureOn(mode: FeatureMode, staff: StaffInfo | null | undefined): boolean {
  return mode === "all" || (mode === "team" && !!staff);
}

/**
 * Описание настройки приложения: по нему сервер проверяет значение, а панель рисует выбор. `group: "bot"`: настройка
 * сообщений бота, она показывается в разделе «Сообщения бота», а не в «Настройках приложения».
 */
export type ConfigDef =
  | { kind: "feature"; title: string; hint: string; group?: "bot" }
  | { kind: "choice"; title: string; hint: string; options: readonly number[]; group?: "bot" };

/** «Не останавливать» в настройке паузы на шаббат. */
export const SHABBAT_OFF = -1;

/** Настройки сообщений бота (раздел «Сообщения бота»), по умолчанию как было до панели. */
export const BOT_CONFIG_DEFAULTS = {
  reminderMinute: DEFAULT_REMINDER_MINUTE,
  shabbatFrom: SHABBAT_FRIDAY_FROM_MINUTE,
  repeatReminderMin: REPEAT_REMINDER_MIN,
  offerTimes: 2,
  offerAgainDays: 7,
  reminderControl: 10,
} as const;

/**
 * Настройки приложения, которые меняются из панели без выкладки. Значение по умолчанию (пока в базе ничего нет)
 * задаёт сервер: у таблицы лидеров это прежняя переменная LEADERBOARD_ENABLED.
 */
export const APP_CONFIG = {
  leaderboard: {
    kind: "feature",
    title: "Таблица лидеров",
    hint: "«Команда»: таблицу видят только администраторы и проверяющие. При выключении данные участников сохраняются.",
  },
  reminders: {
    kind: "feature",
    title: "Напоминания от бота",
    hint: "Предложение включить напоминания, раздел в «Настройках» и отправка. «Команда»: только администраторам и проверяющим (для проверки). При выключении сообщения перестают уходить, выбор учеников сохраняется.",
  },
  repeat: {
    kind: "feature",
    title: "Повторение слов",
    hint: "Карточка «Повторить» на главной, подход повторения и «Мои слова». При выключении коробки слов сохраняются.",
  },
  numbersTrainer: {
    kind: "feature",
    title: "Тренажёр «Числа на слух»",
    hint: "Строка «Числа на слух» в разделе «Числа и время» и проверка речи в тренажёре. «Команда»: только администраторам и проверяющим (для проверки на телефоне). Очки, цель дня и ритм тренажёр не меняет.",
  },
  botWidgets: {
    kind: "feature",
    title: "Карточки в чате с ботом",
    hint: "Команды /progress и /reminders отвечают интерактивной карточкой прямо в сообщении (виджеты Telegram). Выключено, или Telegram карточку не принял: бот отвечает обычным текстом с кнопками. «Команда»: карточки только администраторам и проверяющим.",
  },
  defaultDailyGoal: {
    kind: "choice",
    title: "Цель дня для новых учеников",
    hint: "Сколько слов в день предлагать тем, кто открывает приложение впервые. У остальных цель не меняется.",
    options: DAILY_GOAL_OPTIONS,
  },
  reminderMinute: {
    kind: "choice",
    group: "bot",
    title: "Время напоминаний по умолчанию",
    hint: "Его предлагает приложение («Напоминать вам заниматься?») и команда /reminders тем, кто время ещё не выбирал. У тех, кто уже включил напоминания, время не меняется.",
    options: [7 * 60, 8 * 60, 9 * 60, 10 * 60, 12 * 60, 17 * 60, 18 * 60, 19 * 60, 20 * 60, 21 * 60, 22 * 60],
  },
  shabbatFrom: {
    kind: "choice",
    group: "bot",
    title: "Пауза на шаббат",
    hint: "С пятницы с этого часа до конца субботы (по часам ученика) напоминания не уходят. «Не останавливать»: бот пишет и в шаббат; тогда поправьте тексты, где сказано «В шаббат не пишу».",
    options: [SHABBAT_OFF, 12 * 60, 13 * 60, 14 * 60, 15 * 60, 16 * 60, 17 * 60],
  },
  repeatReminderMin: {
    kind: "choice",
    group: "bot",
    title: "Напоминать о повторении слов",
    hint: "Если слов, которые пора повторить, набралось столько или больше, ежедневное напоминание через раз берёт текст с {к_повторению}. «Выкл.»: о повторении не напоминаем.",
    options: [0, 3, 5, 10, 20],
  },
  offerTimes: {
    kind: "choice",
    group: "bot",
    title: "Сколько раз предлагать напоминания",
    hint: "Предложение «Напоминать вам заниматься?» появляется в приложении после выученного слова. Здесь: сколько раз его показывать, если человек отвечает «Не сейчас». «Не предлагать»: только сам, в «Настройках».",
    options: [0, 1, 2, 3, 5],
  },
  offerAgainDays: {
    kind: "choice",
    group: "bot",
    title: "Предложить снова через",
    hint: "Сколько дней ждать после «Не сейчас», прежде чем предложить ещё раз.",
    options: [1, 3, 7, 14, 30],
  },
  reminderControl: {
    kind: "choice",
    group: "bot",
    title: "Контрольная группа напоминаний",
    hint: "Сколько ежедневных напоминаний из 100 нарочно не отправлять, чтобы сравнить: занимаются ли люди после напоминания чаще, чем без него (отчёт в «Напоминаниях»). Пропуск выпадает разным людям в разные дни, примерно одно напоминание из десяти при 10%. Администраторов и проверяющих не касается. «Выкл.»: напоминания уходят всем, но честной разницы в отчёте не будет.",
    options: [0, 5, 10, 20],
  },
} as const satisfies Record<string, ConfigDef>;

export type ConfigKey = keyof typeof APP_CONFIG;
export const CONFIG_KEYS = Object.keys(APP_CONFIG) as ConfigKey[];

export interface AppConfig {
  leaderboard: FeatureMode;
  reminders: FeatureMode;
  repeat: FeatureMode;
  numbersTrainer: FeatureMode;
  botWidgets: FeatureMode;
  defaultDailyGoal: number;
  reminderMinute: number;
  shabbatFrom: number;
  repeatReminderMin: number;
  offerTimes: number;
  offerAgainDays: number;
  /** Сколько напоминаний из 100 не отправлять (контрольная группа, отчёт «Учёт рассылок»). */
  reminderControl: number;
}

/** Ключи настроек сообщений бота (раздел «Сообщения бота»); остальные в «Настройках приложения». */
export const BOT_CONFIG_KEYS = (Object.keys(APP_CONFIG) as (keyof typeof APP_CONFIG)[]).filter(
  (key) => (APP_CONFIG[key] as ConfigDef).group === "bot",
);

/** Проверяет значение настройки. Возвращает true, если его можно сохранить. */
export function isValidConfigValue(key: ConfigKey, value: unknown): boolean {
  const def: ConfigDef = APP_CONFIG[key];
  if (def.kind === "feature") return (FEATURE_MODES as readonly unknown[]).includes(value);
  return def.options.includes(value as number);
}

/** Подпись значения для панели и журнала. */
export function configValueTitle(key: ConfigKey, value: unknown): string {
  const def: ConfigDef = APP_CONFIG[key];
  if (def.kind === "feature") return FEATURE_MODE_TITLES[value as FeatureMode] ?? String(value);
  if (key === "defaultDailyGoal") return value === 0 ? "Выкл." : `${value} сл.`;
  if (key === "reminderMinute") return minuteText(Number(value));
  if (key === "shabbatFrom") return value === SHABBAT_OFF ? "Не останавливать" : `с ${minuteText(Number(value))}`;
  if (key === "repeatReminderMin") return value === 0 ? "Выкл." : `от ${value} сл.`;
  if (key === "offerTimes") return value === 0 ? "Не предлагать" : `${value} р.`;
  if (key === "offerAgainDays") return `${value} дн.`;
  if (key === "reminderControl") return value === 0 ? "Выкл." : `${value}%`;
  return String(value);
}

/** Сколько новых ролей и записей журнала отдавать за раз. */
export const ADMIN_LOG_PAGE = 50;
export const MAX_STAFF = 50;

// ---- Ответы API панели ----

/** Цифры за один день (или за неделю). */
export interface DayNumbers {
  /** Новые ученики: впервые открыли приложение. */
  newUsers: number;
  /** Открывали приложение (за неделю это разные люди, а не сумма по дням). */
  active: number;
  /** Выучено слов и букв (пройдены все этапы). */
  learned: number;
  /** Сдано викторин (все попытки со сдачей, в том числе повторные). */
  quizzesPassed: number;
}

export interface OverviewDay extends DayNumbers {
  /** Дата по Иерусалиму, `YYYY-MM-DD`. */
  date: string;
}

export interface AdminOverviewResponse {
  today: OverviewDay;
  /** Сегодня и шесть прошлых дней. */
  week: DayNumbers;
  /** Семь дней перед ними. */
  prevWeek: DayNumbers;
  /** Последние 14 дней до вчера включительно, от новых к старым. */
  days: OverviewDay[];
  /** Всего учеников в базе. */
  totalUsers: number;
  /** С какого дня считается «открывали» (до этого дня таблицы посещений ещё не было). */
  activeSince: string | null;
}

export interface ConfigItem {
  key: ConfigKey;
  value: FeatureMode | number;
  /** true, если значение ещё не меняли из панели (действует значение по умолчанию). */
  isDefault: boolean;
  updatedAt: number | null;
  updatedBy: number | null;
}

export interface AdminConfigResponse {
  items: ConfigItem[];
}

export interface StaffMember {
  userId: number;
  role: StaffRole;
  /** Имя из Telegram, если человек уже открывал приложение. */
  name: string | null;
  owner: boolean;
  addedBy: number | null;
  addedAt: number | null;
}

export interface AdminTeamResponse {
  members: StaffMember[];
}

export interface AdminLogEntry {
  id: number;
  at: number;
  actor: number;
  actorName: string | null;
  /** config.set, staff.add, staff.change, staff.remove */
  action: string;
  target: string | null;
  oldValue: unknown;
  newValue: unknown;
}

export interface AdminLogResponse {
  entries: AdminLogEntry[];
  /** id для следующей страницы (записи старше), null если больше нет. */
  nextBefore: number | null;
}

// ---- Аналитика (этап 4, 24.11.2026, docs/ADMIN.md «Аналитика: как сделано») ----

/** Удержание одной недели прихода: доля новичков, открывших приложение через N дней и позже. null: прошло меньше N дней. */
export interface RetentionCohort {
  /** Первый день недели прихода (воскресенье, по Иерусалиму), `YYYY-MM-DD`. */
  week: string;
  /** Сколько новичков пришло за неделю. */
  size: number;
  d1: number | null;
  d7: number | null;
  d30: number | null;
}

/** Шаг воронки: сколько разных учеников дошли до него. */
export interface FunnelStep {
  key: "joined" | "firstItem" | "firstQuiz" | "firstPassed" | "fivePassed";
  title: string;
  users: number;
}

/** Урок в аналитике: сколько начали, прошли все слова, попытки викторины, сдали. */
export interface LessonAnalytics {
  lessonId: string;
  title: string;
  /** Учеников с хотя бы одним этапом в уроке. */
  started: number;
  /** Учеников, прошедших все слова урока. */
  learnedAll: number;
  /** Завершённых попыток викторины (прерванные не записываются). */
  attempts: number;
  /** Из них сданных. */
  passedAttempts: number;
  /** Средний результат завершённых попыток, % (null, если попыток нет). */
  avgPercent: number | null;
  /** Учеников, сдавших урок. */
  passedUsers: number;
}

/** Слово (или буква) с типом вопроса, где ошибаются чаще всего. */
export interface HardItem {
  itemId: string;
  he: string;
  ru: string;
  lessonTitle: string;
  questionType: string;
  questionTitle: string;
  asked: number;
  correct: number;
}

export interface AdminAnalyticsResponse {
  /** С какого дня есть данные о посещениях (удержание раньше этой даты не считается). */
  activeSince: string | null;
  retention: RetentionCohort[];
  funnel: FunnelStep[];
  lessons: LessonAnalytics[];
  /** Порог: слово попадает в «трудные», если его спросили этим типом хотя бы столько раз. */
  hardMinAsked: number;
  hardItems: HardItem[];
  /** «Произнеси» в викторинах: сколько раз спросили и сколько засчитано (после двух попыток). */
  speech: { asked: number; correct: number; hardest: HardItem[] };
}

// ---- Ученики (этап 5, 24.11.2026, docs/ADMIN.md «Ученики: как сделано») ----

export interface StudentRow {
  id: number;
  /** Имя и фамилия из Telegram. */
  name: string;
  username: string | null;
  /** Когда пришёл и когда последний раз открывал (время базы, `YYYY-MM-DD HH:MM:SS` UTC). */
  createdAt: string;
  lastSeenAt: string;
  points: number;
  passedLessons: number;
  statusName: string;
  badges: number;
  /** Участвует в таблице лидеров; banned: убран из неё командой. */
  leaderboard: boolean;
  banned: boolean;
  reminders: boolean;
}

export interface AdminStudentsResponse {
  items: StudentRow[];
  /** Сколько учеников подходит под поиск. */
  total: number;
  /** Смещение следующей страницы или null. */
  nextOffset: number | null;
}

export interface AdminStudentResponse {
  student: StudentRow;
  settings: { dailyGoal: number; gender: string; tz: string; cohortExcluded: boolean };
  progress: {
    words: number;
    letters: number;
    activeDays: number;
    rhythmWeeks: number;
    goalDays: number;
    repeats: number;
    mastered: number;
    /** Последний день занятий по часам ученика, `YYYY-MM-DD` (null, если не занимался). */
    lastDay: string | null;
  };
  lessons: { lessonId: string; title: string; passedAt: string }[];
  attempts: { lessonId: string; title: string; correct: number; total: number; passed: boolean; at: string }[];
  badges: { id: string; title: string; earnedAt: number }[];
  reminder: { enabled: boolean; minute: number; blocked: boolean } | null;
  /** Роль в команде, если есть. */
  staffRole: StaffRole | null;
}

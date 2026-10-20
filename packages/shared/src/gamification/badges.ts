// Каталог бейджей: определения живут данными, правила сведены к счётчикам (метрика достигла порога).
// id бейджа не меняется никогда (к нему привязана выдача). Условия, почему так: docs/GAMIFICATION.md, раздел 5.
import { CATALOG_VERSION } from "./constants";

export type Rarity = "common" | "rare" | "epic" | "legendary";

export const RARITY_TITLES: Record<Rarity, string> = {
  common: "Обычный",
  rare: "Редкий",
  epic: "Эпический",
  legendary: "Легендарный",
};

export type BadgeCategory = "start" | "milestones" | "alphabet" | "topics" | "quality" | "regularity" | "memory" | "variety" | "return";

/** Порядок и названия разделов на экране «Достижения». */
export const BADGE_CATEGORIES: { key: BadgeCategory; title: string }[] = [
  { key: "start", title: "Первые шаги" },
  { key: "milestones", title: "Вехи" },
  { key: "alphabet", title: "Алфавит" },
  { key: "topics", title: "Темы" },
  { key: "quality", title: "Качество" },
  { key: "regularity", title: "Регулярность" },
  { key: "memory", title: "Память" },
  { key: "variety", title: "Разнообразие" },
  { key: "return", title: "Возвращение" },
];

/** Иконки бейджей: имена из lucide-react. Приложение сопоставляет каждое имя компоненту (тест следит, чтобы ни одно не потерялось). */
export const BADGE_ICONS = [
  "Footprints", "Sprout", "Flag", "BookOpen", "Layers", "Target", "Compass", "Castle", "Crown", "Medal", "Trophy",
  "Languages", "Award", "Shield", "Gem", "Sparkles", "CalendarDays",
  "CalendarCheck", "Calendar", "Waves", "Goal", "Shuffle", "Network", "LayoutGrid", "Handshake",
  "RefreshCw", "History", "Brain", "Anchor",
] as const;
export type BadgeIcon = (typeof BADGE_ICONS)[number];

/** Счётчики пользователя, по которым выдаются бейджи (колонки user_stats). */
export const METRICS = [
  "words",
  "letters",
  "lessons",
  "alphabetLessons",
  "perfectQuizzes",
  "topicsClosed",
  "sections",
  "activeDays",
  "rhythmWeeks",
  "goalDays",
  "returns",
  "repeats",
  "mastered",
] as const;
export type Metric = (typeof METRICS)[number];
export type Metrics = Record<Metric, number>;

export const ZERO_METRICS: Metrics = {
  words: 0,
  letters: 0,
  lessons: 0,
  alphabetLessons: 0,
  perfectQuizzes: 0,
  topicsClosed: 0,
  sections: 0,
  activeDays: 0,
  rhythmWeeks: 0,
  goalDays: 0,
  returns: 0,
  repeats: 0,
  mastered: 0,
};

export interface BadgeDef {
  id: string;
  category: BadgeCategory;
  rarity: Rarity;
  icon: BadgeIcon;
  title: string;
  description: string;
  /** Счётчик и порог: бейдж выдаётся, когда `metric >= threshold`. У бейджей тем счётчика нет (`metric: null`, смотрим `topicId`). */
  metric: Metric | null;
  threshold: number;
  /** Только у бейджей тем: постоянный ключ темы. */
  topicId?: string;
}

/** Сведения о контенте, от которых зависит, какие бейджи достижимы (собирает пакет content). */
export interface ContentInfo {
  totalWords: number;
  /** Все уроки, обычные и алфавит. */
  totalLessons: number;
  alphabetLessons: number;
  /** Форм букв в алфавите (27). */
  alphabetLetters: number;
  /** Разделы, в которых есть хотя бы один урок: alphabet, basics, numbers, nouns, verbs, adjectives. */
  sections: string[];
  /** Темы обычных разделов (алфавит бейджа темы не получает: его закрытие даёт `alphabet-passed`). */
  topics: { id: string; title: string; lessonIds: string[] }[];
}

export interface Catalog {
  badges: BadgeDef[];
  /** Версия для ленивой проверки старых пользователей: растёт, когда в каталоге появляются бейджи. */
  version: number;
  byId: Map<string, BadgeDef>;
}

/** Разделы для маски `sections_mask` (бит = раздел). */
export const SECTION_BITS: Record<string, number> = { alphabet: 1, nouns: 2, verbs: 4, adjectives: 8, basics: 16, numbers: 32 };

type Spec = Omit<BadgeDef, "threshold" | "metric"> & { metric: Metric; threshold: number; need?: (info: ContentInfo) => boolean };

function spec(
  id: string,
  category: BadgeCategory,
  rarity: Rarity,
  icon: BadgeIcon,
  title: string,
  description: string,
  metric: Metric,
  threshold: number,
  need?: (info: ContentInfo) => boolean,
): Spec {
  return { id, category, rarity, icon, title, description, metric, threshold, need };
}

/** Каталог для данного контента. Недостижимые бейджи (например, «1000 слов» при 200 словах в приложении) в него не попадают. */
export function buildCatalog(info: ContentInfo): Catalog {
  const words = (n: number) => (i: ContentInfo) => i.totalWords >= n;
  const lessonsAtLeast = (n: number) => (i: ContentInfo) => i.totalLessons >= n;
  const sectionsAtLeast = (n: number) => (i: ContentInfo) => i.sections.length >= n;

  const specs: Spec[] = [
    // Первые шаги
    spec("first-letter", "start", "common", "Footprints", "Первый ход", "Пройдите все этапы первой буквы алфавита", "letters", 1, (i) => i.alphabetLetters > 0),
    spec("first-word", "start", "common", "Sprout", "Первое слово", "Пройдите все четыре этапа первого слова", "words", 1, words(1)),
    spec("first-lesson", "start", "common", "Flag", "Первая партия", "Сдайте первую викторину", "lessons", 1),
    // Вехи
    spec("words-10", "milestones", "common", "BookOpen", "Дебют", "Выучите 10 слов", "words", 10, words(10)),
    spec("words-50", "milestones", "common", "Layers", "Развитие фигур", "Выучите 50 слов", "words", 50, words(50)),
    spec("words-100", "milestones", "rare", "Target", "Центр доски", "Выучите 100 слов", "words", 100, words(100)),
    spec("words-250", "milestones", "rare", "Compass", "Миттельшпиль", "Выучите 250 слов", "words", 250, words(250)),
    spec("words-500", "milestones", "epic", "Castle", "Эндшпиль", "Выучите 500 слов", "words", 500, words(500)),
    spec("words-1000", "milestones", "legendary", "Crown", "Гроссмейстер", "Выучите 1000 слов", "words", 1000, words(1000)),
    spec("lessons-10", "milestones", "rare", "Medal", "Десять партий", "Сдайте 10 разных уроков", "lessons", 10, lessonsAtLeast(10)),
    spec("lessons-25", "milestones", "epic", "Trophy", "Турнирный игрок", "Сдайте 25 разных уроков", "lessons", 25, lessonsAtLeast(25)),
    // Алфавит
    spec("alphabet-letters", "alphabet", "rare", "Languages", `Все ${info.alphabetLetters} форм`, `Пройдите все этапы всех ${info.alphabetLetters} форм букв`, "letters", info.alphabetLetters, (i) => i.alphabetLetters > 0),
    spec("alphabet-passed", "alphabet", "rare", "Award", "Алфавит покорён", "Сдайте все уроки алфавита", "alphabetLessons", info.alphabetLessons, (i) => i.alphabetLessons > 0),
    // Качество
    spec("quiz-perfect", "quality", "rare", "Gem", "Без единой ошибки", "Пройдите викторину без ошибок", "perfectQuizzes", 1),
    spec("quiz-perfect-5", "quality", "epic", "Sparkles", "Чистая игра", "Пройдите без ошибок викторины в 5 разных уроках", "perfectQuizzes", 5, lessonsAtLeast(5)),
    // Регулярность
    spec("days-7", "regularity", "common", "CalendarDays", "Неделя занятий", "Позанимайтесь в 7 разных дней (необязательно подряд)", "activeDays", 7),
    spec("days-30", "regularity", "rare", "CalendarCheck", "Месяц занятий", "Позанимайтесь в 30 разных дней", "activeDays", 30),
    spec("days-100", "regularity", "epic", "Calendar", "Сто дней", "Позанимайтесь в 100 разных дней", "activeDays", 100),
    spec("rhythm-1", "regularity", "common", "Waves", "Ритм найден", "Позанимайтесь 3 дня за одну неделю", "rhythmWeeks", 1),
    spec("rhythm-4", "regularity", "rare", "Waves", "Месяц ритма", "Наберите 4 недели ритма (необязательно подряд)", "rhythmWeeks", 4),
    spec("rhythm-12", "regularity", "epic", "Waves", "Сезон ритма", "Наберите 12 недель ритма", "rhythmWeeks", 12),
    spec("rhythm-26", "regularity", "epic", "Waves", "Полгода ритма", "Наберите 26 недель ритма", "rhythmWeeks", 26),
    spec("rhythm-52", "regularity", "legendary", "Waves", "Год ритма", "Наберите 52 недели ритма", "rhythmWeeks", 52),
    spec("goal-7", "regularity", "common", "Goal", "Цель достигнута", "Выполните цель дня 7 раз", "goalDays", 7),
    spec("goal-30", "regularity", "rare", "Goal", "Цель на 30", "Выполните цель дня 30 раз", "goalDays", 30),
    // Память (повторение слов, задача 10): вспомнено при повторении и доведено до последней коробки (пауза 60 дней)
    spec("repeat-10", "memory", "common", "RefreshCw", "Освежили память", "Вспомните 10 слов при повторении", "repeats", 10, words(10)),
    spec("repeat-100", "memory", "rare", "History", "Ничего не забыто", "Вспомните 100 слов при повторении", "repeats", 100, words(10)),
    spec("repeat-500", "memory", "epic", "History", "Слоновья память", "Вспомните 500 слов при повторении", "repeats", 500, words(50)),
    spec("mastered-10", "memory", "rare", "Brain", "Прочно выучено", "Доведите 10 слов до самой долгой паузы повторения (60 дней)", "mastered", 10, words(10)),
    spec("mastered-50", "memory", "epic", "Anchor", "Якорь в памяти", "Доведите 50 слов до самой долгой паузы повторения", "mastered", 50, words(50)),
    // Разнообразие
    spec("variety-2", "variety", "common", "Shuffle", "Два фронта", "Сдайте уроки в 2 разных разделах", "sections", 2, sectionsAtLeast(2)),
    spec("variety-3", "variety", "rare", "Network", "Три направления", "Сдайте уроки в 3 разных разделах", "sections", 3, sectionsAtLeast(3)),
    spec("variety-4", "variety", "epic", "LayoutGrid", "Вся доска", "Сдайте уроки в 4 разных разделах", "sections", 4, sectionsAtLeast(4)),
    // Возвращение
    spec("return-14", "return", "common", "Handshake", "С возвращением", "Вернитесь после перерыва от 14 дней и позанимайтесь", "returns", 1),
  ];

  const badges: BadgeDef[] = specs
    .filter((s) => !s.need || s.need(info))
    .map(({ need: _need, ...def }) => def);

  for (const topic of info.topics) {
    if (topic.lessonIds.length === 0) continue;
    badges.push({
      id: `topic-${topic.id}`,
      category: "topics",
      rarity: "rare",
      icon: "Shield",
      title: `Тема закрыта: «${topic.title}»`,
      description: `Сдайте все уроки темы «${topic.title}»`,
      metric: null,
      threshold: topic.lessonIds.length,
      topicId: topic.id,
    });
  }

  return { badges, version: CATALOG_VERSION * 1000 + badges.length, byId: new Map(badges.map((b) => [b.id, b])) };
}

/** Какие темы закрыты (сданы все уроки темы) при данном множестве сданных уроков. */
export function closedTopics(info: ContentInfo, passedLessonIds: ReadonlySet<string>): Set<string> {
  const closed = new Set<string>();
  for (const topic of info.topics) {
    if (topic.lessonIds.length > 0 && topic.lessonIds.every((id) => passedLessonIds.has(id))) closed.add(topic.id);
  }
  return closed;
}

/** Все бейджи, условия которых выполнены при данных счётчиках и закрытых темах. */
export function eligibleBadges(catalog: Catalog, metrics: Metrics, closed: ReadonlySet<string>): string[] {
  return catalog.badges
    .filter((b) => (b.metric ? metrics[b.metric] >= b.threshold : !!b.topicId && closed.has(b.topicId)))
    .map((b) => b.id);
}

/** Бейджи, условия которых это событие выполнило впервые (раньше не были выполнены, теперь выполнены). */
export function crossedBadges(
  catalog: Catalog,
  before: Metrics,
  after: Metrics,
  closedBefore: ReadonlySet<string>,
  closedAfter: ReadonlySet<string>,
): string[] {
  return catalog.badges
    .filter((b) =>
      b.metric
        ? before[b.metric] < b.threshold && after[b.metric] >= b.threshold
        : !!b.topicId && !closedBefore.has(b.topicId) && closedAfter.has(b.topicId),
    )
    .map((b) => b.id);
}

/** Сколько бейджей какой редкости (для подписей и тестов). */
export function countByRarity(badges: BadgeDef[]): Record<Rarity, number> {
  const result: Record<Rarity, number> = { common: 0, rare: 0, epic: 0, legendary: 0 };
  for (const b of badges) result[b.rarity] += 1;
  return result;
}

/** Текст для кнопки «Поделиться»: только название бейджа, без имени и id. */
export function shareText(badge: BadgeDef): string {
  return `Я получил(а) бейдж «${badge.title}» в Milav`;
}

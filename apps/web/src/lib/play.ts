// Чистая логика экрана «Достижения» и блока «Мой путь»: группировка бейджей, подписи, прогресс. Без React и сети.
import {
  BADGE_CATEGORIES,
  WEEK_START_DAY,
  type AchievementsResponse,
  type BadgeCategory,
  type BadgeDef,
  type Catalog,
  type Rarity,
  type StatusPath,
} from "@milav/shared";

export interface BadgeView {
  def: BadgeDef;
  earned: boolean;
  /** Получен ли задним числом (найден при пересчёте). */
  retro: boolean;
  /** Поздравление ещё не показано. */
  fresh: boolean;
  earnedAt: number | null;
  /** Прогресс к порогу (у бейджей по счётчикам); null у бейджей тем и у полученных. */
  progress: { value: number; target: number } | null;
}

export interface BadgeGroup {
  key: BadgeCategory;
  title: string;
  badges: BadgeView[];
}

/** Бейджи по разделам в порядке каталога; внутри раздела полученные идут первыми не нужны: порядок каталога понятнее. */
export function groupBadges(catalog: Catalog, data: AchievementsResponse | null): BadgeGroup[] {
  const earned = new Map((data?.earned ?? []).map((e) => [e.id, e]));
  return BADGE_CATEGORIES.map(({ key, title }) => ({
    key,
    title,
    badges: catalog.badges
      .filter((b) => b.category === key)
      .map((def): BadgeView => {
        const got = earned.get(def.id);
        const value = def.metric && data ? data.counters[def.metric] : 0;
        return {
          def,
          earned: !!got,
          retro: got?.retro ?? false,
          fresh: !!got && !got.seen,
          earnedAt: got?.earnedAt ?? null,
          progress: !got && def.metric && data ? { value: Math.min(value, def.threshold), target: def.threshold } : null,
        };
      }),
  })).filter((g) => g.badges.length > 0);
}

/** Классы цвета значка и фона плитки по редкости. Полные строки, чтобы Tailwind их нашёл при сборке. */
export const RARITY_CLASSES: Record<Rarity, { icon: string; soft: string; ring: string }> = {
  common: { icon: "text-rarity-common", soft: "bg-rarity-common-soft", ring: "ring-rarity-common" },
  rare: { icon: "text-rarity-rare", soft: "bg-rarity-rare-soft", ring: "ring-rarity-rare" },
  epic: { icon: "text-rarity-epic", soft: "bg-rarity-epic-soft", ring: "ring-rarity-epic" },
  legendary: { icon: "text-rarity-legendary", soft: "bg-rarity-legendary-soft", ring: "ring-rarity-legendary" },
};

const WEEKDAYS = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];

/** Подписи дней недели, начиная с первого дня недели. */
export function weekdayLabels(): string[] {
  return WEEKDAYS.map((_, i) => WEEKDAYS[(i + WEEK_START_DAY) % 7]!);
}

/** «Конь → Слон» и «6 из 21»; у Короля следующей фигуры нет. */
export function statusPathText(path: StatusPath): { title: string; progress: string } {
  if (!path.next || path.to === null) return { title: `${path.name}: высший статус`, progress: `Сдано уроков: ${path.passed}` };
  return { title: `${path.name} → ${path.next.name}`, progress: `${path.passed} из ${path.to}` };
}

/** Русское склонение: 1 неделя, 2 недели, 5 недель. */
export function plural(n: number, one: string, few: string, many: string): string {
  const mod100 = Math.abs(n) % 100;
  const mod10 = mod100 % 10;
  if (mod100 > 10 && mod100 < 15) return many;
  if (mod10 === 1) return one;
  if (mod10 >= 2 && mod10 <= 4) return few;
  return many;
}

/** Дата получения бейджа для подписи: «14 октября 2026». */
export function formatEarnedDate(seconds: number, timeZone?: string): string {
  try {
    return new Date(seconds * 1000).toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric", timeZone });
  } catch {
    return new Date(seconds * 1000).toISOString().slice(0, 10);
  }
}

/** Итоги прошлой недели уже закрыты на этом устройстве? */
const RECAP_KEY = "milav:recap-week";

export function recapDismissed(weekIdx: number): boolean {
  try {
    return window.localStorage.getItem(RECAP_KEY) === String(weekIdx);
  } catch {
    return false;
  }
}

export function dismissRecap(weekIdx: number): void {
  try {
    window.localStorage.setItem(RECAP_KEY, String(weekIdx));
  } catch {
    // Хранилище недоступно: карточка просто покажется снова.
  }
}

/** Подпись сравнения с теми, кто пришёл в одно время (нейтральные числа, без «лучше» и «хуже»). */
export function cohortText(c: { level: string; size: number; p25?: number; p50?: number; p75?: number; mine: number }): string | null {
  if (c.level === "none" || c.p25 === undefined || c.p50 === undefined || c.p75 === undefined) return null;
  const who = c.level === "week" ? "в ту же неделю" : "примерно в то же время";
  return `С вами начали учиться ${who}: ${c.size} ${plural(c.size, "человек", "человека", "человек")}. Типичный результат на сегодня: от ${c.p25} до ${c.p75} очков, посередине ${c.p50}. У вас: ${c.mine}.`;
}

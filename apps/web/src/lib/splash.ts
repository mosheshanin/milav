// Заставка при запуске (решение владельца 24.11.2026, docs/SPEC.md, «Заставка при запуске»).
// Первый запуск на устройстве: 5 слайдов (≈15 с; было ≈21 с до 26.11.2026, сокращено по данным первых дней:
// половина новичков не дошла до первого упражнения), каждый в цвете своей буквы логотипа M-I-L-A-V.
// Следующие запуски: только логотип на 2,5 с. Нажатие на экран — следующий слайд, «Пропустить» — сразу в приложение.
// Здесь только правила (какой показ и цифры для последнего слайда), вид и анимации: components/Splash.tsx и index.css.
import type { LessonMeta } from "@milav/shared";

/** Отметка «заставку на этом устройстве уже видели» (localStorage). */
export const SPLASH_SEEN_KEY = "milav:splash-seen";

/** Сколько держится каждый слайд полной заставки, мс (последний — до начала раскрытия приложения). */
// Самая поздняя анимация внутри слайда заканчивается к ≈2,5 с (галочки второго слайда), поэтому меньше 3 с не делаем.
export const FULL_DURATIONS = [3000, 3200, 3400, 3000, 2600] as const;
/** Короткая заставка (только логотип), мс. */
export const SHORT_MS = 2500;
/** Раскрытие приложения кругом из центра в конце, мс; после «Пропустить» быстрее. */
export const REVEAL_MS = 700;
export const SKIP_REVEAL_MS = 450;

export type SplashMode = "full" | "short" | "none";

export interface SplashInput {
  /** Заставку на этом устройстве уже видели. */
  seen: boolean;
  /** Браузером управляет программа (сквозные тесты Playwright): `navigator.webdriver`. */
  automated: boolean;
  /** Параметр адреса `?splash=full|short|off` (проверка заставки вручную и в тестах). */
  forced: string | null;
  /** Приложение открыто особой ссылкой (`startapp=record`): сразу к делу. */
  deepLink: boolean;
}

/** Какую заставку показать. Параметр адреса сильнее всего; автотестам и особым ссылкам заставка не мешает. */
export function splashMode(input: SplashInput): SplashMode {
  if (input.forced === "full" || input.forced === "1") return "full";
  if (input.forced === "short") return "short";
  if (input.forced === "off" || input.forced === "0") return "none";
  if (input.automated || input.deepLink) return "none";
  return input.seen ? "short" : "full";
}

/** Цифры для последнего слайда: слова (без букв алфавита) и уроки по манифесту, без запроса к серверу. */
export function splashStats(metas: readonly Pick<LessonMeta, "section" | "count">[]): { words: number; lessons: number } {
  const words = metas.filter((m) => m.section !== "alphabet").reduce((sum, m) => sum + m.count, 0);
  return { words, lessons: metas.length };
}

/** Видели ли заставку на этом устройстве. Без хранилища считаем, что видели: длинную заставку лучше не показывать каждый раз. */
export function splashSeen(): boolean {
  try {
    return window.localStorage.getItem(SPLASH_SEEN_KEY) === "1";
  } catch {
    return true;
  }
}

export function markSplashSeen(): void {
  try {
    window.localStorage.setItem(SPLASH_SEEN_KEY, "1");
  } catch {
    // Хранилище недоступно: при следующем запуске будет короткая заставка (splashSeen вернёт true).
  }
}

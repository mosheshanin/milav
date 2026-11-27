// Видимая часть окна приложения в Telegram (27.11.2026, вопрос 152).
//
// Окно мини-приложения в Telegram бывает выше, чем видно на экране: Telegram показывает только верх, а низ остаётся
// за краем (так написано в документации Telegram про `viewportHeight`). Так бывает на iPad, где окно приложения
// не раскрывается на весь экран, и при ошибке Telegram на iPad, когда снизу остаётся полоса высотой с клавиатуру.
// Браузер об этом не знает и считает, что низ страницы виден: кнопки под холстом «Пиши» оказывались за краем,
// и докрутить до них было нельзя. Поэтому приложение узнаёт у Telegram высоту видимой части и записывает спрятанную
// высоту в CSS-переменную `--app-hidden-bottom`: на столько же увеличивается отступ под содержимым (index.css),
// и нижние кнопки можно прокрутить в видимую часть.

/** Минимальная и наибольшая доля окна, которую считаем спрятанной (меньше — погрешность, больше — сбой данных). */
const MIN_HIDDEN_PX = 2;
const MAX_HIDDEN_SHARE = 0.6;

/**
 * Сколько пикселей снизу окна не видно на экране. `windowHeight` — высота окна страницы (`innerHeight`),
 * `visibleHeight` — высота видимой части от Telegram (`viewportStableHeight`). Нет данных или сбой — 0.
 */
export function hiddenBottom(windowHeight: number, visibleHeight: number | undefined): number {
  if (!Number.isFinite(windowHeight) || windowHeight <= 0) return 0;
  if (visibleHeight === undefined || !Number.isFinite(visibleHeight) || visibleHeight <= 0) return 0;
  const hidden = Math.round(windowHeight - visibleHeight);
  if (hidden < MIN_HIDDEN_PX) return 0;
  return Math.min(hidden, Math.round(windowHeight * MAX_HIDDEN_SHARE));
}

/** Что нужно от Telegram WebApp: высота видимой части и событие её изменения. */
export interface ViewportSource {
  viewportStableHeight?: number;
  onEvent?: (event: string, handler: () => void) => void;
}

/**
 * Следит за видимой частью окна и обновляет `--app-hidden-bottom` на `<html>`: сразу, при событии Telegram
 * `viewportChanged` и при изменении размера окна (поворот iPad, разделённый экран).
 */
export function watchViewport(tg: ViewportSource, win: Window = window): void {
  const update = () => {
    const px = hiddenBottom(win.innerHeight, tg.viewportStableHeight);
    win.document.documentElement.style.setProperty("--app-hidden-bottom", `${px}px`);
  };
  update();
  try {
    tg.onEvent?.("viewportChanged", update);
  } catch {
    // Старая версия Telegram без событий: хватит пересчёта при изменении размера окна.
  }
  win.addEventListener("resize", update);
}

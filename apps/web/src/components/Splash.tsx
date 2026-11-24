// Заставка при запуске (docs/SPEC.md, «Заставка при запуске»; правила показа: lib/splash.ts, вид: index.css, «Заставка»).
// Палитра «Буквы»: каждый слайд в цвете своей буквы логотипа. Элементы-стикеры с чёрной обводкой, как буквы логотипа.
// Приложение грузится под заставкой, а в конце открывается кругом из центра. Нажатие на экран — следующий слайд.
// Заставка не должна ломать приложение: любая ошибка внутри неё просто убирает её (SplashBoundary).
import { Component, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { statusLegend } from "@milav/shared";
import { lessonMetas } from "../lib/lessons";
import { plural } from "../lib/play";
import {
  FULL_DURATIONS,
  REVEAL_MS,
  SHORT_MS,
  SKIP_REVEAL_MS,
  markSplashSeen,
  splashMode,
  splashSeen,
  splashStats,
  type SplashMode,
} from "../lib/splash";
import { launchTarget } from "../telegram";

/** Задержка появления элемента слайда (CSS-переменная --d). */
const delay = (seconds: number) => ({ "--d": `${seconds}s` }) as CSSProperties;

function initialMode(): SplashMode {
  let forced: string | null = null;
  try {
    forced = new URLSearchParams(window.location.search).get("splash");
  } catch {
    // Нечитаемый адрес: параметра нет.
  }
  return splashMode({
    seen: splashSeen(),
    automated: typeof navigator !== "undefined" && navigator.webdriver === true,
    forced,
    deepLink: launchTarget() !== null,
  });
}

/** Буквы-стикеры вокруг логотипа на первом слайде. */
const TILES = [
  { ch: "א", cls: "splash-tile-a", r: -12, d: 0.35 },
  { ch: "ש", cls: "splash-tile-b", r: 10, d: 0.5 },
  { ch: "ל", cls: "splash-tile-c", r: 14, d: 0.65 },
  { ch: "ם", cls: "splash-tile-d", r: -8, d: 0.8 },
];

const WAYS = [
  { img: "listen", name: "Слушай" },
  { img: "speak", name: "Говори" },
  { img: "write", name: "Пиши" },
  { img: "type", name: "Печатай" },
];

function Logo({ small = false }: { small?: boolean }) {
  return <img className={`splash-logo${small ? " splash-logo-sm" : ""}`} src="/splash/logo.webp" alt="Milav" width={589} height={151} />;
}

function Slides({ mode }: { mode: SplashMode }) {
  const first = (
    <section className="splash-slide" data-out="zoom" aria-hidden="true">
      {TILES.map((t) => (
        <span key={t.ch} className={`splash-tile splash-stk ${t.cls}`} style={{ "--r": `${t.r}deg`, "--d": `${t.d}s` } as CSSProperties}>
          {t.ch}
        </span>
      ))}
      <div className="splash-sc">
        <Logo />
      </div>
    </section>
  );
  if (mode === "short") return first;

  const { words, lessons } = splashStats(lessonMetas);
  const steps = statusLegend();
  return (
    <>
      {first}

      <section className="splash-slide" data-out="swipe" aria-hidden="true">
        <div className="splash-sc">
          <p className="splash-title splash-in" style={delay(0.05)}>
            Каждое слово — четырьмя путями
          </p>
          <div className="splash-ways">
            {WAYS.map((w, i) => (
              <div key={w.img} className="splash-stk splash-pop" style={delay(0.3 + i * 0.15)}>
                <img src={`/splash/${w.img}.webp`} alt="" width={320} height={240} />
                {w.name}
              </div>
            ))}
          </div>
          <p className="splash-text splash-in" style={delay(1)}>
            Слух, голос, рука и клавиатура запоминают вместе
          </p>
        </div>
      </section>

      <section className="splash-slide" data-out="wipe" aria-hidden="true">
        <div className="splash-sc">
          <p className="splash-title splash-in" style={delay(0.05)}>
            Выучил — значит выучил
          </p>
          <div className="splash-word splash-stk splash-pop" style={delay(0.3)}>
            <img src="/splash/bird.svg" alt="" width={64} height={64} />
            <div>
              <b className="font-hebrew" dir="rtl">
                ציפור
              </b>
              <small>[ципо́р] · птица</small>
            </div>
          </div>
          <div className="splash-checks">
            {WAYS.map((w, i) => (
              <span key={w.img} style={delay(1 + i * 0.35)}>
                ✓ {w.name}
              </span>
            ))}
          </div>
          <p className="splash-text splash-in" style={delay(0.6)}>
            Приложение слышит произношение и проверяет каждую букву. Обмануть не выйдет
          </p>
        </div>
      </section>

      <section className="splash-slide" data-out="iris" aria-hidden="true">
        <div className="splash-sc">
          <p className="splash-title splash-in" style={delay(0.05)}>
            От пешки до короля
          </p>
          <div className="splash-chess">
            {steps.map((s, i) => (
              <span key={s.key} className={`splash-stk splash-chess-${i}`} style={{ height: `${46 + i * 14}px`, "--d": `${0.3 + i * 0.12}s` } as CSSProperties}>
                {s.symbol}
              </span>
            ))}
          </div>
          <p className="splash-text splash-in" style={delay(1.1)}>
            Сдаёшь уроки — растёт статус. Плюс бейджи, недельный ритм и таблица лидеров
          </p>
        </div>
      </section>

      <section className="splash-slide" aria-hidden="true">
        <div className="splash-sc">
          <Logo small />
          <div className="splash-nums">
            <span className="splash-stk splash-pop" style={delay(0.3)}>
              <b data-n={words}>{words}</b> {plural(words, "слово", "слова", "слов")}
            </span>
            <span className="splash-stk splash-pop" style={delay(0.42)}>
              <b data-n={lessons}>{lessons}</b> {plural(lessons, "урок", "урока", "уроков")}
            </span>
            <span className="splash-stk splash-pop" style={delay(0.54)}>
              все бесплатно
            </span>
          </div>
          <p className="splash-go splash-stk splash-in" style={delay(0.8)}>
            Начать <i>→</i>
          </p>
        </div>
      </section>
    </>
  );
}

function SplashScreen() {
  const [mode] = useState(initialMode);
  const [done, setDone] = useState(mode === "none");
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = root.current;
    if (done || !el) return;
    markSplashSeen();
    const html = document.documentElement;
    html.classList.add("splash-on");

    const slides = [...el.querySelectorAll<HTMLElement>(".splash-slide")];
    const dots = [...el.querySelectorAll<HTMLElement>(".splash-dots i")];
    const durations: readonly number[] = mode === "short" ? [SHORT_MS] : FULL_DURATIONS;
    const calm = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    const timers: number[] = [];
    const later = (fn: () => void, ms: number) => {
      const id = window.setTimeout(fn, ms);
      timers.push(id);
      return id;
    };
    let cur = 0;
    let timer = 0;
    let revealing = false;
    let finished = false;

    // Счёт чисел от нуля до значения.
    const countUp = (node: HTMLElement) => {
      const to = Number(node.dataset.n) || 0;
      if (calm || !to) return;
      const t0 = performance.now();
      const tick = (now: number) => {
        const k = Math.min(1, (now - t0) / 900);
        node.textContent = String(Math.round(to * (1 - (1 - k) ** 3)));
        if (k < 1 && !finished) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    };
    const show = (i: number) => {
      slides[i]?.classList.add("is-on");
      el.dataset.s = String(i);
      dots.forEach((d, k) => d.classList.toggle("is-on", k === i));
      slides[i]?.querySelectorAll<HTMLElement>("[data-n]").forEach(countUp);
    };
    // Раскрытие приложения кругом из центра; без CSS @property (старые WebView) — плавное исчезновение.
    const reveal = (ms: number) => {
      if (revealing) return;
      revealing = true;
      window.clearTimeout(timer);
      el.style.setProperty("--splash-reveal-t", `${ms}ms`);
      if (!window.CSS?.registerProperty) el.classList.add("splash-fade");
      el.classList.add("splash-reveal");
      later(() => {
        finished = true;
        setDone(true);
      }, ms + 50);
    };
    const next = () => {
      if (revealing) return;
      window.clearTimeout(timer);
      if (cur >= slides.length - 1) return reveal(REVEAL_MS);
      const prev = slides[cur]!;
      const out = prev.dataset.out ?? "zoom";
      prev.classList.remove("is-on");
      prev.classList.add("is-out", `out-${out}`);
      later(() => prev.classList.remove("is-out", `out-${out}`), 900);
      cur++;
      slides[cur]!.classList.add(`in-${out}`);
      show(cur);
      timer = later(next, durations[cur] ?? 4400);
    };
    const skip = (e: Event) => {
      e.stopPropagation();
      reveal(SKIP_REVEAL_MS);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") reveal(SKIP_REVEAL_MS);
    };

    // Повторный запуск эффекта (StrictMode в разработке): начинаем с чистого листа.
    slides.forEach((s) => s.classList.remove("is-on", "is-out", "out-zoom", "out-swipe", "out-wipe", "out-iris", "in-zoom", "in-swipe", "in-wipe", "in-iris"));
    el.classList.remove("splash-reveal", "splash-fade");
    const skipButton = el.querySelector<HTMLButtonElement>(".splash-skip");
    el.addEventListener("click", next);
    skipButton?.addEventListener("click", skip);
    window.addEventListener("keydown", onKey);
    show(0);
    timer = later(next, durations[0] ?? SHORT_MS);

    return () => {
      finished = true;
      timers.forEach((id) => window.clearTimeout(id));
      el.removeEventListener("click", next);
      skipButton?.removeEventListener("click", skip);
      window.removeEventListener("keydown", onKey);
      html.classList.remove("splash-on");
    };
  }, [done, mode]);

  if (done) return null;
  return (
    <div ref={root} className="splash" data-s="0" data-testid="splash" data-mode={mode} role="dialog" aria-label="Заставка Milav">
      <div className="splash-base" aria-hidden="true" />
      <div className="splash-bg" aria-hidden="true">
        <i />
        <i />
        <i />
        <i />
      </div>
      <Slides mode={mode} />
      {mode === "full" && (
        <div className="splash-dots" aria-hidden="true">
          {FULL_DURATIONS.map((_, i) => (
            <i key={i} />
          ))}
        </div>
      )}
      <button type="button" className="splash-skip" data-testid="splash-skip">
        Пропустить
      </button>
    </div>
  );
}

/** Любая ошибка заставки убирает её, не задевая приложение. */
class SplashBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  componentDidCatch(): void {
    document.documentElement.classList.remove("splash-on");
  }

  render(): ReactNode {
    return this.state.failed ? null : this.props.children;
  }
}

export function Splash() {
  return (
    <SplashBoundary>
      <SplashScreen />
    </SplashBoundary>
  );
}

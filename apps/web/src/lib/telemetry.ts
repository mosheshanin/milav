import {
  CLIENT_LOG_LIMITS,
  CLIENT_LOG_PATH,
  type ClientErrorSource,
  type ClientEventName,
  type ClientLogContext,
  type ClientLogRequest,
} from "@milav/shared";
import { SCREEN_KEY } from "./screen";

// Отчёты приложения об ошибках и событиях телефона (ROADMAP п. 9). Сервер пишет их в Workers Logs
// (`client_error`, `client_mic_problem`, …, docs/DEPLOY.md). Отправка «выстрелил и забыл»: отчёт никогда не мешает
// ученику, не показывает ошибок и не повторяется. За один запуск не больше CLIENT_LOG_LIMITS.perLaunch отчётов,
// одинаковые ошибки отправляются один раз.

/**
 * Ошибки, которые ничего не говорят и только засоряют журнал:
 * - «Script error.» браузер пишет вместо текста ошибки чужого скрипта (telegram-web-app.js с telegram.org);
 * - «ResizeObserver loop …» безвредное предупреждение браузера о перерисовке.
 */
const IGNORED_MESSAGES = [/^Script error\.?$/i, /ResizeObserver loop/i];

export function isIgnoredError(message: string): boolean {
  return IGNORED_MESSAGES.some((re) => re.test(message.trim()));
}

/** Текст и стек из того, что бросили (Error, строка, что угодно). Обрезаются до пределов отчёта. */
export function errorFields(err: unknown): { message: string; stack?: string } {
  if (err instanceof Error) {
    const message = `${err.name && err.name !== "Error" ? `${err.name}: ` : ""}${err.message}`;
    return {
      message: message.slice(0, CLIENT_LOG_LIMITS.message),
      ...(err.stack ? { stack: err.stack.slice(0, CLIENT_LOG_LIMITS.stack) } : {}),
    };
  }
  let message: string;
  try {
    message = typeof err === "string" ? err : JSON.stringify(err) ?? String(err);
  } catch {
    message = String(err);
  }
  return { message: message.slice(0, CLIENT_LOG_LIMITS.message) };
}

export interface ReporterDeps {
  /** Отправляет готовое тело отчёта (JSON). Не должна бросать. */
  send: (body: string) => void;
  /** Где и на чём это случилось: экран, платформа, версии. */
  context: () => ClientLogContext;
  /** Сколько отчётов за запуск. */
  limit?: number;
}

export interface Reporter {
  error: (source: ClientErrorSource, err: unknown) => void;
  event: (name: ClientEventName, detail?: string) => void;
}

/** Отчётчик с ограничением числа отчётов и без повторов. Вынесен из отправки, чтобы проверяться тестами без браузера. */
export function createReporter({ send, context, limit = CLIENT_LOG_LIMITS.perLaunch }: ReporterDeps): Reporter {
  const seen = new Set<string>();
  let sent = 0;

  function submit(key: string, report: ClientLogRequest): void {
    if (sent >= limit || seen.has(key)) return;
    seen.add(key);
    sent += 1;
    try {
      send(JSON.stringify(report));
    } catch {
      // Отчёт не ушёл: ничего страшного, ученику это не мешает.
    }
  }

  return {
    error(source, err) {
      const fields = errorFields(err);
      if (!fields.message || isIgnoredError(fields.message)) return;
      let ctx: ClientLogContext = {};
      try {
        ctx = context();
      } catch {
        // Без контекста отчёт всё равно полезен.
      }
      submit(`error:${fields.message}`, { kind: "error", source, ...fields, ...ctx });
    },
    event(name, detail) {
      let ctx: ClientLogContext = {};
      try {
        ctx = context();
      } catch {
        // Без контекста отчёт всё равно полезен.
      }
      submit(`event:${name}:${detail ?? ""}`, { kind: "event", name, ...(detail ? { detail } : {}), ...ctx });
    },
  };
}

// ---- Отчётчик приложения ----

/** Версия сборки (первые 7 знаков коммита), подставляется Vite. В тестах её нет. */
function appVersion(): string {
  return typeof __APP_VERSION__ === "string" ? __APP_VERSION__ : "dev";
}

/** Экран из сохранённого места (lib/screen.ts): «study:animals-1», «home». */
function currentScreen(): string | undefined {
  try {
    const raw = window.sessionStorage.getItem(SCREEN_KEY);
    if (!raw) return undefined;
    const screen = JSON.parse(raw) as { name?: unknown; lessonId?: unknown };
    if (typeof screen.name !== "string") return undefined;
    return typeof screen.lessonId === "string" ? `${screen.name}:${screen.lessonId}` : screen.name;
  } catch {
    return undefined;
  }
}

function browserContext(): ClientLogContext {
  const tg = window.Telegram?.WebApp;
  return {
    screen: currentScreen(),
    platform: tg?.platform,
    tgVersion: tg?.version,
    app: appVersion(),
  };
}

/**
 * Отправка через fetch с keepalive: запрос доживёт, даже если приложение сразу закрывают. sendBeacon не подходит:
 * он не умеет заголовок Authorization, а по нему сервер добавляет в запись id ученика.
 */
function browserSend(body: string): void {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const initData = window.Telegram?.WebApp?.initData;
  if (initData) headers.Authorization = `tma ${initData}`;
  void fetch(CLIENT_LOG_PATH, { method: "POST", headers, body, keepalive: true }).catch(() => undefined);
}

let reporter: Reporter | null = null;

/** Отчётчик приложения (создаётся при первом обращении). */
export function getReporter(): Reporter {
  reporter ??= createReporter({ send: browserSend, context: browserContext });
  return reporter;
}

/** Сообщить о событии телефона (например, не включился микрофон). */
export function reportEvent(name: ClientEventName, detail?: string): void {
  getReporter().event(name, detail);
}

/** Сообщить об ошибке. */
export function reportError(source: ClientErrorSource, err: unknown): void {
  getReporter().error(source, err);
}

/**
 * Ловит необработанные ошибки скриптов и промисов. Вызывается один раз при запуске (main.tsx).
 * Падения отрисовки ловит ErrorBoundary (components/ErrorBoundary.tsx).
 */
export function installErrorHandlers(): void {
  window.addEventListener("error", (e: ErrorEvent) => reportError("error", e.error ?? e.message));
  window.addEventListener("unhandledrejection", (e: PromiseRejectionEvent) => reportError("rejection", e.reason));
}

// Наблюдаемость (ROADMAP п. 9, 15.10.2026): приложение сообщает серверу о своих ошибках и о проблемах, которые видит
// только телефон (например, микрофон). Сервер пишет их в Workers Logs строкой JSON, в базу ничего не попадает.
// Подробно: docs/DEPLOY.md, раздел «Наблюдаемость».

/** Куда приложение отправляет отчёты. */
export const CLIENT_LOG_PATH = "/api/client-log";

/**
 * События, о которых знает только телефон. Сервер принимает только эти имена, остальное отклоняет,
 * чтобы в логи не попадало что угодно.
 * - mic_problem: не удалось включить микрофон (detail: denied | unsupported);
 * - app_crash: интерфейс упал и показан экран «Что-то пошло не так» (подробности приходят отдельным отчётом об ошибке).
 */
export const CLIENT_EVENTS = ["mic_problem", "app_crash"] as const;
export type ClientEventName = (typeof CLIENT_EVENTS)[number];

/** Откуда пришла ошибка: window.onerror, необработанный промис или падение отрисовки React. */
export const CLIENT_ERROR_SOURCES = ["error", "rejection", "render"] as const;
export type ClientErrorSource = (typeof CLIENT_ERROR_SOURCES)[number];

/** Пределы отчёта. Длинное приложение обрезает само, сервер проверяет ещё раз. */
export const CLIENT_LOG_LIMITS = {
  /** Размер тела запроса, байт. */
  bodyBytes: 4096,
  /** Текст ошибки, символов. */
  message: 300,
  /** Стек вызовов, символов. */
  stack: 1500,
  /** Короткие поля (экран, платформа, версии, detail), символов. */
  field: 60,
  /** Сколько отчётов приложение отправляет за один запуск (одинаковые ошибки не повторяются). */
  perLaunch: 10,
  /** Сколько отчётов сервер принимает с одного адреса в минуту (в пределах одного экземпляра Worker). */
  perMinutePerIp: 30,
} as const;

/** Общие поля отчёта: где и на чём это случилось. Все необязательные. */
export interface ClientLogContext {
  /** Экран приложения (home, study, quiz, …). */
  screen?: string;
  /** Платформа Telegram: ios, android, tdesktop, weba, … */
  platform?: string;
  /** Версия Telegram WebApp (например, 8.0). */
  tgVersion?: string;
  /** Версия приложения: первые 7 знаков коммита сборки. */
  app?: string;
}

export type ClientLogRequest =
  | ({ kind: "error"; source: ClientErrorSource; message: string; stack?: string } & ClientLogContext)
  | ({ kind: "event"; name: ClientEventName; detail?: string } & ClientLogContext);

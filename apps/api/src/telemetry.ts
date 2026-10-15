import {
  CLIENT_ERROR_SOURCES,
  CLIENT_EVENTS,
  CLIENT_LOG_LIMITS,
  type ClientErrorSource,
  type ClientEventName,
} from "@milav/shared";

// Наблюдаемость (ROADMAP п. 9): события и ошибки пишутся в Workers Logs строкой JSON (observability в wrangler.jsonc).
// Поле `evt` у каждой записи — по нему удобно фильтровать в панели Cloudflare (Workers & Pages → milav → Observability).
// В базу D1 ничего не пишется: бесплатный лимит записей D1 нужен урокам. Список событий и запросы: docs/DEPLOY.md.

export type LogValue = string | number | boolean | null | undefined;
export type LogFields = Record<string, LogValue>;

/** Убирает пустые поля, чтобы запись была короче. */
function compact(fields: LogFields): Record<string, string | number | boolean | null> {
  const out: Record<string, string | number | boolean | null> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined) out[key] = value;
  }
  return out;
}

/** Событие воронки или служебное событие (уровень info). */
export function logEvent(evt: string, fields: LogFields = {}): void {
  console.log(JSON.stringify({ evt, ...compact(fields) }));
}

/** Предупреждение: что-то пошло не так, но ответ получен (уровень warn). */
export function logWarn(evt: string, fields: LogFields = {}): void {
  console.warn(JSON.stringify({ evt, ...compact(fields) }));
}

/** Ошибка (уровень error): в панели Cloudflare такие записи выделены. */
export function logError(evt: string, fields: LogFields = {}): void {
  console.error(JSON.stringify({ evt, ...compact(fields) }));
}

/** Текст и стек ошибки сервера, обрезанные до разумной длины. */
export function describeError(err: unknown): { message: string; stack?: string } {
  if (err instanceof Error) {
    return {
      message: err.message.slice(0, CLIENT_LOG_LIMITS.message),
      ...(err.stack ? { stack: err.stack.slice(0, CLIENT_LOG_LIMITS.stack) } : {}),
    };
  }
  return { message: String(err).slice(0, CLIENT_LOG_LIMITS.message) };
}

// ---- Отчёты приложения (POST /api/client-log) ----

/** Отчёт приложения после проверки: всё обрезано, лишних полей нет. */
export type ClientReport =
  | { kind: "error"; source: ClientErrorSource; message: string; stack?: string; context: LogFields }
  | { kind: "event"; name: ClientEventName; detail?: string; context: LogFields };

/** Короткая строка: только печатные символы, без переводов строк, не длиннее `max`. Иначе undefined. */
function shortText(value: unknown, max: number = CLIENT_LOG_LIMITS.field): string | undefined {
  if (typeof value !== "string") return undefined;
  const clean = value.replace(/[\u0000-\u001f\u007f]/g, " ").trim();
  return clean ? clean.slice(0, max) : undefined;
}

/** Длинный текст (сообщение, стек): переводы строк оставляем, остальные управляющие символы убираем. */
function longText(value: unknown, max: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const clean = value.replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, " ").trim();
  return clean ? clean.slice(0, max) : undefined;
}

/**
 * Проверяет отчёт приложения. Возвращает null, если это не отчёт: неизвестный вид, событие или источник,
 * пустое сообщение об ошибке. Поля обрезаются до пределов CLIENT_LOG_LIMITS.
 */
export function parseClientReport(body: unknown): ClientReport | null {
  if (typeof body !== "object" || body === null) return null;
  const b = body as Record<string, unknown>;
  const context: LogFields = {
    screen: shortText(b.screen),
    platform: shortText(b.platform),
    tgVersion: shortText(b.tgVersion),
    app: shortText(b.app),
  };

  if (b.kind === "error") {
    if (!CLIENT_ERROR_SOURCES.includes(b.source as ClientErrorSource)) return null;
    const message = longText(b.message, CLIENT_LOG_LIMITS.message);
    if (!message) return null;
    const stack = longText(b.stack, CLIENT_LOG_LIMITS.stack);
    return { kind: "error", source: b.source as ClientErrorSource, message, ...(stack ? { stack } : {}), context };
  }

  if (b.kind === "event") {
    if (!CLIENT_EVENTS.includes(b.name as ClientEventName)) return null;
    const detail = shortText(b.detail);
    return { kind: "event", name: b.name as ClientEventName, ...(detail ? { detail } : {}), context };
  }

  return null;
}

/** Пишет отчёт приложения в лог: ошибки уровнем error (`client_error`), события уровнем info (`client_<имя>`). */
export function logClientReport(report: ClientReport, uid?: number): void {
  if (report.kind === "error") {
    logError("client_error", {
      source: report.source,
      message: report.message,
      stack: report.stack,
      uid,
      ...report.context,
    });
  } else {
    logEvent(`client_${report.name}`, { detail: report.detail, uid, ...report.context });
  }
}

/**
 * Ограничитель частоты в памяти экземпляра Worker: не больше `limit` отчётов с одного ключа (адреса) за `windowSec`.
 * Это не точный лимит (у Cloudflare много экземпляров, память сбрасывается), а защита логов от потока мусора
 * без записи в D1. Число ключей ограничено: при переполнении таблица очищается.
 */
export function createThrottle(limit: number, windowSec = 60, maxKeys = 1000) {
  const windows = new Map<string, { start: number; count: number }>();
  return (key: string, now: number = Math.floor(Date.now() / 1000)): boolean => {
    const current = windows.get(key);
    if (!current || now - current.start >= windowSec) {
      if (!current && windows.size >= maxKeys) windows.clear();
      windows.set(key, { start: now, count: 1 });
      return true;
    }
    current.count += 1;
    return current.count <= limit;
  };
}

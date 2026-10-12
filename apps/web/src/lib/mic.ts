export type RecorderProblem = "unsupported" | "denied";

export class RecorderError extends Error {
  constructor(readonly problem: RecorderProblem) {
    super(problem);
  }
}

export type MicState = "granted" | "prompt" | "denied" | "unsupported";

const REMEMBER_KEY = "milav.mic.granted";

let stream: MediaStream | null = null;
let grantedThisSession = false;

function remembered(): boolean {
  try {
    return localStorage.getItem(REMEMBER_KEY) === "1";
  } catch {
    return false;
  }
}

function remember(): void {
  try {
    localStorage.setItem(REMEMBER_KEY, "1");
  } catch {
    // Память браузера может быть недоступна: это только подсказка, работать она не мешает.
  }
}

function live(s: MediaStream | null): s is MediaStream {
  return !!s && s.getTracks().some((t) => t.readyState === "live");
}

export function micSupported(): boolean {
  return !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== "undefined";
}

/**
 * Что известно о доступе к микрофону, без показа системного запроса.
 * Если браузер не умеет отвечать (Permissions API есть не везде), опираемся на то, что доступ уже давали.
 */
export async function micPermission(): Promise<MicState> {
  if (!micSupported()) return "unsupported";
  if (live(stream) || grantedThisSession) return "granted";
  try {
    const status = await navigator.permissions.query({ name: "microphone" as PermissionName });
    if (status.state === "granted" || status.state === "denied" || status.state === "prompt") return status.state;
  } catch {
    // Permissions API недоступен для микрофона.
  }
  return remembered() ? "granted" : "prompt";
}

/**
 * Даёт поток с микрофона. Поток создаётся один раз и используется для всех записей, пока приложение открыто:
 * так системный запрос доступа появляется не при каждой записи. Между записями дорожка выключена (pauseMic).
 */
export async function acquireMic(): Promise<MediaStream> {
  if (!micSupported()) throw new RecorderError("unsupported");
  if (live(stream)) {
    stream.getTracks().forEach((t) => (t.enabled = true));
    return stream;
  }
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch {
    throw new RecorderError("denied");
  }
  grantedThisSession = true;
  remember();
  return stream;
}

/** Между записями микрофон не слушает: дорожка выключена, но разрешение и поток сохраняются. */
export function pauseMic(): void {
  stream?.getTracks().forEach((t) => (t.enabled = false));
}

/** Полностью освобождает микрофон (индикатор записи гаснет). */
export function releaseMic(): void {
  stream?.getTracks().forEach((t) => t.stop());
  stream = null;
}

// Когда приложение свернули, микрофон отпускаем; при возврате поток создаётся заново без нового запроса там, где разрешение запомнено.
if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") releaseMic();
  });
}

// Микрофон: один поток и один анализатор громкости на всё время, пока приложение открыто и записи идут.
//
// Почему так (22.11.2026, iPhone: со второго слова запись не шла, эквалайзер стоял, помогал только перезапуск):
// - Выключать дорожку между записями (`track.enabled = false`) на iPhone нельзя: дорожка может «закончиться» или
//   перестать отдавать звук (WebKit bug 202405 и похожие). Теперь дорожка между записями остаётся включённой.
// - Анализатор (Web Audio) на iPhone работает, только если его подключить к потоку сразу после создания потока
//   (WebKit bug 172261): позже он молчит. Раньше анализатор создавался заново на каждую запись; теперь один раз, вместе
//   с потоком.
// - Звуковой движок (AudioContext) на iPhone запускается только по нажатию: `primeAudio()` вызывается прямо в обработчике
//   кнопки «Записать», до любых ожиданий.
// - Если дорожка всё же умерла (закончилась, заглушена системой, например после звонка или звука другого приложения),
//   поток создаётся заново при следующем нажатии. Если запись была мёртвой тишиной, запись говорит об этом
//   (`ActiveRecording.deadInput`), и микрофон отпускается, чтобы следующее нажатие взяло свежий поток.
// - Без записей дольше IDLE_RELEASE_MS микрофон отпускается (гаснет индикатор записи); когда приложение свёрнуто, тоже.

export type RecorderProblem = "unsupported" | "denied";

export class RecorderError extends Error {
  constructor(readonly problem: RecorderProblem) {
    super(problem);
  }
}

export type MicState = "granted" | "prompt" | "denied" | "unsupported";

const REMEMBER_KEY = "milav.mic.granted";

/** Через сколько без записей отпустить микрофон. */
export const IDLE_RELEASE_MS = 60_000;

let stream: MediaStream | null = null;
let grantedThisSession = false;
let audioContext: AudioContext | null = null;
let source: MediaStreamAudioSourceNode | null = null;
let analyser: AnalyserNode | null = null;
let idleTimer: ReturnType<typeof setTimeout> | undefined;

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

/**
 * Поток годится для записи: есть звуковая дорожка, она не закончилась и не заглушена системой.
 * Заглушённая (`muted`) дорожка на iPhone после прерывания (звонок, другой звук) обратно сама не оживает.
 */
export function usableStream(s: MediaStream | null): s is MediaStream {
  if (!s) return false;
  const tracks = s.getAudioTracks();
  return tracks.length > 0 && tracks.every((t) => t.readyState === "live" && !t.muted);
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
  if (usableStream(stream) || grantedThisSession) return "granted";
  try {
    const status = await navigator.permissions.query({ name: "microphone" as PermissionName });
    if (status.state === "granted" || status.state === "denied" || status.state === "prompt") return status.state;
  } catch {
    // Permissions API недоступен для микрофона.
  }
  return remembered() ? "granted" : "prompt";
}

/**
 * Запускает звуковой движок для анализатора громкости. Вызывать синхронно в обработчике нажатия «Записать»:
 * на iPhone движок, созданный или возобновлённый не по нажатию, молчит. Ошибки не бросает.
 */
export function primeAudio(): void {
  try {
    if (!audioContext || audioContext.state === "closed") {
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return;
      audioContext = new Ctx();
      source = null;
      analyser = null;
    }
    if (audioContext.state === "suspended") void audioContext.resume().catch(() => undefined);
  } catch {
    audioContext = null;
  }
}

/** Анализатор громкости на текущем потоке: создаётся сразу после потока (иначе на iPhone он молчит). */
function attachAnalyser(s: MediaStream): void {
  if (!audioContext || analyser) return;
  try {
    source = audioContext.createMediaStreamSource(s);
    analyser = audioContext.createAnalyser();
    analyser.fftSize = 512;
    analyser.smoothingTimeConstant = 0.6;
    source.connect(analyser);
  } catch {
    source = null;
    analyser = null;
  }
}

export interface MicInput {
  stream: MediaStream;
  /** Анализатор громкости; null, если Web Audio недоступен (запись всё равно идёт и закончится по времени). */
  analyser: AnalyserNode | null;
  sampleRate: number;
}

/**
 * Даёт поток с микрофона и анализатор к нему. Поток создаётся один раз и используется для всех записей, пока он жив:
 * так системный запрос доступа появляется не при каждой записи. Неживой поток создаётся заново.
 */
export async function acquireMic(): Promise<MicInput> {
  if (!micSupported()) throw new RecorderError("unsupported");
  clearTimeout(idleTimer);
  primeAudio();
  if (!usableStream(stream)) {
    dropStream();
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      throw new RecorderError("denied");
    }
    grantedThisSession = true;
    remember();
  }
  attachAnalyser(stream!);
  return { stream: stream!, analyser, sampleRate: audioContext?.sampleRate ?? 48000 };
}

/** Запись закончилась: микрофон остаётся готовым, но если записей долго нет, он отпускается. */
export function recordingDone(): void {
  clearTimeout(idleTimer);
  idleTimer = setTimeout(releaseMic, IDLE_RELEASE_MS);
}

/** Останавливает поток и отключает от него анализатор; звуковой движок остаётся (его запускает только нажатие). */
function dropStream(): void {
  try {
    source?.disconnect();
  } catch {
    // Узел уже отключён.
  }
  source = null;
  analyser = null;
  stream?.getTracks().forEach((t) => t.stop());
  stream = null;
}

/** Полностью освобождает микрофон (индикатор записи гаснет) и звуковой движок. */
export function releaseMic(): void {
  clearTimeout(idleTimer);
  dropStream();
  const ctx = audioContext;
  audioContext = null;
  void ctx?.close().catch(() => undefined);
}

// Когда приложение свернули, микрофон отпускаем; при возврате поток создаётся заново без нового запроса там, где разрешение запомнено.
if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") releaseMic();
  });
}

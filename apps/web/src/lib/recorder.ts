export type RecorderProblem = "unsupported" | "denied";

export class RecorderError extends Error {
  constructor(readonly problem: RecorderProblem) {
    super(problem);
  }
}

export interface ActiveRecording {
  /** Останавливает запись и возвращает звук. */
  stop(): Promise<Blob>;
}

const MIME_TYPES = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];

/** Начинает запись с микрофона. Запись сама остановится через `maxMs`. */
export async function startRecording(maxMs = 5000): Promise<ActiveRecording> {
  if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
    throw new RecorderError("unsupported");
  }
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch {
    throw new RecorderError("denied");
  }

  const mimeType = MIME_TYPES.find((t) => MediaRecorder.isTypeSupported(t));
  const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };
  const finished = new Promise<Blob>((resolve) => {
    recorder.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      resolve(new Blob(chunks, { type: recorder.mimeType }));
    };
  });

  recorder.start();
  const timer = setTimeout(() => {
    if (recorder.state === "recording") recorder.stop();
  }, maxMs);

  return {
    stop: () => {
      clearTimeout(timer);
      if (recorder.state === "recording") recorder.stop();
      return finished;
    },
  };
}

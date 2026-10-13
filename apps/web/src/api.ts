import { QUIZ_SIZE, type MeResponse, type StageProof, type StatusInfo, type WordProgress } from "@milav/shared";
import { authHeader } from "./telegram";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    /** Для кода rate_limited: через сколько секунд можно повторить. */
    readonly retryAfter?: number,
  ) {
    super(code);
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  const auth = authHeader();
  if (auth) headers.set("Authorization", auth);

  let response: Response;
  try {
    response = await fetch(path, { ...init, headers });
  } catch {
    throw new ApiError(0, "network");
  }
  const data = (await response.json().catch(() => ({}))) as { error?: string; retryAfter?: number };
  if (!response.ok) {
    throw new ApiError(response.status, data.error ?? "error", typeof data.retryAfter === "number" ? data.retryAfter : undefined);
  }
  return data as T;
}

const json = (body: unknown): RequestInit => ({
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

export interface StageResponse {
  progress: WordProgress;
  pointsAwarded: number;
  points: number;
}

export interface SpeechResponse {
  heard: string;
  match: boolean;
  progress?: WordProgress;
  pointsAwarded?: number;
  points?: number;
}

export interface LessonProgressResponse {
  words: WordProgress[];
  quiz: { passed: boolean; bestCorrect: number | null };
}

export interface QuizResponse {
  passed: boolean;
  correct: number;
  total: number;
  mistakes: number;
  firstTimePassed: boolean;
  passedLessons: number;
  status: StatusInfo;
}

export const api = {
  me: () => request<MeResponse>("/api/me"),
  lessonProgress: (lessonId: string) => request<LessonProgressResponse>(`/api/lessons/${lessonId}/progress`),
  /** Отметка этапа «слушай», «печатай» или «пиши»: для двух последних сервер проверяет доказательство (набранное слово, штрихи). */
  stage: (wordId: string, proof: StageProof) =>
    request<StageResponse>("/api/progress/stage", json({ wordId, ...proof })),
  speech: (wordId: string, audio: Blob, mode: "study" | "quiz") =>
    request<SpeechResponse>(`/api/speech/check?wordId=${encodeURIComponent(wordId)}&mode=${mode}`, {
      method: "POST",
      headers: { "Content-Type": audio.type || "audio/webm" },
      body: audio,
    }),
  submitQuiz: (lessonId: string, correct: number) =>
    request<QuizResponse>("/api/quiz/submit", json({ lessonId, correct, total: QUIZ_SIZE })),
};

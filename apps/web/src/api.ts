import type {
  MeResponse,
  QuizAnswerRequest,
  QuizAnswerResponse,
  QuizStartResponse,
  StageProof,
  TemplateSaveRequest,
  TemplateSaveResponse,
  TemplatesResponse,
  WordProgress,
} from "@milav/shared";
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

const jsonPut = (body: unknown): RequestInit => ({ ...json(body), method: "PUT" });

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

export const api = {
  me: () => request<MeResponse>("/api/me"),
  lessonProgress: (lessonId: string) => request<LessonProgressResponse>(`/api/lessons/${lessonId}/progress`),
  /** Отметка этапа «слушай», «печатай» или «пиши»: для двух последних сервер проверяет доказательство (набранное слово, штрихи). */
  stage: (wordId: string, proof: StageProof) =>
    request<StageResponse>("/api/progress/stage", json({ wordId, ...proof })),
  /** Этап «говори»: запись голоса; верное слово сервер сам отмечает пройденным. */
  speech: (wordId: string, audio: Blob) =>
    request<SpeechResponse>(`/api/speech/check?wordId=${encodeURIComponent(wordId)}`, {
      method: "POST",
      headers: { "Content-Type": audio.type || "audio/webm" },
      body: audio,
    }),
  /** Начало викторины: вопросы и id сессии выдаёт сервер. */
  quizStart: (lessonId: string) => request<QuizStartResponse>("/api/quiz/start", json({ lessonId })),
  /** Ответ на вопрос с выбором или письмом, либо отказ от вопроса. */
  quizAnswer: (body: QuizAnswerRequest) => request<QuizAnswerResponse>("/api/quiz/answer", json(body)),
  /** Вопрос «произнеси»: запись голоса. */
  quizSpeech: (sessionId: string, index: number, audio: Blob) =>
    request<QuizAnswerResponse>(`/api/quiz/speech?sessionId=${encodeURIComponent(sessionId)}&index=${index}`, {
      method: "POST",
      headers: { "Content-Type": audio.type || "audio/webm" },
      body: audio,
    }),
  /** Запись шаблонов букв (скрытый экран владельца): все записанные варианты. 403, если Telegram id не из секрета. */
  templates: () => request<TemplatesResponse>("/api/templates"),
  /** Записать или перезаписать вариант буквы. */
  templateSave: (body: TemplateSaveRequest) => request<TemplateSaveResponse>("/api/templates", jsonPut(body)),
  templateDelete: (letter: string, slot: number) =>
    request<{ ok: true }>(`/api/templates?letter=${encodeURIComponent(letter)}&slot=${slot}`, { method: "DELETE" }),
};

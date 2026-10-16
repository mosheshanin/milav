import type {
  AdminConfigResponse,
  AdminRemindersResponse,
  ReminderInfo,
  ReminderKind,
  ReminderSettingsRequest,
  ReminderTextItem,
  ReviewExportResponse,
  ReviewItemResponse,
  ReviewListResponse,
  ReviewSaveRequest,
  AdminLogResponse,
  AdminOverviewResponse,
  AdminTeamResponse,
  ConfigKey,
  StaffRole,
  AchievementsResponse,
  CohortResponse,
  HomeResponse,
  LeaderboardResponse,
  LessonContentResponse,
  LessonProgressResponse,
  MeResponse,
  PlayEvent,
  PlayInfo,
  SettingsRequest,
  QuizAnswerRequest,
  QuizAnswerResponse,
  QuizStartResponse,
  StageProof,
  TemplateSaveRequest,
  TemplateSaveResponse,
  TemplatesResponse,
  WordProgress,
} from "@milav/shared";
import { deviceTimeZone } from "./lib/timezone";
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
  /** Бейджи и цель дня, если слово завершено этим запросом. */
  play?: PlayEvent;
}

export interface SpeechResponse {
  heard: string;
  match: boolean;
  progress?: WordProgress;
  pointsAwarded?: number;
  points?: number;
  play?: PlayEvent;
}

export type { HomeResponse, LessonProgressResponse };

export const api = {
  /** Профиль; часовой пояс устройства нужен для границы дня (ритм, цель). */
  me: () => {
    const tz = deviceTimeZone();
    return request<MeResponse>("/api/me", tz ? { headers: { "X-Timezone": tz } } : {});
  },
  achievements: () => request<AchievementsResponse>("/api/achievements"),
  /** Человек увидел поздравление с этими бейджами. */
  seen: (ids: string[]) => request<{ ok: true }>("/api/achievements/seen", json({ ids })),
  settings: (body: SettingsRequest) => request<{ play: PlayInfo }>("/api/settings", jsonPut(body)),
  /** Напоминания от бота: включить (бот сразу пришлёт подтверждение), выключить, время, «Не сейчас». */
  reminders: (body: ReminderSettingsRequest) => request<{ reminders: ReminderInfo }>("/api/reminders", jsonPut(body)),
  leaderboard: (board: "week" | "all") => request<LeaderboardResponse>(`/api/leaderboard?board=${board}`),
  cohort: () => request<CohortResponse>("/api/cohort"),
  /** Главная: прогресс всех доступных уроков одним запросом. */
  home: () => request<HomeResponse>("/api/home"),
  /** Слова (или буквы) урока: в файлах приложения их нет, сервер отдаёт урок только тем, у кого есть доступ. */
  lesson: (lessonId: string) => request<LessonContentResponse>(`/api/lessons/${encodeURIComponent(lessonId)}`),
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

  // ---- Панель администратора (только администраторы; остальным сервер отвечает 403) ----
  admin: {
    overview: () => request<AdminOverviewResponse>("/api/admin/overview"),
    config: () => request<AdminConfigResponse>("/api/admin/config"),
    setConfig: (key: ConfigKey, value: unknown) => request<{ ok: true; changed: boolean }>("/api/admin/config", jsonPut({ key, value })),
    team: () => request<AdminTeamResponse>("/api/admin/team"),
    setRole: (userId: number, role: StaffRole) => request<{ ok: true; changed: boolean }>("/api/admin/team", jsonPut({ userId, role })),
    removeFromTeam: (userId: number) => request<{ ok: true }>(`/api/admin/team?userId=${userId}`, { method: "DELETE" }),
    log: (before?: number) => request<AdminLogResponse>(`/api/admin/log${before ? `?before=${before}` : ""}`),
    reminders: () => request<AdminRemindersResponse>("/api/admin/reminders"),
    addReminder: (kind: ReminderKind, text: string) => request<{ item: ReminderTextItem }>("/api/admin/reminders", json({ kind, text })),
    editReminder: (id: number, body: { text?: string; enabled?: boolean }) =>
      request<{ item: ReminderTextItem; changed: boolean }>(`/api/admin/reminders/${id}`, jsonPut(body)),
    deleteReminder: (id: number) => request<{ ok: true }>(`/api/admin/reminders/${id}`, { method: "DELETE" }),
    sendReminderToMe: (id: number) => request<{ ok: true; text: string; sent: boolean }>(`/api/admin/reminders/${id}/send`, json({})),
  },

  // ---- Проверка слов носителем (администраторы и проверяющие; выгрузка только администраторам) ----
  review: {
    items: () => request<ReviewListResponse>("/api/review/items"),
    item: (id: string) => request<ReviewItemResponse>(`/api/review/items/${encodeURIComponent(id)}`),
    save: (id: string, body: ReviewSaveRequest) => request<{ ok: true; changed: boolean }>(`/api/review/items/${encodeURIComponent(id)}`, jsonPut(body)),
    remove: (id: string) => request<{ ok: true }>(`/api/review/items/${encodeURIComponent(id)}`, { method: "DELETE" }),
    export: () => request<ReviewExportResponse>("/api/review/export"),
  },
};

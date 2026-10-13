import { ApiError } from "../api";

/** Сколько ждать, по-русски и без дробей: «15 с», «2 мин», «3 ч». */
export function waitText(seconds: number): string {
  const s = Math.max(1, Math.ceil(seconds));
  if (s < 90) return `${s} с`;
  if (s < 90 * 60) return `${Math.ceil(s / 60)} мин`;
  return `${Math.ceil(s / 3600)} ч`;
}

/** Текст для человека, когда не удалось сохранить результат (этап, итог викторины). */
export function saveErrorText(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === "rate_limited") {
      return error.retryAfter
        ? `Слишком много попыток подряд. Подождите ${waitText(error.retryAfter)} и повторите.`
        : "Слишком много попыток подряд. Подождите немного и повторите.";
    }
    if (error.code === "lesson_not_completed") return "Сначала пройдите все четыре этапа у всех слов урока.";
    if (error.code === "write_rejected" || error.code === "type_mismatch") {
      return "Сервер не принял ответ. Попробуйте ещё раз.";
    }
  }
  return "Не удалось сохранить результат. Проверьте интернет и нажмите ещё раз.";
}

/** Коды, при которых открытая викторина больше не принимает ответы: надо начинать заново. */
const LOST_SESSION_CODES = ["no_session", "session_expired", "quiz_finished", "bad_index"];

/** Викторину потеряли: её заменили (открыли на другом устройстве), она просрочена или уже закончена. */
export function isQuizSessionLost(error: unknown): boolean {
  return error instanceof ApiError && LOST_SESSION_CODES.includes(error.code);
}

/** Текст для человека, когда ответ на вопрос викторины не удалось отправить. */
export function quizErrorText(error: unknown): string {
  if (error instanceof ApiError && error.code === "rate_limited") return saveErrorText(error);
  if (error instanceof ApiError && error.status !== 0) return "Сервер не принял ответ. Нажмите «Повторить».";
  return "Не удалось отправить ответ. Проверьте интернет и нажмите «Повторить».";
}

/** Текст для человека, когда не удалось записать или удалить вариант буквы (экран записи шаблонов). */
export function recordErrorText(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === "rate_limited") return saveErrorText(error);
    if (error.status === 403) return "Нет доступа к записи шаблонов. Откройте приложение с вашего аккаунта.";
    if (error.code === "too_small") return "Слишком маленький рисунок. Нарисуйте букву крупнее, между линиями.";
    if (error.status === 400 || error.status === 413 || error.status === 422) {
      return "Сервер не принял рисунок. Сотрите и нарисуйте заново.";
    }
    if (error.status !== 0) return "Сервер не смог сохранить. Нажмите ещё раз.";
  }
  return "Нет связи. Рисунок не потерян: проверьте интернет и нажмите ещё раз.";
}

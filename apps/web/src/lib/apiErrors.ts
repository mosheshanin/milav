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

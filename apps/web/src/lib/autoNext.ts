/** Через сколько миллисекунд после успешного этапа обучение само переходит к следующему. */
export const AUTO_NEXT_MS = 2000;

/**
 * Самый большой шаг времени между кадрами, который засчитывается в отсчёт.
 * Пока приложение свёрнуто, кадры не рисуются; после возврата первый шаг огромный,
 * и без этого ограничения переход случился бы мгновенно. Так отсчёт просто стоит на паузе.
 */
export const AUTO_NEXT_MAX_STEP_MS = 100;

/** Сколько времени отсчёта прошло после очередного кадра (от 0 до `total`). */
export function autoNextElapsed(elapsed: number, frameStep: number, total = AUTO_NEXT_MS): number {
  const step = Math.min(Math.max(frameStep, 0), AUTO_NEXT_MAX_STEP_MS);
  return Math.min(elapsed + step, total);
}

/** Доля заливки кнопки (0…1). */
export function autoNextShare(elapsed: number, total = AUTO_NEXT_MS): number {
  if (total <= 0) return 1;
  return Math.min(Math.max(elapsed / total, 0), 1);
}

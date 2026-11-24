// Скорость озвучки слов (задача 12, вопрос 41, решение владельца 24.11): «обычная» или «медленнее».
// Новых файлов не нужно: тот же файл проигрывается медленнее (`playbackRate`, высота голоса сохраняется),
// голос устройства (запасной путь) тоже говорит медленнее. Выбор хранится только на этом устройстве.

export type AudioSpeed = "normal" | "slow";
export const AUDIO_SPEEDS: readonly AudioSpeed[] = ["normal", "slow"];
export const AUDIO_SPEED_TITLES: Record<AudioSpeed, string> = { normal: "Обычная", slow: "Медленнее" };

/** Во сколько раз медленнее звучит «медленнее»: 0.75 заметно медленнее, но речь остаётся естественной. */
export const SLOW_RATE = 0.75;

const KEY = "milav:audio-speed";

export function loadAudioSpeed(): AudioSpeed {
  try {
    return window.localStorage.getItem(KEY) === "slow" ? "slow" : "normal";
  } catch {
    return "normal";
  }
}

export function setAudioSpeed(speed: AudioSpeed): void {
  try {
    window.localStorage.setItem(KEY, speed);
  } catch {
    // Хранилище недоступно: выбор не запомнится.
  }
}

/** Множитель скорости для файла озвучки. */
export function audioRate(speed: AudioSpeed = loadAudioSpeed()): number {
  return speed === "slow" ? SLOW_RATE : 1;
}

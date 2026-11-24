// Какие разделы и темы на главной развёрнуты. По умолчанию всё свёрнуто, чтобы список уроков занимал меньше места.
// Состояние хранится только на этом устройстве (localStorage); если хранилище недоступно, оно живёт до перезагрузки.

const KEY = "milav:home-open";

/** Ключ раздела: `section:nouns`, `section:alphabet`. */
export function sectionKey(section: string): string {
  return `section:${section}`;
}

/** Ключ темы: `topic:animals`. */
export function topicKey(topicId: string): string {
  return `topic:${topicId}`;
}

/** Развёрнутые блоки из хранилища. Повреждённые данные и недоступное хранилище дают пустой набор. */
export function loadOpen(): Set<string> {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return new Set();
    const list: unknown = JSON.parse(raw);
    return new Set(Array.isArray(list) ? list.filter((x): x is string => typeof x === "string") : []);
  } catch {
    return new Set();
  }
}

export function saveOpen(open: Set<string>): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify([...open].sort()));
  } catch {
    // Хранилище недоступно: состояние не запомнится.
  }
}

/**
 * Новый набор, в котором раскрыты раздел и тема урока (задача 11, вопрос 37, 24.11): так после «Продолжить»
 * человек, вернувшись на главную, сразу видит свой урок. У алфавита тем нет, раскрывается только раздел.
 * Исходный набор не меняется; уже раскрытое остаётся раскрытым.
 */
export function revealed(open: Set<string>, lesson: { section: string; topicId: string }): Set<string> {
  const next = new Set(open);
  next.add(sectionKey(lesson.section));
  if (lesson.section !== "alphabet") next.add(topicKey(lesson.topicId));
  return next;
}

/** Новый набор, в котором блок `key` переключён. Исходный набор не меняется. */
export function toggled(open: Set<string>, key: string): Set<string> {
  const next = new Set(open);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  return next;
}

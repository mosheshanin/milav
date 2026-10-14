/**
 * Почтовый ящик картинок: владелец кладёт файлы в content/inbox/images/ (через веб-интерфейс GitHub), а `tools/images-inbox.ts`
 * переносит их в apps/web/public/words и прописывает поле `image` в уроках. Здесь чистая логика без файлов и графики:
 * какое имя файла какому слову или букве соответствует, куда писать, что менять в JSON урока. Формат: docs/IMAGES.md.
 */

/** Расширения, которые принимает ящик. Растровые файлы сжимаются в webp, svg переносится как есть. */
export const INBOX_EXTENSIONS = ["png", "jpg", "jpeg", "webp", "svg"] as const;

/** Файлы ящика, которые не картинки. */
export const INBOX_IGNORED = ["README.md", ".gitkeep"];

/** Длинная сторона растровой картинки после сжатия, пикселей (на карточке слова картинка не больше 112 пикселей). */
export const IMAGE_MAX_SIDE = 384;

/** Больше этого размера исходный файл не принимается, килобайт. */
export const INBOX_MAX_KB = 8 * 1024;

/** Больше этого размера svg не принимается, килобайт (картинка слова это маленький рисунок). */
export const SVG_MAX_KB = 200;

/** Слово или буква, к которым может относиться картинка. */
export interface ImageTarget {
  kind: "word" | "letter";
  id: string;
  /** Иврит слова (у буквы слово-пример). */
  he: string;
  ru: string;
  /** Текущий путь картинки, если есть. */
  image?: string;
}

/** Разбор имени файла из ящика: `animals-1-cat.PNG` даёт id `animals-1-cat` и расширение `png`. */
export function parseInboxName(file: string): { id: string; ext: (typeof INBOX_EXTENSIONS)[number] } | null {
  const m = /^([a-z0-9][a-z0-9-]*)\.([A-Za-z]+)$/.exec(file);
  if (!m) return null;
  const ext = m[2]!.toLowerCase();
  const known = INBOX_EXTENSIONS.find((e) => e === ext);
  return known ? { id: m[1]!, ext: known } : null;
}

/** Путь картинки на сайте. Слово: `/words/<id>.<ext>`, у буквы `/words/<id буквы>-example.<ext>`. */
export function imagePath(target: Pick<ImageTarget, "kind" | "id">, ext: string): string {
  return target.kind === "letter" ? `/words/${target.id}-example.${ext}` : `/words/${target.id}.${ext}`;
}

/** Урок в виде JSON-объекта, как в файле: меняется на месте. */
export interface RawLesson {
  words?: Array<{ id: string; he: string; ru: string; image?: string }>;
  letters?: Array<{ id: string; example: { he: string; ru: string; image?: string } }>;
}

/** Все слова и буквы набора как цели для картинок. */
export function targetsOf(lessons: RawLesson[]): ImageTarget[] {
  return lessons.flatMap((l) => [
    ...(l.words ?? []).map((w): ImageTarget => ({ kind: "word", id: w.id, he: w.he, ru: w.ru, image: w.image })),
    ...(l.letters ?? []).map((x): ImageTarget => ({ kind: "letter", id: x.id, he: x.example.he, ru: x.example.ru, image: x.example.image })),
  ]);
}

/** Цели без картинки (для списка владельцу). */
export function missingImages(lessons: RawLesson[]): ImageTarget[] {
  return targetsOf(lessons).filter((t) => !t.image);
}

/**
 * Прописывает новую картинку в уроках. У слова это поле `image`; у буквы `example.image`. Кроме того, слово-пример
 * буквы это обычно слово из урока: если у буквы пример тот же иврит и картинки нет (или она старая, та же, что была у слова),
 * буква получает новую картинку тоже. Возвращает, сколько мест изменено.
 */
export function applyImage(lessons: RawLesson[], target: ImageTarget, path: string): number {
  let changed = 0;
  const old = target.image;
  for (const lesson of lessons) {
    for (const w of lesson.words ?? []) {
      if (target.kind === "word" && w.id === target.id && w.image !== path) {
        w.image = path;
        changed++;
      }
    }
    for (const x of lesson.letters ?? []) {
      const direct = target.kind === "letter" && x.id === target.id;
      const sameExample = target.kind === "word" && x.example.he === target.he && (!x.example.image || x.example.image === old);
      if ((direct || sameExample) && x.example.image !== path) {
        x.example.image = path;
        changed++;
      }
    }
  }
  return changed;
}

/** Сколько раз путь картинки встречается в уроках (чтобы не удалять файл, которым ещё кто-то пользуется). */
export function imageUses(lessons: RawLesson[], path: string): number {
  let n = 0;
  for (const l of lessons) {
    for (const w of l.words ?? []) if (w.image === path) n++;
    for (const x of l.letters ?? []) if (x.example.image === path) n++;
  }
  return n;
}

export interface InboxPlan {
  /** Файлы, которые можно обработать. */
  accepted: Array<{ file: string; ext: (typeof INBOX_EXTENSIONS)[number]; target: ImageTarget }>;
  /** Что не так с остальными файлами: остаются в ящике, пока владелец не исправит. */
  problems: string[];
}

/** Сопоставляет файлы ящика со словами и буквами. Два файла к одному слову (a.png и a.jpg) оба отклоняются. */
export function planInbox(files: string[], targets: ImageTarget[]): InboxPlan {
  const byId = new Map(targets.map((t) => [t.id, t]));
  const plan: InboxPlan = { accepted: [], problems: [] };
  const parsed = files
    .filter((f) => !INBOX_IGNORED.includes(f))
    .map((file) => ({ file, name: parseInboxName(file) }));
  const counts = new Map<string, number>();
  for (const p of parsed) if (p.name) counts.set(p.name.id, (counts.get(p.name.id) ?? 0) + 1);
  for (const { file, name } of parsed) {
    if (!name) {
      plan.problems.push(`${file}: имя должно быть вида <id слова>.png (допустимо png, jpg, webp, svg), например animals-1-cat.png`);
      continue;
    }
    const target = byId.get(name.id);
    if (!target) {
      plan.problems.push(`${file}: нет слова или буквы с id «${name.id}» (список без картинок: docs/IMAGES.md)`);
      continue;
    }
    if ((counts.get(name.id) ?? 0) > 1) {
      plan.problems.push(`${file}: для «${name.id}» несколько файлов, оставьте один`);
      continue;
    }
    plan.accepted.push({ file, ext: name.ext, target });
  }
  return plan;
}

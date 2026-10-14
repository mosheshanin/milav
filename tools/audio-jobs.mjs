// Что и в какой файл озвучивать. Вынесено из generate-audio.mjs без побочных эффектов (ни сети, ни записи файлов),
// чтобы имена файлов проверял тест (content/audioJobs.test.ts) и они не расходились с путями, которые знает приложение.
//
// Виды озвучки (поле `kind`):
//   word    основная форма слова: /audio/<id>.mp3, поле audio слова (текст с огласовками); у глагола это инфинитив;
//   form    форма слова: у прилагательного (f, mp, fp) /audio/<id>-form-<ключ>.mp3,
//           у глагола (27 форм) /audio/<id>-form-<время>-<ключ>.mp3, например paal-1-write-form-past-3ms.mp3;
//           поле audio формы (с огласовками);
//   phrase  фраза-пример слова: /audio/<id>-phrase.mp3, поле example.audio (у фраз огласовок нет, уходит иврит как есть);
//   letter  название буквы: /audio/<id буквы>.mp3, поле audio буквы (огласовки из name.niqqud);
//   example слово-пример буквы, только если у него ещё нет файла: /audio/<id буквы>-example.mp3, поле example.audio.

export const ALL_KINDS = ["word", "form", "phrase", "letter", "example"];

/** Времена глагола в порядке показа. Должны совпадать с VERB_TENSES в packages/shared/src/verbs.ts (это проверяет тест). */
export const VERB_TENSE_ORDER = ["present", "past", "future", "imperative"];

/**
 * @param {{ file: string, data: any }[]} lessons уроки (содержимое JSON, поля заполняются по месту через `set`)
 * @param {{ kinds?: string[], only?: string[] }} [options] `kinds`: какие виды озвучки собирать (по умолчанию все);
 *   `only`: id слов и букв, остальные пропускаются.
 */
export function buildJobs(lessons, { kinds = ALL_KINDS, only } = {}) {
  const list = [];
  const add = (job) => {
    if (kinds.includes(job.kind)) list.push(job);
  };
  for (const { file, data } of lessons) {
    for (const word of data.words ?? []) {
      if (only?.length && !only.includes(word.id)) continue;
      add({ file, kind: "word", id: word.id, name: word.id, plain: word.he, niqqud: word.niqqud ?? word.he, set: (path) => (word.audio = path), has: word.audio });
      for (const [key, form] of Object.entries(word.forms ?? {})) {
        const name = `${word.id}-form-${key}`;
        add({ file, kind: "form", id: name, name, plain: form.he, niqqud: form.niqqud ?? form.he, set: (path) => (form.audio = path), has: form.audio });
      }
      for (const tense of VERB_TENSE_ORDER) {
        for (const [key, form] of Object.entries(word.verb?.[tense] ?? {})) {
          const name = `${word.id}-form-${tense}-${key}`;
          add({ file, kind: "form", id: name, name, plain: form.he, niqqud: form.niqqud ?? form.he, set: (path) => (form.audio = path), has: form.audio });
        }
      }
      if (word.example) {
        const name = `${word.id}-phrase`;
        add({ file, kind: "phrase", id: name, name, plain: word.example.he, niqqud: word.example.he, set: (path) => (word.example.audio = path), has: word.example.audio });
      }
    }
    for (const letter of data.letters ?? []) {
      if (only?.length && !only.includes(letter.id)) continue;
      add({ file, kind: "letter", id: letter.id, name: letter.id, plain: letter.name.he, niqqud: letter.name.niqqud, set: (path) => (letter.audio = path), has: letter.audio });
      if (!letter.example.audio) {
        const name = `${letter.id}-example`;
        add({ file, kind: "example", id: name, name, plain: letter.example.he, niqqud: letter.example.niqqud, set: (path) => (letter.example.audio = path), has: undefined });
      }
    }
  }
  return list;
}

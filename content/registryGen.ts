import { readdirSync, readFileSync } from "node:fs";

/**
 * Текст файла content/registry.ts: статические импорты всех уроков из content/lessons.
 * Порядок: по ключу темы, затем по номеру урока (число, а не строка: animals-2 раньше animals-10).
 * Используют инструмент `npm run content:index` (записывает файл) и тест registry.test.ts (сверяет с файлом).
 */
export function renderRegistry(lessonsDir: URL): string {
  const entries = readdirSync(lessonsDir)
    .filter((f) => f.endsWith(".json"))
    .map((file) => {
      const data = JSON.parse(readFileSync(new URL(file, lessonsDir), "utf8")) as { topicId?: unknown; number?: unknown };
      return { file, topicId: String(data.topicId ?? ""), number: Number(data.number ?? 0) };
    });

  const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
  entries.sort((a, b) => compare(a.topicId, b.topicId) || a.number - b.number || compare(a.file, b.file));

  const ident = (file: string) => "lesson_" + file.replace(/\.json$/, "").replace(/[^a-zA-Z0-9]/g, "_");
  const imports = entries.map((e) => `import ${ident(e.file)} from "./lessons/${e.file}";`).join("\n");
  const list = entries.map((e) => `  ${ident(e.file)},`).join("\n");

  return `// Этот файл создаёт \`npm run content:index\` (tools/content-index.ts), руками не правится.
// Тест content/registry.test.ts следит, чтобы список совпадал с файлами в content/lessons.
${imports}

export const lessonFiles: unknown[] = [
${list}
];
`;
}

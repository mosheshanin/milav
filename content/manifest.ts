// Лёгкая часть контента для приложения: только манифест (content/manifest.json), без слов уроков.
// Приложение импортирует `@milav/content/manifest` и никогда `@milav/content`: тот тянет все уроки целиком,
// а слова урока приложение получает по API с проверкой доступа (docs/CONTENT.md, «Манифест и выдача уроков»).
// Это проверяют тест content/appImports.test.ts и проверка сборки tools/check-bundle.mjs.
import type { ContentInfo, LessonMeta } from "@milav/shared";
import data from "./manifest.json";

export interface ContentManifest {
  /** Все уроки без слов: сначала алфавит по номеру, потом остальные в порядке реестра. */
  lessons: LessonMeta[];
  /** Сведения о контенте для каталога бейджей (те же, что считает сервер). */
  info: ContentInfo;
}

export const manifest = data as unknown as ContentManifest;

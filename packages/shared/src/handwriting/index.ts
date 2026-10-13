// Распознавание рукописных букв. Чистый TypeScript без браузерных API: работает и в приложении, и в Worker.
// Шаблоны (шрифты и записанные владельцем) подгружаются лениво через loadTemplates(); сервер берёт те же файлы
// статически из staticTemplates.ts (точка входа «@milav/shared/static-templates»).
export * from "./canvas";
export * from "./ownCalibration";
export * from "./recognizer";
export * from "./skeleton";
export * from "./types";
export { buildTemplates, loadBaseTemplates, loadTemplates, type RawTemplate } from "./templates";

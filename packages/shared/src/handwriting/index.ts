// Распознавание рукописных букв. Чистый TypeScript без браузерных API: работает и в приложении, и в Worker.
// Шаблоны из шрифтов (baseTemplates.json) подгружаются лениво через loadBaseTemplates().
export * from "./canvas";
export * from "./recognizer";
export * from "./skeleton";
export * from "./types";
export { loadBaseTemplates } from "./baseTemplates";

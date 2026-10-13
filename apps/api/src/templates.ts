import { warmUpTemplates } from "@milav/shared";
import { STATIC_TEMPLATES } from "@milav/shared/static-templates";

/**
 * Шаблоны букв сервера: те же файлы и тот же порядок, что у приложения (loadTemplates в packages/shared).
 * Собираются и «прогреваются» один раз при запуске процесса Worker, поэтому запрос на проверку письма
 * не тратит свой лимит процессорного времени на разбор файлов и подготовку сеток.
 */
export const templates = STATIC_TEMPLATES;
warmUpTemplates(templates);

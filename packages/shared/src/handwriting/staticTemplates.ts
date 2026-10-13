// Тот же набор шаблонов, что отдаёт loadTemplates(), но подключённый статически.
// Нужен серверу: Worker собирает его один раз при запуске процесса, а не в запросе, где у бесплатного тарифа
// всего 10 мс процессорного времени. В основной файл приложения не входит (его в index.ts нет), приложение
// берёт шаблоны через loadTemplates() отдельным куском.
import baseTemplates from "./baseTemplates.json";
import ownTemplates from "./ownTemplates.json";
import { buildTemplates, type RawTemplate } from "./templates";

export const STATIC_TEMPLATES = buildTemplates(baseTemplates as RawTemplate[], ownTemplates as RawTemplate[]);

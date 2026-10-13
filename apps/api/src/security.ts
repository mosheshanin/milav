import { createMiddleware } from "hono/factory";
import type { AppEnv } from "./env";

/**
 * Заголовки всех ответов API. Статические файлы получают свои из apps/web/public/_headers.
 * - nosniff: браузер не угадывает тип содержимого;
 * - no-referrer: адрес приложения не уходит в Referer;
 * - no-store: ответы про конкретного человека (профиль, прогресс) не кэшируются ни браузером, ни прокси.
 */
export const apiSecurityHeaders = createMiddleware<AppEnv>(async (c, next) => {
  await next();
  c.header("X-Content-Type-Options", "nosniff");
  c.header("Referrer-Policy", "no-referrer");
  c.header("Cache-Control", "no-store");
});

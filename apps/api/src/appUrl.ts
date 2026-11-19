// Адрес приложения для ссылок, которые Worker отправляет наружу: кнопки бота, кнопки напоминаний, адрес вебхука.
//
// Worker отвечает сразу на двух адресах: свой домен (milav.app) и запасной milav.<поддомен>.workers.dev.
// Раньше ссылки брались из адреса текущего запроса, и бот, получавший вебхук на workers.dev, давал кнопку на
// workers.dev, хотя у части пользователей этот адрес не открывается (вопрос 7). Теперь основной адрес задаётся
// переменной APP_URL в wrangler.jsonc, а адрес запроса остаётся запасным (локальная разработка, тесты).

/** Основной адрес приложения (только https), иначе адрес текущего запроса. Возвращает origin без слеша на конце. */
export function appOrigin(env: { APP_URL?: string }, requestUrl: string): string {
  const fixed = env.APP_URL?.trim();
  if (fixed) {
    try {
      const url = new URL(fixed);
      if (url.protocol === "https:") return url.origin;
    } catch {
      // Неверное значение переменной: работаем по адресу запроса, как раньше.
    }
  }
  return new URL(requestUrl).origin;
}

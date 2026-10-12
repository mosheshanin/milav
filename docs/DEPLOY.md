# Деплой на Cloudflare (бесплатный тариф)

Приложение целиком (фронтенд и API) работает как один Worker `milav`. Свой сервер, SSH и Node.js на вашем компьютере не нужны:
сборка и публикация идут в облаке Cloudflare при каждом пуше в `main`.

## Настройка автодеплоя (один раз)

Worker `milav` → Settings → Build (подключение к GitHub-репозиторию `mosheshanin/milav`):

| Поле | Значение |
|---|---|
| Production branch | `main` |
| Root directory | `/` (корень репозитория) |
| Build command | `npm run build` |
| Deploy command | `npx wrangler deploy` (по умолчанию) |

Конфигурация Worker лежит в корне: `wrangler.jsonc` (имя `milav`, точка входа `apps/api/src/index.ts`, статика `apps/web/dist`).
Имя в `wrangler.jsonc` должно совпадать с именем Worker в панели Cloudflare.

## Секреты

Worker `milav` → Settings → Variables & Secrets → добавьте секрет `BOT_TOKEN` (токен бота от @BotFather).
В репозиторий токен не попадает.

## Подключение к Telegram

В @BotFather: `/mybots` → ваш бот → Bot Settings → Menu Button → адрес Worker вида
`https://milav.<ваш-поддомен>.workers.dev`. Кнопка в чате с ботом откроет мини-приложение.

## Ручной деплой и локальная разработка (по желанию, нужен Node.js)

```
npm install
npm run dev:api    # Worker на http://localhost:8787 (раздаёт собранный apps/web/dist)
npm run dev:web    # фронтенд на http://localhost:5173, запросы /api уходят на Worker
npm run deploy     # сборка и ручная публикация (после npx wrangler login)
```

Для локальных секретов скопируйте `apps/api/.dev.vars.example` в `.dev.vars` в корне репозитория.

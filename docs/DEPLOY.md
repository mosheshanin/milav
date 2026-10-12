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

Worker `milav` → Settings → Variables & Secrets → секрет `BOT_TOKEN` (токен бота от @BotFather), уже добавлен.
В репозиторий токен не попадает.

Для озвучки: секрет `GOOGLE_TTS_API_KEY` в GitHub (Settings → Secrets and variables → Actions), см. [`AUDIO.md`](./AUDIO.md).

## Подключение к Telegram

В @BotFather: `/mybots` → ваш бот → Bot Settings → Menu Button → адрес Worker вида
`https://milav.<ваш-поддомен>.workers.dev`. Кнопка в чате с ботом откроет мини-приложение.

## Ручной деплой и локальная разработка (по желанию, нужен Node.js)

```
npm install
npm run dev:api    # Worker на http://localhost:8787 (раздаёт собранный apps/web/dist)
npm run dev:web    # фронтенд на http://localhost:5173, запросы /api уходят на Worker
npm run deploy     # сборка и ручная публикация (после npx wrangler login)

# новая миграция базы (на боевой базе применяется вручную, автоматически пока нет):
npx wrangler d1 migrations apply milav-db --remote
```

Для локальных секретов скопируйте `apps/api/.dev.vars.example` в `.dev.vars` в корне репозитория.

## Проверки

```
npm run typecheck   # типы во всех пакетах
npm test            # юнит-тесты (общие правила, контент, API на настоящем SQLite, викторина, распознавание букв)
```

Сквозная проверка в браузере (Chromium на размере телефона, урок и викторина целиком):

```
npm run build
npx wrangler d1 migrations apply milav-db --local --env local
npm run dev:api                      # в одном окне
node tools/e2e-lesson.mjs e2e-shots  # в другом, скриншоты попадут в e2e-shots/
```

Локально открыть приложение вне Telegram можно по адресу `http://localhost:8787/?dev=1001` (номер задаёт тестового пользователя).

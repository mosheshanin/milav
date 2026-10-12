# Деплой на Cloudflare (бесплатный тариф)

Приложение целиком (фронтенд и API) разворачивается одним Worker. Свой сервер и SSH не нужны.

## Один раз

1. Создайте бесплатный аккаунт на https://dash.cloudflare.com.
2. Создайте бота в Telegram через @BotFather командой `/newbot`, сохраните токен.
3. Установите зависимости: `npm install`.
4. Войдите в Cloudflare: `npx wrangler login` (откроется браузер).
5. Сохраните токен бота как секрет: `cd apps/api && npx wrangler secret put BOT_TOKEN`.

## Каждый деплой

```
npm run deploy
```

Команда собирает мини-приложение и публикует Worker. В конце wrangler покажет адрес вида
`https://milav.<ваш-поддомен>.workers.dev`.

## Подключение к Telegram

В @BotFather: `/mybots` → ваш бот → Bot Settings → Menu Button → укажите адрес из предыдущего шага.
После этого в чате с ботом появится кнопка, открывающая мини-приложение.

## Локальная разработка

```
npm run dev:api    # Worker на http://localhost:8787
npm run dev:web    # фронтенд на http://localhost:5173, запросы /api уходят на Worker
```

Для локальных секретов скопируйте `apps/api/.dev.vars.example` в `apps/api/.dev.vars`.

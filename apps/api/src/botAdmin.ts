// Раздел панели «Сообщения бота» (docs/ADMIN.md): все тексты, которые бот пишет ученику, кроме ежедневных напоминаний
// и подтверждений (они в «Напоминаниях»). Изменить, вернуть исходный, «Прислать мне». Тексты профиля и меню команд
// уходят в Telegram сразу. Настройки отправки этого раздела живут в app_config (`/api/admin/config`, группа «bot»).
import {
  progressVars,
  BOT_TEXTS,
  BOT_TEXT_KEYS,
  checkBotText,
  isBotTextKey,
  minuteText,
  type AdminBotResponse,
  type AdminBotSaveResponse,
  type BotTextItem,
  type BotTextKey,
  type BotTexts,
  type BotProfileSync,
} from "@milav/shared";
import { adminRoutes, loadConfig, logStatement } from "./admin";
import { appOrigin } from "./appUrl";
import { parseJson, readBodyLimited } from "./body";
import { nameVar, syncBotProfile, type BotProfilePart } from "./bot";
import { botMessage, botTextRows, dropBotTextsCache, loadBotTexts, type BotTextRow } from "./botTexts";
import { progressData } from "./botWidgets";
import type { Bindings } from "./env";
import { loadReminderRow, reminderSettings, sendToUser, telegramFetchFn } from "./reminders";
import { logEvent } from "./telemetry";

const nowSeconds = () => Math.floor(Date.now() / 1000);

function itemOf(key: BotTextKey, row: BotTextRow | undefined): BotTextItem {
  return {
    key,
    text: row?.text ?? BOT_TEXTS[key].default,
    isDefault: !row,
    updatedAt: row?.updated_at ?? null,
    updatedBy: row?.updated_by ?? null,
  };
}

/** Какую часть профиля бота менять в Telegram вместе с этим текстом (null: текст не из профиля). */
function profilePart(key: BotTextKey): BotProfilePart | null {
  if (key === "profile.description") return "description";
  if (key === "profile.short") return "short";
  if (key.startsWith("command.")) return "commands";
  return null;
}

async function syncIfProfile(env: Bindings, key: BotTextKey, texts: BotTexts): Promise<BotProfileSync | undefined> {
  const part = profilePart(key);
  return part ? syncBotProfile(env, part, texts, telegramFetchFn()) : undefined;
}

/** Строки базы мимо кэша: решение о записи принимаем по базе. */
async function freshRows(db: D1Database): Promise<Map<BotTextKey, BotTextRow>> {
  dropBotTextsCache(db);
  return botTextRows(db);
}

const keyParam = (value: string | undefined): BotTextKey | null => (isBotTextKey(value) ? value : null);

adminRoutes.get("/api/admin/bot", async (c) => {
  const rows = await freshRows(c.env.DB);
  const body: AdminBotResponse = { items: BOT_TEXT_KEYS.map((key) => itemOf(key, rows.get(key))) };
  return c.json(body);
});

// Изменить текст: { text }. Текст, равный исходному, хранится как «исходный» (строка из базы удаляется).
adminRoutes.put("/api/admin/bot/:key", async (c) => {
  const key = keyParam(c.req.param("key"));
  if (!key) return c.json({ error: "not_found" }, 404);
  const raw = await readBodyLimited(c.req.raw, 16 * 1024);
  const body = raw ? parseJson<{ text?: unknown }>(raw) : null;
  const check = checkBotText(key, body?.text);
  if (!check.ok) return c.json({ error: `text_${check.error}`, ...(check.name !== undefined ? { name: check.name } : {}) }, 400);

  const rows = await freshRows(c.env.DB);
  const old = rows.get(key);
  const oldText = old?.text ?? BOT_TEXTS[key].default;
  if (check.text === oldText) {
    const same: AdminBotSaveResponse = { item: itemOf(key, old), changed: false };
    return c.json(same);
  }
  const actor = c.get("user").id;
  const now = nowSeconds();
  const toDefault = check.text === BOT_TEXTS[key].default;
  await c.env.DB.batch([
    toDefault
      ? c.env.DB.prepare("DELETE FROM bot_texts WHERE key = ?").bind(key)
      : c.env.DB
          .prepare(
            `INSERT INTO bot_texts (key, text, updated_by, updated_at) VALUES (?1, ?2, ?3, ?4)
             ON CONFLICT (key) DO UPDATE SET text = excluded.text, updated_by = excluded.updated_by, updated_at = excluded.updated_at`,
          )
          .bind(key, check.text, actor, now),
    logStatement(c.env.DB, actor, toDefault ? "bot.reset" : "bot.text", key, oldText, check.text, now),
  ]);
  dropBotTextsCache(c.env.DB);
  logEvent("admin_bot_text", { uid: actor, key });
  const fresh = await botTextRows(c.env.DB);
  const telegram = await syncIfProfile(c.env, key, await loadBotTexts(c.env.DB));
  const res: AdminBotSaveResponse = { item: itemOf(key, fresh.get(key)), changed: true, ...(telegram ? { telegram } : {}) };
  return c.json(res);
});

// Вернуть исходный текст.
adminRoutes.delete("/api/admin/bot/:key", async (c) => {
  const key = keyParam(c.req.param("key"));
  if (!key) return c.json({ error: "not_found" }, 404);
  const old = (await freshRows(c.env.DB)).get(key);
  if (!old) {
    const same: AdminBotSaveResponse = { item: itemOf(key, undefined), changed: false };
    return c.json(same);
  }
  const actor = c.get("user").id;
  const now = nowSeconds();
  await c.env.DB.batch([
    c.env.DB.prepare("DELETE FROM bot_texts WHERE key = ?").bind(key),
    logStatement(c.env.DB, actor, "bot.reset", key, old.text, BOT_TEXTS[key].default, now),
  ]);
  dropBotTextsCache(c.env.DB);
  logEvent("admin_bot_text", { uid: actor, key, reset: true });
  const telegram = await syncIfProfile(c.env, key, await loadBotTexts(c.env.DB));
  const res: AdminBotSaveResponse = { item: itemOf(key, undefined), changed: true, ...(telegram ? { telegram } : {}) };
  return c.json(res);
});

// «Прислать мне»: сообщение приходит администратору в чат с ботом с теми же кнопками, что у учеников.
adminRoutes.post("/api/admin/bot/:key/send", async (c) => {
  const key = keyParam(c.req.param("key"));
  if (!key) return c.json({ error: "not_found" }, 404);
  const user = c.get("user");
  const reminder = await loadReminderRow(c.env.DB, user.id);
  const minute = reminder?.minute ?? reminderSettings(await loadConfig(c.env)).defaultMinute;
  // «Мой прогресс» текстом: подстановки из прогресса самого администратора.
  const progress = key === "progress.text" ? progressVars(await progressData(c.env, user.id, Math.floor(Date.now() / 1000))) : {};
  const vars = { имя: nameVar(user.firstName), время: minuteText(minute), ...progress };
  const message = botMessage(await loadBotTexts(c.env.DB), key, vars, `${appOrigin(c.env, c.req.url)}/`);
  if (!message) return c.json({ error: "not_a_message" }, 400);
  const sent = await sendToUser(c.env, user.id, message.text, message.reply_markup);
  if (sent === "blocked") return c.json({ error: "bot_blocked", text: message.text }, 409);
  if (sent === "retry") return c.json({ error: "telegram_error", text: message.text }, 502);
  return c.json({ ok: true, text: message.text, sent: sent === "sent" });
});

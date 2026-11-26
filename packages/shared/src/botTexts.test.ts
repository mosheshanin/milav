import { describe, expect, it } from "vitest";
import {
  BOT_MENU_COMMANDS,
  BOT_TEXTS,
  BOT_TEXT_GROUPS,
  BOT_TEXT_KEYS,
  checkBotText,
  defaultBotTexts,
  isBotTextKey,
  renderBotText,
} from "./botTexts";
import { APP_CONFIG, BOT_CONFIG_KEYS, SHABBAT_OFF, configValueTitle, isValidConfigValue } from "./admin";

describe("каталог текстов бота", () => {
  it("каждый исходный текст проходит свою проверку и не меняется ею", () => {
    for (const key of BOT_TEXT_KEYS) expect(checkBotText(key, BOT_TEXTS[key].default), key).toEqual({ ok: true, text: BOT_TEXTS[key].default });
  });

  it("у каждого текста есть группа из списка групп, у каждой группы есть тексты", () => {
    const groups = BOT_TEXT_GROUPS.map((g) => g.id);
    for (const key of BOT_TEXT_KEYS) expect(groups).toContain(BOT_TEXTS[key].group);
    for (const g of groups) expect(BOT_TEXT_KEYS.some((k) => BOT_TEXTS[k].group === g), g).toBe(true);
  });

  it("пределы Telegram: подсказка до 200, описание 512, короткое 120, команда 256, сообщение до 4096", () => {
    for (const key of BOT_TEXT_KEYS) {
      const def = BOT_TEXTS[key];
      const limit = def.kind === "popup" ? 200 : key === "profile.description" ? 512 : key === "profile.short" ? 120 : key.startsWith("command.") ? 256 : 4096;
      expect(def.max, key).toBeLessThanOrEqual(limit);
    }
  });

  it("меню команд: все четыре команды, подписи из текстов", () => {
    expect(BOT_MENU_COMMANDS.map((c) => c.command)).toEqual(["start", "help", "reminders", "progress"]);
    for (const c of BOT_MENU_COMMANDS) expect(isBotTextKey(c.key)).toBe(true);
  });

  it("isBotTextKey не принимает чужое", () => {
    expect(isBotTextKey("start")).toBe(true);
    for (const bad of ["toString", "__proto__", "", 5, null]) expect(isBotTextKey(bad)).toBe(false);
  });
});

describe("проверка и подстановки", () => {
  it("очищает края и управляющие символы, сохраняет переносы", () => {
    expect(checkBotText("start", "  Привет\r\n{имя}\u0007  ")).toEqual({ ok: true, text: "Привет\n{имя}" });
  });

  it("ошибки", () => {
    expect(checkBotText("start", "")).toMatchObject({ error: "empty" });
    expect(checkBotText("start", null)).toMatchObject({ error: "empty" });
    expect(checkBotText("popup.on", "я".repeat(201))).toMatchObject({ error: "too_long" });
    expect(checkBotText("start", "{имя")).toMatchObject({ error: "bad_braces" });
    expect(checkBotText("start", "{время}")).toEqual({ ok: false, error: "unknown_placeholder", name: "время" });
    expect(checkBotText("button.enable", "Включить\nв {время}")).toMatchObject({ error: "multiline" });
    expect(checkBotText("command.help", "Две\nстроки")).toMatchObject({ error: "multiline" });
    expect(checkBotText("profile.description", "Две\nстроки")).toMatchObject({ ok: true });
  });

  it("подстановка без значения пустая", () => {
    expect(renderBotText("Привет, {имя}! В {время}", { имя: "Аня" })).toBe("Привет, Аня! В ");
    expect(defaultBotTexts()["button.enable"]).toBe("Включить в {время}");
  });
});

describe("настройки сообщений бота", () => {
  it("в группе «bot» пять настроек, значения по умолчанию допустимы", () => {
    expect(BOT_CONFIG_KEYS).toEqual(["reminderMinute", "shabbatFrom", "repeatReminderMin", "offerTimes", "offerAgainDays"]);
    expect(isValidConfigValue("reminderMinute", 1200)).toBe(true);
    expect(isValidConfigValue("shabbatFrom", 900)).toBe(true);
    expect(isValidConfigValue("shabbatFrom", SHABBAT_OFF)).toBe(true);
    expect(isValidConfigValue("shabbatFrom", 1200)).toBe(false);
    expect(isValidConfigValue("repeatReminderMin", 5)).toBe(true);
    expect(isValidConfigValue("offerTimes", 2)).toBe(true);
    expect(isValidConfigValue("offerAgainDays", 7)).toBe(true);
    expect("group" in APP_CONFIG.leaderboard).toBe(false);
  });

  it("подписи значений", () => {
    expect(configValueTitle("reminderMinute", 540)).toBe("9:00");
    expect(configValueTitle("shabbatFrom", SHABBAT_OFF)).toBe("Не останавливать");
    expect(configValueTitle("shabbatFrom", 900)).toBe("с 15:00");
    expect(configValueTitle("repeatReminderMin", 0)).toBe("Выкл.");
    expect(configValueTitle("offerTimes", 0)).toBe("Не предлагать");
    expect(configValueTitle("offerAgainDays", 14)).toBe("14 дн.");
  });
});

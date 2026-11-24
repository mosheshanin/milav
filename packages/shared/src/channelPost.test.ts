// Пост в канал: разметка, длина по правилам Telegram, проверка полей.
import { describe, expect, it } from "vitest";
import {
  CHANNEL_BUTTON_DEFAULT,
  CHANNEL_CAPTION_MAX,
  CHANNEL_DEFAULT,
  CHANNEL_TEXT_MAX,
  channelPostLink,
  checkChannelPost,
  isButtonUrl,
  isChannelId,
  parsePost,
  postHtml,
  postLength,
} from "./channelPost";

describe("разметка поста", () => {
  it("жирный, курсив и ссылка", () => {
    expect(parsePost("**Иврит** для __всех__: [сайт](https://milav.app)!")).toEqual([
      { text: "Иврит", bold: true },
      { text: " для " },
      { text: "всех", italic: true },
      { text: ": " },
      { text: "сайт", href: "https://milav.app" },
      { text: "!" },
    ]);
  });

  it("одиночные _ и * не разметка: имена вроде @y_o_g_g_y остаются как есть", () => {
    expect(postHtml("Пишите @y_o_g_g_y, 5 * 3")).toBe("Пишите @y_o_g_g_y, 5 * 3");
  });

  it("HTML экранируется, разметка становится тегами", () => {
    expect(postHtml("**<b>** & [x](https://a.b/?q=1&r=\"2\")")).toBe(
      '<b>&lt;b&gt;</b> &amp; <a href="https://a.b/?q=1&amp;r=&quot;2&quot;">x</a>',
    );
  });

  it("жирный на несколько строк", () => {
    expect(postHtml("**раз\nдва**")).toBe("<b>раз\nдва</b>");
  });

  it("ссылка не http не считается разметкой", () => {
    expect(postHtml("[x](javascript:alert(1))")).toBe("[x](javascript:alert(1))");
  });

  it("длина без разметки, эмодзи как у Telegram (2 единицы)", () => {
    expect(postLength("**Шалом**")).toBe(5);
    expect(postLength("[тут](https://milav.app)")).toBe(3);
    expect(postLength("👋")).toBe(2);
  });
});

describe("проверка поста", () => {
  it("по умолчанию канал @milavnews, кнопки нет", () => {
    expect(checkChannelPost({ text: "  Привет  ", hasPhoto: false })).toEqual({
      ok: true,
      post: { text: "Привет", channel: CHANNEL_DEFAULT, button: null },
    });
  });

  it("без текста можно только с картинкой", () => {
    expect(checkChannelPost({ text: " ", hasPhoto: false })).toMatchObject({ ok: false, error: "empty" });
    expect(checkChannelPost({ text: "", hasPhoto: true })).toMatchObject({ ok: true });
  });

  it("предел длины: 1024 с картинкой, 4096 без", () => {
    const caption = "а".repeat(CHANNEL_CAPTION_MAX);
    expect(checkChannelPost({ text: caption, hasPhoto: true }).ok).toBe(true);
    expect(checkChannelPost({ text: `${caption}б`, hasPhoto: true })).toEqual({ ok: false, error: "too_long", max: CHANNEL_CAPTION_MAX });
    expect(checkChannelPost({ text: `${caption}б`, hasPhoto: false }).ok).toBe(true);
    expect(checkChannelPost({ text: "а".repeat(CHANNEL_TEXT_MAX + 1), hasPhoto: false })).toMatchObject({ error: "too_long", max: CHANNEL_TEXT_MAX });
  });

  it("разметка в длину не входит", () => {
    expect(checkChannelPost({ text: `**${"а".repeat(CHANNEL_CAPTION_MAX)}**`, hasPhoto: true }).ok).toBe(true);
  });

  it("кнопка: нужны и надпись, и ссылка https", () => {
    const base = { text: "Пост", hasPhoto: false };
    expect(checkChannelPost({ ...base, buttonText: CHANNEL_BUTTON_DEFAULT.text, buttonUrl: CHANNEL_BUTTON_DEFAULT.url })).toEqual({
      ok: true,
      post: { text: "Пост", channel: CHANNEL_DEFAULT, button: { ...CHANNEL_BUTTON_DEFAULT } },
    });
    expect(checkChannelPost({ ...base, buttonUrl: "https://milav.app" })).toMatchObject({ error: "button_text_missing" });
    expect(checkChannelPost({ ...base, buttonText: "Открыть" })).toMatchObject({ error: "button_url_missing" });
    expect(checkChannelPost({ ...base, buttonText: "Открыть", buttonUrl: "http://milav.app" })).toMatchObject({ error: "bad_button_url" });
    expect(checkChannelPost({ ...base, buttonText: "я".repeat(65), buttonUrl: "https://milav.app" })).toMatchObject({ error: "button_too_long" });
  });

  it("канал: @имя или числовой id", () => {
    expect(isChannelId("@milavnews")).toBe(true);
    expect(isChannelId("-1001234567890")).toBe(true);
    expect(isChannelId("milavnews")).toBe(false);
    expect(isChannelId("@ab")).toBe(false);
    expect(checkChannelPost({ text: "x", channel: "t.me/milavnews", hasPhoto: false })).toMatchObject({ error: "bad_channel" });
  });

  it("ссылки кнопки и поста", () => {
    expect(isButtonUrl("https://t.me/milavbotbot?startapp")).toBe(true);
    expect(isButtonUrl("tg://resolve?domain=x")).toBe(false);
    expect(isButtonUrl("https://localhost")).toBe(false);
    expect(channelPostLink("@milavnews", 12)).toBe("https://t.me/milavnews/12");
    expect(channelPostLink("-1001234567890", 12)).toBeNull();
  });
});

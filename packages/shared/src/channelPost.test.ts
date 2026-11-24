// Пост в канал: разметка, длина по правилам Telegram, проверка полей.
import { describe, expect, it } from "vitest";
import {
  CHANNEL_BUTTON_DEFAULT,
  CHANNEL_CAPTION_MAX,
  CHANNEL_DEFAULT,
  CHANNEL_PHOTOS_MAX,
  CHANNEL_TEXT_MAX,
  channelPostLink,
  checkChannelPost,
  isButtonUrl,
  isChannelId,
  parsePost,
  postHtml,
  postLayout,
  postLength,
  postTextMax,
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
    expect(checkChannelPost({ text: "  Привет  ", photos: 0 })).toEqual({
      ok: true,
      post: { text: "Привет", channel: CHANNEL_DEFAULT, button: null, layout: "text" },
    });
  });

  it("без текста можно только с картинкой", () => {
    expect(checkChannelPost({ text: " ", photos: 0 })).toMatchObject({ ok: false, error: "empty" });
    expect(checkChannelPost({ text: "", photos: 1 })).toMatchObject({ ok: true });
  });

  it("предел длины: 1024 с картинкой, 4096 без", () => {
    const caption = "а".repeat(CHANNEL_CAPTION_MAX);
    expect(checkChannelPost({ text: caption, photos: 1 }).ok).toBe(true);
    expect(checkChannelPost({ text: `${caption}б`, photos: 1 })).toEqual({ ok: false, error: "too_long", max: CHANNEL_CAPTION_MAX });
    expect(checkChannelPost({ text: `${caption}б`, photos: 0 }).ok).toBe(true);
    expect(checkChannelPost({ text: "а".repeat(CHANNEL_TEXT_MAX + 1), photos: 0 })).toMatchObject({ error: "too_long", max: CHANNEL_TEXT_MAX });
  });

  it("разметка в длину не входит", () => {
    expect(checkChannelPost({ text: `**${"а".repeat(CHANNEL_CAPTION_MAX)}**`, photos: 1 }).ok).toBe(true);
  });

  it("кнопка: нужны и надпись, и ссылка https", () => {
    const base = { text: "Пост", photos: 0 };
    expect(checkChannelPost({ ...base, buttonText: CHANNEL_BUTTON_DEFAULT.text, buttonUrl: CHANNEL_BUTTON_DEFAULT.url })).toEqual({
      ok: true,
      post: { text: "Пост", channel: CHANNEL_DEFAULT, button: { ...CHANNEL_BUTTON_DEFAULT }, layout: "text" },
    });
    expect(checkChannelPost({ ...base, buttonUrl: "https://milav.app" })).toMatchObject({ error: "button_text_missing" });
    expect(checkChannelPost({ ...base, buttonText: "Открыть" })).toMatchObject({ error: "button_url_missing" });
    expect(checkChannelPost({ ...base, buttonText: "Открыть", buttonUrl: "http://milav.app" })).toMatchObject({ error: "bad_button_url" });
    expect(checkChannelPost({ ...base, buttonText: "я".repeat(65), buttonUrl: "https://milav.app" })).toMatchObject({ error: "button_too_long" });
  });

  it("вид поста по числу картинок и кнопке", () => {
    expect(postLayout(0, true)).toBe("text");
    expect(postLayout(1, true)).toBe("photo");
    expect(postLayout(2, false)).toBe("album");
    expect(postLayout(10, true)).toBe("album+text");
    expect([postTextMax("text"), postTextMax("photo"), postTextMax("album"), postTextMax("album+text")]).toEqual([4096, 1024, 1024, 4096]);
  });

  it("альбом: до 10 картинок; без кнопки текст это подпись (1024), с кнопкой отдельное сообщение (4096) и текст обязателен", () => {
    const button = { buttonText: "Открыть", buttonUrl: "https://milav.app" };
    const long = "а".repeat(CHANNEL_CAPTION_MAX + 1);
    expect(checkChannelPost({ text: "x", photos: CHANNEL_PHOTOS_MAX + 1 })).toEqual({ ok: false, error: "too_many_photos", max: 10 });
    expect(checkChannelPost({ text: "", photos: 3 })).toMatchObject({ ok: true, post: { layout: "album" } });
    expect(checkChannelPost({ text: long, photos: 3 })).toMatchObject({ error: "too_long", max: CHANNEL_CAPTION_MAX });
    expect(checkChannelPost({ text: long, photos: 3, ...button })).toMatchObject({ ok: true, post: { layout: "album+text" } });
    expect(checkChannelPost({ text: " ", photos: 3, ...button })).toEqual({ ok: false, error: "button_needs_text" });
  });

  it("канал: @имя или числовой id", () => {
    expect(isChannelId("@milavnews")).toBe(true);
    expect(isChannelId("-1001234567890")).toBe(true);
    expect(isChannelId("milavnews")).toBe(false);
    expect(isChannelId("@ab")).toBe(false);
    expect(checkChannelPost({ text: "x", channel: "t.me/milavnews", photos: 0 })).toMatchObject({ error: "bad_channel" });
  });

  it("ссылки кнопки и поста", () => {
    expect(isButtonUrl("https://t.me/milavbotbot?startapp")).toBe(true);
    expect(isButtonUrl("tg://resolve?domain=x")).toBe(false);
    expect(isButtonUrl("https://localhost")).toBe(false);
    expect(channelPostLink("@milavnews", 12)).toBe("https://t.me/milavnews/12");
    expect(channelPostLink("-1001234567890", 12)).toBeNull();
  });
});

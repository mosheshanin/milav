// Вёрстка карточек в чате с ботом (packages/shared/src/botWidgetHtml.ts): пределы Telegram и запрещённое.
// Тест здесь, а не в packages/shared: нужен zlib из Node (Telegram меряет HTML после сжатия).
import { deflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { PROGRESS_WIDGET_HTML, REMINDERS_WIDGET_HTML, WIDGET_HTML_MAX_BYTES, WIDGET_HTML_MAX_COMPRESSED } from "@milav/shared";

const CARDS = { progress: PROGRESS_WIDGET_HTML, reminders: REMINDERS_WIDGET_HTML };

describe("вёрстка карточек", () => {
  for (const [name, html] of Object.entries(CARDS)) {
    it(`${name}: в пределах Telegram (32 КБ, 4 КБ после сжатия zlib уровня 9)`, () => {
      const bytes = Buffer.from(html, "utf8");
      expect(bytes.length).toBeLessThanOrEqual(WIDGET_HTML_MAX_BYTES);
      // Иначе sendWidget ответит INPUT_MEDIA_WIDGET_TOO_LARGE.
      expect(deflateSync(bytes, { level: 9 }).length).toBeLessThanOrEqual(WIDGET_HTML_MAX_COMPRESSED);
    });

    it(`${name}: без того, что Telegram вырезает или запрещает`, () => {
      // Поля ввода, звук, рамки, внешние скрипты и сеть в карточке не работают (docs/WIDGETS.md).
      expect(html).not.toMatch(/<(input|select|textarea|audio|video|iframe|form|link|meta|progress|meter)\b/i);
      expect(html).not.toMatch(/<script[^>]+src=/i);
      expect(html).not.toMatch(/\b(fetch|XMLHttpRequest|WebSocket|alert|confirm|prompt)\s*\(/);
      expect(html).not.toMatch(/\bvh\b|overflow:\s*(auto|scroll)|@font-face|@import|url\((?!data:|#)/);
      // Шаблонная строка в TypeScript: обратная кавычка или «${» внутри сломали бы код карточки.
      expect(html).not.toMatch(/`|\$\{/);
      // Запрос к боту только из обработчика нажатия или при появлении: не из таймера.
      expect(html).not.toMatch(/setTimeout\([^)]*request/);
      expect(html).toContain("TelegramWidget");
    });
  }

  it("карточки знают свои запросы (их же разбирает сервер)", () => {
    expect(PROGRESS_WIDGET_HTML).toContain("request('p')");
    expect(REMINDERS_WIDGET_HTML).toContain("request('r')");
    // Выключатель собирает «r:on» или «r:off», кнопки времени «r:t:<минуты>».
    expect(REMINDERS_WIDGET_HTML).toContain(`data-q="r:'+(d.on?'off':'on')`);
    expect(REMINDERS_WIDGET_HTML).toContain(`data-q="r:t:'+o[i]`);
  });
});

// «Поделиться достижением»: штатный выбор чата Telegram, наших запросов нет (CSP не затрагивается).
// В тексте только название бейджа и ссылка на приложение, без имени и id.
import { SHARE_URL } from "@milav/shared";
import { getTelegram } from "../telegram";

/** Ссылка t.me/share/url с ссылкой на приложение и текстом. */
export function shareLink(text: string, appUrl: string = SHARE_URL): string {
  return `https://t.me/share/url?url=${encodeURIComponent(appUrl)}&text=${encodeURIComponent(text)}`;
}

export function shareText(text: string): void {
  const link = shareLink(text);
  const tg = getTelegram();
  try {
    if (tg?.openTelegramLink) tg.openTelegramLink(link);
    else window.open(link, "_blank", "noopener");
  } catch {
    // Не открылось: ничего страшного, достижение остаётся в приложении.
  }
}

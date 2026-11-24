// Страница https://milav.app/privacy: политика конфиденциальности для браузера и @BotFather (решение владельца 24.11).
// Текст тот же, что на экране приложения: privacySections в packages/shared/src/privacy.ts. Страница без скриптов,
// поэтому CSP разрешает только встроенные стили.
import { PRIVACY_UPDATED, privacySections } from "@milav/shared";

const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export const PRIVACY_PAGE_CSP = "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";

export function privacyPageHtml(): string {
  const body = privacySections()
    .map((s) => {
      const paragraphs = s.paragraphs.map((p) => `<p>${escapeHtml(p)}</p>`).join("");
      const items = s.items?.length ? `<ul>${s.items.map((i) => `<li>${escapeHtml(i)}</li>`).join("")}</ul>` : "";
      return `<section><h2>${escapeHtml(s.title)}</h2>${paragraphs}${items}</section>`;
    })
    .join("");
  return `<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Milav — политика конфиденциальности</title>
<style>
:root { color-scheme: light dark; }
body { margin: 0; font: 17px/1.55 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #f6f7f9; color: #1d2330; }
main { max-width: 680px; margin: 0 auto; padding: 24px 20px 48px; }
h1 { font-size: 26px; margin: 0 0 4px; }
.updated { color: #5d6675; margin: 0 0 24px; }
h2 { font-size: 19px; margin: 28px 0 8px; }
p, li { margin: 0 0 10px; }
ul { padding-left: 22px; margin: 0; }
@media (prefers-color-scheme: dark) { body { background: #14171c; color: #e7eaf0; } .updated { color: #a3abb8; } }
</style>
</head>
<body>
<main>
<h1>Политика конфиденциальности Milav</h1>
<p class="updated">Обновлено ${escapeHtml(PRIVACY_UPDATED)}</p>
${body}
</main>
</body>
</html>`;
}

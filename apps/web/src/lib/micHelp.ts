export interface MicHelp {
  where: string;
  steps: string[];
}

/** Как включить микрофон для Telegram на разных устройствах. `platform` берётся из Telegram.WebApp.platform. */
export function micHelp(platform: string | undefined, userAgent = ""): MicHelp {
  const p = (platform ?? "").toLowerCase();
  const ua = userAgent.toLowerCase();
  if (p === "ios" || (!p && /iphone|ipad|ipod/.test(ua))) {
    return {
      where: "iPhone и iPad",
      steps: ["Откройте «Настройки» телефона", "Найдите в списке Telegram", "Включите переключатель «Микрофон»", "Вернитесь в Telegram и нажмите «Попробовать снова»"],
    };
  }
  if (p.startsWith("android") || (!p && ua.includes("android"))) {
    return {
      where: "Android",
      steps: ["Откройте «Настройки» телефона", "Приложения, затем Telegram, затем «Разрешения»", "Выберите «Микрофон» и «Разрешить»", "Вернитесь в Telegram и нажмите «Попробовать снова»"],
    };
  }
  if (p === "macos") {
    return {
      where: "Mac",
      steps: ["Системные настройки, затем «Конфиденциальность и безопасность»", "Откройте «Микрофон» и включите Telegram", "Нажмите «Попробовать снова»"],
    };
  }
  if (p === "tdesktop") {
    return {
      where: "Telegram для компьютера",
      steps: ["Windows: Параметры, затем «Конфиденциальность», затем «Микрофон», включите доступ для классических приложений", "Нажмите «Попробовать снова»"],
    };
  }
  return {
    where: "браузер",
    steps: ["Нажмите на значок замка или микрофона в адресной строке", "Выберите «Разрешить» для микрофона", "Обновите страницу и нажмите «Попробовать снова»"],
  };
}

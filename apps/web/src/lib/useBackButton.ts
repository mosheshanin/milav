import { useEffect, useRef } from "react";
import { getTelegram } from "../telegram";

/**
 * Показывает кнопку «назад» Telegram, пока экран открыт, и вызывает `handler` по нажатию.
 * Нажатие «назад» срабатывает и от системной кнопки Android, и от свайпа назад на iOS.
 * Без обработчика (null) кнопка скрыта: на главной «назад» закрывает приложение, как и должно.
 * Свежий обработчик подхватывается без пересоздания кнопки.
 */
export function useBackButton(handler: (() => void) | null): void {
  const latest = useRef(handler);
  latest.current = handler;
  const active = handler !== null;

  useEffect(() => {
    const button = getTelegram()?.BackButton;
    if (!active || !button) return;
    const onClick = () => latest.current?.();
    try {
      button.onClick(onClick);
      button.show();
    } catch {
      // Версия Telegram без кнопки «назад»: остаётся стрелка в шапке приложения.
    }
    return () => {
      try {
        button.offClick(onClick);
        button.hide();
      } catch {
        // См. выше.
      }
    };
  }, [active]);
}

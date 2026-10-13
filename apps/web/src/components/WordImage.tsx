import { useState } from "react";

/**
 * Картинка слова или слова-примера. Если картинки нет или файл не загрузился, плитка нужного размера показывает
 * запасной вариант: `fallback` (первую букву слова).
 */
export function WordImage({ image, fallback, className }: { image?: string; fallback: string; className: string }) {
  const [broken, setBroken] = useState(false);
  const showImage = image && !broken;
  return (
    <div className={`flex shrink-0 items-center justify-center rounded-control bg-page ${className}`}>
      {showImage ? (
        <img
          src={image}
          alt=""
          className="size-4/5 object-contain"
          loading="eager"
          data-testid="word-image"
          onError={() => setBroken(true)}
        />
      ) : (
        <span dir="rtl" lang="he" aria-hidden className="font-hebrew text-5xl font-bold text-accent-soft" data-testid="word-image-fallback">
          {[...fallback][0]}
        </span>
      )}
    </div>
  );
}

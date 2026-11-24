// Картинки для поста в канал уменьшаются на телефоне до отправки: Telegram всё равно хранит фото не больше 2560 px по
// длинной стороне, а Worker на бесплатном тарифе держит запрос в памяти и тратит на него процессорное время.
// Большое фото с телефона (4032×3024, 3–5 МБ) становится JPEG 2560×1920 (около 0,5–1 МБ). Плоский скриншот, у которого
// PNG легче JPEG, остаётся PNG. Формат, который браузер умеет открыть (HEIC на iPhone, WebP), переводится в JPEG.

export const PHOTO_MAX_SIDE = 2560;
const KEEP_JPEG_BYTES = 1.5 * 1024 * 1024;
const JPEG_QUALITY = 0.9;

/** Размер после уменьшения: длинная сторона не больше `max`, пропорции сохраняются. */
export function fitSize(width: number, height: number, max = PHOTO_MAX_SIDE): { width: number; height: number } {
  const scale = Math.min(1, max / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

/** Имя файла с расширением .jpg вместо прежнего. */
export function jpegName(name: string): string {
  return `${name.replace(/\.[^./]+$/, "") || "photo"}.jpg`;
}

/**
 * Уменьшает картинку и переводит в JPEG. Небольшой JPEG нужного размера возвращается как есть. Если браузер не смог
 * открыть файл, возвращается исходный (сервер проверит формат и размер сам).
 */
export async function shrinkPhoto(file: File): Promise<File> {
  if (typeof createImageBitmap !== "function" || typeof document === "undefined") return file;
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return file;
  }
  try {
    const size = fitSize(bitmap.width, bitmap.height);
    const sameSize = size.width === bitmap.width && size.height === bitmap.height;
    if (file.type === "image/jpeg" && sameSize && file.size <= KEEP_JPEG_BYTES) return file;
    const canvas = document.createElement("canvas");
    canvas.width = size.width;
    canvas.height = size.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    // У PNG бывает прозрачность: в JPEG она стала бы чёрной, поэтому кладём картинку на белый фон.
    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, size.width, size.height);
    ctx.drawImage(bitmap, 0, 0, size.width, size.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY));
    if (!blob) return file;
    // JPEG вышел тяжелее исходного JPEG или PNG того же размера (у плоских скриншотов PNG бывает легче): оставляем исходный.
    if ((file.type === "image/jpeg" || file.type === "image/png") && sameSize && blob.size >= file.size) return file;
    return new File([blob], jpegName(file.name), { type: "image/jpeg" });
  } finally {
    bitmap.close();
  }
}

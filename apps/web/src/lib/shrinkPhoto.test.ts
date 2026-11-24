// Уменьшение картинок для поста в канал: размеры и имя файла (само рисование проверяет сквозной тест в браузере).
import { describe, expect, it } from "vitest";
import { fitSize, jpegName, shrinkPhoto } from "./shrinkPhoto";

describe("уменьшение картинок поста", () => {
  it("длинная сторона не больше 2560, пропорции сохраняются", () => {
    expect(fitSize(1170, 2532)).toEqual({ width: 1170, height: 2532 });
    expect(fitSize(4032, 3024)).toEqual({ width: 2560, height: 1920 });
    expect(fitSize(3000, 6000)).toEqual({ width: 1280, height: 2560 });
    expect(fitSize(10, 100000)).toEqual({ width: 1, height: 2560 });
  });

  it("имя файла с .jpg", () => {
    expect(jpegName("IMG_0001.HEIC")).toBe("IMG_0001.jpg");
    expect(jpegName("скрин.png")).toBe("скрин.jpg");
    expect(jpegName("без-расширения")).toBe("без-расширения.jpg");
    expect(jpegName(".png")).toBe("photo.jpg");
  });

  it("без поддержки картинок в среде файл возвращается как есть", async () => {
    const file = new File([new Uint8Array(3)], "a.png", { type: "image/png" });
    expect(await shrinkPhoto(file)).toBe(file);
  });
});

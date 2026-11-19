import { describe, expect, it } from "vitest";
import { appOrigin } from "./appUrl";

const REQUEST = "https://milav.example.workers.dev/api/me";

describe("appOrigin: основной адрес приложения", () => {
  it("берёт APP_URL, если он задан", () => {
    expect(appOrigin({ APP_URL: "https://milav.app" }, REQUEST)).toBe("https://milav.app");
  });

  it("отбрасывает путь и слеш на конце", () => {
    expect(appOrigin({ APP_URL: " https://milav.app/some/path/ " }, REQUEST)).toBe("https://milav.app");
  });

  it("без APP_URL работает по адресу запроса (локальная разработка)", () => {
    expect(appOrigin({}, REQUEST)).toBe("https://milav.example.workers.dev");
    expect(appOrigin({ APP_URL: "" }, "http://localhost:8787/api/me")).toBe("http://localhost:8787");
  });

  it("неверный или не https адрес не используется", () => {
    expect(appOrigin({ APP_URL: "milav.app" }, REQUEST)).toBe("https://milav.example.workers.dev");
    expect(appOrigin({ APP_URL: "http://milav.app" }, REQUEST)).toBe("https://milav.example.workers.dev");
  });
});

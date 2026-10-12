import { describe, expect, it } from "vitest";
import { parseDevUser, validateInitData } from "./auth";
import { signInitData } from "./test-utils/telegram";

const TOKEN = "123456:TEST-bot-token";
const NOW = 1_800_000_000;
const user = { id: 777, first_name: "Моше", username: "moshe" };

describe("проверка подписи initData", () => {
  it("принимает корректную подпись и отдаёт пользователя", async () => {
    const data = signInitData(TOKEN, user, NOW);
    const result = await validateInitData(data, TOKEN, { now: NOW + 10 });
    expect(result).toEqual({
      id: 777,
      firstName: "Моше",
      lastName: undefined,
      username: "moshe",
      languageCode: undefined,
    });
  });

  it("отклоняет подпись, сделанную другим токеном", async () => {
    const data = signInitData("999:other-token", user, NOW);
    expect(await validateInitData(data, TOKEN, { now: NOW })).toBeNull();
  });

  it("отклоняет подмену данных пользователя", async () => {
    const data = signInitData(TOKEN, user, NOW);
    const forged = data.replace(encodeURIComponent('"id":777'), encodeURIComponent('"id":1'));
    expect(forged).not.toBe(data);
    expect(await validateInitData(forged, TOKEN, { now: NOW })).toBeNull();
  });

  it("отклоняет данные без подписи или пустые", async () => {
    expect(await validateInitData("user=%7B%22id%22%3A1%7D&auth_date=1", TOKEN, { now: 2 })).toBeNull();
    expect(await validateInitData("", TOKEN)).toBeNull();
    expect(await validateInitData(signInitData(TOKEN, user, NOW), "", { now: NOW })).toBeNull();
  });

  it("отклоняет устаревшую подпись (старше суток)", async () => {
    const data = signInitData(TOKEN, user, NOW);
    expect(await validateInitData(data, TOKEN, { now: NOW + 24 * 3600 + 1 })).toBeNull();
    expect(await validateInitData(data, TOKEN, { now: NOW + 24 * 3600 - 1 })).not.toBeNull();
  });

  it("отклоняет подпись из будущего", async () => {
    const data = signInitData(TOKEN, user, NOW + 3600);
    expect(await validateInitData(data, TOKEN, { now: NOW })).toBeNull();
  });
});

describe("тестовый вход", () => {
  it("разбирает заголовок вида id:имя", () => {
    expect(parseDevUser("42:Тест")).toEqual({ id: 42, firstName: "Тест" });
  });
  it("отклоняет мусор", () => {
    expect(parseDevUser("abc")).toBeNull();
    expect(parseDevUser("42:")).toBeNull();
  });
});

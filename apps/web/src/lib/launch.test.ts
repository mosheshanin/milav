import { describe, expect, it } from "vitest";
import { launchFromOf, launchTargetFrom } from "./launch";

const base = { hash: "", search: "", allowDev: false };

describe("цель запуска", () => {
  it("параметр record из Telegram открывает запись", () => {
    expect(launchTargetFrom({ ...base, startParam: "record" })).toBe("record");
  });

  it("параметр можно прочитать и из хеша адреса", () => {
    expect(launchTargetFrom({ ...base, hash: "#tgWebAppData=x&tgWebAppStartParam=record&tgWebAppVersion=8.0" })).toBe("record");
  });

  it("обычный запуск и чужие параметры ведут на главную", () => {
    expect(launchTargetFrom(base)).toBeNull();
    expect(launchTargetFrom({ ...base, startParam: "lesson-1" })).toBeNull();
    expect(launchTargetFrom({ ...base, hash: "#tgWebAppStartParam=other" })).toBeNull();
    expect(launchTargetFrom({ ...base, startParam: "RECORD" })).toBeNull();
  });

  it("тестовый параметр адреса ?record работает только в разработке", () => {
    expect(launchTargetFrom({ ...base, search: "?record=1" })).toBeNull();
    expect(launchTargetFrom({ ...base, search: "?record=1", allowDev: true })).toBe("record");
    expect(launchTargetFrom({ ...base, search: "?dev=1001&record", allowDev: true })).toBe("record");
    expect(launchTargetFrom({ ...base, search: "?dev=1001", allowDev: true })).toBeNull();
  });
});

describe("метка ?from= (учёт рассылок)", () => {
  it("кнопка «Продолжить» под напоминанием даёт reminder; чужое и пустое не берём", () => {
    expect(launchFromOf("?from=reminder")).toBe("reminder");
    expect(launchFromOf("?x=1&from=reminder")).toBe("reminder");
    expect(launchFromOf("")).toBeUndefined();
    expect(launchFromOf("?from=")).toBeUndefined();
    expect(launchFromOf("?from=<script>")).toBeUndefined();
  });
});

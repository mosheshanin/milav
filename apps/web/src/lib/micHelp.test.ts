import { describe, expect, it } from "vitest";
import { micHelp } from "./micHelp";

describe("подсказка по включению микрофона", () => {
  it("для каждой платформы свои шаги", () => {
    expect(micHelp("ios").where).toContain("iPhone");
    expect(micHelp("android").steps.join(" ")).toContain("Разрешения");
    expect(micHelp("android_x").where).toBe("Android");
    expect(micHelp("macos").where).toBe("Mac");
    expect(micHelp("tdesktop").where).toContain("компьютера");
    expect(micHelp("weba").where).toBe("браузер");
  });

  it("без платформы определяет по строке браузера", () => {
    expect(micHelp(undefined, "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)").where).toContain("iPhone");
    expect(micHelp(undefined, "Mozilla/5.0 (Linux; Android 14)").where).toBe("Android");
    expect(micHelp(undefined, "").where).toBe("браузер");
  });

  it("последний шаг всегда ведёт обратно к кнопке", () => {
    for (const p of ["ios", "android", "macos", "tdesktop", "weba"]) {
      expect(micHelp(p).steps.at(-1)).toContain("Попробовать снова");
    }
  });
});

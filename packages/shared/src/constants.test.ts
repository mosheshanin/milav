import { describe, expect, it } from "vitest";
import { lessonOpenWithoutPurchase } from "./constants";

describe("lessonOpenWithoutPurchase", () => {
  it("бесплатный урок открыт всегда", () => {
    expect(lessonOpenWithoutPurchase({ free: true }, false)).toBe(true);
    expect(lessonOpenWithoutPurchase({ free: true }, true)).toBe(true);
  });

  it("платный открыт, только пока платные открыты всем", () => {
    expect(lessonOpenWithoutPurchase({ free: false }, true)).toBe(true);
    expect(lessonOpenWithoutPurchase({ free: false }, false)).toBe(false);
  });
});

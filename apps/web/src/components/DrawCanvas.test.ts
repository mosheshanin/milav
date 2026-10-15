import { describe, expect, it } from "vitest";
import { CANVAS_LINE_HEIGHT } from "@milav/shared";
import { INK_WIDTH } from "./DrawCanvas";

describe("толщина линии буквы", () => {
  it("равна толщине штриха в шрифте подсказки: 16 px при нынешней геометрии холста (решение владельца 15.10)", () => {
    expect(INK_WIDTH).toBe(16);
  });

  it("следует за высотой строки: около 16 % расстояния между направляющими", () => {
    expect(INK_WIDTH / CANVAS_LINE_HEIGHT).toBeGreaterThan(0.15);
    expect(INK_WIDTH / CANVAS_LINE_HEIGHT).toBeLessThan(0.17);
  });
});

import { describe, expect, it } from "vitest";
import { BADGE_ICONS } from "@milav/shared";
import { catalog } from "@milav/content";
import { BADGE_ICON_COMPONENTS } from "./badgeIcons";

describe("значки бейджей", () => {
  it("у каждого имени из BADGE_ICONS есть компонент", () => {
    for (const name of BADGE_ICONS) expect(BADGE_ICON_COMPONENTS[name], name).toBeTruthy();
  });

  it("у каждого бейджа каталога значок известен", () => {
    for (const badge of catalog.badges) expect(BADGE_ICON_COMPONENTS[badge.icon], badge.id).toBeTruthy();
  });
});

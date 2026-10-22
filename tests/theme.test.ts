import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import manifest from "@/app/manifest";
import { THEME_COLOR } from "@/lib/theme";

describe("theme color", () => {
  it("matches the --bg design token", () => {
    const css = readFileSync("app/base.css", "utf8");
    expect(/--bg:\s*(#[0-9a-f]{6})/i.exec(css)?.[1]).toBe(THEME_COLOR);
  });

  it("paints the installed app with the interface background", () => {
    const { background_color, theme_color, display } = manifest();
    expect(background_color).toBe(THEME_COLOR);
    expect(theme_color).toBe(THEME_COLOR);
    expect(display).toBe("standalone");
  });
});

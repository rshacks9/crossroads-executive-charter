import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { THEME_COLORS, themeColor, themeOverride } from "./theme";

const read = (relative: string): string => readFileSync(new URL(relative, import.meta.url), "utf-8");

describe("theme toggle", () => {
  it("stores a choice only when it differs from the system setting", () => {
    expect(themeOverride("dark", "light")).toBe("dark");
    expect(themeOverride("light", "dark")).toBe("light");
    expect(themeOverride("dark", "dark")).toBeNull();
    expect(themeOverride("light", "light")).toBeNull();
  });

  it("pins the toolbar colour to a stored choice, otherwise follows each tag's colour scheme", () => {
    const light = "(prefers-color-scheme: light)";
    const dark = "(prefers-color-scheme: dark)";
    expect(themeColor(null, light)).toBe(THEME_COLORS.light);
    expect(themeColor(null, dark)).toBe(THEME_COLORS.dark);
    expect(themeColor("dark", light)).toBe(THEME_COLORS.dark);
    expect(themeColor("light", dark)).toBe(THEME_COLORS.light);
    expect(themeColor(null, "")).toBe(THEME_COLORS.light);
  });

  it("uses each theme's masthead ink, with one theme-color tag per colour scheme in index.html", () => {
    const html = read("../index.html");
    expect(html.match(/<meta name="theme-color"/g)).toHaveLength(2);
    expect(html).toContain(`<meta name="theme-color" media="(prefers-color-scheme: light)" content="${THEME_COLORS.light}" />`);
    expect(html).toContain(`<meta name="theme-color" media="(prefers-color-scheme: dark)" content="${THEME_COLORS.dark}" />`);
    const css = read("./styles.css");
    expect(css).toContain(`--ink: ${THEME_COLORS.light};`);
    expect(css).toContain(`--ink: ${THEME_COLORS.dark};`);
  });
});

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
    // Each value from its own block: the print reset repeats the light values, so a bare search would pass anyway.
    const css = read("./styles.css");
    expect(css.match(/^:root [{][^}]*?--ink: (#[0-9a-f]{6});/m)?.[1]).toBe(THEME_COLORS.light);
    expect(css.match(/^:root\[data-theme="dark"\] [{][^}]*?--ink: (#[0-9a-f]{6});/m)?.[1]).toBe(THEME_COLORS.dark);
  });
});

describe("status colours follow the theme", () => {
  const css = read("./styles.css");
  /** The custom properties set in the token block a pattern finds (its first group is the block body). */
  const block = (pattern: RegExp): Record<string, string> => {
    const body = pattern.exec(css)?.[1];
    if (body === undefined) throw new Error(`no token block for ${pattern}`);
    return Object.fromEntries([...body.matchAll(/--([a-z0-9-]+):\s*([^;]+);/g)].map((m) => [m[1] ?? "", (m[2] ?? "").trim()]));
  };
  const LIGHT = block(/^:root [{]([^}]*)[}]/m);
  const DARK = block(/^:root\[data-theme="dark"\] [{]([^}]*)[}]/m);
  const SYSTEM = block(/^@media [(]prefers-color-scheme: dark[)] [{]\s*:root:not[(]\[data-theme="light"\][)] [{]([^}]*)[}]/m);
  const PRINT = block(/^@media print [{][^{]*:root:not[(]\[data-theme="light"\][)] [{]([^}]*)[}]/m);
  // What each theme ends up with: dark themes inherit the light tokens they do not set; print overrides
  // whichever theme is on, so it is checked over the dark one.
  const THEMES: Record<string, Record<string, string>> = { light: LIGHT, dark: { ...LIGHT, ...DARK }, "dark (system setting)": { ...LIGHT, ...SYSTEM }, print: { ...LIGHT, ...DARK, ...PRINT } };
  // Text and the fill behind it, and the landing-rate bands drawn on the panel.
  const PAIRS: [string, string][] = [["fit-fits", "fit-fits-bg"], ["fit-tight", "fit-tight-bg"], ["kind-fleet", "kind-fleet-bg"], ["kind-network", "kind-network-bg"], ["base-ktyq", "base-ktyq-bg"]];
  const RATES = ["rate-good", "rate-ok", "rate-warn", "rate-bad"];
  const STATUS = [...PAIRS.flat(), ...RATES];

  const hex = (value: string): string => (/^#[0-9a-f]{3}$/i.test(value) ? `#${[...value.slice(1)].map((c) => c + c).join("")}` : value);
  const luminance = (value: string): number => {
    const full = hex(value);
    const channel = (i: number) => {
      const c = Number.parseInt(full.slice(1 + 2 * i, 3 + 2 * i), 16) / 255;
      return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * channel(0) + 0.7152 * channel(1) + 0.0722 * channel(2);
  };
  /** WCAG 2 contrast ratio of two #rrggbb or #rgb colours. */
  const contrast = (a: string, b: string): number => {
    const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return ((high ?? 0) + 0.05) / ((low ?? 0) + 0.05);
  };

  it("measures contrast the WCAG way", () => {
    expect(contrast("#000000", "#ffffff")).toBeCloseTo(21, 5);
    expect(contrast("#fff", "#2a6f97")).toBeCloseTo(5.5, 1);
    expect(contrast("#777777", "#777777")).toBe(1);
  });

  it("sets every status token in all four token blocks; the system dark twin matches the dark theme and print the light one", () => {
    for (const name of STATUS) {
      expect(LIGHT[name], name).toMatch(/^#[0-9a-f]{6}$/);
      expect(DARK[name], name).toMatch(/^#[0-9a-f]{6}$/);
      expect(SYSTEM[name], name).toBe(DARK[name]);
      expect(PRINT[name], name).toBe(LIGHT[name]);
    }
    // In dark the fills follow the theme instead of keeping the light values.
    for (const [, fill] of PAIRS) expect(DARK[fill], fill).not.toBe(LIGHT[fill]);
  });

  it("keeps text on its fill at 4.5:1 or more, and the landing-rate bands at 3:1 against the panel, in every theme", () => {
    for (const [theme, tokens] of Object.entries(THEMES)) {
      for (const [text, fill] of PAIRS) expect(contrast(tokens[text] ?? "", tokens[fill] ?? ""), `${theme}: ${text} on ${fill}`).toBeGreaterThanOrEqual(4.5);
      for (const rate of RATES) expect(contrast(tokens[rate] ?? "", tokens.panel ?? ""), `${theme}: ${rate} on the panel`).toBeGreaterThanOrEqual(3);
    }
  });

  it("colours the chips, bands and tags with the tokens, with no fixed colour left in their rules", () => {
    const rules: [string, string[]][] = [
      [".fit--fits", ["fit-fits-bg", "fit-fits"]],
      [".fit--tight", ["fit-tight-bg", "fit-tight"]],
      [".rate--good", ["rate-good"]],
      [".rate--ok", ["rate-ok"]],
      [".rate--warn", ["rate-warn"]],
      [".rate--bad", ["rate-bad"]],
      [".news-card--fleet .news-card__kind", ["kind-fleet-bg", "kind-fleet"]],
      [".news-card--network .news-card__kind", ["kind-network-bg", "kind-network"]],
      [".tag--ktyq", ["base-ktyq-bg", "base-ktyq"]],
    ];
    const lines = css.split("\n");
    for (const [selector, tokens] of rules) {
      const found = lines.filter((line) => line.startsWith(`${selector} {`));
      expect(found, selector).toHaveLength(1);
      const rule = found[0] ?? "";
      expect(rule, selector).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?[(]/i);
      for (const token of tokens) expect(rule, selector).toContain(`var(--${token})`);
    }
  });
});

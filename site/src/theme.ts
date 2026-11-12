// The theme toggle in the masthead (App.tsx): which choice to store, and the colour of the browser
// toolbar. index.html has one theme-color tag per colour scheme, with the same two colours.

export type Theme = "light" | "dark";

/** The masthead ink of each theme (styles.css --ink), which mobile browsers use for their toolbar. */
export const THEME_COLORS: Record<Theme, string> = { light: "#1b2328", dark: "#0d1316" };

/** What to store after the toggle switches to `next`: nothing when that is the system's own theme, so
 *  the site follows the system setting again, otherwise the choice itself. */
export function themeOverride(next: Theme, system: Theme): Theme | null {
  return next === system ? null : next;
}

/** The content of a theme-color tag: the stored theme's colour when a choice is stored, otherwise the
 *  colour of the scheme named in the tag's own media query. */
export function themeColor(stored: Theme | null, media: string): string {
  if (stored) return THEME_COLORS[stored];
  return media.includes("dark") ? THEME_COLORS.dark : THEME_COLORS.light;
}

// Server-render the site shell before any data has loaded: catches render-time crashes in the header,
// menu and footer, and checks their link names and the search shortcut without a browser.
import { renderToString } from "react-dom/server";
import { afterAll, describe, expect, it, vi } from "vitest";

vi.mock("leaflet", () => ({ default: {} }));
vi.mock("leaflet/dist/leaflet.css", () => ({}));
// On its first render App reads the address; the theme toggle guards its use of storage and
// matchMedia. That address is all it needs from window on the server.
vi.stubGlobal("window", { location: { hash: "#/" } });
afterAll(() => {
  vi.unstubAllGlobals();
});

const { App, leavesMenu } = await import("./App");

const shell = () => renderToString(<App />);
const textOf = (html: string) => html.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&");

describe("site shell", () => {
  it("names the header and footer wordmark links by their visible text, then 'home'", () => {
    const links = shell().match(/<a class="wordmark"[^>]*>.*?<[/]a>/g) ?? [];
    expect(links).toHaveLength(2);
    for (const link of links) {
      expect(link).not.toContain("aria-label");
      expect(textOf(link)).toBe("Crossroads Executive & Charter, home");
    }
  });

  it("offers Ctrl/Cmd+K for search and no single-key shortcut", () => {
    const html = shell();
    expect(html).toContain('aria-keyshortcuts="Control+K Meta+K"');
    expect(html).toContain('<kbd aria-hidden="true">Ctrl K</kbd>');
    expect(html).not.toContain("<kbd>/</kbd>");
  });

  it("closes the open menu when focus moves to an element outside it, but not on a tap that focuses nothing", () => {
    const inside = {};
    const outside = {};
    const box = { contains: (n: unknown) => n === inside };
    expect(leavesMenu(box, inside as EventTarget)).toBe(false);
    expect(leavesMenu(box, outside as EventTarget)).toBe(true);
    expect(leavesMenu(box, null)).toBe(false);
  });

  it("marks the footer column labels up as headings, so screen readers can jump between them", () => {
    const html = shell();
    for (const label of ["The airline", "Pilots", "Elsewhere"]) expect(html).toContain(`<h2 class="footer__head">${label}</h2>`);
    expect(html).not.toContain('<p class="footer__head">');
  });
});

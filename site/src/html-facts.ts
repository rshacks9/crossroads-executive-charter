// Facts that appear in the page head: the title, the search description and the link-preview
// description. The build fills them into index.html from the snapshot (see vite.config.ts) and
// the app uses the same functions at run time, so the numbers cannot drift from the data.
// Keep this module free of imports: the Vite config loads it.

export const DEFAULT_AIRLINE_NAME = "Crossroads Executive & Charter";

/** The parts of a snapshot the head facts are built from. Every field is optional: the build reads raw JSON. */
export interface FactsSource {
  airline?: { name?: string | null; divisions?: readonly unknown[] | null } | null;
  fleet?: readonly unknown[] | null;
  routes?: readonly unknown[] | null;
  hubs?: readonly ({ airports?: readonly string[] | null } | null)[] | null;
}

export interface SiteCounts {
  types: number;
  routes: number;
  bases: number;
  divisions: number;
}

const size = (list: unknown): number => (Array.isArray(list) ? list.length : 0);

/** Counts for the descriptions, or null when any of them is missing, so that a zero is never published. */
export function countsFromSnapshot(source: FactsSource | null | undefined): SiteCounts | null {
  if (!source || typeof source !== "object") return null;
  // A base is an airport listed by a hub, counted once: the same rule as networkFacts in data.ts.
  const bases = new Set<string>();
  const hubs: unknown = source.hubs;
  if (Array.isArray(hubs)) {
    for (const hub of hubs) {
      const airports: unknown = (hub as { airports?: unknown } | null)?.airports;
      if (Array.isArray(airports)) for (const icao of airports) if (typeof icao === "string" && icao) bases.add(icao);
    }
  }
  const counts: SiteCounts = {
    types: size(source.fleet),
    routes: size(source.routes),
    bases: bases.size,
    divisions: size(source.airline?.divisions),
  };
  return Object.values(counts).every((n) => n > 0) ? counts : null;
}

const WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve"];

/** Whole numbers up to twelve as words, the way the site copy writes them; anything else as digits. */
export function numberWord(n: number): string {
  return WORDS[n] ?? n.toLocaleString("en-US");
}

const capital = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);
const plural = (n: number, one: string, many: string): string => (n === 1 ? one : many);
const digits = (n: number, one: string, many: string): string => `${n.toLocaleString("en-US")} ${plural(n, one, many)}`;

/** Title of the home page. The other pages put their own name in front of the airline name. */
export function homeTitle(name?: string | null): string {
  const shown = typeof name === "string" && name.trim() ? name.trim() : DEFAULT_AIRLINE_NAME;
  return `${shown} · Virtual airline from Indianapolis`;
}

/** Search-result description of the site (the meta description of the home page). Kept within 160 characters. */
export function siteDescription(counts: SiteCounts | null): string {
  if (!counts) {
    return "A fictional flight-sim virtual airline from Indianapolis: light jets to the A380 and 777F across executive, charter, sports and cargo divisions. Join on vAMSYS.";
  }
  const types = digits(counts.types, "aircraft type", "aircraft types");
  const routes = digits(counts.routes, "route", "routes");
  return `A fictional flight-sim virtual airline from Indianapolis: ${types}, from the Citation Mustang to the A380 and 777F, and ${routes}. Join on vAMSYS.`;
}

/** Shorter-sentence description for link previews (Open Graph: Discord, Reddit, Facebook). */
export function socialDescription(counts: SiteCounts | null): string {
  if (!counts) {
    return "Light jets to the A380 and 777F from Indianapolis: executive, charter, sports and cargo flying on one career path. A virtual airline for flight simulation on vAMSYS.";
  }
  const bases = `${capital(numberWord(counts.bases))} Indianapolis ${plural(counts.bases, "base", "bases")}`;
  const routes = digits(counts.routes, "route", "routes");
  const divisions = `${numberWord(counts.divisions)} ${plural(counts.divisions, "division", "divisions")}`;
  return `Light jets to the A380 and 777F. ${bases}, ${routes}, ${divisions} and one career path. A virtual airline for flight simulation on vAMSYS.`;
}

/** Values for the {{placeholders}} in index.html. */
export function htmlFacts(source: FactsSource | null | undefined): Record<string, string> {
  const counts = countsFromSnapshot(source);
  return {
    site_title: homeTitle(source?.airline?.name),
    site_description: siteDescription(counts),
    social_description: socialDescription(counts),
  };
}

const ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ESCAPES[c] ?? c);
}

/** A placeholder is {{name}}: letters, digits, underscore, dot or hyphen, with optional spaces inside the braces. */
const PLACEHOLDER = /\{\{\s*([A-Za-z0-9_.-]+)\s*\}\}/g;

/** Names of the placeholders in a piece of HTML, in order of appearance. */
export function placeholders(html: string): string[] {
  return [...html.matchAll(PLACEHOLDER)].map((m) => m[1] ?? "");
}

/**
 * Replace every {{name}} in the HTML with its escaped value. An unknown name, an empty value or an
 * unused fact throws, so a placeholder can never be published and a fact cannot silently fall out of the page.
 */
export function fillHtmlFacts(html: string, facts: Readonly<Record<string, string>>): string {
  const used = new Set<string>();
  const filled = html.replace(PLACEHOLDER, (_match, name: string) => {
    const value = Object.hasOwn(facts, name) ? facts[name] : undefined;
    if (typeof value !== "string" || value.trim() === "") throw new Error(`index.html: no value for the placeholder {{${name}}}`);
    used.add(name);
    return escapeHtml(value);
  });
  const unused = Object.keys(facts).filter((name) => !used.has(name));
  if (unused.length > 0) throw new Error(`index.html: no placeholder for ${unused.map((n) => `{{${n}}}`).join(", ")}`);
  return filled;
}

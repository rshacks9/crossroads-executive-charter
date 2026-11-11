// The page head (title, search description, link-preview description) is filled from the snapshot when
// the site is built. These tests pin the wording rules and prove that no number in the head is typed by hand.
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import type { Snapshot } from "./data";
import {
  DEFAULT_AIRLINE_NAME,
  countsFromSnapshot,
  escapeHtml,
  fillHtmlFacts,
  homeTitle,
  htmlFacts,
  numberWord,
  placeholders,
  siteDescription,
  socialDescription,
} from "./html-facts";

vi.mock("leaflet", () => ({ default: {} }));
vi.mock("leaflet/dist/leaflet.css", () => ({}));

const { ROUTES } = await import("./App");

const read = (relative: string): string => readFileSync(new URL(relative, import.meta.url), "utf-8");
const snapshot: Snapshot = JSON.parse(read("../public/data/snapshot.json"));
const indexHtml = read("../index.html");
const facts = htmlFacts(snapshot);

// A number, as digits or as a word, in front of something the snapshot counts ("292 routes", "Two Indianapolis bases").
const TYPED_COUNT =
  /\b(\d[\d,.]*|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand)[\s-]+(?:[a-z]+\s+)?(aircraft|types?|routes?|bases?|hubs?|divisions?|ranks?|destinations?|airports?|pilots?)\b/i;

describe("counts come from the snapshot", () => {
  it("counts aircraft types, routes, bases and divisions", () => {
    expect(countsFromSnapshot(snapshot)).toEqual({
      types: snapshot.fleet.length,
      routes: snapshot.routes.length,
      bases: new Set(snapshot.hubs.flatMap((h) => h.airports)).size,
      divisions: snapshot.airline.divisions.length,
    });
  });

  it("counts a base once, whichever hub lists it, and ignores what is not an airport code", () => {
    const source = { fleet: [1], routes: [1], airline: { divisions: [1] }, hubs: [{ airports: ["KIND", "KTYQ"] }, { airports: ["KIND", "", 7] }, null, { airports: null }] };
    expect(countsFromSnapshot(source as never)?.bases).toBe(2);
  });

  it("gives no counts, rather than a zero, when anything is missing", () => {
    const full = { fleet: [1], routes: [1], airline: { divisions: [1] }, hubs: [{ airports: ["KIND"] }] };
    expect(countsFromSnapshot(full)).toEqual({ types: 1, routes: 1, bases: 1, divisions: 1 });
    const broken = [null, undefined, {}, [], "text", { ...full, fleet: [] }, { ...full, routes: null }, { ...full, hubs: [] }, { ...full, hubs: [{ airports: [] }] }, { ...full, airline: null }, { ...full, airline: { divisions: [] } }];
    for (const source of broken) expect(countsFromSnapshot(source as never), JSON.stringify(source)).toBeNull();
  });
});

describe("wording", () => {
  it("writes whole numbers up to twelve as words and larger ones as digits", () => {
    expect([0, 1, 4, 12].map(numberWord)).toEqual(["zero", "one", "four", "twelve"]);
    expect([13, 310, 1250].map(numberWord)).toEqual(["13", "310", "1,250"]);
  });

  it("describes the site with the numbers it is given", () => {
    const counts = { types: 19, routes: 310, bases: 2, divisions: 4 };
    expect(siteDescription(counts)).toBe(
      "A fictional flight-sim virtual airline from Indianapolis: 19 aircraft types, from the Citation Mustang to the A380 and 777F, and 310 routes. Join on vAMSYS.",
    );
    expect(socialDescription(counts)).toBe(
      "Light jets to the A380 and 777F. Two Indianapolis bases, 310 routes, four divisions and one career path. A virtual airline for flight simulation on vAMSYS.",
    );
  });

  it("uses the singular for one of anything", () => {
    const one = { types: 1, routes: 1, bases: 1, divisions: 1 };
    expect(siteDescription(one)).toContain(": 1 aircraft type, from");
    expect(siteDescription(one)).toContain(", and 1 route. Join");
    expect(socialDescription(one)).toContain("One Indianapolis base, 1 route, one division and one career path.");
  });

  it("falls back to sentences without counts", () => {
    for (const text of [siteDescription(null), socialDescription(null)]) expect(text).not.toMatch(TYPED_COUNT);
    expect(htmlFacts(null).site_description).toBe(siteDescription(null));
    expect(htmlFacts({ fleet: [] }).social_description).toBe(socialDescription(null));
  });

  it("keeps the search description within 160 characters and the link preview within 200", () => {
    const counts = countsFromSnapshot(snapshot);
    for (const text of [siteDescription(counts), siteDescription(null)]) expect(text.length, text).toBeLessThanOrEqual(160);
    for (const text of [socialDescription(counts), socialDescription(null)]) expect(text.length, text).toBeLessThanOrEqual(200);
  });

  it("names the airline in the home title, with a default", () => {
    expect(homeTitle("Test Air")).toBe("Test Air · Virtual airline from Indianapolis");
    for (const missing of [null, undefined, "", "  "]) expect(homeTitle(missing)).toBe(`${DEFAULT_AIRLINE_NAME} · Virtual airline from Indianapolis`);
    expect(facts.site_title).toBe(homeTitle(snapshot.airline.name));
  });

  it("names only aircraft and kinds of flying the airline still has", () => {
    // The sentences name the Citation Mustang, the A380 and the 777F, and executive, charter, sports and cargo flying.
    expect(snapshot.fleet.map((f) => f.code)).toEqual(expect.arrayContaining(["C510", "A388", "B77L"]));
    const divisions = snapshot.airline.divisions.map((d) => d.name).join(" ").toLowerCase();
    for (const word of ["executive", "charter", "sports", "cargo"]) expect(divisions).toContain(word);
  });
});

describe("filling placeholders", () => {
  it("escapes values for HTML text and attributes", () => {
    expect(escapeHtml(`Tom & "Jerry" <b> it's`)).toBe("Tom &amp; &quot;Jerry&quot; &lt;b&gt; it&#39;s");
    expect(fillHtmlFacts('<title>{{t}}</title><meta content="{{ t }}">', { t: 'A & "B"' })).toBe(
      '<title>A &amp; &quot;B&quot;</title><meta content="A &amp; &quot;B&quot;">',
    );
  });

  it("refuses a placeholder without a value, an empty value and a fact that is not used", () => {
    expect(() => fillHtmlFacts("<p>{{missing}}</p>", {})).toThrow("{{missing}}");
    expect(() => fillHtmlFacts("<p>{{toString}}</p>", {})).toThrow("{{toString}}");
    expect(() => fillHtmlFacts("<p>{{a}}</p>", { a: "  " })).toThrow("{{a}}");
    expect(() => fillHtmlFacts("<p>{{a}}</p>", { a: "x", b: "y" })).toThrow("no placeholder for {{b}}");
  });

  it("lists placeholders in the order they appear", () => {
    expect(placeholders("{{a}} x {{ b.c-d }} {{a}} {{ }} {{no way}}")).toEqual(["a", "b.c-d", "a"]);
  });
});

describe("the real index.html", () => {
  it("has exactly the placeholders the build fills, once each", () => {
    expect(placeholders(indexHtml).sort()).toEqual(Object.keys(facts).sort());
  });

  it("builds into a head with the snapshot's numbers and no braces left", () => {
    const built = fillHtmlFacts(indexHtml, facts);
    expect(built).not.toContain("{{");
    const title = /<title>([^<]*)<\/title>/.exec(built)?.[1];
    expect(title).toBe(escapeHtml(homeTitle(snapshot.airline.name)));
    const description = /<meta name="description" content="([^"]*)"/.exec(built)?.[1] ?? "";
    expect(description).toContain(`${snapshot.fleet.length.toLocaleString("en-US")} aircraft type`);
    expect(description).toContain(`${snapshot.routes.length.toLocaleString("en-US")} route`);
    const social = /<meta property="og:description" content="([^"]*)"/.exec(built)?.[1] ?? "";
    expect(social).toContain(`${snapshot.routes.length.toLocaleString("en-US")} route`);
    expect(social).toContain(`${numberWord(snapshot.airline.divisions.length)} division`);
  });

  it("has no number typed by hand in front of something the snapshot counts", () => {
    // The pattern must recognise the kind of text it is there to catch.
    const stale = ["18 aircraft types", "292 routes", "Two Indianapolis bases", "four divisions", "Eighteen aircraft types", "Six ranks", "a six-rank career path", "110 destinations"];
    for (const text of stale) expect(text).toMatch(TYPED_COUNT);
    expect(indexHtml).not.toMatch(TYPED_COUNT);
    for (const route of ROUTES) expect(route.description, `#/${route.path}`).not.toMatch(TYPED_COUNT);
  });

  it("leaves the static 404 page alone: the build does not fill it", () => {
    const notFound = read("../public/404.html");
    expect(notFound).not.toContain("{{");
    expect(notFound).not.toMatch(TYPED_COUNT);
  });
});

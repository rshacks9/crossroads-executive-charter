// Server-render every new page against the committed snapshot: catches render-time crashes and
// checks the key content without a browser. Leaflet needs a DOM, so the map module is stubbed.
import { readFileSync } from "node:fs";
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { Crew, Snapshot } from "./data";

vi.mock("leaflet", () => ({ default: {} }));
vi.mock("leaflet/dist/leaflet.css", () => ({}));

const { AirportPage, DestinationsPage, ExplorerPanel, NotFoundPage, PlanPage, ResourcesPage, RoutePage, RouteRows, RunwayTable, SearchDialog, StatsPage, TypePage } = await import("./explore-pages");
const { DivisionDot, FleetPage, LivePage, MapLegend, PageHeader, RoutesPage, HomePage, PilotsPage } = await import("./pages");
const { HandbookPage, CareersPage, ServicesPage } = await import("./info");
const { divisionColor } = await import("./LiveMap");
const { findRoute, onwardLegs, routeHref, suggestFleet } = await import("./explore");
const { routeDivision } = await import("./data");

const snapshot: Snapshot = JSON.parse(readFileSync(new URL("../public/data/snapshot.json", import.meta.url), "utf-8"));
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&#x27;/g, "'").replace(/\s+/g, " ");

describe("pages render from the snapshot", () => {
  it("home, fleet and network explorer", () => {
    expect(text(renderToString(<HomePage snapshot={snapshot} />))).toContain("Longest leg");
    const fleet = renderToString(<FleetPage snapshot={snapshot} />);
    expect(fleet).toContain('href="#/fleet/C750"');
    const routes = text(renderToString(<RoutesPage snapshot={snapshot} />));
    expect(routes).toContain(`${snapshot.routes.length} routes from Indianapolis`);
    expect(routes).toContain("Choose an airport");
  });

  it("every destination page", () => {
    const served = new Set(snapshot.routes.flatMap((r) => [r.from, r.to]));
    for (const icao of served) {
      const html = text(renderToString(<AirportPage snapshot={snapshot} icao={icao} />));
      expect(html).toContain(`Routes serving ${icao}`);
    }
    expect(text(renderToString(<DestinationsPage snapshot={snapshot} />))).toContain(`${served.size} airports on the schedule`);
  });

  it("every fleet detail page", () => {
    for (const f of snapshot.fleet) {
      const html = text(renderToString(<TypePage snapshot={snapshot} code={f.code} />));
      expect(html).toContain(f.name);
      expect(html).toContain("Planning range");
    }
  });

  it("every route page", () => {
    for (const r of snapshot.routes) {
      const html = renderToString(<RoutePage snapshot={snapshot} route={findRoute(snapshot, r.callsign!)} />);
      expect(html).toContain("Book on vAMSYS");
      expect(html).toContain("simbrief.com");
    }
  });

  it("planner, resources, stats and 404", () => {
    const plan = text(renderToString(<PlanPage snapshot={snapshot} />));
    expect(plan).toContain("Simulation planning tool");
    expect(plan).toContain("doesn't sell real flights");
    expect(text(renderToString(<ResourcesPage snapshot={snapshot} />))).toContain("Full schedule (CSV)");
    expect(text(renderToString(<StatsPage snapshot={snapshot} />))).toContain("Routes by division");
    expect(text(renderToString(<NotFoundPage snapshot={snapshot} />))).toContain("We can't find that page");
    expect(text(renderToString(<AirportPage snapshot={snapshot} icao="ZZZZ" />))).toContain("We can't find airport ZZZZ");
    expect(text(renderToString(<TypePage snapshot={snapshot} code="B748" />))).toContain("We can't find aircraft type B748");
  });

  it("links Pegasus to the official vAMSYS guide everywhere it is offered", () => {
    const url = "https://vamsys.co.uk/docs/pegasus/pegasus-acars";
    for (const html of [
      renderToString(<ResourcesPage snapshot={snapshot} />),
      renderToString(<PilotsPage snapshot={snapshot} />),
      renderToString(<HandbookPage snapshot={snapshot} />),
      renderToString(<CareersPage snapshot={snapshot} />),
    ]) expect(html).toContain(`href="${url}"`);
    expect(renderToString(<ResourcesPage snapshot={snapshot} />)).not.toContain('href="https://vamsys.io/"');
  });

  it("lets the VATSIM remarks value break after the slash without changing its text", () => {
    const html = renderToString(<HandbookPage snapshot={snapshot} />);
    expect(html).toMatch(/CALLSIGN[/]<wbr ?[/]?>CROSSROADS/);
    expect(html.replace(/<wbr ?[/]?>/g, "")).toContain("CALLSIGN/CROSSROADS");
  });

  it("keys map legends to the lines drawn and explains shared division counts", () => {
    const total = snapshot.routes.length;
    const legend = text(renderToString(<MapLegend snapshot={snapshot} routes={snapshot.routes} />));
    expect(legend).toContain("Cargo routes dashed");
    // Until a route carries the executive-charter tag, no line is drawn in that division's colour.
    if (!snapshot.routes.some((r) => r.tags.includes("executive-charter"))) expect(legend).not.toContain("Executive Charter");
    const cargo = text(renderToString(<MapLegend snapshot={snapshot} routes={snapshot.routes.filter((r) => r.kind === "cargo")} />));
    expect(cargo).toContain("Cargo Charter");
    expect(cargo).not.toContain("Executive");
    expect(renderToString(<MapLegend snapshot={snapshot} routes={[]} />)).toBe("");
    for (const html of [
      renderToString(<DestinationsPage snapshot={snapshot} />),
      renderToString(<AirportPage snapshot={snapshot} icao="KIND" />),
      renderToString(<TypePage snapshot={snapshot} code="C25C" />),
    ]) expect(html).toContain('aria-label="Map legend"');
    const home = text(renderToString(<HomePage snapshot={snapshot} />));
    expect(home).toContain("Based KTYQ and KIND");
    expect(home).toContain(`of ${total} routes`);
    expect(home).toContain(`so the counts add up to more than ${total}`);
    expect(text(renderToString(<StatsPage snapshot={snapshot} />))).toContain(`add up to more than ${total} routes`);
  });

  it("explains the explorer's keys to keyboards and the two-finger move to touch screens", () => {
    const html = renderToString(<RoutesPage snapshot={snapshot} />);
    expect(text(html)).toContain("Escape to clear");
    expect(html).toContain('aria-label="Route explorer map" aria-describedby="explorer-keys"');
    expect(html).toContain('<p class="fineprint kbd-hint" id="explorer-keys">Keyboard: Tab to the map, arrow keys to move between airports,');
    expect(text(html)).toContain("Choose any airport on the map or in the list");
    expect(text(html)).not.toMatch(/click/i);
    for (const page of [html, renderToString(<DestinationsPage snapshot={snapshot} />), renderToString(<HomePage snapshot={snapshot} />), renderToString(<LivePage snapshot={snapshot} />)]) {
      expect(page).toContain('<p class="map-hint">Use two fingers to move the map.</p>');
    }
    const airport = text(renderToString(<AirportPage snapshot={snapshot} icao="KIND" />));
    expect(airport).toContain("Select a route line to highlight it, or another airport to open its page.");
    expect(airport).not.toMatch(/click/i);
  });

  it("announces only the explorer's route count, not the whole panel", () => {
    const noop = () => undefined;
    const panel = renderToString(<ExplorerPanel snapshot={snapshot} routes={snapshot.routes} selected="KIND" onSelect={noop} selectedRoute={null} onRoute={noop} />);
    expect(panel).toContain('<aside class="explorer__panel" aria-label="Route explorer">');
    expect(panel).not.toContain("aria-live");
    expect(panel.match(/role="status"/g)).toHaveLength(1);
    const start = panel.indexOf('role="status">');
    expect(text(panel.slice(start, panel.indexOf("</p>", start)))).toMatch(/[0-9]+ routes in this view/);
    const empty = text(renderToString(<ExplorerPanel snapshot={snapshot} routes={snapshot.routes} selected={null} onSelect={noop} selectedRoute={null} onRoute={noop} />));
    expect(empty).toContain("Choose an airport");
    expect(empty).toContain("Pick an airport here or on the map");
    expect(empty).not.toMatch(/click/i);
  });

  it("lists each runway strip once, with both ends' true headings", () => {
    const crew: Crew = JSON.parse(readFileSync(new URL("../public/data/crew.json", import.meta.url), "utf-8"));
    const html = renderToString(<RunwayTable icao="KIND" runways={crew.airports.KIND!.runways} />);
    const body = html.slice(html.indexOf("<tbody>"), html.indexOf("</tbody>"));
    expect(body.match(/<tr>/g)).toHaveLength(3);
    expect(html).toContain("<strong>05R/23L</strong>");
    expect(html).not.toContain("23L/05R");
    expect(html).toContain('<span class="sub">135°/315° true</span>');
  });

  it("offers onward legs that share an aircraft type, with the airport name and the shared types", () => {
    const route = findRoute(snapshot, "CRX524")!;
    const back = snapshot.routes.find((r) => r.from === route.to && r.to === route.from);
    const legs = onwardLegs(snapshot.routes, route, back);
    const html = renderToString(<RoutePage snapshot={snapshot} route={route} />);
    const start = html.indexOf('<ul class="onward">');
    const list = html.slice(start, html.indexOf("</ul>", start));
    expect(list.match(/<li>/g)).toHaveLength(legs.length + (back ? 1 : 0));
    for (const { route: leg, shared } of legs) {
      expect(shared.length).toBeGreaterThan(0);
      expect(list).toContain(`href="${routeHref(leg)}"`);
      expect(text(list)).toContain(`${leg.to} ${snapshot.airports[leg.to]!.name} · `);
      expect(text(list)).toContain(` nm · ${shared.join(", ")}`);
    }
  });

  it("planner: radios in one box, an announced same-airport message, types that do not fit folded away", () => {
    const html = renderToString(<PlanPage snapshot={snapshot} />);
    expect(html).toMatch(/<legend>Load<[/]legend><div class="planner__options"><label>/);
    expect(html).toContain('<div role="status"></div>');
    const { suggestions } = suggestFleet(snapshot, { from: "KIND", to: "KLAS", load: 12, cargo: false });
    const fitting = suggestions.filter((s) => s.status === "fits" || s.status === "tight");
    const misfits = suggestions.filter((s) => s.status === "short-range" || s.status === "too-small");
    expect(fitting.length).toBeGreaterThan(0);
    expect(misfits.length).toBeGreaterThan(0);
    const fold = html.indexOf('<details class="suggestions-more">');
    expect(fold).toBeGreaterThan(0);
    expect(text(html.slice(fold))).toContain(`${misfits.length} ${misfits.length === 1 ? "type that does" : "types that do"} not fit`);
    for (const s of fitting) {
      const at = html.indexOf(`href="#/fleet/${s.type.code}"`);
      expect(at, s.type.code).toBeGreaterThan(-1);
      expect(at, s.type.code).toBeLessThan(fold);
    }
    for (const s of misfits) expect(html.indexOf(`href="#/fleet/${s.type.code}"`), s.type.code).toBeGreaterThan(fold);
    expect(html.slice(0, fold)).not.toMatch(/suggestion--(short-range|too-small)/);
    expect(html).not.toContain("suggestion--wrong-role");
  });

  it("names every data table with a caption; the tables that stack on phones keep explicit table roles", () => {
    const c25c = snapshot.fleet.find((f) => f.code === "C25C")!;
    expect(renderToString(<TypePage snapshot={snapshot} code="C25C" />)).toContain(`<caption class="visually-hidden">${c25c.name} at a glance</caption>`);
    expect(renderToString(<RoutePage snapshot={snapshot} route={findRoute(snapshot, "CRX524")} />)).toContain('<caption class="visually-hidden">CRX524 flight facts</caption>');
    const crew: Crew = JSON.parse(readFileSync(new URL("../public/data/crew.json", import.meta.url), "utf-8"));
    expect(renderToString(<RunwayTable icao="KIND" runways={crew.airports.KIND!.runways} />)).toContain('<caption class="visually-hidden">Runways at KIND</caption>');
    const landed = { callsign: "CRX524", flight_number: "524", from: "CYYZ", to: "KIND", aircraft: "E175", landing_rate: -140, duration_min: 95, landed: snapshot.generated_at };
    expect(renderToString(<HomePage snapshot={{ ...snapshot, recent_flights: [landed] }} />)).toContain('<caption class="visually-hidden">Latest flights</caption>');
    const flight = { callsign: "CRX524", flight_number: "524", from: "CYYZ", to: "KIND", phase: "Cruise", aircraft: "E175", aircraft_name: null, registration: null, pilot: null, rank: null, network: null, lat: 42.5, lon: -82.1, altitude_ft: 35000, groundspeed_kt: 450, heading: 225, route_nm: 380, remaining_nm: 120, eta: null };
    const live = renderToString(<LivePage snapshot={{ ...snapshot, live: [flight] }} />);
    expect(live).toContain('<caption class="visually-hidden">Flights in progress</caption>');
    const handbook = renderToString(<HandbookPage snapshot={snapshot} />);
    expect(handbook).toContain('<caption class="visually-hidden">Flight-number blocks</caption>');
    expect(handbook).toContain('<caption class="visually-hidden">Cost index guidance</caption>');
    const roles: Record<string, string> = { thead: "rowgroup", tbody: "rowgroup", tr: "row", th: "columnheader", td: "cell" };
    for (const [html, count] of [[handbook, 2], [live, 1]] as const) {
      expect(html.match(/<table class="table" role="table">/g)).toHaveLength(count);
      for (const [, tag, attrs] of html.matchAll(/<(thead|tbody|tr|th|td)( [^>]*)?>/g)) expect(attrs ?? "", tag).toContain(`role="${roles[tag!]}"`);
    }
  });

  it("pages route lists 25 at a time, in a named table with sortable columns", () => {
    const total = snapshot.routes.length;
    const html = renderToString(<RoutesPage snapshot={snapshot} />);
    const body = html.slice(html.indexOf("<tbody>"), html.indexOf("</tbody>"));
    expect(body.match(/<tr>/g)).toHaveLength(25);
    const page = text(html);
    expect(page).toContain(`Showing 25 of ${total}`);
    expect(page).toContain("Show 25 more");
    expect(page).toContain(`Show all ${total}`);
    expect(page).toContain(`${total} routes shown`);
    expect(page).toContain(`Jump to the ${total} routes`);
    expect(page).toMatch(/Details for CRX\d+/);
    expect(html).toContain('<caption class="visually-hidden">Routes shown</caption>');
    expect(html.match(/class="th-sort"/g)).toHaveLength(5);
    expect(html).not.toContain("aria-sort");
    expect(renderToString(<AirportPage snapshot={snapshot} icao="KIND" />)).toContain('<caption class="visually-hidden">Routes serving KIND</caption>');
    expect(text(renderToString(<TypePage snapshot={snapshot} code="C25C" />))).toContain("Other aircraft");
  });

  it("lists routes on phones as one two-line link per route", () => {
    const divisions = snapshot.airline.divisions;
    const routes = snapshot.routes.filter((r) => routeDivision(r, divisions) >= 0).slice(0, 4);
    const html = renderToString(<RouteRows routes={routes} snapshot={snapshot} />);
    expect(html.match(/<a /g)).toHaveLength(routes.length);
    for (const r of routes) expect(html).toContain(`href="${routeHref(r)}"`);
    expect(text(html)).toContain(divisions[routeDivision(routes[0]!, divisions)]!.name);
    expect(html).toContain('<span class="visually-hidden">to </span>');
  });

  it("search announces its count in one status line, and the 404 offers a search button", () => {
    const html = renderToString(<SearchDialog snapshot={snapshot} open={false} onClose={() => undefined} />);
    expect(html).toContain('<p class="search-dialog__status" role="status">Type an ICAO or IATA code');
    expect(html).toContain('aria-autocomplete="list"');
    expect(html).not.toContain("aria-activedescendant");
    expect(html).not.toContain("search-dialog__empty");
    const notFound = renderToString(<NotFoundPage snapshot={snapshot} />);
    expect(notFound).toMatch(/<button type="button" class="button button--quiet">Search the site<[/]button>/);
    expect(text(notFound)).not.toContain("Press /");
  });

  it("takes division colours from the theme, so dots, accents and bars follow the toggle", () => {
    expect([0, 1, 5, 6, 7, -1].map(divisionColor)).toEqual(["var(--div-0)", "var(--div-1)", "var(--div-5)", "var(--div-0)", "var(--div-1)", "var(--div-5)"]);
    expect(renderToString(<DivisionDot index={2} />)).toContain('style="background:var(--div-2)"');
    expect(renderToString(<HomePage snapshot={snapshot} />)).toContain("--accent:var(--div-0)");
    for (const html of [
      renderToString(<FleetPage snapshot={snapshot} />),
      renderToString(<ServicesPage snapshot={snapshot} />),
      renderToString(<TypePage snapshot={snapshot} code="C510" />),
    ]) expect(html).toContain("--accent:var(--div-");
    expect(renderToString(<StatsPage snapshot={snapshot} />)).toMatch(/background:var[(]--div-[0-5][)]/);
  });

  it("register buttons go to the airline's vAMSYS sign-in page while join_url is unset", async () => {
    const { joinHref } = await import("./pages");
    expect(snapshot.airline.join_url).toBeNull();
    const login = "https://vamsys.io/login/crossroads";
    expect(snapshot.airline.pilot_login_url).toBe(login);
    expect(joinHref(snapshot)).toEqual({ href: login, external: true });
    expect(joinHref({ airline: { ...snapshot.airline, join_url: "https://example.test/join" } }).href).toBe("https://example.test/join");
    expect(joinHref({ airline: { ...snapshot.airline, pilot_login_url: null } }).href).toBe("#/pilots");
    for (const html of [renderToString(<PilotsPage snapshot={snapshot} />), renderToString(<HomePage snapshot={snapshot} />), renderToString(<ResourcesPage snapshot={snapshot} />), renderToString(<CareersPage snapshot={snapshot} />)]) {
      expect(html).toContain(`href="${login}"`);
      expect(html).not.toMatch(/Applications open soon|Apply to fly with us|Apply on vAMSYS/);
    }
    expect(renderToString(<PilotsPage snapshot={snapshot} />)).toContain("Register on vAMSYS");
  });

  it("keeps the page-header text in one block, with the facts or buttons after it", () => {
    expect(renderToString(<PageHeader eyebrow="Fleet" title="From Mustang to 777F" />)).toBe(
      '<header class="page-header"><div class="page-header__inner"><div class="page-header__text"><p class="eyebrow eyebrow--on-ink">Fleet</p><h1 class="page-title">From Mustang to 777F</h1></div></div></header>',
    );
    for (const html of [renderToString(<FleetPage snapshot={snapshot} />), renderToString(<StatsPage snapshot={snapshot} />), renderToString(<AirportPage snapshot={snapshot} icao="KIND" />)]) {
      expect(html).toMatch(/<p class="page-header__lede">[^<]*<[/]p><[/]div><dl class="header-facts">/);
    }
    expect(renderToString(<PilotsPage snapshot={snapshot} />)).toMatch(/<p class="page-header__lede">[^<]*<[/]p><[/]div><div class="hero__actions">/);
  });
});

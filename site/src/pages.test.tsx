// Server-render every new page against the committed snapshot: catches render-time crashes and
// checks the key content without a browser. Leaflet needs a DOM, so the map module is stubbed.
import { readFileSync } from "node:fs";
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { Crew, Snapshot } from "./data";

vi.mock("leaflet", () => ({ default: {} }));
vi.mock("leaflet/dist/leaflet.css", () => ({}));

const { AirportPage, DestinationsPage, ExplorerPanel, NotFoundPage, PlanPage, ResourcesPage, RoutePage, RouteRows, RunwayTable, SearchDialog, StatsPage, TypePage } = await import("./explore-pages");
const { DivisionDot, FleetPage, Leg, LivePage, MapLegend, PageHeader, RoutesPage, HomePage, PilotsPage, bases } = await import("./pages");
const { HandbookPage, CareersPage, NewsPage, ServicesPage } = await import("./info");
const { divisionColor } = await import("./LiveMap");
const { MORE_COUNTRIES, destinationGroups, findRoute, onwardLegs, routeHref, servedAirports, suggestFleet } = await import("./explore");
const { formatNumber, networkFacts, payloadTonnes, routeBase, routeDivision, weatherBoard } = await import("./data");
const { WeatherBoard } = await import("./crew");
const { FLEET_INFO, KTYQ_TYPES, SERVICES, TOURS, baseFor } = await import("./content");
const { capital, numberWord } = await import("./html-facts");

const snapshot: Snapshot = JSON.parse(readFileSync(new URL("../public/data/snapshot.json", import.meta.url), "utf-8"));
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&#x27;/g, "'").replace(/\s+/g, " ");

describe("pages render from the snapshot", () => {
  it("home, fleet and network explorer", () => {
    expect(text(renderToString(<HomePage snapshot={snapshot} />))).toContain("Longest leg");
    const fleet = renderToString(<FleetPage snapshot={snapshot} />);
    expect(fleet).toContain('href="#/fleet/C750"');
    const routes = text(renderToString(<RoutesPage snapshot={snapshot} />));
    const based = snapshot.routes.filter((r) => routeBase(r, bases(snapshot)) !== "").length;
    expect(routes).toContain(`${snapshot.routes.length} routes, ${based} of them to or from Indianapolis`);
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

  it("fleet cards: figures with a small unit, payload in tonnes, the role as the only eyebrow word, a strip without art", () => {
    const html = renderToString(<FleetPage snapshot={snapshot} />);
    for (const f of snapshot.fleet) {
      const info = FLEET_INFO[f.code];
      if (info) {
        expect(html).toContain(`${formatNumber(info.range_nm)}<span class="specs__unit"> nm</span>`);
        expect(html).toContain(`${info.cruise_kt}<span class="specs__unit"> kt</span>`);
        expect(text(html)).toContain(`${f.code} · ${info.role}`);
      }
      if ((f.type === "cargo" || f.type === "cargo-containers") && f.max_cargo != null) {
        expect(html).toContain(`<dt>Payload</dt><dd>${formatNumber(payloadTonnes(f.max_cargo, f.weight_unit))}<span class="specs__unit"> t</span></dd>`);
      }
    }
    expect(text(html)).not.toMatch(/· (Freighter|Passenger) ·/);
    const bare = snapshot.fleet.filter((f) => !FLEET_INFO[f.code]?.livery && !f.image).length;
    expect(bare).toBeGreaterThan(0);
    expect(html.match(/fleet-card__media--empty/g)).toHaveLength(bare);
    expect(html.match(/>Specs and routes/g)).toHaveLength(snapshot.fleet.length);
    expect(html).not.toContain("Specs, range ring");
  });

  it("services: each aircraft pill opens its own type page", () => {
    const html = renderToString(<ServicesPage snapshot={snapshot} />);
    const pills = [...html.matchAll(/<a class="chip chip--link" href="([^"]*)"/g)].map((m) => m[1]);
    expect(pills.length).toBeGreaterThan(1);
    for (const href of pills) expect(href).toMatch(/^#[/]fleet[/][A-Z0-9]+$/);
    expect(pills).toContain("#/fleet/C510");
    expect(html).not.toContain('href="#/fleet"');
  });

  it("in-page jumps: Contents links carry their section's address, and the jump targets take focus", () => {
    const html = renderToString(<HandbookPage snapshot={snapshot} />);
    const links = [...html.matchAll(/<a href="#[/]handbook[?]s=([a-z]+)">/g)].map((m) => m[1]);
    const sections = [...html.matchAll(/<section id="hb-([a-z]+)" class="hb-section" tabindex="-1">/g)].map((m) => m[1]);
    expect(links).toHaveLength(7);
    expect(links).toEqual(sections);
    expect(html).not.toContain('href="#/handbook"');
    const services = renderToString(<ServicesPage snapshot={snapshot} />);
    const shown = SERVICES.filter((s) => snapshot.airline.divisions.some((d) => d.name === s.division));
    expect(services.match(/<section id="service-[a-z-]+" class="page service" tabindex="-1"/g)).toHaveLength(shown.length);
    for (const page of [html, services]) expect(page).not.toMatch(/href="#[^/]/);
  });

  it("destinations: a group per big country and More countries, a jump button each, an announced count", () => {
    const list = servedAirports(snapshot);
    const groups = destinationGroups(list, list);
    const html = renderToString(<DestinationsPage snapshot={snapshot} />);
    expect(html).toContain(`<p class="filters__count" role="status">${list.length} of ${list.length} airports</p>`);
    const headings = [...html.matchAll(/<h2 id="dest-[a-z0-9-]+" tabindex="-1">([^<]*)/g)].map((m) => m[1]?.trim());
    expect(headings).toEqual(groups.map((g) => g.title));
    const buttons = [...html.matchAll(/<button type="button" class="chip-button">([^<]*)<[/]button>/g)].map((m) => m[1]);
    expect(buttons).toEqual(groups.map((g) => g.title));
    expect(html).not.toMatch(/href="#[^/]/);
    expect(html.match(/class="dest-card"/g)).toHaveLength(list.length);
    const more = groups.find((g) => g.title === MORE_COUNTRIES);
    expect(more?.items.length).toBeGreaterThan(0);
    const page = text(html);
    for (const a of more?.items ?? []) expect(page).toContain(` ${a.airport?.country ?? "Other"} · ${a.routes} ${a.routes === 1 ? "route" : "routes"} `);
  });

  it("destinations on phones: the United States opens with its 12 busiest airports and a Show all button", () => {
    const list = servedAirports(snapshot);
    const us = destinationGroups(list, list)[0]!;
    expect(us.items.length).toBeGreaterThan(12);
    vi.stubGlobal("window", { matchMedia: () => ({ matches: true, addEventListener: () => undefined, removeEventListener: () => undefined }) });
    try {
      const html = renderToString(<DestinationsPage snapshot={snapshot} />);
      const start = html.indexOf('<h2 id="dest-united-states"');
      const group = html.slice(start, html.indexOf("</div>", start));
      expect(group.match(/class="dest-card"/g)).toHaveLength(12);
      for (const a of us.items.slice(0, 12)) expect(group).toContain(`href="#/airport/${a.icao}"`);
      expect(group).toContain(`>Show all ${us.items.length}</button>`);
      expect(html.match(/class="dest-card"/g)).toHaveLength(list.length - us.items.length + 12);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("crew weather board: the counts, the airports that are not VFR, and a button for the rest", () => {
    const crew: Crew = JSON.parse(readFileSync(new URL("../public/data/crew.json", import.meta.url), "utf-8"));
    const board = weatherBoard(crew.airports);
    const html = renderToString(<WeatherBoard airports={crew.airports} />);
    expect(html).toContain(`<p class="muted wx-board__summary">${board.summary}</p>`);
    expect(html.match(/<li class="wx-tile /g) ?? []).toHaveLength(board.first.length);
    for (const [icao] of board.vfr) expect(html).not.toContain(`<strong>${icao}</strong>`);
    if (board.vfr.length) expect(html).toContain(`aria-expanded="false" aria-controls="wx-tiles">Show all ${board.first.length + board.vfr.length} airports</button>`);
  });

  it("names repeated links by where they go, hides the arrows, and reads a leg as 'to'", () => {
    // Markup as served, without the comments React puts between adjacent text nodes.
    const render = (node: Parameters<typeof renderToString>[0]) => renderToString(node).replace(/<!-- -->/g, "");
    const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/'/g, "&#x27;");
    const leg = render(<Leg from="KIND" to="KLAS" snapshot={snapshot} />);
    expect(leg).toContain('<span class="leg__arrow" aria-hidden="true">→</span><span class="visually-hidden"> to </span>');
    expect(leg).not.toContain('aria-label="to"');
    const home = render(<HomePage snapshot={snapshot} />);
    for (const d of snapshot.airline.divisions) expect(home).toContain(`Sample itinerary<span class="visually-hidden">: ${esc(d.name)}</span> <span aria-hidden="true">→</span>`);
    const fleet = render(<FleetPage snapshot={snapshot} />);
    for (const f of snapshot.fleet) {
      expect(fleet).toContain(`Specs and routes<span class="visually-hidden"> for the ${esc(f.name)}</span> <span aria-hidden="true">→</span>`);
      expect(fleet).toContain(`On the map<span class="visually-hidden">: ${esc(f.name)} routes</span> <span aria-hidden="true">→</span>`);
    }
    const services = render(<ServicesPage snapshot={snapshot} />);
    const briefings = services.match(/Open the briefing<span class="visually-hidden"> for CRX[0-9]+<[/]span> <span aria-hidden="true">→<[/]span>/g) ?? [];
    expect(briefings.length).toBeGreaterThan(0);
    expect(briefings).toHaveLength((services.match(/Open the briefing/g) ?? []).length);
    const resources = render(<ResourcesPage snapshot={snapshot} />);
    expect(resources.match(/<h3 class="h3"><a href="https:/g)).toHaveLength(3);
    expect(resources).not.toMatch(/<h2 class="h3"><a /);
  });
});

describe("texts follow the data", () => {
  it("counts the KTYQ types and the tours instead of typing them; the empty Events box points to the tours", () => {
    expect(snapshot.fleet.filter((f) => baseFor(f.code) === "KTYQ")).toHaveLength(KTYQ_TYPES.length);
    expect(text(renderToString(<ServicesPage snapshot={snapshot} />))).toContain(`${capital(numberWord(KTYQ_TYPES.length))} light and mid-size types at KTYQ, from the Mustang`);
    const careers = renderToString(<CareersPage snapshot={snapshot} />);
    expect(careers).toContain(`<h2>${capital(numberWord(TOURS.length))} ${TOURS.length === 1 ? "tour" : "tours"} in vAMSYS Activities</h2>`);
    expect(careers.match(/<li class="tour">/g)).toHaveLength(TOURS.length);
    const news = renderToString(<NewsPage snapshot={{ ...snapshot, events: [] }} />);
    expect(news).toContain('<p class="empty">No group flights are scheduled yet. Open tours are on the <a href="#/careers">Careers page</a>.</p>');
  });

  it("counts a base's routes as its destinations card does, and the destinations apart from the bases", () => {
    const baseList = bases(snapshot);
    const list = servedAirports(snapshot);
    const home = text(renderToString(<HomePage snapshot={snapshot} />));
    for (const icao of baseList) {
      const routes = snapshot.routes.filter((r) => r.from === icao || r.to === icao).length;
      expect(list.find((a) => a.icao === icao)?.routes).toBe(routes);
      expect(home).toContain(`${snapshot.fleet.filter((f) => baseFor(f.code) === icao).length} types based here · ${routes} routes`);
    }
    expect(home).toContain(`${snapshot.routes.length} routes, most of them from ${numberWord(baseList.length)} Indianapolis bases, and one career path.`);
    const destinations = networkFacts(snapshot).destinations;
    expect(destinations).toBe(list.length - baseList.length);
    const page = text(renderToString(<DestinationsPage snapshot={snapshot} />));
    expect(page).toContain(`${destinations} destinations plus our ${numberWord(baseList.length)} Indianapolis bases. Every airport Crossroads flies to`);
  });
});

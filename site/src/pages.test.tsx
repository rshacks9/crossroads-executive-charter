// Server-render every new page against the committed snapshot: catches render-time crashes and
// checks the key content without a browser. Leaflet needs a DOM, so the map module is stubbed.
import { readFileSync } from "node:fs";
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { Crew, LiveFlight, RecentFlight, Snapshot } from "./data";

vi.mock("leaflet", () => ({ default: {} }));
vi.mock("leaflet/dist/leaflet.css", () => ({}));

const { AirportPage, DestinationsPage, ExplorerPanel, NotFoundPage, PlanPage, ResourcesPage, RoutePage, RouteRows, RunwayTable, SearchDialog, StatsPage, TypePage } = await import("./explore-pages");
const { AUTOMATION_DISCLOSURE, AUTOMATION_LABEL, DISCORD_LABEL, DivisionDot, FleetPage, HOW_TO_JOIN, JOIN_TERMS, SETUP_FLIGHTS, Leg, LivePage, MapLegend, NEW_AIRLINE, NewsCard, PageHeader, REGISTER_LABEL, RoutesPage, HomePage, PilotsPage, SETUP_NOTE, bases, joinHref, registrationOpen, shortName } = await import("./pages");
const { AboutPage, HandbookPage, CareersPage, NewsPage, ServicesPage, groupFlightNote } = await import("./info");
const { divisionColor } = await import("./LiveMap");
const { MORE_COUNTRIES, defaultSimTypes, destinationGroups, findRoute, firstFlight, networkStats, onwardLegs, routeHref, routeKey, routesForTypes, servedAirports, suggestFleet } = await import("./explore");
const { formatNumber, networkFacts, nextWeekly, payloadTonnes, routeBase, routeDivision, weatherBoard, weeklyTime } = await import("./data");
const { CrewPage, WeatherBoard } = await import("./crew");
const { Footer } = await import("./App");
const { FLEET_INFO, KTYQ_TYPES, NEWS, RULES_URL, SERVICES, SOP_RULES, TOURS, VATSIM_REMARKS, baseFor } = await import("./content");
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

  it("gives one VATSIM remarks string, CALLSIGN/CROSSROADS, wherever it tells pilots what to file", () => {
    expect(VATSIM_REMARKS).toBe("CALLSIGN/CROSSROADS");
    const pages = [HandbookPage, PilotsPage, ResourcesPage, CareersPage, NewsPage].map((Page) => text(renderToString(<Page snapshot={snapshot} />).replace(/<wbr ?[/]?>/g, "")));
    for (const page of pages) {
      for (const remark of page.match(/[A-Z]+[/]CROSSROADS[A-Z]*/g) ?? []) expect(remark).toBe(VATSIM_REMARKS);
      expect(page).not.toMatch(/RMK[/]|CROSSROADS VIRTUAL/);
    }
    expect(pages[0]).toContain(`put ${VATSIM_REMARKS} in your flight plan remarks`);
    expect(pages[1]).toContain(`put ${VATSIM_REMARKS} in your flight plan remarks`);
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
    expect(html).toContain('<p class="fineprint kbd-hint" id="explorer-keys">Keyboard: Tab to an airport on the map, arrow keys to move between airports,');
    expect(text(html)).toContain("Choose any airport on the map or in the list");
    expect(text(html)).not.toMatch(/click/i);
    for (const page of [html, renderToString(<DestinationsPage snapshot={snapshot} />), renderToString(<HomePage snapshot={snapshot} />), renderToString(<LivePage snapshot={snapshot} />)]) {
      expect(page).toContain('<p class="map-hint">Use two fingers to move the map.</p>');
    }
    const airport = text(renderToString(<AirportPage snapshot={snapshot} icao="KIND" />));
    expect(airport).toContain("Select a route line to highlight it, or another airport to open its page.");
    expect(airport).not.toMatch(/click/i);
  });

  it("announces only the explorer's route count, from a live region that is there before an airport is chosen", () => {
    const noop = () => undefined;
    const panel = renderToString(<ExplorerPanel snapshot={snapshot} routes={snapshot.routes} selected="KIND" onSelect={noop} selectedRoute={null} onRoute={noop} />);
    expect(panel).toContain('<aside class="explorer__panel" aria-label="Route explorer">');
    expect(panel).not.toContain("aria-live");
    expect(panel.match(/role="status"/g)).toHaveLength(1);
    const start = panel.indexOf('role="status">');
    expect(text(panel.slice(start, panel.indexOf("</p>", start)))).toMatch(/[0-9]+ routes in this view/);
    // With no airport the same element is in place, empty: a region added along with its text is often not read out.
    const emptyHtml = renderToString(<ExplorerPanel snapshot={snapshot} routes={snapshot.routes} selected={null} onSelect={noop} selectedRoute={null} onRoute={noop} />);
    expect(emptyHtml.match(/role="status"/g)).toHaveLength(1);
    expect(emptyHtml).toContain('<div class="explorer__airport"><p class="visually-hidden" role="status"></p><p class="explorer__hint">');
    const empty = text(emptyHtml);
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

  it("links to every departure from the arrival airport when fewer than three legs share a type", () => {
    const backOf = (r: (typeof snapshot.routes)[number]) => snapshot.routes.find((b) => b.from === r.to && b.to === r.from);
    const few = snapshot.routes.find((r) => onwardLegs(snapshot.routes, r, backOf(r)).length < 3)!;
    const html = renderToString(<RoutePage snapshot={snapshot} route={few} />);
    expect(html).toMatch(new RegExp(`<a class="text-link" href="#/airport/${few.to}">All departures from ${few.to}`));
    const full = findRoute(snapshot, "CRX524")!;
    expect(onwardLegs(snapshot.routes, full, backOf(full)).length).toBeGreaterThanOrEqual(3);
    expect(text(renderToString(<RoutePage snapshot={snapshot} route={full} />))).not.toContain("All departures from");
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

  it("while join_url is unset, join buttons say How to join and lead to Fly with us, which says registration isn't open", () => {
    expect(snapshot.airline.join_url).toBeNull();
    const login = "https://vamsys.io/login/crossroads";
    expect(snapshot.airline.pilot_login_url).toBe(login);
    expect(registrationOpen(snapshot)).toBe(false);
    expect(joinHref(snapshot)).toEqual({ href: "#/pilots", external: false });
    for (const html of [renderToString(<HomePage snapshot={snapshot} />), renderToString(<CareersPage snapshot={snapshot} />)]) {
      expect(html).toContain(`<a class="button" href="#/pilots">${HOW_TO_JOIN}</a>`);
      // The sign-in page is no way in for new pilots: its Create Account link bounces while sign-up is closed.
      expect(html).not.toContain(`href="${login}" rel="noopener">${REGISTER_LABEL}`);
      expect(html).not.toContain(`>${REGISTER_LABEL}</a>`);
    }
    expect(renderToString(<HomePage snapshot={snapshot} />)).not.toContain(`href="${login}"`);
    const pilots = renderToString(<PilotsPage snapshot={snapshot} />);
    expect(text(pilots)).toContain("Registration isn't open yet. Crossroads is brand new, and its sign-up page on vAMSYS isn't taking new pilots yet.");
    expect(text(pilots)).toContain("Not open yet: see the note at the top of this page.");
    expect(pilots).toContain(`href="${login}" rel="noopener">Existing pilots: log in</a>`);
    expect(pilots).not.toContain(`>${REGISTER_LABEL}</a>`);
    expect(renderToString(<ResourcesPage snapshot={snapshot} />)).not.toContain('class="button button--ghost"');
  });

  it("once join_url is set, every join button goes straight to the vAMSYS sign-up page", () => {
    const signup = "https://vamsys.io/register/crossroads";
    const open: Snapshot = { ...snapshot, airline: { ...snapshot.airline, join_url: signup } };
    expect(registrationOpen(open)).toBe(true);
    expect(joinHref(open)).toEqual({ href: signup, external: true });
    for (const html of [renderToString(<PilotsPage snapshot={open} />), renderToString(<HomePage snapshot={open} />), renderToString(<ResourcesPage snapshot={open} />), renderToString(<CareersPage snapshot={open} />)]) {
      expect(html).toContain(`href="${signup}" rel="noopener">${REGISTER_LABEL}</a>`);
      expect(text(html)).not.toContain("isn't open yet");
    }
    expect(renderToString(<PilotsPage snapshot={open} />)).toContain(`<a class="text-link" href="${signup}" rel="noopener">Crossroads sign-up page on vAMSYS`);
    expect(renderToString(<HomePage snapshot={open} />)).toContain(`<a class="button button--ghost" href="#/pilots">${HOW_TO_JOIN}</a>`);
  });

  it("uses one label per action: no retired join or booking labels on any page, open or closed", () => {
    const open: Snapshot = { ...snapshot, airline: { ...snapshot.airline, join_url: "https://vamsys.io/register/crossroads" } };
    for (const s of [snapshot, open]) {
      for (const html of [HomePage, PilotsPage, CareersPage, ResourcesPage].map((Page) => renderToString(<Page snapshot={s} />))) {
        expect(html).not.toMatch(/>(Applications open soon|Apply to fly with us|Apply on vAMSYS|Join Crossroads|Start as a Cadet|How it works|How a flight works|Book this flight in Phoenix)</);
      }
    }
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
  it("counts the KTYQ types and the tours instead of typing them; the empty Events box points to the tours too", () => {
    expect(snapshot.fleet.filter((f) => baseFor(f.code) === "KTYQ")).toHaveLength(KTYQ_TYPES.length);
    expect(text(renderToString(<ServicesPage snapshot={snapshot} />))).toContain(`${capital(numberWord(KTYQ_TYPES.length))} light and mid-size types at KTYQ, from the Piper M600 to the Citation`);
    const careers = renderToString(<CareersPage snapshot={snapshot} />);
    expect(careers).toContain(`<h2>${capital(numberWord(TOURS.length))} ${TOURS.length === 1 ? "tour" : "tours"} to fly</h2>`);
    // One name for where the tours are (Events in Phoenix), and no badges: the vAMSYS Badges module is off.
    expect(text(careers)).toContain("Register for a tour under Events in Phoenix");
    expect(text(careers)).not.toMatch(/badge|Activities/i);
    for (const item of NEWS) expect(`${item.title} ${item.body}`).not.toMatch(/badge|under Activities/i);
    expect(careers.match(/<li class="tour">/g)).toHaveLength(TOURS.length);
    const news = text(renderToString(<NewsPage snapshot={{ ...snapshot, events: [] }} />));
    expect(news).toContain("every week. Open tours are on the Careers page");
    expect(renderToString(<NewsPage snapshot={{ ...snapshot, events: [] }} />)).toContain('Open tours are on the <a href="#/careers">Careers page</a>.</p>');
  });

  it("counts the bases, ranks and divisions it names from the data, and words them as the copy did", () => {
    const ladder = snapshot.ranks.filter((r) => !r.honorary);
    // The airline as it is: the words the copy used to type by hand.
    expect([bases(snapshot).length, ladder.length, snapshot.airline.divisions.length]).toEqual([2, 6, 4]);
    const homeHtml = renderToString(<HomePage snapshot={snapshot} />);
    const home = text(homeHtml);
    for (const phrase of ["Two bases, one airline", "Two airports, real logic", "Six ranks from Cadet to Chief Pilot, earned", "Four divisions Pick your flying", "types across four divisions on one schedule."]) expect(home).toContain(phrase);
    expect(homeHtml).toContain('aria-label="Our two bases"');
    expect(text(renderToString(<CareersPage snapshot={snapshot} />))).toContain("Six ranks, earned with flight hours and accepted PIREPs.");
    expect(text(renderToString(<ServicesPage snapshot={snapshot} />))).toContain("Four kinds of flying, one airline");
    expect(text(renderToString(<PilotsPage snapshot={snapshot} />))).toContain("Indianapolis, two airports");
    expect(text(renderToString(<RoutesPage snapshot={snapshot} />))).toContain("Both bases and point-to-point");

    // Another airline: three bases, four ranks and three divisions. Every count follows the data.
    const hub = snapshot.hubs[0]!;
    const other: Snapshot = {
      ...snapshot,
      hubs: [{ ...hub, airports: [...hub.airports, "KBAF"] }, ...snapshot.hubs.slice(1)],
      ranks: ladder.slice(0, 4),
      airline: { ...snapshot.airline, divisions: snapshot.airline.divisions.slice(0, 3) },
    };
    const pages = [HomePage, CareersPage, ServicesPage, PilotsPage, RoutesPage].map((Page) => renderToString(<Page snapshot={other} />));
    const all = pages.map(text).join(" ");
    for (const phrase of [
      "Three bases, one airline", "Three airports, real logic", "Four ranks from Cadet to Senior Captain, earned", "Three divisions Pick your flying",
      "types across three divisions on one schedule.", "Four ranks, earned with flight hours", "Three kinds of flying, one airline",
      "Indianapolis, three airports", "All bases and point-to-point",
    ]) expect(all).toContain(phrase);
    expect(pages[0]).toContain('aria-label="Our three bases"');
    expect(all).not.toMatch(/\b(two bases|two airports|six ranks|four divisions|four kinds|both bases)\b/i);
  });

  it("counts the walkthrough steps and the SOP rules it lists", () => {
    const pilots = renderToString(<PilotsPage snapshot={snapshot} />);
    const steps = pilots.match(/<li class="walkthrough__step">/g)?.length ?? 0;
    expect(steps).toBeGreaterThan(1);
    expect(text(pilots)).toContain(`${capital(numberWord(steps))} steps from vAMSYS sign-up to your first accepted PIREP.`);
    const resources = renderToString(<ResourcesPage snapshot={snapshot} />);
    const start = resources.indexOf('<ol class="sop-brief">');
    const rules = resources.slice(start, resources.indexOf("</ol>", start)).match(/<li>/g)?.length ?? 0;
    expect(rules).toBeGreaterThan(1);
    expect(text(resources)).toContain(`SOPs in brief The ${numberWord(rules)} rules`);
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

  it("names the longest leg's airports in the order it flies them", () => {
    const { longest } = networkStats(snapshot);
    if (!longest) throw new Error("the snapshot has no routes");
    const name = (icao: string) => snapshot.airports[icao]?.name ?? icao;
    const home = text(renderToString(<HomePage snapshot={snapshot} />));
    expect(home).toContain(`Longest leg ${routeKey(longest)} ${name(longest.from)} to ${name(longest.to)} · ${formatNumber(longest.distance_nm)} nm`);
  });

  it("labels the country figure 'Countries and territories' and defines international by the 50 states", () => {
    const stats = networkStats(snapshot);
    const countries = networkFacts(snapshot).countries;
    expect(stats.countries).toBe(countries);
    const page = renderToString(<StatsPage snapshot={snapshot} />);
    expect(page).toContain(`<dt>Countries and territories</dt><dd>${countries}</dd>`);
    expect(text(page)).toContain("International means at least one end outside the 50 states.");
    const home = renderToString(<HomePage snapshot={{ ...snapshot, stats: { ...snapshot.stats, all_time: null } }} />);
    expect(home).toContain(`<span class="stat__value">${countries}</span><span class="stat__label">Countries and territories</span>`);
    expect(renderToString(<AboutPage snapshot={snapshot} />)).toContain(`<dt>Countries and territories</dt><dd>${countries}</dd>`);
  });

  it("dates news day first with the month in full; the type table says 'Type code'", () => {
    const card = text(renderToString(<NewsCard item={{ date: "2026-11-11", kind: "News", title: "Title", body: "Body" }} />));
    expect(card).toContain("11 November 2026");
    expect(card).not.toContain("Nov 11");
    for (const f of snapshot.fleet) {
      const html = renderToString(<TypePage snapshot={snapshot} code={f.code} />);
      expect(html).toContain(`<th scope="row">Type code</th><td>${f.code}</td>`);
      expect(html).not.toContain("ICAO type");
    }
  });

  it("says 'fictional' in the first screen", () => {
    expect(renderToString(<HomePage snapshot={snapshot} />)).toContain('<p class="eyebrow eyebrow--on-ink">Fictional virtual airline for flight simulation · Indianapolis, Indiana</p>');
  });
});

describe("flights flown by automation", () => {
  const inAir = (callsign: string, automation?: boolean): LiveFlight => ({
    callsign, flight_number: null, from: "KTYQ", to: "KMDW", phase: "Cruise", aircraft: "PRM1", aircraft_name: null, registration: null, pilot: null, rank: null, network: null,
    lat: 41, lon: -87, altitude_ft: 25000, groundspeed_kt: 400, heading: 300, route_nm: 150, remaining_nm: 60, eta: null, ...(automation === undefined ? {} : { automation }),
  });
  const landed = (callsign: string, automation?: boolean): RecentFlight => ({
    callsign, flight_number: null, from: "KMDW", to: "KTYQ", aircraft: "C510", landing_rate: -97, duration_min: 40, landed: snapshot.generated_at, ...(automation === undefined ? {} : { automation }),
  });
  // The visible words, then the sentence a screen reader hears with them.
  const label = `<span class="tag tag--automation">${AUTOMATION_LABEL}<span class="visually-hidden">: one of the founder&#x27;s own flights, flown with his automation tools while he monitors it</span></span>`;
  const count = (html: string) => html.split(label).length - 1;
  const busy: Snapshot = { ...snapshot, live: [inAir("CRX115", true), inAir("CRX301", false), inAir("CRX302")], recent_flights: [landed("CRX116", true), landed("CRX303", false), landed("CRX304")] };

  it("labels a listed flight on the live board, the live cards and the latest flights, with words for screen readers", () => {
    expect(AUTOMATION_LABEL).toBe("Flown by automation");
    const live = renderToString(<LivePage snapshot={busy} />);
    expect(count(live)).toBe(1);
    const row = live.slice(live.indexOf("<strong>CRX115</strong>"));
    expect(row.indexOf(label)).toBeLessThan(row.indexOf("</tr>"));
    const home = renderToString(<HomePage snapshot={busy} />);
    // One live card (CRX115) and one latest-flights row (CRX116).
    expect(count(home)).toBe(2);
    expect(home.slice(home.indexOf("<strong>CRX116</strong>")).indexOf(label)).toBeLessThan(home.slice(home.indexOf("<strong>CRX116</strong>")).indexOf("</tr>"));
  });

  it("puts the label on its own line: its rule comes after the base tag rule it overrides", () => {
    const css = readFileSync(new URL("./styles.css", import.meta.url), "utf-8").split("\n");
    const base = css.findIndex((line) => line.startsWith(".tag {"));
    const own = css.findIndex((line) => line.startsWith(".tag--automation {"));
    expect(base).toBeGreaterThan(-1);
    expect(own).toBeGreaterThan(base);
    expect(css[own]).toContain("display: flex;");
  });

  it("labels nothing that is not listed", () => {
    const quiet: Snapshot = { ...busy, live: busy.live.map((f) => ({ ...f, automation: false })), recent_flights: busy.recent_flights.map((f) => ({ ...f, automation: undefined })) };
    for (const html of [renderToString(<LivePage snapshot={quiet} />), renderToString(<HomePage snapshot={quiet} />)]) expect(html).not.toContain("tag--automation");
  });

  it("discloses on the Live page that the founder flies some of his own flights with automation he monitors", () => {
    expect(AUTOMATION_DISCLOSURE).toBe("Some of the founder's own flights are flown with his automation tools, which he monitors.");
    for (const s of [snapshot, busy]) expect(text(renderToString(<LivePage snapshot={s} />))).toContain(AUTOMATION_DISCLOSURE);
  });

  it("lists the three setup test flights in automation_flights by booking, so live data labels them too", () => {
    const config = JSON.parse(readFileSync(new URL("../../site.config.json", import.meta.url), "utf-8"));
    const listed: { booking_id?: unknown; pirep_id?: unknown; note?: string }[] = config.automation_flights;
    expect(SETUP_FLIGHTS.map((f) => f.callsign)).toEqual(["CRX115", "CRX116", "CRX121"]);
    // Each by the booking it was flown from: a callsign is shared by every pilot on the route, so the sync never matches one.
    for (const flight of SETUP_FLIGHTS) {
      expect(listed.filter((e) => typeof e.booking_id === "number" && (e.note ?? "").startsWith(`${flight.callsign} `)), flight.callsign).toHaveLength(1);
    }
    const whole = (value: unknown) => typeof value === "number" && Number.isInteger(value) && value > 0;
    for (const entry of listed) expect(whole(entry.booking_id) || whole(entry.pirep_id), JSON.stringify(entry)).toBe(true);
  });
});

describe("the Discord link", () => {
  // A stand-in address for the test only: site.config.json keeps discord_url null until the Discord exists.
  const invite = "https://discord.example/crossroads";
  const withDiscord: Snapshot = { ...snapshot, airline: { ...snapshot.airline, discord_url: invite } };
  const everyPage = (s: Snapshot) => [
    ...[HomePage, FleetPage, RoutesPage, DestinationsPage, ServicesPage, PlanPage, LivePage, CareersPage, HandbookPage, ResourcesPage, StatsPage, CrewPage, NewsPage, AboutPage, PilotsPage, NotFoundPage].map((Page) => renderToString(<Page snapshot={s} />)),
    renderToString(<AirportPage snapshot={s} icao="KIND" />),
    renderToString(<TypePage snapshot={s} code="C510" />),
    renderToString(<RoutePage snapshot={s} route={findRoute(s, "CRX115")} />),
    renderToString(<Footer snapshot={s} />),
  ];

  it("shows nothing about Discord while discord_url is null", () => {
    const config = JSON.parse(readFileSync(new URL("../../site.config.json", import.meta.url), "utf-8"));
    expect(config.discord_url).toBeNull();
    expect(snapshot.airline.discord_url).toBeNull();
    for (const html of [...everyPage(snapshot), renderToString(<Footer snapshot={null} />)]) expect(html).not.toMatch(/discord/i);
  });

  it("links Join the Discord on the join page and in the footer once discord_url is set", () => {
    expect(DISCORD_LABEL).toBe("Join the Discord");
    const link = `href="${invite}" rel="noopener">${DISCORD_LABEL}</a>`;
    expect(renderToString(<PilotsPage snapshot={withDiscord} />)).toContain(`<a class="button button--ghost" ${link}`);
    expect(renderToString(<Footer snapshot={withDiscord} />)).toContain(`<li><a ${link}</li>`);
    // Only those two places link it.
    expect(everyPage(withDiscord).filter((html) => html.includes(invite))).toHaveLength(2);
  });
});

describe("the weekly group flight", () => {
  const sunday = { weekday: "Sunday", utc: "20:00" };

  it("comes from one value in site.config.json, shown in UTC and Indianapolis time", () => {
    const config = JSON.parse(readFileSync(new URL("../../site.config.json", import.meta.url), "utf-8"));
    expect(config.group_flight).toEqual(sunday);
    expect(snapshot.airline.group_flight).toEqual(sunday);
    // Indianapolis keeps daylight saving, so 20:00Z is 15:00 there in winter and 16:00 in summer.
    expect(weeklyTime(sunday, new Date("2026-11-12T12:00:00Z"))).toBe("Sundays at 20:00Z (15:00 Indianapolis)");
    expect(weeklyTime(sunday, new Date("2027-07-01T12:00:00Z"))).toBe("Sundays at 20:00Z (16:00 Indianapolis)");
    // The next one: later the same Sunday, or the Sunday after once it has started.
    expect(nextWeekly(sunday, new Date("2026-11-12T12:00:00Z"))?.toISOString()).toBe("2026-11-15T20:00:00.000Z");
    expect(nextWeekly(sunday, new Date("2026-11-15T19:59:00Z"))?.toISOString()).toBe("2026-11-15T20:00:00.000Z");
    expect(nextWeekly(sunday, new Date("2026-11-15T20:01:00Z"))?.toISOString()).toBe("2026-11-22T20:00:00.000Z");
    // A UTC time that falls on another day in Indianapolis names that day.
    expect(weeklyTime({ weekday: "Monday", utc: "02:00" }, new Date("2026-11-12T12:00:00Z"))).toBe("Mondays at 02:00Z (Sunday 21:00 Indianapolis)");
    for (const bad of [{ weekday: "Sun", utc: "20:00" }, { weekday: "Sunday", utc: "8pm" }, { weekday: "Sunday", utc: "24:00" }]) expect(weeklyTime(bad, new Date())).toBeNull();
  });

  it("says on the News page that it starts once registration opens and that the founder flies it every week", () => {
    const when = weeklyTime(sunday, new Date(snapshot.generated_at));
    const closed = text(renderToString(<NewsPage snapshot={{ ...snapshot, events: [] }} />));
    expect(closed).toContain(`A weekly group flight on ${when} starts once registration opens, and the founder flies it every week. Open tours are on the Careers page`);
    expect(closed).toMatch(/on Sundays at 20:00Z [(]1[56]:00 Indianapolis[)] starts/);
    expect(closed).not.toContain("No group flights are scheduled yet");
    const open: Snapshot = { ...snapshot, events: [], airline: { ...snapshot.airline, join_url: "https://vamsys.io/register/crossroads" } };
    expect(groupFlightNote(open)).toBe(`The weekly group flight is on ${when}, and the founder flies it every week.`);
    expect(text(renderToString(<NewsPage snapshot={open} />))).not.toContain("once registration opens");
    // With no group flight set, the box says so.
    const none: Snapshot = { ...snapshot, events: [], airline: { ...snapshot.airline, group_flight: null } };
    expect(groupFlightNote(none)).toBeNull();
    expect(text(renderToString(<NewsPage snapshot={none} />))).toContain("No group flights are scheduled yet. Open tours are on the Careers page");
  });
});

describe("the KTYQ base rule", () => {
  // The Piper M600, a single-engine turboprop, is based at KTYQ. Copy that says what works from KTYQ
  // says "light and mid-size aircraft" or names the M600; it never says "jets".
  const JETS = /\bjets\b/i;
  const KTYQ = /\b(KTYQ|Indianapolis Executive)\b/;
  // How the site words the base rule: what KTYQ takes, what works, lives or starts there, and
  // everything larger at KIND.
  const RULE = /everything (larger|bigger)|larger aircraft|base rules?|right base|\btakes\b|sized for|\b(work|works|live|lives|start|starts)\b/i;
  const ruleSentences = (page: string) => page.split(/(?<=[.!?])\s+/).filter((s) => KTYQ.test(s) && RULE.test(s));

  it("is the base of the M600, which is not a jet", () => {
    expect(baseFor("M600")).toBe("KTYQ");
    expect(KTYQ_TYPES).toContain("M600");
    expect(FLEET_INFO.M600!.role).toMatch(/turboprop/i);
  });

  it("never says jets where a page says what works from KTYQ", () => {
    const pages: [string, string][] = [
      ["home", renderToString(<HomePage snapshot={snapshot} />)],
      ["fleet", renderToString(<FleetPage snapshot={snapshot} />)],
      ["pilots", renderToString(<PilotsPage snapshot={snapshot} />)],
      ["services", renderToString(<ServicesPage snapshot={snapshot} />)],
      ["careers", renderToString(<CareersPage snapshot={snapshot} />)],
      ["handbook", renderToString(<HandbookPage snapshot={snapshot} />)],
      ["about", renderToString(<AboutPage snapshot={snapshot} />)],
      ["news", renderToString(<NewsPage snapshot={snapshot} />)],
      ["resources", renderToString(<ResourcesPage snapshot={snapshot} />)],
      ["plan", renderToString(<PlanPage snapshot={snapshot} />)],
      ["airport", renderToString(<AirportPage snapshot={snapshot} icao="KTYQ" />)],
    ];
    const stating: string[] = [];
    for (const [name, html] of pages) {
      for (const sentence of ruleSentences(text(html))) {
        stating.push(name);
        expect(sentence, name).not.toMatch(JETS);
      }
    }
    // The scan finds the rule wherever the site states it, so a page cannot pass by saying it differently.
    for (const name of ["home", "fleet", "pilots", "handbook", "about", "news", "resources", "plan"]) expect(stating, name).toContain(name);
    // It catches the wording it replaced.
    for (const old of [
      "Light and mid-size jets (up to Citation X size) start and end at Indianapolis Executive, KTYQ.",
      "KTYQ takes jets up to Citation X size.",
      "Light and mid-size jets live at Indianapolis Executive, everything larger at Indianapolis International.",
      "Base rules still apply when booking: light and mid jets from KTYQ, larger aircraft from KIND.",
      "Indianapolis Executive (KTYQ), north of the city, is a business-aviation field sized for light and mid-size jets.",
    ]) expect(ruleSentences(old).some((s) => JETS.test(s)), old).toBe(true);
  });

  it("names the M600 or says light and mid-size aircraft in the rule, its NOTAM and the Executive copy", () => {
    const rule = SOP_RULES.find((r) => r.title === "Right base, right aircraft");
    const notam = NEWS.find((n) => n.kind === "NOTAM" && n.title.startsWith("Base rule"));
    const executive = snapshot.airline.divisions.find((d) => d.base === "KTYQ");
    const service = SERVICES.find((s) => s.division === executive?.name);
    if (!rule || !notam || !executive || !service) throw new Error("the base rule, its NOTAM or the Executive division is missing");
    const copy = [rule.body, notam.title, notam.body, executive.summary ?? "", service.pitch, ...service.points.filter((p) => KTYQ.test(p))];
    for (const line of copy) expect(line).not.toMatch(JETS);
    for (const line of [rule.body, notam.title, notam.body]) expect(line).toMatch(/light and mid-size aircraft/i);
    for (const line of [rule.body, notam.body, executive.summary ?? ""]) expect(line).toContain("Piper M600");
  });
});

describe("joining", () => {
  it("walks a new pilot through the vAMSYS sign-up as the vAMSYS docs describe it", () => {
    const html = renderToString(<PilotsPage snapshot={snapshot} />);
    const page = text(html);
    expect(page).toContain("create an account with your name, email address and a password, then confirm your email");
    expect(page).toContain("Sign in on the same page with that account");
    expect(page).toContain("vAMSYS gives you your pilot username, CRX and a number, so there's nothing to choose");
    expect(html).toContain(`href="${RULES_URL}"`);
    expect(page).toContain("install FSUIPC as well");
    expect(page).toContain("Pegasus lists Crossroads only once you hold a booking");
    expect(page).toContain("Book before you fly");
    expect(page).toContain("use Jumpseat in Phoenix first");
    expect(page).toContain("under My vAMSYS Account → Social, Online & 3rd Party");
    // Retired copy that did not match vAMSYS: a "Register link", a username you choose, staff approval as a given.
    expect(page).not.toMatch(/Register link|username you're happy|Once staff approve|application to accepted/);
  });

  it("says plainly that the airline is new, with the join terms; claims no pilot numbers and implies no other pilots", () => {
    const page = text(renderToString(<PilotsPage snapshot={snapshot} />));
    expect(NEW_AIRLINE).toContain("Founding pilots welcome; you could be one of the first.");
    expect(JOIN_TERMS).toBe("Free to join; no activity requirement for the first 30 days.");
    expect(page).toContain(`A new airline ${NEW_AIRLINE} ${JOIN_TERMS}`);
    // A date, yes; a head count, never.
    expect(NEW_AIRLINE).not.toMatch(/[0-9][0-9,]* (pilots|members)|hundreds|thousands|dozens|growing community/i);
    const home = text(renderToString(<HomePage snapshot={snapshot} />));
    expect(home).toContain(`Founding pilots welcome. Crossroads opened on vAMSYS in November 2026 and is just getting started, so you could be one of the first. ${JOIN_TERMS}`);
    // Nothing that sizes up a roster or speaks for pilots who may not exist yet.
    for (const t of [page, home, text(renderToString(<LivePage snapshot={snapshot} />))]) expect(t).not.toMatch(/roster|very few|tiny|our pilots/i);
  });

  it("labels the three setup flights as setup test flights, not as pilot or logbook activity", () => {
    const home = text(renderToString(<HomePage snapshot={{ ...snapshot, recent_flights: [] }} />));
    expect(home).toContain("Airline setup Setup test flights");
    expect(home).toContain(SETUP_NOTE);
    expect(SETUP_NOTE).toContain("founder's automation tools while the airline was being built");
    expect(home).not.toMatch(/Logbook firsts|PIREPs accepted|Just landed/);
    const news = NEWS.filter((n) => n.body.includes("CRX115"));
    expect(news.map((n) => n.title)).toEqual(["Setup test flights"]);
    expect(news[0]!.body).toContain("They were tests of the airline's setup, not pilot flights.");
    for (const item of NEWS) expect(`${item.title} ${item.body}`).not.toMatch(/PIREPs accepted|logbook entries were accepted/i);
    expect(FLEET_INFO.PRM1!.blurb).toContain("setup test flight");
    expect(FLEET_INFO.C750!.blurb).toContain("setup test flight");
  });

  it("quotes the VATSIM Code of Conduct instead of paraphrasing it", () => {
    const page = text(renderToString(<PilotsPage snapshot={snapshot} />));
    expect(page).toContain("“Pilots shall monitor their flights at all times” (B3(a))");
    expect(page).toContain("“Only unaltered speech is permitted to be transmitted” (A14(d))");
    expect(page).not.toMatch(/stay at the controls|make every radio call yourself/);
  });

  it("suggests the starter tour's first leg as the first flight, in the KTYQ jet that comes with MSFS 2024", () => {
    const starter = TOURS.find((t) => t.starter);
    const first = firstFlight(snapshot);
    if (!starter || !first) throw new Error("no starter tour or first flight");
    expect([first.route.from, first.route.to]).toEqual(starter.legs[0]);
    const ktyq = defaultSimTypes(snapshot).filter((f) => baseFor(f.code) === "KTYQ");
    expect(ktyq.map((f) => f.code)).toEqual(["C25C"]);
    expect(first.defaults.map((f) => f.code)).toEqual(["C25C"]);
    // Markup as served, without the comments React puts between adjacent text nodes.
    const html = renderToString(<PilotsPage snapshot={snapshot} />).replace(/<!-- -->/g, "");
    expect(html).toContain(`<a class="text-link" href="${routeHref(first.route)}"><span>Route details and SimBrief link<span class="visually-hidden">: ${routeKey(first.route)}</span>`);
    const page = text(html);
    expect(page).toContain(`No add-on needed: the ${shortName(ktyq[0]!.name)} comes with MSFS 2024 and flies this route.`);
    expect(page).toContain(`It's leg 1 of the ${starter.name} tour. Register for the tour under Events in Phoenix first`);
    expect(page).toContain(`${formatNumber(first.route.distance_nm)} nm`);
    expect(text(renderToString(<HomePage snapshot={snapshot} />))).toContain(`Start as a Cadet at KTYQ in the ${shortName(ktyq[0]!.name)}, which comes with MSFS 2024.`);
  });

  it("counts the routes of the Standard-edition types only: the CJ4, not the Longitude (Premium Deluxe/Aviator)", () => {
    const defaults = defaultSimTypes(snapshot);
    expect(defaults.map((f) => f.code)).toEqual(["C25C"]);
    expect(snapshot.airline.sim_aircraft?.C700).toBe("Cessna Citation Longitude (MSFS 2024 Premium Deluxe/Aviator)");
    const count = snapshot.routes.filter((r) => r.types.includes("C25C")).length;
    // Round 13 schedule: the CJ4 flies 150 of the 316 routes.
    expect([count, snapshot.routes.length]).toEqual([150, 316]);
    expect(routesForTypes(snapshot, defaults)).toHaveLength(count);
    const page = text(renderToString(<PilotsPage snapshot={snapshot} />));
    expect(page).toContain(`Do I need add-on aircraft? Not to start. The Citation CJ4 comes with every edition of MSFS 2024 and flies ${count} of our ${snapshot.routes.length} routes.`);
    expect(page).not.toMatch(/Longitude (comes|come) with/);
    const none: Snapshot = { ...snapshot, airline: { ...snapshot.airline, sim_aircraft: {} } };
    expect(text(renderToString(<PilotsPage snapshot={none} />))).not.toContain("Do I need add-on aircraft?");
  });
});

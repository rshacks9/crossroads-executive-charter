// Server-render every new page against the committed snapshot: catches render-time crashes and
// checks the key content without a browser. Leaflet needs a DOM, so the map module is stubbed.
import { readFileSync } from "node:fs";
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { Snapshot } from "./data";

vi.mock("leaflet", () => ({ default: {} }));
vi.mock("leaflet/dist/leaflet.css", () => ({}));

const { AirportPage, DestinationsPage, NotFoundPage, PlanPage, ResourcesPage, RoutePage, RouteRows, StatsPage, TypePage } = await import("./explore-pages");
const { FleetPage, MapLegend, RoutesPage, HomePage, PilotsPage } = await import("./pages");
const { HandbookPage, CareersPage } = await import("./info");
const { findRoute, routeHref } = await import("./explore");
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

  it("explains the explorer's keyboard controls", () => {
    expect(text(renderToString(<RoutesPage snapshot={snapshot} />))).toContain("Escape to clear");
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
});

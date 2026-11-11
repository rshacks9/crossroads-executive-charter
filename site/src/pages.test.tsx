// Server-render every new page against the committed snapshot: catches render-time crashes and
// checks the key content without a browser. Leaflet needs a DOM, so the map module is stubbed.
import { readFileSync } from "node:fs";
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { Snapshot } from "./data";

vi.mock("leaflet", () => ({ default: {} }));
vi.mock("leaflet/dist/leaflet.css", () => ({}));

const { AirportPage, DestinationsPage, NotFoundPage, PlanPage, ResourcesPage, RoutePage, StatsPage, TypePage } = await import("./explore-pages");
const { FleetPage, RoutesPage, HomePage, PilotsPage } = await import("./pages");
const { HandbookPage, CareersPage } = await import("./info");
const { findRoute } = await import("./explore");

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

  it("explains the explorer's keyboard controls", () => {
    expect(text(renderToString(<RoutesPage snapshot={snapshot} />))).toContain("Escape to clear");
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

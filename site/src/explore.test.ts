import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { Snapshot } from "./data";
import { FLEET_INFO } from "./content";
import {
  COMFORT_SHARE,
  airportSummary,
  briefingCard,
  buildSearchIndex,
  destinationBlurb,
  distanceNm,
  findRoute,
  initialCourse,
  listJoin,
  networkStats,
  parseLocation,
  routeHref,
  routeKey,
  routesForType,
  scheduleCsv,
  search,
  servedAirports,
  simbriefUrl,
  suggestFleet,
} from "./explore";

const snapshot: Snapshot = JSON.parse(readFileSync(new URL("../public/data/snapshot.json", import.meta.url), "utf-8"));

describe("hash routing", () => {
  it("parses top-level pages and aliases", () => {
    expect(parseLocation("")).toEqual({ page: "" });
    expect(parseLocation("#/")).toEqual({ page: "" });
    expect(parseLocation("#/routes?type=E190")).toEqual({ page: "routes" });
    expect(parseLocation("#/plan")).toEqual({ page: "plan" });
    expect(parseLocation("#/join")).toEqual({ page: "pilots" });
    expect(parseLocation("#/airports")).toEqual({ page: "destinations" });
  });

  it("parses detail pages and normalises case", () => {
    expect(parseLocation("#/airport/kase")).toEqual({ page: "airport", id: "KASE" });
    expect(parseLocation("#/fleet/C750")).toEqual({ page: "type", id: "C750" });
    expect(parseLocation("#/route/CRX101")).toEqual({ page: "route", id: "CRX101" });
    expect(parseLocation("#/route/CRX101/")).toEqual({ page: "route", id: "CRX101" });
  });

  it("sends unknown and malformed paths to the 404 page", () => {
    expect(parseLocation("#/nope").page).toBe("notfound");
    expect(parseLocation("#/airport/<script>").page).toBe("notfound");
    expect(parseLocation("#/fleet/C750/extra").page).toBe("notfound");
    expect(parseLocation("#/live/KIND").page).toBe("notfound");
  });

  it("round-trips every route through its URL", () => {
    for (const route of snapshot.routes) {
      const loc = parseLocation(routeHref(route));
      expect(loc).toEqual({ page: "route", id: routeKey(route).toUpperCase() });
      expect(findRoute(snapshot, (loc as { id: string }).id)).toBe(route);
    }
  });
});

describe("geometry", () => {
  it("matches the schedule's great-circle distances", () => {
    for (const route of snapshot.routes.slice(0, 40)) {
      const d = distanceNm(snapshot.airports[route.from]!, snapshot.airports[route.to]!);
      expect(Math.abs((d ?? 0) - (route.distance_nm ?? 0))).toBeLessThanOrEqual(1);
    }
  });

  it("gives sensible initial courses", () => {
    const kind = snapshot.airports.KIND!;
    expect(initialCourse(kind, snapshot.airports.KMIA!)).toBeGreaterThan(130);
    expect(initialCourse(kind, snapshot.airports.KMIA!)).toBeLessThan(170);
    expect(initialCourse(kind, snapshot.airports.EDDP!)).toBeLessThan(60); // great circle heads north-east
    expect(distanceNm({ lat: null, lon: 1 }, kind)).toBeNull();
  });
});

describe("airports", () => {
  it("summarises a destination from the schedule only", () => {
    const s = airportSummary(snapshot, "KASE");
    expect(s.routes.length).toBe(snapshot.routes.filter((r) => r.from === "KASE" || r.to === "KASE").length);
    expect(s.routes.length).toBeGreaterThan(0);
    expect(s.departures + s.arrivals).toBe(s.routes.length);
    expect(s.partners).toContain("KTYQ");
    expect(s.isBase).toBe(false);
    expect(s.fromBase?.base).toMatch(/KTYQ|KIND/);
    expect(s.fromBase!.nm).toBeGreaterThan(800);
  });

  it("knows the bases", () => {
    const s = airportSummary(snapshot, "KIND");
    expect(s.isBase).toBe(true);
    expect(s.fromBase).toBeNull();
  });

  it("lists every served airport once, busiest first", () => {
    const list = servedAirports(snapshot);
    const served = new Set(snapshot.routes.flatMap((r) => [r.from, r.to]));
    expect(list.length).toBe(served.size);
    for (let i = 1; i < list.length; i++) expect(list[i - 1]!.routes).toBeGreaterThanOrEqual(list[i]!.routes);
  });

  it("writes a blurb that only states data", () => {
    const s = airportSummary(snapshot, "LSGG");
    const text = destinationBlurb(s, snapshot.airline.divisions.map((d) => d.name), (c) => c);
    expect(text).toContain("Geneva");
    expect(text).toContain("Switzerland");
    expect(text).toContain(`${s.routes.length} Crossroads`);
    expect(text).not.toMatch(/best|famous|popular|luxury/i);
    expect(listJoin(["a", "b", "c"])).toBe("a, b and c");
  });
});

describe("fleet", () => {
  it("lists the routes a type can fly, longest first", () => {
    const routes = routesForType(snapshot, "B77L");
    expect(routes.length).toBeGreaterThan(0);
    expect(routes.every((r) => r.types.includes("B77L"))).toBe(true);
    expect(routes[0]!.distance_nm).toBeGreaterThanOrEqual(routes[routes.length - 1]!.distance_nm!);
  });

  it("has planning figures for every fleet type", () => {
    for (const f of snapshot.fleet) expect(FLEET_INFO[f.code], f.code).toBeDefined();
  });
});

describe("charter planner", () => {
  it("picks small jets for a short passenger hop and rules out freighters", () => {
    const { distance, suggestions } = suggestFleet(snapshot, { from: "KTYQ", to: "KMDW", load: 4, cargo: false });
    expect(distance).toBeGreaterThan(100);
    expect(suggestions[0]!.status).toBe("fits");
    expect(suggestions[0]!.type.code).toBe("C510");
    expect(suggestions.filter((s) => s.status === "wrong-role").map((s) => s.type.code).sort()).toEqual(["A306", "B77L", "MD11"]);
    expect(suggestions[0]!.scheduled.length).toBeGreaterThan(0);
  });

  it("rules out aircraft that are too small or short of range", () => {
    const { suggestions } = suggestFleet(snapshot, { from: "KIND", to: "LFPB", load: 120, cargo: false });
    const by = Object.fromEntries(suggestions.map((s) => [s.type.code, s]));
    expect(by.C510!.status).toBe("too-small");
    expect(by.B752!.status).toBe("short-range");
    expect(by.A388!.status).toBe("fits");
    expect(by.A346!.status).toBe("too-small");
  });

  it("flags legs close to the range limit as tight", () => {
    // Find a pair that sits between the comfort share and full planning range for the Mustang.
    const range = FLEET_INFO.C510!.range_nm;
    const { suggestions, distance } = suggestFleet(snapshot, { from: "KTYQ", to: "KDAL", load: 2, cargo: false });
    const mustang = suggestions.find((s) => s.type.code === "C510")!;
    if (distance! > range) expect(mustang.status).toBe("short-range");
    else if (distance! > range * COMFORT_SHARE) expect(mustang.status).toBe("tight");
    else expect(mustang.status).toBe("fits");
  });

  it("handles cargo loads by payload", () => {
    const { suggestions } = suggestFleet(snapshot, { from: "KIND", to: "EDDP", load: 95000, cargo: true });
    expect(suggestions[0]!.type.code).toBe("B77L");
    expect(suggestions.find((s) => s.type.code === "A306")!.status).not.toBe("fits");
  });
});

describe("search", () => {
  const index = buildSearchIndex(snapshot);

  it("indexes airports, aircraft, routes and pages", () => {
    const kinds = new Set(index.map((e) => e.kind));
    expect([...kinds].sort()).toEqual(["Aircraft", "Airport", "Page", "Route"]);
    expect(index.filter((e) => e.kind === "Route").length).toBe(snapshot.routes.length);
  });

  it("puts the airport first for an ICAO code", () => {
    const results = search(index, "kase");
    expect(results[0]!.href).toBe("#/airport/KASE");
    expect(results.some((r) => r.kind === "Route")).toBe(true);
  });

  it("finds by IATA, city, callsign and type", () => {
    expect(search(index, "GVA")[0]!.href).toBe("#/airport/LSGG");
    expect(search(index, "crx511")[0]!.kind).toBe("Route");
    expect(search(index, "G650")[0]!.href).toBe("#/fleet/GLF6");
    expect(search(index, "plan charter")[0]!.href).toBe("#/plan");
    expect(search(index, "zzzz-nothing")).toEqual([]);
    expect(search(index, "   ")).toEqual([]);
  });
});

describe("network stats", () => {
  const stats = networkStats(snapshot);

  it("counts every route exactly once by division and distance", () => {
    expect(stats.routes).toBe(snapshot.routes.length);
    expect(stats.byDivision.reduce((s, b) => s + b.value, 0)).toBe(snapshot.routes.length);
    expect(stats.distanceBands.reduce((s, b) => s + b.value, 0)).toBe(snapshot.routes.length);
  });

  it("finds the longest and shortest legs", () => {
    const max = Math.max(...snapshot.routes.map((r) => r.distance_nm ?? 0));
    const min = Math.min(...snapshot.routes.map((r) => r.distance_nm ?? Infinity));
    expect(stats.longest!.distance_nm).toBe(max);
    expect(stats.shortest!.distance_nm).toBe(min);
    expect(stats.topAirports.length).toBeLessThanOrEqual(10);
    expect(stats.topAirports.some((a) => a.label.startsWith("KIND") || a.label.startsWith("KTYQ"))).toBe(false);
    expect(stats.international).toBeGreaterThan(0);
  });
});

describe("downloads and links", () => {
  const route = snapshot.routes.find((r) => r.callsign === "CRX115") ?? snapshot.routes[0]!;

  it("builds a SimBrief redirect URL", () => {
    const url = new URL(simbriefUrl(route, "PRM1"));
    expect(url.hostname).toBe("www.simbrief.com");
    expect(url.searchParams.get("orig")).toBe(route.from);
    expect(url.searchParams.get("dest")).toBe(route.to);
    expect(url.searchParams.get("airline")).toBe("CRX");
    expect(url.searchParams.get("fltnum")).toMatch(/^\d+$/);
  });

  it("writes a briefing card with the disclaimer and runways", () => {
    const card = briefingCard(snapshot, route, { [route.from]: [{ id: "18/36", length_ft: 7001 }] });
    expect(card).toContain(route.callsign!);
    expect(card).toContain("Fictional virtual airline");
    expect(card).toContain("18/36 (7,001 ft)");
    expect(card).toContain(`Runways ${route.to}: see charts`);
  });

  it("exports the schedule as CSV", () => {
    const csv = scheduleCsv(snapshot);
    const lines = csv.trim().split("\n");
    expect(lines.length).toBe(snapshot.routes.length + 1);
    expect(lines[0]).toMatch(/^callsign,flight_number,from/);
    // Fields with commas or quotes are quoted (RFC 4180).
    const tricky = { ...snapshot, routes: [route], airports: { ...snapshot.airports, [route.from]: { ...snapshot.airports[route.from]!, name: 'Field "A", North' } } };
    expect(scheduleCsv(tricky)).toContain('"Field ""A"", North"');
  });
});

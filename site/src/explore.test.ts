import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { Crew, CrewRunway, Route, Snapshot } from "./data";
import { formatNumber, routeDivision, routeInDivision } from "./data";
import { FLEET_INFO, PEGASUS_URL, baseFor } from "./content";
import {
  COMFORT_SHARE,
  MORE_COUNTRIES,
  airportSummary,
  briefingCard,
  buildSearchIndex,
  destinationBlurb,
  destinationGroups,
  distanceNm,
  divisionBaseLabel,
  findRoute,
  initialCourse,
  isSearchShortcut,
  jumpTo,
  listJoin,
  mapLegendKeys,
  markerKeyAction,
  markerLabel,
  markerOrder,
  markerTabStop,
  moveIndex,
  moveSearchActive,
  wireMarker,
  networkStats,
  onwardLegs,
  parseLocation,
  routeHref,
  routeKey,
  routeOtherEnd,
  routesForType,
  runwayStrips,
  scheduleCsv,
  search,
  searchStatus,
  servedAirports,
  simbriefUrl,
  sortRoutes,
  sortRoutesBy,
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

  it("splits a base's types into those based there and visiting ones", () => {
    const names = snapshot.airline.divisions.map((d) => d.name);
    for (const icao of ["KIND", "KTYQ"]) {
      const s = airportSummary(snapshot, icao);
      const based = s.types.filter((c) => baseFor(c) === icao).length;
      const visiting = s.types.length - based;
      const text = destinationBlurb(s, names, (c) => c);
      expect(based).toBeGreaterThan(0);
      expect(text).toContain(`${s.routes.length} scheduled routes start or end here, flown by the ${based} types based here`);
      expect(text).toContain(visiting ? ` and ${visiting} visiting type` : "based here.");
    }
    const kind = airportSummary(snapshot, "KIND");
    expect(destinationBlurb({ ...kind, types: ["A388", "B77L"] }, names, (c) => c)).toMatch(/flown by the 2 types based here[.]$/);
    expect(destinationBlurb({ ...kind, types: ["B77L", "C510"] }, names, (c) => c)).toMatch(/flown by the 1 type based here and 1 visiting type[.]$/);
    expect(destinationBlurb({ ...kind, types: ["B77L", "C510", "E55P"] }, names, (c) => c)).toMatch(/and 2 visiting types[.]$/);
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

  it("schedules no type on a route longer than its planning range", () => {
    const over: string[] = [];
    for (const route of snapshot.routes) {
      if (route.distance_nm == null) continue;
      for (const code of route.types) {
        const range = FLEET_INFO[code]?.range_nm;
        if (range != null && route.distance_nm > range) over.push(`${route.callsign ?? `${route.from}-${route.to}`} ${code} ${route.distance_nm}/${range} nm`);
      }
    }
    expect(over).toEqual([]);
  });
});

describe("route lists", () => {
  const bases = ["KTYQ", "KIND"];
  const sorted = sortRoutes(snapshot.routes, bases);
  const nm = (r: { distance_nm: number | null }) => r.distance_nm ?? Infinity;

  it("lists departures from the bases first, shortest first within each group", () => {
    expect(sorted.map(routeKey).sort()).toEqual(snapshot.routes.map(routeKey).sort());
    const split = sorted.findIndex((r) => !bases.includes(r.from));
    expect(split).toBeGreaterThan(0);
    expect(sorted.slice(0, split).every((r) => bases.includes(r.from))).toBe(true);
    expect(sorted.slice(split).every((r) => !bases.includes(r.from))).toBe(true);
    for (const group of [sorted.slice(0, split), sorted.slice(split)]) {
      for (let i = 1; i < group.length; i++) expect(nm(group[i]!)).toBeGreaterThanOrEqual(nm(group[i - 1]!));
    }
  });

  it("puts an airport's own departures first on its page and leaves the input alone", () => {
    const kase = snapshot.routes.filter((r) => r.from === "KASE" || r.to === "KASE");
    const before = kase.map(routeKey);
    const list = sortRoutes(kase, ["KASE"]);
    expect(list[0]!.from).toBe("KASE");
    expect(list[list.length - 1]!.to).toBe("KASE");
    expect(kase.map(routeKey)).toEqual(before);
    expect(sortRoutes([], bases)).toEqual([]);
  });

  it("sorts by a column either way and keeps the default order for ties", () => {
    expect(nm(sortRoutesBy(sorted, "distance", "desc")[0]!)).toBe(Math.max(...snapshot.routes.map((r) => r.distance_nm ?? 0)));
    const blocks = sortRoutesBy(sorted, "block", "asc").map((r) => r.duration_min ?? Infinity);
    for (let i = 1; i < blocks.length; i++) expect(blocks[i]).toBeGreaterThanOrEqual(blocks[i - 1]!);
    const byFrom = sortRoutesBy(sorted, "from", "asc");
    for (let i = 1; i < byFrom.length; i++) expect(byFrom[i - 1]!.from.localeCompare(byFrom[i]!.from, "en", { numeric: true })).toBeLessThanOrEqual(0);
    const fromKind = byFrom.filter((r) => r.from === "KIND");
    for (let i = 1; i < fromKind.length; i++) expect(nm(fromKind[i]!)).toBeGreaterThanOrEqual(nm(fromKind[i - 1]!));
    const flights = sortRoutesBy(sorted, "flight", "desc").map(routeKey);
    expect(flights).toEqual([...flights].sort((a, b) => b.localeCompare(a, "en", { numeric: true })));
    const lastTo = snapshot.routes.map((r) => r.to).sort((a, b) => a.localeCompare(b, "en", { numeric: true })).pop();
    expect(sortRoutesBy(sorted, "to", "desc")[0]!.to).toBe(lastTo);
    const unknown = { ...sorted[0]!, callsign: "CRX999", distance_nm: null };
    for (const dir of ["asc", "desc"] as const) expect(sortRoutesBy([unknown, ...sorted], "distance", dir).pop()).toBe(unknown);
  });

  it("names the far end of a row: not the page's airport, else not a base", () => {
    expect(routeOtherEnd({ from: "KTYQ", to: "KASE" }, undefined, bases)).toBe("KASE");
    expect(routeOtherEnd({ from: "KASE", to: "KTYQ" }, undefined, bases)).toBe("KASE");
    expect(routeOtherEnd({ from: "EGGW", to: "KTEB" }, undefined, bases)).toBe("KTEB");
    expect(routeOtherEnd({ from: "KTYQ", to: "KASE" }, "KASE", bases)).toBe("KTYQ");
    expect(routeOtherEnd({ from: "KTYQ", to: "KASE" }, "KTYQ", bases)).toBe("KASE");
  });
});

describe("onward legs", () => {
  const nm = (r: { distance_nm: number | null }) => r.distance_nm ?? Infinity;

  it("keeps departures that share a type with the route: most shared first, then shortest, seven at most", () => {
    for (const route of snapshot.routes) {
      const key = routeKey(route);
      const back = snapshot.routes.find((r) => r.from === route.to && r.to === route.from);
      const sharing = snapshot.routes.filter((r) => r.from === route.to && r !== back && r.types.some((t) => route.types.includes(t)));
      const legs = onwardLegs(snapshot.routes, route, back);
      expect(legs.length, key).toBe(Math.min(7, sharing.length));
      for (const leg of legs) {
        expect(leg.route.from, key).toBe(route.to);
        expect(leg.route, key).not.toBe(back);
        expect(leg.shared, key).toEqual(leg.route.types.filter((t) => route.types.includes(t)));
        expect(leg.shared.length, key).toBeGreaterThan(0);
      }
      for (let i = 1; i < legs.length; i++) {
        const a = legs[i - 1]!;
        const b = legs[i]!;
        if (b.shared.length === a.shared.length) expect(nm(b.route), key).toBeGreaterThanOrEqual(nm(a.route));
        else expect(b.shared.length, key).toBeLessThan(a.shared.length);
      }
    }
  });

  it("offers the CRX524 crew at KIND only legs their aircraft can fly", () => {
    const route = findRoute(snapshot, "CRX524")!;
    const legs = onwardLegs(snapshot.routes, route, snapshot.routes.find((r) => r.from === route.to && r.to === route.from));
    expect(legs).toHaveLength(7);
    for (const leg of legs) expect(leg.route.types.some((t) => route.types.includes(t))).toBe(true);
    expect(legs.some((leg) => leg.route.types.every((t) => t === "B77L" || t === "MD11"))).toBe(false);
  });

  it("never offers a leg the aircraft cannot fly, even when fewer than three share a type", () => {
    const mk = (callsign: string, from: string, to: string, types: string[], distance_nm: number | null): Route => ({ ...snapshot.routes[0]!, callsign, from, to, types, distance_nm });
    const inbound = mk("CRX901", "AAAA", "BBBB", ["E175", "C25C"], 300);
    const back = mk("CRX902", "BBBB", "AAAA", ["E175"], 300);
    const routes = [inbound, back, mk("CRX903", "BBBB", "CCCC", ["B77L"], 900), mk("CRX905", "BBBB", "DDDD", ["E175", "C25C", "B752"], 400), mk("CRX907", "BBBB", "EEEE", ["C25C"], null), mk("CRX909", "BBBB", "FFFF", ["MD11"], 120)];
    const few = onwardLegs(routes, inbound, back);
    expect(few.map((leg) => leg.route.callsign)).toEqual(["CRX905", "CRX907"]);
    expect(few.map((leg) => leg.shared)).toEqual([["E175", "C25C"], ["C25C"]]);
    const more = [...routes, mk("CRX911", "BBBB", "GGGG", ["E175"], 100), mk("CRX913", "BBBB", "HHHH", ["C25C", "E175"], 650)];
    expect(onwardLegs(more, inbound, back).map((leg) => leg.route.callsign)).toEqual(["CRX905", "CRX913", "CRX911", "CRX907"]);
    expect(onwardLegs(more, inbound, back, 2).map((leg) => leg.route.callsign)).toEqual(["CRX905", "CRX913"]);
    expect(onwardLegs(more, inbound).map((leg) => leg.route.callsign)).toContain("CRX902");
  });
});

describe("runway strips", () => {
  const end = (id: string, reciprocal: string | null, heading: number | null): CrewRunway => ({ id, reciprocal, heading_true_deg: heading, length_ft: 9000, width_ft: 150, surface: "CON", elevation_ft: 700, wind: null });

  it("lists each strip once, lower-numbered end first, with both ends' true headings", () => {
    const strips = runwayStrips([end("05L", "23R", 44.5), end("23R", "05L", 224.5), end("19L", "01R", 205), end("01R", "19L", 25)]);
    expect(strips.map((s) => s.label)).toEqual(["05L/23R", "01R/19L"]);
    expect(strips.map((s) => s.key)).toEqual(["05L/23R", "01R/19L"]);
    expect(strips.map((s) => s.headings)).toEqual(["045°/225° true", "025°/205° true"]);
    expect(strips[0]).toMatchObject({ length_ft: 9000, width_ft: 150, surface: "CON" });
  });

  it("shows one heading when the other end is missing, and none when no heading is known", () => {
    const strips = runwayStrips([end("09", "27", 92), end("18", null, 180), end("H1", null, null)]);
    expect(strips.map((s) => [s.label, s.headings])).toEqual([["09/27", "092° true"], ["18", "180° true"], ["H1", null]]);
  });

  it("gives every airport in crew.json one row per strip; KIND has three", () => {
    const crew: Crew = JSON.parse(readFileSync(new URL("../public/data/crew.json", import.meta.url), "utf-8"));
    expect(runwayStrips(crew.airports.KIND!.runways).map((s) => s.label)).toEqual(["05L/23R", "05R/23L", "14/32"]);
    for (const [icao, airport] of Object.entries(crew.airports)) {
      const pairs = new Set(airport.runways.map((r) => [r.id, r.reciprocal ?? ""].sort().join("/")));
      expect(runwayStrips(airport.runways), icao).toHaveLength(pairs.size);
    }
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

  it("writes a route's distance in the pages' number style and keeps it and the block time whole", () => {
    const route = snapshot.routes.find((r) => (r.distance_nm ?? 0) >= 1000 && (r.duration_min ?? 0) >= 60)!;
    const entry = index.find((e) => e.href === routeHref(route))!;
    expect(entry.subtitle).toContain(` · ${formatNumber(route.distance_nm)}\u00a0nm · `);
    expect(entry.subtitle).toMatch(/ · [0-9]+h\u00a0[0-9]{2}m$/);
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

  it("opens on Ctrl+K or Cmd+K, never on a key pressed alone", () => {
    const press = (key: string, ctrlKey = false, metaKey = false, altKey = false) => ({ key, ctrlKey, metaKey, altKey });
    expect(isSearchShortcut(press("k", true))).toBe(true);
    expect(isSearchShortcut(press("k", false, true))).toBe(true);
    expect(isSearchShortcut(press("K", true))).toBe(true);
    expect(isSearchShortcut(press("/"))).toBe(false);
    expect(isSearchShortcut(press("k"))).toBe(false);
    expect(isSearchShortcut(press("/", true))).toBe(false);
    expect(isSearchShortcut(press("k", true, false, true))).toBe(false);
  });

  it("states how many results there are, or why there are none", () => {
    expect(searchStatus("", 0)).toMatch(/^Type an ICAO or IATA code/);
    expect(searchStatus("   ", 0)).toMatch(/^Type an ICAO or IATA code/);
    expect(searchStatus("aspen", 9)).toBe("9 results. ↑ ↓ to choose, Enter to open.");
    expect(searchStatus("kase", 1)).toBe("1 result. ↑ ↓ to choose, Enter to open.");
    expect(searchStatus(" zzzz ", 0)).toBe("Nothing matches “zzzz”.");
  });

  it("starts with no result active; the first ArrowDown lands on the first result", () => {
    expect(moveSearchActive(-1, 9, "ArrowDown")).toBe(0);
    expect(moveSearchActive(0, 9, "ArrowDown")).toBe(1);
    expect(moveSearchActive(8, 9, "ArrowDown")).toBe(8);
    expect(moveSearchActive(3, 9, "ArrowUp")).toBe(2);
    expect(moveSearchActive(0, 9, "ArrowUp")).toBe(0);
    expect(moveSearchActive(12, 5, "ArrowUp")).toBe(4);
    expect(moveSearchActive(-1, 0, "ArrowDown")).toBe(-1);
  });
});

describe("network stats", () => {
  const stats = networkStats(snapshot);

  it("counts every route a division's aircraft can fly, and every route once by distance", () => {
    expect(stats.routes).toBe(snapshot.routes.length);
    const divisions = snapshot.airline.divisions;
    expect(stats.byDivision.map((b) => b.label)).toEqual(divisions.map((d) => d.name));
    for (const b of stats.byDivision) {
      const division = divisions[b.index ?? -1];
      expect(division, b.label).toBeDefined();
      expect(b.value, b.label).toBe(snapshot.routes.filter((r) => routeInDivision(r, division)).length);
      expect(b.value, b.label).toBeGreaterThan(0); // Executive Charter read 0 when ties went to Executive
    }
    // Divisions share routes, so the bars add up to more than the schedule, as the fine print says.
    expect(stats.byDivision.reduce((s, b) => s + b.value, 0)).toBeGreaterThan(snapshot.routes.length);
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

describe("divisions on cards and map legends", () => {
  const divisions = snapshot.airline.divisions;
  const index = (name: string) => divisions.findIndex((d) => d.name === name);

  it("names the bases a division's aircraft work from", () => {
    expect(divisionBaseLabel(divisions[index("Executive")]!, snapshot.fleet)).toBe("Based KTYQ and KIND");
    for (const d of divisions.filter((x) => x.name !== "Executive")) expect(divisionBaseLabel(d, snapshot.fleet), d.name).toBe("Based KIND");
    expect(divisionBaseLabel({ fleets: [], base: "KTYQ" }, snapshot.fleet)).toBe("Based KTYQ");
    expect(divisionBaseLabel({ fleets: ["ZZZZ"], base: null }, snapshot.fleet)).toBe("Network-wide");
  });

  it("keys a legend to the division colours and the dashed cargo line a map draws", () => {
    const all = mapLegendKeys(snapshot.routes, divisions, snapshot.airports);
    expect(all.cargo).toBe(true);
    for (const i of all.divisions) expect(snapshot.routes.some((r) => Math.max(0, routeDivision(r, divisions)) === i), divisions[i]?.name).toBe(true);
    // No route carries the executive-charter tag yet, so no line is drawn in that division's colour.
    if (!snapshot.routes.some((r) => r.tags.includes("executive-charter"))) expect(all.divisions).not.toContain(index("Executive Charter"));
    expect(mapLegendKeys(snapshot.routes.filter((r) => r.kind === "cargo"), divisions, snapshot.airports)).toEqual({ divisions: [index("Cargo Charter")], cargo: true });
    expect(mapLegendKeys(snapshot.routes.filter((r) => r.from === "KTYQ"), divisions, snapshot.airports)).toEqual({ divisions: [index("Executive")], cargo: false });
    expect(mapLegendKeys([], divisions, snapshot.airports)).toEqual({ divisions: [], cargo: false });
  });

  it("follows the maps: one line per airport pair, none without coordinates", () => {
    const cargo = snapshot.routes.find((r) => r.kind === "cargo")!;
    const back = { ...cargo, from: cargo.to, to: cargo.from, kind: "scheduled", tags: [], types: ["C510"] };
    expect(mapLegendKeys([cargo, back], divisions, snapshot.airports)).toEqual({ divisions: [index("Cargo Charter")], cargo: true });
    const nowhere = { ...snapshot.airports, [cargo.to]: { ...snapshot.airports[cargo.to]!, lat: null } };
    expect(mapLegendKeys([cargo], divisions, nowhere)).toEqual({ divisions: [], cargo: false });
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

describe("keyboard map markers", () => {
  type Listener = (e: { key: string; preventDefault(): void; stopPropagation(): void }) => void;
  function fakeMarker() {
    const attrs: Record<string, string> = {};
    let listener: Listener | null = null;
    return {
      attrs,
      el: { setAttribute: (n: string, v: string) => { attrs[n] = v; }, addEventListener: (_t: "keydown", l: Listener) => { listener = l; } },
      press(key: string) {
        const e = { key, prevented: false, stopped: false, preventDefault() { this.prevented = true; }, stopPropagation() { this.stopped = true; } };
        listener!(e);
        return e;
      },
    };
  }

  it("makes the tab-stop marker a named, focusable button", () => {
    const m = fakeMarker();
    const ktyq = snapshot.airports.KTYQ!;
    const count = snapshot.routes.filter((r) => r.from === "KTYQ" || r.to === "KTYQ").length;
    wireMarker(m.el, "KTYQ", markerLabel("KTYQ", ktyq, count), false, { onSelect: () => {}, onMove: () => {}, onClear: () => {} }, { tabStop: true, role: "button" });
    expect(m.attrs.tabindex).toBe("0");
    expect(m.attrs.role).toBe("button");
    expect(m.attrs["aria-pressed"]).toBe("false");
    expect(m.attrs["aria-label"]).toBe(`KTYQ Indianapolis Executive, ${count} routes`);
    expect(markerLabel("KASE", snapshot.airports.KASE, 1, { selected: true })).toBe("KASE Aspen/Pitkin County, 1 route, selected");
  });

  it("Enter and Space select, arrows move, Escape clears, other keys pass through", () => {
    const m = fakeMarker();
    const calls: string[] = [];
    wireMarker(m.el, "KASE", "KASE", true, {
      onSelect: (icao) => calls.push(`select ${icao}`),
      onMove: (icao, action) => calls.push(`${action} ${icao}`),
      onClear: () => calls.push("clear"),
    }, { tabStop: false, role: "button" });
    for (const key of ["Enter", " ", "ArrowRight", "ArrowDown", "ArrowLeft", "Home", "End", "Escape"]) {
      const e = m.press(key);
      expect(e.prevented, key).toBe(true);
      expect(e.stopped, key).toBe(true); // keeps Leaflet from panning the map
    }
    expect(calls).toEqual(["select KASE", "select KASE", "next KASE", "next KASE", "prev KASE", "first KASE", "last KASE", "clear"]);
    const tab = m.press("Tab");
    expect(tab.prevented).toBe(false); // Tab keeps moving focus normally
    expect(markerKeyAction("a")).toBeNull();
  });

  it("leaves Escape alone when there is nothing to clear", () => {
    const m = fakeMarker();
    wireMarker(m.el, "KASE", "KASE", false, { onSelect: () => {}, onMove: () => {} }, { tabStop: false, role: "link" });
    expect(m.press("Escape").prevented).toBe(false);
  });

  it("makes markers that open a page links out of the tab order, with no pressed state", () => {
    const m = fakeMarker();
    const calls: string[] = [];
    wireMarker(m.el, "KASE", "KASE Aspen/Pitkin County, 1 route", true, { onSelect: (icao) => calls.push(icao), onMove: () => {} }, { tabStop: false, role: "link" });
    expect(m.attrs.tabindex).toBe("-1");
    expect(m.attrs.role).toBe("link");
    expect(m.attrs["aria-pressed"]).toBeUndefined();
    expect(m.attrs["aria-label"]).toBe("KASE Aspen/Pitkin County, 1 route");
    expect(m.attrs["data-icao"]).toBe("KASE");
    m.press("Enter");
    expect(calls).toEqual(["KASE"]);
  });

  it("gives a map one tab stop: the selected airport when drawn, else the refocused marker, else the first", () => {
    const order = ["KTYQ", "KIND", "KASE"];
    expect(markerTabStop(order, "KASE", "KIND")).toBe("KASE");
    expect(markerTabStop(order, "EGLL", "KIND")).toBe("KIND");
    expect(markerTabStop(order, null, "KASE")).toBe("KASE");
    expect(markerTabStop(order, undefined, null)).toBe("KTYQ");
    expect(markerTabStop(order, "EGLL", "LFPB")).toBe("KTYQ");
    expect(markerTabStop([], "KASE", "KIND")).toBeUndefined();
  });

  it("orders markers bases first, then west to east, and wraps arrow moves", () => {
    const served = [...new Set(snapshot.routes.flatMap((r) => [r.from, r.to]))];
    const order = markerOrder(served, snapshot.airports, ["KTYQ", "KIND"]);
    expect(order.slice(0, 2)).toEqual(["KTYQ", "KIND"]);
    expect(order.length).toBe(served.length);
    const lons = order.slice(2).map((i) => snapshot.airports[i]!.lon!);
    for (let i = 1; i < lons.length; i++) expect(lons[i]).toBeGreaterThanOrEqual(lons[i - 1]!);
    expect(moveIndex(order.length - 1, order.length, "next")).toBe(0);
    expect(moveIndex(0, order.length, "prev")).toBe(order.length - 1);
    expect(moveIndex(5, order.length, "first")).toBe(0);
    expect(moveIndex(5, order.length, "last")).toBe(order.length - 1);
    expect(moveIndex(0, 0, "next")).toBe(-1);
  });
});

describe("external links", () => {
  it("points Pegasus at the official vAMSYS Pegasus ACARS docs", () => {
    expect(PEGASUS_URL).toBe("https://vamsys.co.uk/docs/pegasus/pegasus-acars");
  });
});

describe("tours", () => {
  it("every tour leg is a scheduled Crossroads route", async () => {
    const { TOURS } = await import("./content");
    expect(TOURS.map((t) => t.legs.length)).toEqual([8, 6, 8]);
    for (const tour of TOURS) for (const [from, to] of tour.legs) expect(snapshot.routes.some((r) => r.from === from && r.to === to), `${tour.name} ${from}-${to}`).toBe(true);
  });
});

describe("in-page jumps", () => {
  it("scroll the target into view, then focus it without a second scroll", () => {
    const calls: string[] = [];
    jumpTo({
      scrollIntoView: (options) => void calls.push(`scroll ${JSON.stringify(options)}`),
      focus: (options) => void calls.push(`focus ${JSON.stringify(options)}`),
    });
    expect(calls).toEqual(['scroll {"block":"start"}', 'focus {"preventScroll":true}']);
  });

  it("do nothing when the target is not on the page", () => {
    expect(() => jumpTo(null)).not.toThrow();
    expect(() => jumpTo(undefined)).not.toThrow();
  });
});

describe("destination groups", () => {
  const at = (icao: string, country: string | null) => ({ icao, airport: { country } });
  const all = [
    at("KIND", "United States"), at("KTYQ", "United States"),
    at("MMUN", "Mexico"), at("MMMX", "Mexico"), at("MMSD", "Mexico"),
    at("LFPB", "France"), at("LFMN", "France"),
    at("EGLL", "United Kingdom"), at("EGLC", "United Kingdom"), at("EGGW", "United Kingdom"),
    at("CYYZ", "Canada"), at("ZZZZ", null),
  ];

  it("puts the United States first, then countries with three or more airports, then the rest by country and ICAO", () => {
    const groups = destinationGroups(all, all);
    expect(groups.map((g) => g.title)).toEqual(["United States", "Mexico", "United Kingdom", MORE_COUNTRIES]);
    expect(groups[0]!.items.map((a) => a.icao)).toEqual(["KIND", "KTYQ"]);
    expect(groups[3]!.items.map((a) => a.icao)).toEqual(["CYYZ", "LFMN", "LFPB", "ZZZZ"]);
    expect(destinationGroups(all, all, 4).map((g) => g.title)).toEqual(["United States", MORE_COUNTRIES]);
  });

  it("keeps an airport under its heading while a filter narrows the list, and leaves out empty groups", () => {
    const cancun = all.filter((a) => a.icao === "MMUN");
    expect(destinationGroups(all, cancun)).toEqual([{ title: "Mexico", items: cancun }]);
    const france = all.filter((a) => a.airport.country === "France");
    expect(destinationGroups(all, france)).toEqual([{ title: MORE_COUNTRIES, items: [france[1], france[0]] }]);
    expect(destinationGroups(all, [])).toEqual([]);
  });

  it("files every airport on the schedule once", () => {
    const list = servedAirports(snapshot);
    const groups = destinationGroups(list, list);
    expect(groups[0]?.title).toBe("United States");
    expect(groups.flatMap((g) => g.items.map((a) => a.icao)).sort()).toEqual(list.map((a) => a.icao).sort());
    const countryOf = (a: (typeof list)[number]) => a.airport?.country ?? "Other";
    const size = (country: string) => list.filter((a) => countryOf(a) === country).length;
    for (const g of groups.slice(1)) {
      if (g.title === MORE_COUNTRIES) for (const a of g.items) expect(size(countryOf(a)), a.icao).toBeLessThan(3);
      else expect(size(g.title), g.title).toBeGreaterThanOrEqual(3);
    }
  });
});

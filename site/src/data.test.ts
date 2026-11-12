import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  filterRoutes,
  formatCompact,
  formatDuration,
  formatFeet,
  formatWeight,
  greatCircle,
  hashParam,
  isSnapshot,
  isStale,
  loadSnapshot,
  networkFacts,
  payloadTonnes,
  primaryDivision,
  routeBase,
  routeDivision,
  POINT_TO_POINT,
  progressPercent,
  relativeAge,
  componentText,
  isCrew,
  kgToLb,
  loadCrew,
  weatherBoard,
  windText,
  type Crew,
  type CrewAirport,
  type FuelPlan,
  type Route,
  type WindComponents,
  type Snapshot,
} from "./data";

// The committed snapshot is the "preview": the real schedule mirrored from vAMSYS.
const snapshot: Snapshot = JSON.parse(readFileSync(new URL("../public/data/snapshot.json", import.meta.url), "utf-8"));

describe("snapshot contract", () => {
  it("accepts the snapshot the Python sync writes", () => {
    expect(isSnapshot(snapshot)).toBe(true);
    expect(snapshot.source).toBe("preview");
  });

  it("rejects other shapes", () => {
    expect(isSnapshot(null)).toBe(false);
    expect(isSnapshot({ ...snapshot, schema: "crossroads-public/2" })).toBe(false);
    expect(isSnapshot({ ...snapshot, source: "made-up" })).toBe(false);
    expect(isSnapshot({ ...snapshot, live: undefined })).toBe(false);
  });

  it("loadSnapshot validates and surfaces HTTP failures", async () => {
    const ok = (async () => new Response(JSON.stringify(snapshot), { status: 200 })) as typeof fetch;
    await expect(loadSnapshot(ok)).resolves.toMatchObject({ schema: "crossroads-public/1" });
    const missing = (async () => new Response("", { status: 404 })) as typeof fetch;
    await expect(loadSnapshot(missing)).rejects.toThrow("404");
    const wrong = (async () => new Response("{}", { status: 200 })) as typeof fetch;
    await expect(loadSnapshot(wrong)).rejects.toThrow("unexpected shape");
  });

  it("preview carries no invented activity", () => {
    expect(snapshot.live).toEqual([]);
    expect(snapshot.recent_flights).toEqual([]);
    expect(snapshot.stats.all_time).toBeNull();
  });
});

describe("formatting", () => {
  it("formats durations, altitudes, weights and counts", () => {
    expect(formatDuration(115)).toBe("1h 55m");
    expect(formatDuration(45)).toBe("45m");
    expect(formatDuration(null)).toBe("—");
    expect(formatFeet(41000)).toBe("FL410");
    expect(formatFeet(9500)).toBe("9,500 ft");
    expect(formatCompact(7421)).toBe("7,421");
    expect(formatCompact(812400)).toBe("812.4K");
    expect(formatWeight(91000, "kg")).toBe("91,000 kg");
    expect(formatWeight(null, "kg")).toBe("—");
  });

  it("gives a payload in whole tonnes, from kg or lbs", () => {
    expect(payloadTonnes(102000, "kg")).toBe(102);
    expect(payloadTonnes(48000, "kg")).toBe(48);
    expect(payloadTonnes(225000, "lbs")).toBe(102);
    expect(payloadTonnes(91000, null)).toBe(91);
    expect(payloadTonnes(null, "kg")).toBeNull();
  });

  it("computes progress and age", () => {
    expect(progressPercent({ route_nm: 556, remaining_nm: 210 })).toBe(62);
    expect(progressPercent({ route_nm: null, remaining_nm: 10 })).toBeNull();
    const now = new Date("2026-11-10T18:30:00Z");
    expect(relativeAge("2026-11-10T18:00:00Z", now)).toBe("30 min ago");
    expect(isStale({ generated_at: "2026-11-10T18:00:00Z" }, now)).toBe(false);
    expect(isStale({ generated_at: "2026-11-10T17:00:00Z" }, now)).toBe(true);
  });
});

describe("routes and divisions", () => {
  const routes: Route[] = snapshot.routes;
  const divisions = snapshot.airline.divisions;
  const cargo = divisions.find((d) => d.name === "Cargo Charter");

  it("filters by ICAO, flight number, aircraft type and division", () => {
    expect(filterRoutes(routes, "kteb", "").every((r) => r.from === "KTEB" || r.to === "KTEB")).toBe(true);
    expect(filterRoutes(routes, "CRX101", "").map((r) => r.flight_number)).toEqual(["CX101"]);
    expect(filterRoutes(routes, "", "MD11").every((r) => r.types.includes("MD11"))).toBe(true);
    expect(filterRoutes(routes, "", "", cargo).every((r) => r.kind === "cargo")).toBe(true);
    expect(filterRoutes(routes, "", "")).toHaveLength(routes.length);
  });

  it("assigns each route a primary division by aircraft overlap", () => {
    const ktyq = routes.find((r) => r.flight_number === "CX101")!;
    expect(divisions[primaryDivision(ktyq, divisions)]!.name).toBe("Executive");
    expect(primaryDivision({ types: ["ZZZZ"] }, divisions)).toBe(-1);
  });

  it("files routes under a division by tag first, then by aircraft", () => {
    const name = (callsign: string) => divisions[routeDivision(routes.find((r) => r.callsign === callsign)!, divisions)]!.name;
    expect(name("CRX101")).toBe("Executive");
    expect(name("CRX311")).toBe("Group & Sports Charter");
    expect(name("CRX517")).toBe("Group & Sports Charter"); // group charter that business jets can also fly
    expect(name("CRX607")).toBe("Cargo Charter");
  });

  it("files a route tagged executive-charter under Executive Charter", () => {
    const name = (route: Route, list = divisions) => list[routeDivision(route, list)]!.name;
    // CRX536 is shared by the Gulfstreams and the VIP Airbuses: the tie goes to Executive until tagged.
    const vip = routes.find((r) => r.callsign === "CRX536")!;
    expect(name(vip)).toBe("Executive");
    expect(name({ ...vip, tags: [...vip.tags, "executive-charter"] })).toBe("Executive Charter");
    // Cargo, group and sports tags still decide first.
    const sports = routes.find((r) => r.callsign === "CRX311")!;
    expect(name({ ...sports, tags: [...sports.tags, "executive-charter"] })).toBe("Group & Sports Charter");
    // Without an Executive Charter division the aircraft decide.
    const others = divisions.filter((d) => d.name !== "Executive Charter");
    expect(name({ ...vip, tags: ["executive-charter"] }, others)).toBe("Executive");
  });

  it("filters by base, including point-to-point legs", () => {
    const bases = ["KTYQ", "KIND"];
    const ktyq = filterRoutes(routes, "", "", undefined, "KTYQ", bases);
    expect(ktyq.length).toBeGreaterThan(50);
    expect(ktyq.every((r) => r.from === "KTYQ" || r.to === "KTYQ")).toBe(true);
    const p2p = filterRoutes(routes, "", "", undefined, POINT_TO_POINT, bases);
    expect(p2p.map((r) => r.callsign)).toContain("CRX171");
    expect(p2p.every((r) => routeBase(r, bases) === "")).toBe(true);
    // KTYQ only takes jets up to Citation X size.
    const small = new Set(["C510", "PRM1", "C25C", "LJ35", "E55P", "H25B", "C750"]);
    expect(ktyq.every((r) => r.types.every((t) => small.has(t)))).toBe(true);
  });

  it("summarises the network without counting the bases as destinations", () => {
    const facts = networkFacts(snapshot);
    expect(facts).toMatchObject({ aircraftTypes: 19, routes: 310, destinations: 110 });
    expect(facts.countries).toBeGreaterThanOrEqual(5);
  });
});

describe("geometry and hash routing", () => {
  it("draws a great circle that starts and ends at the airports", () => {
    const path = greatCircle([39.7173, -86.2944], [51.8747, -0.3683], 16);
    expect(path).toHaveLength(17);
    expect(path[0]![0]).toBeCloseTo(39.7173, 3);
    expect(path[16]![1]).toBeCloseTo(-0.3683, 3);
    // The arc bows north of the straight line between Indianapolis and London.
    expect(Math.max(...path.map((p) => p[0]))).toBeGreaterThan(51.9);
  });

  it("reads query parameters from the hash", () => {
    expect(hashParam("division", "#/routes?division=Cargo%20Charter")).toBe("Cargo Charter");
    expect(hashParam("division", "#/routes")).toBe("");
  });
});

describe("crew briefings", () => {
  // crew.json is written by the sync job next to snapshot.json (Kimi's Jumpseat modules + live weather).
  const crew: unknown = JSON.parse(readFileSync(new URL("../public/data/crew.json", import.meta.url), "utf-8"));

  it("accepts the committed crew.json and covers every route and fleet type", () => {
    expect(isCrew(crew)).toBe(true);
    const c = crew as Crew;
    for (const route of snapshot.routes) {
      if (!route.callsign) continue;
      expect(c.plans[route.callsign], route.callsign).toBeTruthy();
      for (const plan of Object.values(c.plans[route.callsign] as Record<string, FuelPlan>)) {
        const phases = Object.values(plan.phases).reduce((sum, p) => sum + p.fuel_kg, 0);
        expect(Math.abs(phases - plan.trip_kg)).toBeLessThanOrEqual(2);
        expect(plan.total_kg).toBeGreaterThan(plan.trip_kg);
      }
    }
    for (const icao of Object.keys(snapshot.airports)) expect(c.airports[icao], icao).toBeTruthy();
  });

  it("rejects other shapes and surfaces HTTP failures", async () => {
    expect(isCrew(null)).toBe(false);
    expect(isCrew({ generated_at: "x" })).toBe(false);
    const missing = (async () => new Response("", { status: 404 })) as typeof fetch;
    await expect(loadCrew(missing)).rejects.toThrow("404");
  });

  it("formats wind and runway components for pilots", () => {
    expect(kgToLb(1000)).toBe(2205);
    expect(windText(undefined)).toBe("—");
    expect(windText({ direction_deg: 0, speed_kt: 0, variable: false })).toBe("Calm");
    expect(windText({ direction_deg: 50, speed_kt: 12.4, gust_kt: 22, variable: false })).toBe("050° 12 kt gusting 22");
    expect(windText({ direction_deg: null, speed_kt: 4, variable: true })).toBe("VRB 4 kt");
    expect(componentText({ headwind_kt: 9, tailwind_kt: 0, crosswind_kt: 3, crosswind_from: "left" } as WindComponents))
      .toBe("9 kt head, 3 kt cross from left");
    expect(componentText({ headwind_kt: -5, tailwind_kt: 5, crosswind_kt: 0, crosswind_from: null } as unknown as WindComponents))
      .toBe("5 kt tail, no crosswind");
  });

  it("puts the weather board's non-VFR airports first, worst first, and counts every airport once", () => {
    const at = (flight_category: CrewAirport["flight_category"]) => ({ flight_category });
    const board = weatherBoard({ KAAA: at("VFR"), KBBB: at("MVFR"), KCCC: at("IFR"), KDDD: at(null), KEEE: at("LIFR"), KFFF: at("VFR"), KGGG: at("MVFR") });
    expect(board.first.map(([icao]) => icao)).toEqual(["KEEE", "KCCC", "KBBB", "KGGG", "KDDD"]);
    expect(board.vfr.map(([icao]) => icao)).toEqual(["KAAA", "KFFF"]);
    expect(board.summary).toBe("2 VFR, 2 MVFR, 2 IFR or lower, 1 no report");
    expect(weatherBoard({ KAAA: at("VFR"), KBBB: at("IFR") }).summary).toBe("1 VFR, 1 IFR or lower");
    expect(weatherBoard({}).summary).toBe("");
    // crew.json carries live weather, so only the invariants are checked against it.
    const airports = (crew as Crew).airports;
    const live = weatherBoard(airports);
    expect(live.first.length + live.vfr.length).toBe(Object.keys(airports).length);
    expect(live.summary.split(", ").reduce((sum, part) => sum + Number(part.split(" ")[0]), 0)).toBe(Object.keys(airports).length);
    expect(live.first.some(([, a]) => a.flight_category === "VFR")).toBe(false);
  });
});

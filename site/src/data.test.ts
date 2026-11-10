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
  primaryDivision,
  progressPercent,
  relativeAge,
  type Route,
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

  it("summarises the network without counting the bases as destinations", () => {
    const facts = networkFacts(snapshot);
    expect(facts).toMatchObject({ aircraftTypes: 15, routes: 56, destinations: 21 });
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

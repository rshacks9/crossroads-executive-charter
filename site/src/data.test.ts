import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  filterRoutes,
  formatCompact,
  formatDuration,
  formatFeet,
  isSnapshot,
  isStale,
  loadSnapshot,
  progressPercent,
  relativeAge,
  type Route,
} from "./data";

const sample = JSON.parse(readFileSync(new URL("../public/data/snapshot.json", import.meta.url), "utf-8"));

describe("snapshot contract", () => {
  it("accepts the snapshot the Python sync writes", () => {
    expect(isSnapshot(sample)).toBe(true);
  });

  it("rejects other shapes", () => {
    expect(isSnapshot(null)).toBe(false);
    expect(isSnapshot({ ...sample, schema: "crossroads-public/2" })).toBe(false);
    expect(isSnapshot({ ...sample, live: undefined })).toBe(false);
  });

  it("loadSnapshot validates and surfaces HTTP failures", async () => {
    const ok = (async () => new Response(JSON.stringify(sample), { status: 200 })) as typeof fetch;
    await expect(loadSnapshot(ok)).resolves.toMatchObject({ schema: "crossroads-public/1" });
    const missing = (async () => new Response("", { status: 404 })) as typeof fetch;
    await expect(loadSnapshot(missing)).rejects.toThrow("404");
    const wrong = (async () => new Response("{}", { status: 200 })) as typeof fetch;
    await expect(loadSnapshot(wrong)).rejects.toThrow("unexpected shape");
  });
});

describe("formatting", () => {
  it("formats durations, altitudes and counts", () => {
    expect(formatDuration(115)).toBe("1h 55m");
    expect(formatDuration(45)).toBe("45m");
    expect(formatDuration(null)).toBe("—");
    expect(formatFeet(41000)).toBe("FL410");
    expect(formatFeet(9500)).toBe("9,500 ft");
    expect(formatCompact(7421)).toBe("7,421");
    expect(formatCompact(812400)).toBe("812.4K");
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

describe("route filtering", () => {
  const routes: Route[] = sample.routes;
  it("matches ICAO, flight number and aircraft type", () => {
    expect(filterRoutes(routes, "kteb", "").every((r) => r.from === "KTEB" || r.to === "KTEB")).toBe(true);
    expect(filterRoutes(routes, "CXC101", "").map((r) => r.flight_number)).toEqual(["101"]);
    expect(filterRoutes(routes, "", "CL60").every((r) => r.types.includes("CL60"))).toBe(true);
    expect(filterRoutes(routes, "", "")).toHaveLength(routes.length);
  });
});

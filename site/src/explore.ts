// Data-driven helpers for the explorer, destination, fleet-detail, planner, search, resources and
// stats pages. Everything here is computed from snapshot.json plus the planning figures in
// content.ts; nothing invents activity, members or real-world facts.

import type { Airport, Division, FleetType, Route, Snapshot } from "./data";
import { formatDuration, routeDivision, routeInDivision } from "./data";
import { FLEET_INFO, baseFor } from "./content";

// ------------------------------------------------------------------ routing

export const PAGES = [
  "", "fleet", "routes", "destinations", "services", "plan", "live", "careers", "handbook",
  "resources", "stats", "crew", "news", "about", "pilots",
] as const;
export type PagePath = (typeof PAGES)[number];

export type Location =
  | { page: PagePath }
  | { page: "airport"; id: string }
  | { page: "type"; id: string }
  | { page: "route"; id: string }
  | { page: "notfound"; raw: string };

/** Old links keep working. */
const ALIASES: Record<string, PagePath> = { events: "news", divisions: "services", ranks: "careers", join: "pilots", airports: "destinations", planner: "plan", charter: "plan", dashboard: "stats" };

/** Parse a hash route such as "#/airport/KASE", "#/fleet/C750", "#/route/CRX101" or "#/routes?type=E190". */
export function parseLocation(hash: string): Location {
  const raw = decodeURIComponent(hash.replace(/^#\/?/, "").split(/[?#]/)[0] ?? "").replace(/\/+$/, "");
  const [head = "", id, ...rest] = raw.split("/");
  const key = head.toLowerCase();
  if (id && !rest.length) {
    const clean = id.toUpperCase();
    if (/^[A-Z0-9]{2,8}$/.test(clean)) {
      if (key === "airport" || key === "destinations") return { page: "airport", id: clean };
      if (key === "fleet" || key === "type") return { page: "type", id: clean };
      if (key === "route" || key === "routes") return { page: "route", id: clean };
    }
    return { page: "notfound", raw };
  }
  if (ALIASES[key]) return { page: ALIASES[key] };
  if ((PAGES as readonly string[]).includes(key) && !id) return { page: key as PagePath };
  return { page: "notfound", raw };
}

export const airportHref = (icao: string) => `#/airport/${icao}`;
export const typeHref = (code: string) => `#/fleet/${code}`;
export const routeHref = (route: Pick<Route, "callsign" | "flight_number" | "from" | "to">) =>
  `#/route/${encodeURIComponent(routeKey(route))}`;
export function routeKey(route: Pick<Route, "callsign" | "flight_number" | "from" | "to">): string {
  return route.callsign ?? route.flight_number ?? `${route.from}${route.to}`;
}

export function findRoute(snapshot: Pick<Snapshot, "routes">, id: string): Route | undefined {
  const wanted = id.toUpperCase();
  return snapshot.routes.find((r) => routeKey(r).toUpperCase() === wanted || r.flight_number?.toUpperCase() === wanted);
}

// ------------------------------------------------------------------ geometry

export const EARTH_NM = 3440.065;

export function distanceNm(a: Pick<Airport, "lat" | "lon">, b: Pick<Airport, "lat" | "lon">): number | null {
  if (a.lat == null || a.lon == null || b.lat == null || b.lon == null) return null;
  const rad = Math.PI / 180;
  const h = Math.sin(((b.lat - a.lat) * rad) / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(((b.lon - a.lon) * rad) / 2) ** 2;
  return Math.round(2 * EARTH_NM * Math.asin(Math.sqrt(h)));
}

/** Initial true course from a to b, degrees 0-359. */
export function initialCourse(a: Pick<Airport, "lat" | "lon">, b: Pick<Airport, "lat" | "lon">): number | null {
  if (a.lat == null || a.lon == null || b.lat == null || b.lon == null) return null;
  const rad = Math.PI / 180;
  const y = Math.sin((b.lon - a.lon) * rad) * Math.cos(b.lat * rad);
  const x = Math.cos(a.lat * rad) * Math.sin(b.lat * rad) - Math.sin(a.lat * rad) * Math.cos(b.lat * rad) * Math.cos((b.lon - a.lon) * rad);
  return Math.round(((Math.atan2(y, x) / rad) + 360) % 360);
}

// ------------------------------------------------------------------ airports

export interface AirportSummary {
  icao: string;
  airport: Airport | undefined;
  routes: Route[];
  departures: number;
  arrivals: number;
  partners: string[];
  types: string[];
  divisions: number[];
  longest: Route | null;
  /** Great-circle distance from the nearer Indianapolis base, nm. */
  fromBase: { base: string; nm: number } | null;
  isBase: boolean;
}

export function airportSummary(snapshot: Pick<Snapshot, "routes" | "airports" | "hubs" | "airline">, icao: string): AirportSummary {
  const routes = snapshot.routes.filter((r) => r.from === icao || r.to === icao);
  const partners = [...new Set(routes.map((r) => (r.from === icao ? r.to : r.from)))].sort();
  const types = [...new Set(routes.flatMap((r) => r.types))].sort();
  const divisions = [...new Set(routes.map((r) => routeDivision(r, snapshot.airline.divisions)).filter((d) => d >= 0))].sort();
  const longest = routes.reduce<Route | null>((max, r) => ((r.distance_nm ?? 0) > (max?.distance_nm ?? -1) ? r : max), null);
  const bases = [...new Set(snapshot.hubs.flatMap((h) => h.airports))];
  const airport = snapshot.airports[icao];
  let fromBase: AirportSummary["fromBase"] = null;
  if (airport && !bases.includes(icao)) {
    for (const base of bases) {
      const b = snapshot.airports[base];
      const nm = b ? distanceNm(b, airport) : null;
      if (nm != null && (!fromBase || nm < fromBase.nm)) fromBase = { base, nm };
    }
  }
  return {
    icao, airport, routes, partners, types, divisions, longest, fromBase,
    departures: routes.filter((r) => r.from === icao).length,
    arrivals: routes.filter((r) => r.to === icao).length,
    isBase: bases.includes(icao),
  };
}

/** Every airport on the schedule, most-served first, then alphabetical. */
export function servedAirports(snapshot: Pick<Snapshot, "routes" | "airports">): { icao: string; airport: Airport | undefined; routes: number }[] {
  const counts = new Map<string, number>();
  for (const r of snapshot.routes) for (const icao of [r.from, r.to]) counts.set(icao, (counts.get(icao) ?? 0) + 1);
  return [...counts]
    .map(([icao, routes]) => ({ icao, airport: snapshot.airports[icao], routes }))
    .sort((a, b) => b.routes - a.routes || a.icao.localeCompare(b.icao));
}

/**
 * A short destination note built only from schedule data, so it is always factual: where the
 * airport is, how far it is from Indianapolis and what Crossroads flies there.
 */
export function destinationBlurb(summary: AirportSummary, divisionNames: string[], typeName: (code: string) => string): string {
  const a = summary.airport;
  const name = a?.name ?? summary.icao;
  if (summary.isBase) {
    return `${name} is a Crossroads base. ${summary.routes.length} scheduled routes start or end here, flown by ${summary.types.length} aircraft types.`;
  }
  const where = a?.country ? ` in ${a.country}` : "";
  const dist = summary.fromBase ? ` It is ${summary.fromBase.nm.toLocaleString("en-US")} nm great-circle from ${summary.fromBase.base}.` : "";
  const divs = summary.divisions.map((i) => divisionNames[i]).filter((n): n is string => Boolean(n));
  const divText = divs.length ? ` Flights here belong to the ${listJoin(divs)} ${divs.length === 1 ? "division" : "divisions"}.` : "";
  const types = summary.types.map(typeName);
  const typeText = types.length <= 3 ? listJoin(types) : `${types.length} types, from the ${types[0]} to the ${types[types.length - 1]}`;
  return `${name}${where} is on ${summary.routes.length} Crossroads ${summary.routes.length === 1 ? "route" : "routes"}.${dist}${divText} Bookable aircraft: ${typeText}.`;
}

export function listJoin(items: string[]): string {
  if (items.length <= 1) return items.join("");
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

// ------------------------------------------------------------------ divisions

/**
 * Where a division's aircraft work from, e.g. "Based KTYQ and KIND": the bases of its types that are
 * in the fleet, in the order the division lists them. Without such types, the configured base.
 */
export function divisionBaseLabel(division: Pick<Division, "fleets" | "base">, fleet: Pick<FleetType, "code">[]): string {
  const flown = new Set(fleet.map((f) => f.code));
  const where = [...new Set(division.fleets.filter((code) => flown.has(code)).map((code) => baseFor(code)))];
  if (where.length) return `Based ${listJoin(where)}`;
  return division.base ? `Based ${division.base}` : "Network-wide";
}

/**
 * What a route map draws, for its legend: the division colours on its lines and whether a dashed
 * cargo line is among them. It follows ExploreMap and LiveMap: one line per airport pair, drawn for
 * the first route listed, coloured by routeDivision (a route without a division takes the first
 * colour), and only when both airports have coordinates.
 */
export function mapLegendKeys(routes: readonly Route[], divisions: Division[], airports: Record<string, Pick<Airport, "lat" | "lon">>): { divisions: number[]; cargo: boolean } {
  const pairs = new Set<string>();
  const used = new Set<number>();
  let cargo = false;
  for (const route of routes) {
    const pair = [route.from, route.to].sort().join("-");
    if (pairs.has(pair)) continue;
    pairs.add(pair);
    const a = airports[route.from];
    const b = airports[route.to];
    if (!a || !b || a.lat == null || a.lon == null || b.lat == null || b.lon == null) continue;
    used.add(Math.max(0, routeDivision(route, divisions)));
    if (route.kind === "cargo") cargo = true;
  }
  return { divisions: [...used].sort((x, y) => x - y), cargo };
}

// ------------------------------------------------------------------ fleet

export function routesForType(snapshot: Pick<Snapshot, "routes">, code: string): Route[] {
  return snapshot.routes.filter((r) => r.types.includes(code)).sort((a, b) => (b.distance_nm ?? 0) - (a.distance_nm ?? 0));
}

export const isFreighterType = (t: Pick<FleetType, "type">) => t.type === "cargo" || t.type === "cargo-containers";

// ------------------------------------------------------------------ route lists

const byFlight = (a: Route, b: Route) => routeKey(a).localeCompare(routeKey(b), "en", { numeric: true });
const orLast = (value: number | null) => value ?? Number.MAX_SAFE_INTEGER;

/**
 * The one default order for route lists: routes that depart one of `from` (the airport a page is
 * about, or the bases) first, then shortest first, then by flight. Returns a new array.
 */
export function sortRoutes(routes: readonly Route[], from: readonly string[]): Route[] {
  const group = (r: Route) => (from.includes(r.from) ? 0 : 1);
  return [...routes].sort((a, b) => group(a) - group(b) || orLast(a.distance_nm) - orLast(b.distance_nm) || byFlight(a, b));
}

export type RouteSortKey = "flight" | "from" | "to" | "distance" | "block";

/**
 * Reorder a route list by one column, either way. Missing figures go last both ways; equal values
 * keep the order they came in (the sort is stable).
 */
export function sortRoutesBy(routes: readonly Route[], key: RouteSortKey, dir: "asc" | "desc"): Route[] {
  const sign = dir === "asc" ? 1 : -1;
  const text = (get: (r: Route) => string) => (a: Route, b: Route) => sign * get(a).localeCompare(get(b), "en", { numeric: true });
  const figure = (get: (r: Route) => number | null) => (a: Route, b: Route) => {
    const x = get(a);
    const y = get(b);
    if (x == null || y == null) return (x == null ? 1 : 0) - (y == null ? 1 : 0);
    return sign * (x - y);
  };
  const compare: Record<RouteSortKey, (a: Route, b: Route) => number> = {
    flight: text(routeKey),
    from: text((r) => r.from),
    to: text((r) => r.to),
    distance: figure((r) => r.distance_nm),
    block: figure((r) => r.duration_min),
  };
  return [...routes].sort(compare[key]);
}

/**
 * The airport a route row names under its codes: the end that is not `focus` on that airport's
 * page; elsewhere the end that is not a base, or the destination when neither or both ends are.
 */
export function routeOtherEnd(route: Pick<Route, "from" | "to">, focus: string | undefined, bases: readonly string[]): string {
  if (focus) return route.from === focus ? route.to : route.from;
  return bases.includes(route.to) && !bases.includes(route.from) ? route.from : route.to;
}

// ------------------------------------------------------------------ charter planner

export type FitStatus = "fits" | "tight" | "short-range" | "too-small" | "wrong-role";

export interface FleetSuggestion {
  type: FleetType;
  status: FitStatus;
  reason: string;
  rangeNm: number | null;
  capacity: number | null;
  /** Scheduled Crossroads routes between the two airports this type can be booked on, either direction. */
  scheduled: Route[];
}

export interface PlanRequest {
  from: string;
  to: string;
  /** Passengers, or cargo weight in kg when cargo is true. */
  load: number;
  cargo: boolean;
}

/** Share of planning range treated as comfortable; above it the leg is "tight" (fuel stop likely into winds). */
export const COMFORT_SHARE = 0.85;

/**
 * Rank fleet types for a simulated charter: freighters for cargo, passenger types for people; the
 * smallest aircraft that carries the load and covers the distance comes first. Uses the rounded
 * Crossroads planning ranges, so it is a simulation aid, not a performance calculation.
 */
export function suggestFleet(snapshot: Pick<Snapshot, "fleet" | "routes" | "airports">, request: PlanRequest): { distance: number | null; suggestions: FleetSuggestion[] } {
  const a = snapshot.airports[request.from];
  const b = snapshot.airports[request.to];
  const distance = a && b ? distanceNm(a, b) : null;
  const pair = snapshot.routes.filter((r) => (r.from === request.from && r.to === request.to) || (r.from === request.to && r.to === request.from));
  const rank: Record<FitStatus, number> = { fits: 0, tight: 1, "short-range": 2, "too-small": 3, "wrong-role": 4 };
  const suggestions = snapshot.fleet.map((type): FleetSuggestion => {
    const rangeNm = FLEET_INFO[type.code]?.range_nm ?? null;
    const freighter = isFreighterType(type);
    const capacity = freighter ? type.max_cargo : type.max_pax;
    const scheduled = pair.filter((r) => r.types.includes(type.code));
    let status: FitStatus;
    let reason: string;
    if (freighter !== request.cargo) {
      status = "wrong-role";
      reason = freighter ? "Freighter: no passenger cabin" : "Passenger aircraft";
    } else if (capacity != null && request.load > capacity) {
      status = "too-small";
      reason = freighter ? `Payload ${capacity.toLocaleString("en-US")} ${type.weight_unit ?? "kg"} is below the load` : `${capacity} seats is fewer than the group`;
    } else if (distance != null && rangeNm != null && distance > rangeNm) {
      status = "short-range";
      reason = `Planning range ${rangeNm.toLocaleString("en-US")} nm; needs a fuel stop`;
    } else if (distance != null && rangeNm != null && distance > rangeNm * COMFORT_SHARE) {
      status = "tight";
      reason = `Within range but close to the ${rangeNm.toLocaleString("en-US")} nm limit; check winds in SimBrief`;
    } else {
      status = "fits";
      reason = rangeNm != null ? `Nonstop within the ${rangeNm.toLocaleString("en-US")} nm planning range` : "Fits the load";
    }
    return { type, status, reason, rangeNm, capacity, scheduled };
  });
  suggestions.sort((x, y) => rank[x.status] - rank[y.status] || (y.scheduled.length ? 1 : 0) - (x.scheduled.length ? 1 : 0) || (x.capacity ?? 0) - (y.capacity ?? 0) || (x.rangeNm ?? 0) - (y.rangeNm ?? 0));
  return { distance, suggestions };
}

// ------------------------------------------------------------------ search

export type SearchKind = "Airport" | "Route" | "Aircraft" | "Page";

export interface SearchEntry {
  kind: SearchKind;
  title: string;
  subtitle: string;
  href: string;
  terms: string;
}

const PAGE_ENTRIES: { title: string; subtitle: string; href: string; terms: string }[] = [
  { title: "Route network explorer", subtitle: "Map, filters and every route", href: "#/routes", terms: "network map schedule explorer routes" },
  { title: "Destinations", subtitle: "Every airport we serve", href: "#/destinations", terms: "airports destinations cities" },
  { title: "Fleet", subtitle: "All aircraft types", href: "#/fleet", terms: "fleet aircraft types jets" },
  { title: "Plan a charter", subtitle: "Simulation planning tool", href: "#/plan", terms: "plan charter planner trip quote" },
  { title: "Network stats", subtitle: "Routes by division, longest legs", href: "#/stats", terms: "stats statistics dashboard numbers" },
  { title: "Pilot resources", subtitle: "Checklists, briefing cards, downloads", href: "#/resources", terms: "resources downloads checklist briefing card simbrief pegasus" },
  { title: "Crew Tools", subtitle: "Weather, fuel and approach briefings", href: "#/crew", terms: "crew tools weather metar taf fuel approach" },
  { title: "Pilot handbook", subtitle: "SOPs, fuel policy, landing rates", href: "#/handbook", terms: "handbook sop rules fuel policy landing cost index" },
  { title: "Careers and ranks", subtitle: "Cadet to Chief Pilot", href: "#/careers", terms: "career ranks promotion hours" },
  { title: "How to fly with us", subtitle: "Join on vAMSYS", href: "#/pilots", terms: "join apply fly with us vamsys pegasus" },
  { title: "Divisions and services", subtitle: "Executive, charter and cargo", href: "#/services", terms: "divisions services executive charter cargo sports" },
  { title: "Live flights", subtitle: "Flights in progress", href: "#/live", terms: "live flights tracking map" },
  { title: "News and NOTAMs", subtitle: "From the ops desk", href: "#/news", terms: "news notam updates" },
  { title: "About", subtitle: "Built at the Crossroads of America", href: "#/about", terms: "about indianapolis" },
];

export function buildSearchIndex(snapshot: Pick<Snapshot, "routes" | "airports" | "fleet">): SearchEntry[] {
  const entries: SearchEntry[] = [];
  const served = servedAirports(snapshot);
  for (const { icao, airport, routes } of served) {
    entries.push({
      kind: "Airport",
      title: `${icao} · ${airport?.name ?? icao}`,
      subtitle: `${airport?.country ?? ""}${airport?.country ? " · " : ""}${routes} ${routes === 1 ? "route" : "routes"}`,
      href: airportHref(icao),
      terms: [icao, airport?.iata, airport?.name, airport?.country].filter(Boolean).join(" "),
    });
  }
  for (const type of snapshot.fleet) {
    const info = FLEET_INFO[type.code];
    entries.push({
      kind: "Aircraft",
      title: type.name,
      subtitle: `${type.code}${info ? ` · ${info.role}` : ""} · base ${baseFor(type.code)}`,
      href: typeHref(type.code),
      terms: [type.code, type.name, info?.role, ...type.registrations].filter(Boolean).join(" "),
    });
  }
  for (const route of snapshot.routes) {
    const a = snapshot.airports[route.from];
    const b = snapshot.airports[route.to];
    entries.push({
      kind: "Route",
      title: `${routeKey(route)} ${route.from} → ${route.to}`,
      subtitle: `${a?.name ?? route.from} to ${b?.name ?? route.to} · ${route.distance_nm ?? "?"} nm · ${formatDuration(route.duration_min)}`,
      href: routeHref(route),
      terms: [route.callsign, route.flight_number, route.from, route.to, a?.name, b?.name, a?.iata, b?.iata, ...route.types, ...route.tags].filter(Boolean).join(" "),
    });
  }
  for (const page of PAGE_ENTRIES) entries.push({ kind: "Page", ...page });
  return entries;
}

/** Rank entries for a query: every word must match; exact codes and prefixes score highest. */
export function search(index: SearchEntry[], query: string, limit = 12): SearchEntry[] {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const kindBonus: Record<SearchKind, number> = { Airport: 3, Aircraft: 3, Page: 2, Route: 0 };
  const scored: { entry: SearchEntry; score: number }[] = [];
  for (const entry of index) {
    const haystack = `${entry.title} ${entry.terms}`.toLowerCase();
    const tokens = haystack.split(/[\s·→,()/-]+/);
    let score = kindBonus[entry.kind];
    let ok = true;
    for (const w of words) {
      if (tokens.includes(w)) score += 10;
      else if (tokens.some((t) => t.startsWith(w))) score += 5;
      else if (haystack.includes(w)) score += 1;
      else { ok = false; break; }
    }
    // A bare airport code should list the airport first, then its routes.
    if (ok && entry.kind === "Route" && words.length === 1 && entry.title.toLowerCase().startsWith(words[0]!)) score += 8;
    if (ok) scored.push({ entry, score });
  }
  return scored.sort((a, b) => b.score - a.score || a.entry.title.localeCompare(b.entry.title)).slice(0, limit).map((s) => s.entry);
}

// ------------------------------------------------------------------ network stats

export interface Bar { label: string; value: number; index?: number; href?: string }

export interface NetworkStats {
  byDivision: Bar[];
  byType: Bar[];
  topAirports: Bar[];
  distanceBands: Bar[];
  longest: Route | null;
  shortest: Route | null;
  averageNm: number;
  totalScheduledNm: number;
  international: number;
  countries: number;
  routes: number;
}

export const DISTANCE_BANDS: [number, number, string][] = [
  [0, 300, "Under 300 nm"],
  [300, 700, "300–699 nm"],
  [700, 1200, "700–1,199 nm"],
  [1200, 2000, "1,200–1,999 nm"],
  [2000, 3500, "2,000–3,499 nm"],
  [3500, Infinity, "3,500 nm and over"],
];

export function networkStats(snapshot: Pick<Snapshot, "routes" | "airports" | "fleet" | "hubs" | "airline">): NetworkStats {
  const { routes } = snapshot;
  const divisions = snapshot.airline.divisions;
  // Every route a division's aircraft can fly, as the home page, services and the routes filter count
  // them: a route shared by two divisions counts for both.
  const byDivision = divisions.map((d, index) => ({ label: d.name, index, value: routes.filter((r) => routeInDivision(r, d)).length, href: `#/routes?division=${encodeURIComponent(d.name)}` }));
  const byType = snapshot.fleet
    .map((f) => ({ label: f.name, value: routes.filter((r) => r.types.includes(f.code)).length, href: typeHref(f.code) }))
    .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label));
  const bases = new Set(snapshot.hubs.flatMap((h) => h.airports));
  const topAirports = servedAirports(snapshot)
    .filter((a) => !bases.has(a.icao))
    .slice(0, 10)
    .map((a) => ({ label: `${a.icao} · ${a.airport?.name ?? a.icao}`, value: a.routes, href: airportHref(a.icao) }));
  const withDistance = routes.filter((r) => r.distance_nm != null);
  const distanceBands = DISTANCE_BANDS.map(([lo, hi, label]) => ({ label, value: withDistance.filter((r) => r.distance_nm! >= lo && r.distance_nm! < hi).length }));
  const sorted = [...withDistance].sort((a, b) => a.distance_nm! - b.distance_nm!);
  const total = withDistance.reduce((s, r) => s + r.distance_nm!, 0);
  const home = snapshot.airports["KIND"]?.country ?? "United States";
  const served = new Set(routes.flatMap((r) => [r.from, r.to]));
  return {
    byDivision, byType, topAirports, distanceBands,
    longest: sorted[sorted.length - 1] ?? null,
    shortest: sorted[0] ?? null,
    averageNm: withDistance.length ? Math.round(total / withDistance.length) : 0,
    totalScheduledNm: total,
    international: routes.filter((r) => [r.from, r.to].some((i) => (snapshot.airports[i]?.country ?? home) !== home)).length,
    countries: new Set([...served].map((i) => snapshot.airports[i]?.country).filter(Boolean)).size,
    routes: routes.length,
  };
}

// ------------------------------------------------------------------ links and downloads

/** SimBrief's documented redirect method pre-fills a dispatch from these fields. */
export function simbriefUrl(route: Pick<Route, "from" | "to" | "flight_number" | "callsign">, type: string): string {
  const number = (route.callsign ?? route.flight_number ?? "").replace(/^[A-Z]+/, "");
  const params = new URLSearchParams({ airline: "CRX", fltnum: number, type, orig: route.from, dest: route.to });
  return `https://www.simbrief.com/system/dispatch.php?${params.toString()}`;
}

/** A plain-text briefing card for one route, for printing or keeping next to the simulator. */
export function briefingCard(snapshot: Pick<Snapshot, "airports" | "fleet" | "airline">, route: Route, runways?: Record<string, { id: string; length_ft: number | null }[]>): string {
  const a = snapshot.airports[route.from];
  const b = snapshot.airports[route.to];
  const names = Object.fromEntries(snapshot.fleet.map((f) => [f.code, f.name]));
  const course = a && b ? initialCourse(a, b) : null;
  const rwy = (icao: string) => {
    const list = runways?.[icao];
    if (!list?.length) return "see charts";
    return list.map((r) => `${r.id}${r.length_ft ? ` (${Math.round(r.length_ft).toLocaleString("en-US")} ft)` : ""}`).join(", ");
  };
  const line = "-".repeat(60);
  return [
    `${snapshot.airline.name.toUpperCase()} - ROUTE BRIEFING CARD`,
    "Fictional virtual airline. For flight simulation only, never for real-world navigation.",
    line,
    `Flight      ${route.callsign ?? "-"}   (${route.flight_number ?? "-"})`,
    `From        ${route.from}  ${a?.name ?? ""}`,
    `To          ${route.to}  ${b?.name ?? ""}`,
    `Distance    ${route.distance_nm ?? "-"} nm great-circle${course != null ? `, initial course ${String(course).padStart(3, "0")} true` : ""}`,
    `Block       ${formatDuration(route.duration_min)} (schedule estimate)`,
    `Type        ${route.kind === "cargo" ? "Cargo charter" : "Passenger"}${route.tags.length ? ` - ${route.tags.join(", ")}` : ""}`,
    `Aircraft    ${route.types.map((t) => `${t} ${names[t] ?? ""}`.trim()).join("; ")}`,
    line,
    `Runways ${route.from}: ${rwy(route.from)}`,
    `Runways ${route.to}: ${rwy(route.to)}`,
    line,
    "BEFORE YOU FLY",
    "[ ] Book the route in the vAMSYS pilot portal",
    "[ ] Generate the SimBrief OFP from the booking",
    "[ ] Check weather and runway winds in Crew Tools",
    "[ ] Block fuel includes 45 min final reserve",
    "[ ] Start Pegasus before engine start",
    "",
    "ON THE DAY",
    "[ ] 250 kt below 10,000 ft (US) unless ATC says otherwise",
    "[ ] Stabilised by 1,000 ft in cloud, 500 ft visual - or go around",
    "[ ] Target touchdown 60-250 fpm",
    "[ ] Leave Pegasus running until engines are off at the gate",
    "[ ] Diversions, go-arounds and firm landings go in the PIREP comments",
    line,
    `Generated from the published Crossroads schedule.`,
  ].join("\n");
}

/** The schedule as CSV (RFC 4180 quoting), for spreadsheets. */
export function scheduleCsv(snapshot: Pick<Snapshot, "routes" | "airports" | "airline">): string {
  const q = (v: string | number | null | undefined) => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const header = ["callsign", "flight_number", "from", "from_name", "to", "to_name", "distance_nm", "block_min", "kind", "division", "aircraft", "tags"];
  const rows = snapshot.routes.map((r) => {
    const d = routeDivision(r, snapshot.airline.divisions);
    return [r.callsign, r.flight_number, r.from, snapshot.airports[r.from]?.name, r.to, snapshot.airports[r.to]?.name, r.distance_nm, r.duration_min, r.kind, d >= 0 ? snapshot.airline.divisions[d]!.name : "", r.types.join(" "), r.tags.join(" ")].map(q).join(",");
  });
  return [header.join(","), ...rows].join("\n") + "\n";
}

// ------------------------------------------------------------------ keyboard map markers

/** Tab and arrow order for airport markers: bases first, then west to east (ties by ICAO). */
export function markerOrder(icaos: Iterable<string>, airports: Record<string, Pick<Airport, "lon">>, bases: string[]): string[] {
  return [...new Set(icaos)].sort((a, b) => {
    const ba = bases.indexOf(a);
    const bb = bases.indexOf(b);
    if (ba >= 0 || bb >= 0) return (ba < 0 ? 99 : ba) - (bb < 0 ? 99 : bb);
    return (airports[a]?.lon ?? 999) - (airports[b]?.lon ?? 999) || a.localeCompare(b);
  });
}

/** Accessible name for a marker, e.g. "KTYQ Indianapolis Executive, 24 routes". */
export function markerLabel(icao: string, airport: Pick<Airport, "name"> | undefined, routes: number, opts: { base?: boolean; selected?: boolean } = {}): string {
  const name = airport?.name ? ` ${airport.name}` : "";
  return `${icao}${name}${opts.base ? " (Crossroads base)" : ""}, ${routes} ${routes === 1 ? "route" : "routes"}${opts.selected ? ", selected" : ""}`;
}

export type MarkerAction = "select" | "next" | "prev" | "first" | "last" | "clear";

export function markerKeyAction(key: string): MarkerAction | null {
  switch (key) {
    case "Enter":
    case " ":
    case "Spacebar":
      return "select";
    case "ArrowRight":
    case "ArrowDown":
      return "next";
    case "ArrowLeft":
    case "ArrowUp":
      return "prev";
    case "Home":
      return "first";
    case "End":
      return "last";
    case "Escape":
    case "Esc":
      return "clear";
    default:
      return null;
  }
}

/** The minimal DOM surface the marker wiring needs (an SVG path in the browser, a fake in tests). */
export interface MarkerElement {
  setAttribute(name: string, value: string): void;
  addEventListener(type: "keydown", listener: (event: { key: string; preventDefault(): void; stopPropagation(): void }) => void): void;
  focus?(options?: { preventScroll?: boolean }): void;
}

/**
 * Make one map marker a keyboard button: focusable, named, Enter/Space select it, arrows/Home/End
 * move focus through the ordered markers, Escape clears the selection. Keys are kept from Leaflet's
 * own keyboard panning.
 */
export function wireMarker(el: MarkerElement, icao: string, label: string, pressed: boolean, handlers: { onSelect: (icao: string) => void; onMove: (icao: string, action: "next" | "prev" | "first" | "last") => void; onClear?: () => void }): void {
  el.setAttribute("tabindex", "0");
  el.setAttribute("role", "button");
  el.setAttribute("aria-label", label);
  el.setAttribute("aria-pressed", pressed ? "true" : "false");
  el.setAttribute("data-icao", icao);
  el.addEventListener("keydown", (event) => {
    const action = markerKeyAction(event.key);
    if (!action) return;
    if (action === "clear" && !handlers.onClear) return;
    event.preventDefault();
    event.stopPropagation();
    if (action === "select") handlers.onSelect(icao);
    else if (action === "clear") handlers.onClear!();
    else handlers.onMove(icao, action);
  });
}

/** Index of the marker to focus after an arrow/Home/End press; wraps around at the ends. */
export function moveIndex(current: number, count: number, action: "next" | "prev" | "first" | "last"): number {
  if (count <= 0) return -1;
  if (action === "first") return 0;
  if (action === "last") return count - 1;
  return action === "next" ? (current + 1) % count : (current - 1 + count) % count;
}

// ------------------------------------------------------------------ page meta

export function setMeta(title: string, description: string): void {
  if (typeof document === "undefined") return;
  document.title = title;
  let tag = document.querySelector<HTMLMetaElement>('meta[name="description"]');
  if (!tag) {
    tag = document.createElement("meta");
    tag.name = "description";
    document.head.appendChild(tag);
  }
  tag.content = description;
}

export function download(filename: string, text: string, type = "text/plain"): void {
  const blob = new Blob([text], { type: `${type};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

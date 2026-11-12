// Data-driven helpers for the explorer, destination, fleet-detail, planner, search, resources and
// stats pages. Everything here is computed from snapshot.json plus the planning figures in
// content.ts; nothing invents activity, members or real-world facts.

import type { Airport, Crew, CrewRunway, Division, FleetType, Route, Snapshot } from "./data";
import { formatDuration, formatNumber, routeDivision, routeInDivision } from "./data";
import { FLEET_INFO, TOURS, baseFor } from "./content";
import type { Tour } from "./content";

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

/** The Destinations heading for countries with too few airports for a group of their own. */
export const MORE_COUNTRIES = "More countries and territories";

/**
 * The Destinations index in groups: the United States first, then each country with at least `min`
 * airports on the whole list (`all`), alphabetical, then MORE_COUNTRIES with the rest, by country and
 * then ICAO. Groups are decided on `all`, so an airport keeps its heading while a filter narrows
 * `shown`; within a group `shown`'s order is kept, and empty groups are left out.
 */
export function destinationGroups<T extends { icao: string; airport?: Pick<Airport, "country"> | undefined }>(all: readonly T[], shown: readonly T[], min = 3): { title: string; items: T[] }[] {
  const us = "United States";
  const country = (item: T) => item.airport?.country ?? "Other";
  const counts = new Map<string, number>();
  for (const item of all) counts.set(country(item), (counts.get(country(item)) ?? 0) + 1);
  const groups = new Map<string, T[]>();
  const more: T[] = [];
  for (const item of shown) {
    const c = country(item);
    if (c === us || (counts.get(c) ?? 0) >= min) groups.set(c, [...(groups.get(c) ?? []), item]);
    else more.push(item);
  }
  const titles = [...groups.keys()].sort((a, b) => (a === us ? -1 : b === us ? 1 : a.localeCompare(b)));
  const result = titles.map((title) => ({ title, items: groups.get(title) ?? [] }));
  if (more.length) result.push({ title: MORE_COUNTRIES, items: more.sort((a, b) => country(a).localeCompare(country(b)) || a.icao.localeCompare(b.icao)) });
  return result;
}

/** One runway strip, built from the two ends that crew.json lists for it. */
export interface RunwayStrip {
  /** The sorted pair of end names, e.g. "05R/23L". */
  key: string;
  /** "05R/23L", the lower-numbered end first; an end without a reciprocal stands alone. */
  label: string;
  /** "045°/225° true": each end's heading from its own row, in the label's order; one heading when the other end is missing. */
  headings: string | null;
  length_ft: number | null;
  width_ft: number | null;
  surface: string | null;
}

const runwayNumber = (id: string) => Number.parseInt(id, 10);
const trueHeading = (deg: number | null) => (deg == null ? "—" : `${String(Math.round(deg)).padStart(3, "0")}°`);

/**
 * One row per runway strip: crew.json lists every strip twice, once from each end. Ends pair up on
 * the sorted id/reciprocal pair; strips keep the order of the end listed first.
 */
export function runwayStrips(runways: readonly CrewRunway[]): RunwayStrip[] {
  const byId = new Map(runways.map((r): [string, CrewRunway] => [r.id, r]));
  const strips = new Map<string, RunwayStrip>();
  for (const r of runways) {
    const key = r.reciprocal ? [r.id, r.reciprocal].sort().join("/") : r.id;
    if (strips.has(key)) continue;
    const other = r.reciprocal ? byId.get(r.reciprocal) : undefined;
    const ends = other ? (runwayNumber(other.id) < runwayNumber(r.id) ? [other, r] : [r, other]) : [r];
    strips.set(key, {
      key,
      label: other ? ends.map((e) => e.id).join("/") : r.reciprocal ? `${r.id}/${r.reciprocal}` : r.id,
      headings: ends.some((e) => e.heading_true_deg != null) ? `${ends.map((e) => trueHeading(e.heading_true_deg)).join("/")} true` : null,
      length_ft: ends.map((e) => e.length_ft).find((v) => v != null) ?? null,
      width_ft: ends.map((e) => e.width_ft).find((v) => v != null) ?? null,
      surface: ends.map((e) => e.surface).find((v) => v != null) ?? null,
    });
  }
  return [...strips.values()];
}

/**
 * A short destination note built only from schedule data, so it is always factual: where the
 * airport is, how far it is from Indianapolis and what Crossroads flies there.
 */
export function destinationBlurb(summary: AirportSummary, divisionNames: string[], typeName: (code: string) => string): string {
  const a = summary.airport;
  const name = a?.name ?? summary.icao;
  if (summary.isBase) {
    // The types based at this airport, and those that fly in from the other base.
    const based = summary.types.filter((code) => baseFor(code) === summary.icao).length;
    const visiting = summary.types.length - based;
    const typeWord = (n: number) => (n === 1 ? "type" : "types");
    const flown = `the ${based} ${typeWord(based)} based here${visiting ? ` and ${visiting} visiting ${typeWord(visiting)}` : ""}`;
    return `${name} is a Crossroads base. ${summary.routes.length} scheduled routes start or end here, flown by ${flown}.`;
  }
  const where = a?.country ? ` in ${inCountry(a.country)}` : "";
  const dist = summary.fromBase ? ` It is ${summary.fromBase.nm.toLocaleString("en-US")} nm great-circle from ${summary.fromBase.base}.` : "";
  const divs = summary.divisions.map((i) => divisionNames[i]).filter((n): n is string => Boolean(n));
  const divText = divs.length ? ` Flights here belong to the ${listJoin(divs)} ${divs.length === 1 ? "division" : "divisions"}.` : "";
  const types = summary.types.map(typeName);
  // Not "from the X to the Y": the list is in schedule order, not by size.
  const typeText = types.length <= 3 ? listJoin(types) : `${types.length} types, including the ${types[0]} and the ${types[1]}`;
  return `${name}${where} is on ${summary.routes.length} Crossroads ${summary.routes.length === 1 ? "route" : "routes"}.${dist}${divText} Bookable aircraft: ${typeText}.`;
}

/** A country as it reads after "in": "the United States", "the Bahamas", "France". */
export function inCountry(country: string): string {
  const the = /^(United |U\.S\. )|(Islands|Republic|Emirates)$/.test(country) || ["Bahamas", "Netherlands", "Philippines", "Gambia", "Maldives"].includes(country);
  return the ? `the ${country}` : country;
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

/**
 * Types that come with every edition of MSFS 2024: the Standard edition's aircraft, labelled
 * "(MSFS 2024 Standard)" in site.config.json. Types that only the Premium Deluxe and Aviator editions
 * include, such as the Citation Longitude, don't count: not every pilot has them.
 */
export function defaultSimTypes(snapshot: Pick<Snapshot, "airline" | "fleet">): FleetType[] {
  const labels = snapshot.airline.sim_aircraft ?? {};
  return snapshot.fleet.filter((f) => /[(]MSFS 2024 Standard[)]/i.test(labels[f.code] ?? ""));
}

/** Routes that at least one of `types` may fly. */
export function routesForTypes(snapshot: Pick<Snapshot, "routes">, types: readonly Pick<FleetType, "code">[]): Route[] {
  const codes = new Set(types.map((t) => t.code));
  return snapshot.routes.filter((r) => r.types.some((code) => codes.has(code)));
}

export interface FirstFlight {
  route: Route;
  tour: Tour;
  /** The types on this route that come with MSFS 2024. */
  defaults: FleetType[];
}

/**
 * The suggested first flight: the first leg of the starter tour (content.ts), when that leg is on the
 * schedule. Null when there is no starter tour or its first leg is not a route.
 */
export function firstFlight(snapshot: Pick<Snapshot, "airline" | "fleet" | "routes">, tours: readonly Tour[] = TOURS): FirstFlight | null {
  const tour = tours.find((t) => t.starter);
  const leg = tour?.legs[0];
  if (!tour || !leg) return null;
  const route = snapshot.routes.find((r) => r.from === leg[0] && r.to === leg[1]);
  if (!route) return null;
  return { route, tour, defaults: defaultSimTypes(snapshot).filter((f) => route.types.includes(f.code)) };
}

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

/** A leg onward from a route's arrival, with the aircraft types it shares with that route. */
export interface OnwardLeg<R> {
  route: R;
  shared: string[];
}

/**
 * Legs onward from a route's arrival airport: the departures from there (other than `except`, the
 * return leg) that share an aircraft type with the route, most shared types first, then shortest.
 * At most `limit` legs. A leg the arriving aircraft cannot fly is never offered, however few qualify:
 * the route page then also links to the airport's page, which lists every departure.
 */
export function onwardLegs<R extends Pick<Route, "from" | "types" | "distance_nm">>(routes: readonly R[], route: Pick<Route, "to" | "types">, except?: R, limit = 7): OnwardLeg<R>[] {
  const nearest = (a: OnwardLeg<R>, b: OnwardLeg<R>) => orLast(a.route.distance_nm) - orLast(b.route.distance_nm);
  return routes
    .filter((r) => r.from === route.to && r !== except)
    .map((r): OnwardLeg<R> => ({ route: r, shared: r.types.filter((t) => route.types.includes(t)) }))
    .filter((leg) => leg.shared.length > 0)
    .sort((a, b) => b.shared.length - a.shared.length || nearest(a, b))
    .slice(0, limit);
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
      // No-break spaces keep "3,977 nm" and "2h 27m" whole when a phone wraps the line.
      subtitle: `${a?.name ?? route.from} to ${b?.name ?? route.to} · ${route.distance_nm != null ? formatNumber(route.distance_nm) : "?"}\u00a0nm · ${formatDuration(route.duration_min).replace(" ", "\u00a0")}`,
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

/** Window event that opens the search dialog (App.tsx listens; the 404 page's search button sends it). */
export const SEARCH_EVENT = "crossroads:search";

/** Ctrl+K, or Cmd+K on a Mac, opens search. There is deliberately no single-key shortcut such as "/":
 *  it can fire while speech-input users dictate, and it could not be turned off (WCAG 2.1.4). */
export function isSearchShortcut(e: Pick<KeyboardEvent, "key" | "ctrlKey" | "metaKey" | "altKey">): boolean {
  return (e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === "k";
}

/** The search dialog's status line, announced as it changes: a hint while the field is empty, then
 *  how many results there are, or that nothing matches. */
export function searchStatus(query: string, count: number): string {
  const q = query.trim();
  if (!q) return "Type an ICAO or IATA code, a city, a callsign or an aircraft. ↑ ↓ to move, Enter to open, Esc to close.";
  if (count <= 0) return `Nothing matches “${q}”.`;
  return `${count} ${count === 1 ? "result" : "results"}. ↑ ↓ to choose, Enter to open.`;
}

/** The result an arrow key moves to. -1 means none is active: the dialog opens that way (Enter then
 *  opens the first result), and the first ArrowDown lands on the first result. */
export function moveSearchActive(active: number, count: number, key: "ArrowDown" | "ArrowUp"): number {
  if (count <= 0) return -1;
  return Math.max(0, Math.min(count - 1, key === "ArrowDown" ? active + 1 : active - 1));
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

/**
 * The runways a briefing card lists at each airport: one entry per strip ("05R/23L") with its length,
 * as the runway table shows them, although crew.json lists every strip once from each end.
 */
export function briefingRunways(airports: Crew["airports"] | null | undefined, icaos: readonly string[]): Record<string, { id: string; length_ft: number | null }[]> | undefined {
  if (!airports) return undefined;
  return Object.fromEntries(icaos.map((icao) => [icao, runwayStrips(airports[icao]?.runways ?? []).map((s) => ({ id: s.label, length_ft: s.length_ft }))]));
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

/** Arrow-key order for airport markers (the first is the default tab stop): bases first, then west to east (ties by ICAO). */
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

export interface MarkerOptions {
  /** The map's one tab stop (tabindex 0); the other markers take -1 and are reached with the arrow keys. */
  tabStop: boolean;
  /** "button" (with aria-pressed) where selecting toggles a selection, "link" where it opens a page. */
  role: "button" | "link";
}

/**
 * The marker that holds the map's tab stop (a roving tabindex): the selected airport when it is
 * drawn, else the marker that had focus before a redraw, else the first in keyboard order.
 */
export function markerTabStop(order: readonly string[], selected?: string | null, refocus?: string | null): string | undefined {
  if (selected && order.includes(selected)) return selected;
  if (refocus && order.includes(refocus)) return refocus;
  return order[0];
}

/**
 * Make one map marker a keyboard button or link: named, Enter/Space select it, arrows/Home/End move
 * focus through the ordered markers, Escape clears the selection. Only the tab-stop marker is in
 * the tab order, so one Tab enters the markers and the next leaves them. Keys are kept from
 * Leaflet's own keyboard panning.
 */
export function wireMarker(el: MarkerElement, icao: string, label: string, pressed: boolean, handlers: { onSelect: (icao: string) => void; onMove: (icao: string, action: "next" | "prev" | "first" | "last") => void; onClear?: () => void }, options: MarkerOptions): void {
  el.setAttribute("tabindex", options.tabStop ? "0" : "-1");
  el.setAttribute("role", options.role);
  el.setAttribute("aria-label", label);
  if (options.role === "button") el.setAttribute("aria-pressed", pressed ? "true" : "false");
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

// ------------------------------------------------------------------ in-page jumps

/**
 * An in-page jump: scroll a section into view, then move keyboard focus to it (the target needs
 * tabIndex -1), so the next Tab continues from there. Jumps are buttons or onClick handlers, never a
 * bare #id link: the hash router reads that as a page.
 */
export function jumpTo(el: Pick<HTMLElement, "scrollIntoView" | "focus"> | null | undefined): void {
  if (!el) return;
  el.scrollIntoView({ block: "start" });
  el.focus({ preventScroll: true });
}

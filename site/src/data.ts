// Types mirror sync/crossroads_sync/snapshot.py (schema "crossroads-public/1").

export interface Division {
  name: string;
  summary: string | null;
  base: string | null;
  fleets: string[];
}

/** A weekly group flight: the weekday and the UTC start time ("20:00"), from site.config.json. */
export interface GroupFlight {
  weekday: string;
  utc: string;
}

export interface Airline {
  divisions: Division[];
  /** Simulator aircraft each fleet type is flown in, keyed by ICAO type code. */
  sim_aircraft?: Record<string, string>;
  name: string;
  short_name: string;
  tagline: string | null;
  join_url: string | null;
  pilot_login_url: string | null;
  discord_url: string | null;
  contact_email: string | null;
  /** Missing in snapshots written before the group flight was configured. */
  group_flight?: GroupFlight | null;
}

export interface Stats {
  from: string | null;
  to: string | null;
  flights: number | null;
  flight_hours: number | null;
  passengers: number | null;
  cargo: number | null;
  distance: number | null;
  average_landing_rate: number | null;
}

export interface LiveFlight {
  callsign: string | null;
  flight_number: string | null;
  from: string;
  to: string;
  phase: string | null;
  aircraft: string | null;
  aircraft_name: string | null;
  registration: string | null;
  pilot: string | null;
  rank: string | null;
  network: string | null;
  lat: number | null;
  lon: number | null;
  altitude_ft: number | null;
  groundspeed_kt: number | null;
  heading: number | null;
  route_nm: number | null;
  remaining_nm: number | null;
  eta: string | null;
}

export interface FleetType {
  code: string;
  name: string;
  type: string | null;
  max_pax: number | null;
  max_cargo: number | null;
  weight_unit: "lbs" | "kg" | null;
  aircraft_count: number;
  registrations: string[];
  image: string | null;
  image_attribution: string | null;
  image_link: string | null;
}

export interface Route {
  kind: string;
  tags: string[];
  flight_number: string | null;
  callsign: string | null;
  from: string;
  to: string;
  distance_nm: number | null;
  duration_min: number | null;
  departure_time: string | null;
  types: string[];
  days: string[];
}

export interface Hub {
  name: string;
  default: boolean;
  pilots: number | null;
  airports: string[];
}

export interface Rank {
  level: number | null;
  name: string;
  abbreviation: string | null;
  honorary: boolean;
  hours: number | null;
  flights: number | null;
  points: number | null;
  description: string | null;
  image: string | null;
  pilots: number | null;
}

export interface AirlineEvent {
  name: string;
  kind: string | null;
  description: string | null;
  start: string | null;
  end: string | null;
  image: string | null;
  tags: string[];
  registration_required: boolean;
  registrations: number | null;
  points: number | null;
}

export interface RecentFlight {
  callsign: string | null;
  flight_number: string | null;
  from: string;
  to: string;
  aircraft: string | null;
  landing_rate: number | null;
  duration_min: number | null;
  landed: string | null;
}

export interface Airport {
  icao: string;
  iata: string | null;
  name: string;
  country: string | null;
  lat: number | null;
  lon: number | null;
  base: boolean;
}

export interface Snapshot {
  schema: "crossroads-public/1";
  source: "vamsys" | "preview" | "sample";
  generated_at: string;
  unavailable: string[];
  airline: Airline;
  stats: { all_time: Stats | null; last_30_days: Stats | null };
  live: LiveFlight[];
  fleet: FleetType[];
  routes: Route[];
  hubs: Hub[];
  ranks: Rank[];
  events: AirlineEvent[];
  recent_flights: RecentFlight[];
  airports: Record<string, Airport>;
}

export const SNAPSHOT_URL = "./data/snapshot.json";

export function isSnapshot(value: unknown): value is Snapshot {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    v.schema === "crossroads-public/1" &&
    (v.source === "vamsys" || v.source === "preview" || v.source === "sample") &&
    typeof v.generated_at === "string" &&
    typeof v.airline === "object" && v.airline !== null &&
    Array.isArray(v.live) && Array.isArray(v.fleet) && Array.isArray(v.routes) &&
    Array.isArray(v.hubs) && Array.isArray(v.ranks) && Array.isArray(v.events) &&
    Array.isArray(v.recent_flights) && typeof v.airports === "object" && v.airports !== null
  );
}

export async function loadSnapshot(fetcher: typeof fetch = fetch): Promise<Snapshot> {
  // Cache-bust so a freshly deployed snapshot shows without a hard refresh.
  const response = await fetcher(`${SNAPSHOT_URL}?t=${Math.floor(Date.now() / 60000)}`, { cache: "no-store" });
  if (!response.ok) throw new Error(`snapshot request failed (${response.status})`);
  const body: unknown = await response.json();
  if (!isSnapshot(body)) throw new Error("snapshot has an unexpected shape");
  return body;
}

// ------------------------------------------------------------------ formatting

const integerFormat = new Intl.NumberFormat("en-US");

export function formatNumber(value: number | null | undefined): string {
  return value === null || value === undefined ? "—" : integerFormat.format(value);
}

export function formatCompact(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  if (Math.abs(value) < 10_000) return integerFormat.format(value);
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

export function formatDuration(minutes: number | null | undefined): string {
  if (minutes === null || minutes === undefined || minutes < 0) return "—";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h ? `${h}h ${String(m).padStart(2, "0")}m` : `${m}m`;
}

export function formatFeet(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return value >= 18_000 ? `FL${String(Math.round(value / 100)).padStart(3, "0")}` : `${integerFormat.format(value)} ft`;
}

export function relativeAge(iso: string, now: Date = new Date()): string {
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return "unknown";
  const minutes = Math.round((now.getTime() - then) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} h ago`;
  return `${Math.round(hours / 24)} days ago`;
}

export function formatDate(iso: string | null, withTime = false): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  // Day first, the way the site's typed dates read ("11 November 2026"); with a time the month is short.
  return date.toLocaleString("en-GB", {
    day: "numeric",
    month: withTime ? "short" : "long",
    year: withTime ? undefined : "numeric",
    hour: withTime ? "numeric" : undefined,
    minute: withTime ? "2-digit" : undefined,
    timeZoneName: withTime ? "short" : undefined,
  });
}

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
/** The airline's home time zone, for times shown beside UTC. */
export const HOME_TIME_ZONE = "America/Indiana/Indianapolis";

/** The next start of a weekly flight at or after `from`, or null when its weekday or time is not valid. */
export function nextWeekly(flight: GroupFlight, from: Date): Date | null {
  const day = WEEKDAYS.indexOf(flight.weekday);
  const time = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(flight.utc);
  if (day < 0 || !time || Number.isNaN(from.getTime())) return null;
  const start = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate(), Number(time[1]), Number(time[2])));
  start.setUTCDate(start.getUTCDate() + ((day - start.getUTCDay() + 7) % 7));
  if (start.getTime() < from.getTime()) start.setUTCDate(start.getUTCDate() + 7);
  return start;
}

/**
 * "Sundays at 20:00Z (15:00 Indianapolis)": the UTC time, and the Indianapolis time of the next one,
 * which moves with daylight saving. A local time on another day names that day.
 */
export function weeklyTime(flight: GroupFlight, from: Date): string | null {
  const next = nextWeekly(flight, from);
  if (!next) return null;
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: HOME_TIME_ZONE, weekday: "long", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(next);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? "";
  const day = part("weekday");
  return `${flight.weekday}s at ${flight.utc}Z (${day === flight.weekday ? "" : `${day} `}${part("hour")}:${part("minute")} Indianapolis)`;
}

export function progressPercent(flight: Pick<LiveFlight, "route_nm" | "remaining_nm">): number | null {
  const { route_nm: total, remaining_nm: remaining } = flight;
  if (!total || remaining === null || total <= 0) return null;
  return Math.max(0, Math.min(100, Math.round(((total - remaining) / total) * 100)));
}

/** Snapshots older than this are flagged as stale on the page. */
export const STALE_AFTER_MINUTES = 45;

export function isStale(snapshot: Pick<Snapshot, "generated_at">, now: Date = new Date()): boolean {
  const then = Date.parse(snapshot.generated_at);
  return Number.isNaN(then) || now.getTime() - then > STALE_AFTER_MINUTES * 60000;
}

// ------------------------------------------------------------------ divisions & network

/** The division a route mostly belongs to: the one sharing the most aircraft types with it. */
export function primaryDivision(route: Pick<Route, "types">, divisions: Division[]): number {
  let best = -1;
  let bestOverlap = 0;
  divisions.forEach((division, index) => {
    const overlap = route.types.filter((t) => division.fleets.includes(t)).length;
    if (overlap > bestOverlap) {
      best = index;
      bestOverlap = overlap;
    }
  });
  return best;
}

export function routeInDivision(route: Pick<Route, "types">, division: Division | undefined): boolean {
  return !division || route.types.some((t) => division.fleets.includes(t));
}

export interface NetworkFacts {
  aircraftTypes: number;
  routes: number;
  destinations: number;
  countries: number;
}

export function networkFacts(snapshot: Pick<Snapshot, "fleet" | "routes" | "airports" | "hubs">): NetworkFacts {
  const bases = new Set(snapshot.hubs.flatMap((h) => h.airports));
  const served = new Set(snapshot.routes.flatMap((r) => [r.from, r.to]));
  const destinations = [...served].filter((icao) => !bases.has(icao));
  const countries = new Set([...served].map((icao) => snapshot.airports[icao]?.country).filter(Boolean));
  return {
    aircraftTypes: snapshot.fleet.length,
    routes: snapshot.routes.length,
    destinations: destinations.length,
    countries: countries.size,
  };
}

/** Points along the great circle between two airports, for drawing realistic route arcs. */
export function greatCircle(a: [number, number], b: [number, number], steps = 32): [number, number][] {
  const rad = Math.PI / 180;
  const [lat1, lon1, lat2, lon2] = [a[0] * rad, a[1] * rad, b[0] * rad, b[1] * rad];
  const d = 2 * Math.asin(Math.sqrt(Math.sin((lat2 - lat1) / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin((lon2 - lon1) / 2) ** 2));
  if (d === 0) return [a, b];
  const points: [number, number][] = [];
  for (let i = 0; i <= steps; i++) {
    const f = i / steps;
    const A = Math.sin((1 - f) * d) / Math.sin(d);
    const B = Math.sin(f * d) / Math.sin(d);
    const x = A * Math.cos(lat1) * Math.cos(lon1) + B * Math.cos(lat2) * Math.cos(lon2);
    const y = A * Math.cos(lat1) * Math.sin(lon1) + B * Math.cos(lat2) * Math.sin(lon2);
    const z = A * Math.sin(lat1) + B * Math.sin(lat2);
    points.push([Math.atan2(z, Math.sqrt(x * x + y * y)) / rad, Math.atan2(y, x) / rad]);
  }
  return points;
}

/** Read a query parameter from the hash route, e.g. #/routes?division=Cargo%20Charter */
export function hashParam(name: string, hash: string = typeof window === "undefined" ? "" : window.location.hash): string {
  const query = hash.split("?")[1] ?? "";
  return new URLSearchParams(query).get(name) ?? "";
}

export function formatWeight(value: number | null, unit: "lbs" | "kg" | null): string {
  if (value === null) return "—";
  return `${integerFormat.format(value)} ${unit ?? ""}`.trim();
}

/** Kilograms in a pound (exact). */
export const LB_TO_KG = 0.45359237;

/** A payload in whole tonnes (1,000 kg), from a figure in kg, or in lbs when the unit says so. */
export function payloadTonnes(value: number | null, unit: "lbs" | "kg" | null): number | null {
  if (value === null) return null;
  return Math.round((unit === "lbs" ? value * LB_TO_KG : value) / 1000);
}

/**
 * The division a route is sold under, for labels that name one division (row dots, map lines, the
 * route eyebrow, the schedule CSV). Route tags from vAMSYS decide first (cargo, then group and sports
 * charters, then executive charters); other routes fall back to the division sharing the most
 * aircraft types. Counts per division use routeInDivision instead.
 */
export function routeDivision(route: Pick<Route, "types" | "tags" | "kind">, divisions: Division[]): number {
  const find = (pattern: RegExp) => divisions.findIndex((d) => pattern.test(d.name));
  const tags = route.tags.map((t) => t.toLowerCase());
  if (route.kind === "cargo" || tags.includes("cargo-charter")) {
    const i = find(/cargo/i);
    if (i >= 0) return i;
  }
  if (tags.includes("sports-charter") || tags.includes("group-charter")) {
    const i = find(/group|sport/i);
    if (i >= 0) return i;
  }
  if (tags.includes("executive-charter")) {
    const i = find(/executive charter/i);
    if (i >= 0) return i;
  }
  return primaryDivision(route, divisions);
}

/** Which Indianapolis base a route works from: "KTYQ", "KIND" or "" for point-to-point legs. */
export function routeBase(route: Pick<Route, "from" | "to">, bases: string[]): string {
  return bases.find((b) => route.from === b || route.to === b) ?? "";
}

export const POINT_TO_POINT = "p2p";

export function filterRoutes(routes: Route[], query: string, type: string, division?: Division, base = "", bases: string[] = []): Route[] {
  const q = query.trim().toUpperCase();
  return routes.filter((route) => {
    if (!routeInDivision(route, division)) return false;
    if (type && !route.types.includes(type)) return false;
    if (base) {
      const here = routeBase(route, bases);
      if (base === POINT_TO_POINT ? here !== "" : here !== base) return false;
    }
    if (!q) return true;
    return [route.from, route.to, route.flight_number, route.callsign]
      .some((field) => field !== null && field.toUpperCase().includes(q));
  });
}

// ------------------------------------------------------------------ crew tools (crew.json)
// Produced by sync/crossroads_sync/crew.py using Kimi's Jumpseat modules.

export interface WindComponents {
  headwind_kt: number;
  tailwind_kt: number;
  crosswind_kt: number;
  crosswind_from: string;
  gust_headwind_kt?: number;
  gust_crosswind_kt?: number;
}

export interface CrewRunway {
  id: string;
  reciprocal: string | null;
  heading_true_deg: number | null;
  length_ft: number | null;
  width_ft: number | null;
  surface: string | null;
  elevation_ft: number | null;
  wind: WindComponents | null;
}

export interface CrewMetar {
  raw: string;
  station?: string;
  wind?: { direction_deg: number | null; speed_kt: number; gust_kt?: number; variable: boolean };
  visibility?: { value: number; unit: string };
  temperature_c?: number;
  dewpoint_c?: number;
  altimeter?: { value: number; unit: string };
  observed_at?: string;
  age_s?: number;
  stale?: boolean;
}

export interface CrewAirport {
  flight_category: "VFR" | "MVFR" | "IFR" | "LIFR" | null;
  clouds: { cover: string; base_ft: number | null }[];
  metar: CrewMetar | null;
  taf: string | null;
  runways: CrewRunway[];
  preferred_runway: string | null;
}

export interface FuelPlan {
  phases: Record<string, { minutes: number; fuel_kg: number }>;
  trip_kg: number;
  contingency_kg: number;
  reserve_minutes: number;
  reserve_kg: number;
  total_kg: number;
}

export interface ApproachCard {
  runway: { identifier?: string; orientation?: { heading_true_deg?: number }; threshold_elevation_ft?: number; length_ft?: number; glide_path_deg?: number };
  wind?: { wind_direction_true_deg: number; wind_speed_kt: number; components: WindComponents };
  aircraft: { approach_speed_kt?: number; threshold_crossing_height_ft?: number };
  target_gates: { distance_to_threshold_nm: number; target_speed_kt?: number; height_above_threshold_ft?: number; altitude_ft_msl?: number }[];
}

export interface Crew {
  generated_at: string;
  weather_source: string | null;
  airports: Record<string, CrewAirport>;
  plans: Record<string, Record<string, FuelPlan>>;
  approaches: Record<string, Record<string, ApproachCard>>;
  notes: Record<string, string>;
}

export function isCrew(value: unknown): value is Crew {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return typeof v.generated_at === "string" && typeof v.airports === "object" && v.airports !== null
    && typeof v.plans === "object" && v.plans !== null && typeof v.approaches === "object" && v.approaches !== null;
}

export async function loadCrew(fetcher: typeof fetch = fetch): Promise<Crew> {
  const response = await fetcher(`./data/crew.json?t=${Math.floor(Date.now() / 60000)}`, { cache: "no-store" });
  if (!response.ok) throw new Error(`crew briefing request failed (${response.status})`);
  const body: unknown = await response.json();
  if (!isCrew(body)) throw new Error("crew briefing has an unexpected shape");
  return body;
}

export const KG_TO_LB = 2.20462262;

export function kgToLb(kg: number): number {
  return Math.round(kg * KG_TO_LB);
}

export function windText(wind: CrewMetar["wind"] | undefined): string {
  if (!wind) return "—";
  if (wind.speed_kt === 0) return "Calm";
  const dir = wind.variable || wind.direction_deg == null ? "VRB" : String(Math.round(wind.direction_deg)).padStart(3, "0") + "°";
  return `${dir} ${Math.round(wind.speed_kt)} kt${wind.gust_kt ? ` gusting ${Math.round(wind.gust_kt)}` : ""}`;
}

export function componentText(c: WindComponents | null | undefined): string {
  if (!c) return "—";
  const along = c.tailwind_kt > 0 ? `${c.tailwind_kt} kt tail` : `${Math.max(0, c.headwind_kt)} kt head`;
  const across = c.crosswind_kt > 0 ? `${c.crosswind_kt} kt cross from ${c.crosswind_from}` : "no crosswind";
  return `${along}, ${across}`;
}

/** Weather-board order of the airports that are not VFR; anything else counts as no report. */
const BOARD_RANK: Record<string, number> = { LIFR: 0, IFR: 1, MVFR: 2 };

/**
 * The network weather board: the airports that are not VFR, worst first (LIFR, IFR, MVFR, then no
 * report; crew.json order within each), the VFR ones apart, and a summary counted from the same data
 * ("99 VFR, 8 MVFR, 4 IFR or lower, 1 no report", leaving out the parts that are zero).
 */
export function weatherBoard<T extends Pick<CrewAirport, "flight_category">>(airports: Record<string, T>): { first: [string, T][]; vfr: [string, T][]; summary: string } {
  const entries = Object.entries(airports);
  const rank = (a: T) => BOARD_RANK[a.flight_category ?? ""] ?? 3;
  const vfr = entries.filter(([, a]) => a.flight_category === "VFR");
  const first = entries.filter(([, a]) => a.flight_category !== "VFR").sort((x, y) => rank(x[1]) - rank(y[1]));
  const mvfr = first.filter(([, a]) => a.flight_category === "MVFR").length;
  const lower = first.filter(([, a]) => a.flight_category === "IFR" || a.flight_category === "LIFR").length;
  const parts: [number, string][] = [[vfr.length, "VFR"], [mvfr, "MVFR"], [lower, "IFR or lower"], [first.length - mvfr - lower, "no report"]];
  return { first, vfr, summary: parts.filter(([n]) => n > 0).map(([n, label]) => `${n} ${label}`).join(", ") };
}

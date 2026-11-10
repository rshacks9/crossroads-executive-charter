// Types mirror sync/crossroads_sync/snapshot.py (schema "crossroads-public/1").

export interface Airline {
  name: string;
  short_name: string;
  tagline: string | null;
  join_url: string | null;
  pilot_login_url: string | null;
  discord_url: string | null;
  contact_email: string | null;
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
  source: "vamsys" | "sample";
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
    (v.source === "vamsys" || v.source === "sample") &&
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
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: withTime ? undefined : "numeric",
    hour: withTime ? "numeric" : undefined,
    minute: withTime ? "2-digit" : undefined,
    timeZoneName: withTime ? "short" : undefined,
  });
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

export function filterRoutes(routes: Route[], query: string, type: string): Route[] {
  const q = query.trim().toUpperCase();
  return routes.filter((route) => {
    if (type && !route.types.includes(type)) return false;
    if (!q) return true;
    return [route.from, route.to, route.flight_number, route.callsign]
      .some((field) => field !== null && field.toUpperCase().includes(q));
  });
}

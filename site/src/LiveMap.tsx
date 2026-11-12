import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useEffect, useRef } from "react";
import type { Airport, Division, LiveFlight, Route } from "./data";
import { formatFeet, greatCircle, routeDivision } from "./data";
import { AUTOMATION_LABEL } from "./content";

/** Division colours as Leaflet writes them on each line: a fallback under the `.route--dN` classes,
 *  which take the theme's `--div-N` tokens (styles.css). */
export const DIVISION_COLORS = ["#e8703a", "#2a6f97", "#2f7a55", "#7b4fa0", "#b0812a", "#55646c"];

/** A division's colour as a theme token, for dots, accents and bars, so it follows the light/dark toggle. */
export function divisionColor(index: number): string {
  const n = DIVISION_COLORS.length;
  return `var(--div-${((index % n) + n) % n})`;
}

/**
 * Touch-first screens, where a map leaves one finger to scroll the page and takes two to move or
 * zoom (Leaflet then sets touch-action: pan-x pan-y): Leaflet's phone test, or a coarse primary
 * pointer, the query that shows MapHint (.map-hint in styles.css).
 */
export function touchFirst(): boolean {
  return L.Browser.mobile || (typeof window.matchMedia === "function" && window.matchMedia("(pointer: coarse)").matches);
}

/** Under every map; styles.css shows it on touch screens only. */
export function MapHint() {
  return <p className="map-hint">Use two fingers to move the map.</p>;
}

interface Props {
  flights: LiveFlight[];
  airports: Record<string, Airport>;
  bases: string[];
  /** When given, the scheduled network is drawn underneath any live flights. */
  routes?: Route[];
  divisions?: Division[];
  height?: number;
  onSelect?: (index: number) => void;
  label?: string;
}

const PLANE =
  '<svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true"><path d="M12 2c.8 0 1.4.7 1.4 1.6v5.6l7.6 4.4v2l-7.6-2.3v4.6l2.2 1.6v1.7L12 20.1l-3.6 1.1v-1.7l2.2-1.6v-4.6L3 15.6v-2l7.6-4.4V3.6C10.6 2.7 11.2 2 12 2z"/></svg>';

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c);
}

const has = (a: Airport | undefined): a is Airport & { lat: number; lon: number } => a?.lat != null && a.lon != null;

/** A plane's tooltip (HTML): callsign, leg, aircraft and altitude, then the automation label on a listed flight. */
export function flightTooltip(flight: LiveFlight): string {
  const name = escapeHtml(flight.callsign ?? flight.flight_number ?? "Flight");
  const label = flight.automation ? `<br>${AUTOMATION_LABEL}` : "";
  return `<strong>${name}</strong><br>${escapeHtml(flight.from)} → ${escapeHtml(flight.to)}<br>${escapeHtml(flight.aircraft ?? "")} · ${escapeHtml(formatFeet(flight.altitude_ft))}${label}`;
}

/** A plane marker's title, which keyboard and screen-reader users get: the flight, its leg and the automation label. */
export function flightTitle(flight: LiveFlight): string {
  return `${flight.callsign ?? "Flight"} ${flight.from} to ${flight.to}${flight.automation ? `, ${AUTOMATION_LABEL.toLowerCase()}` : ""}`;
}

export function LiveMap({ flights, airports, bases, routes = [], divisions = [], height = 440, onSelect, label }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layer = useRef<L.LayerGroup | null>(null);
  const bounds = useRef<L.LatLngBounds | null>(null);

  useEffect(() => {
    if (!container.current || map.current) return;
    // On touch screens one finger scrolls the page past the map; two fingers move and zoom it.
    const instance = L.map(container.current, { zoomControl: true, scrollWheelZoom: false, worldCopyJump: true, dragging: !touchFirst() }).setView([39.7, -86.3], 4);
    // OpenStreetMap's standard tiles: free, no key, attribution required. A busy site should move to
    // a hosted tile provider (see README) to stay within the OSM tile usage policy.
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 12,
      className: "map-tiles",
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(instance);
    map.current = instance;
    layer.current = L.layerGroup().addTo(instance);
    // Leaflet measures its container once; re-measure when layout settles or the viewport changes.
    const observer = new ResizeObserver(() => {
      instance.invalidateSize();
      if (bounds.current) instance.fitBounds(bounds.current, { padding: [28, 28], maxZoom: 7 });
    });
    observer.observe(container.current);
    return () => {
      observer.disconnect();
      instance.remove();
      map.current = null;
      layer.current = null;
    };
  }, []);

  useEffect(() => {
    const instance = map.current;
    const group = layer.current;
    if (!instance || !group) return;
    group.clearLayers();
    const points: L.LatLngExpression[] = [];
    const served = new Set<string>();

    // Scheduled network: one arc per airport pair, coloured by the route's main division.
    const drawn = new Set<string>();
    for (const route of routes) {
      const key = [route.from, route.to].sort().join("-");
      if (drawn.has(key)) continue;
      drawn.add(key);
      const a = airports[route.from];
      const b = airports[route.to];
      if (!has(a) || !has(b)) continue;
      const division = Math.max(0, routeDivision(route, divisions)) % DIVISION_COLORS.length;
      L.polyline(greatCircle([a.lat, a.lon], [b.lat, b.lon]), { color: DIVISION_COLORS[division], className: `route route--d${division}`, weight: 2, opacity: 0.85, dashArray: route.kind === "cargo" ? "6 6" : undefined, interactive: false }).addTo(group);
      served.add(route.from).add(route.to);
    }
    for (const icao of served) {
      const airport = airports[icao];
      if (!has(airport) || bases.includes(icao)) continue;
      L.circleMarker([airport.lat, airport.lon], { radius: 4, color: "#1b2328", weight: 1.5, fillColor: "#ffffff", fillOpacity: 1 })
        .bindTooltip(`${escapeHtml(icao)} · ${escapeHtml(airport.name)}`, { direction: "top" })
        .addTo(group);
      points.push([airport.lat, airport.lon]);
    }

    for (const icao of bases) {
      const airport = airports[icao];
      if (!has(airport)) continue;
      L.circleMarker([airport.lat, airport.lon], { radius: 7, color: "#1b2328", weight: 2, fillColor: "#e8703a", fillOpacity: 1 })
        .bindTooltip(`${escapeHtml(icao)} · ${escapeHtml(airport.name)} (base)`, { direction: "top" })
        .addTo(group);
      points.push([airport.lat, airport.lon]);
    }

    flights.forEach((flight, index) => {
      const from = airports[flight.from];
      const to = airports[flight.to];
      const here = flight.lat != null && flight.lon != null ? ([flight.lat, flight.lon] as [number, number]) : null;
      if (has(from) && here) L.polyline([[from.lat, from.lon], here], { color: "#e8703a", weight: 3 }).addTo(group);
      if (has(to) && (here || has(from))) {
        L.polyline([here ?? [from!.lat!, from!.lon!], [to.lat, to.lon]], { color: "#1b2328", className: "route-remaining", weight: 1.5, dashArray: "4 6", opacity: 0.6 }).addTo(group);
      }
      for (const airport of [from, to]) {
        if (!has(airport)) continue;
        L.circleMarker([airport.lat, airport.lon], { radius: 3.5, color: "#1b2328", weight: 1.5, fillColor: "#ffffff", fillOpacity: 1 })
          .bindTooltip(escapeHtml(airport.icao), { direction: "top" })
          .addTo(group);
        points.push([airport.lat, airport.lon]);
      }
      if (here) {
        const icon = L.divIcon({ className: "plane-icon", html: `<span style="transform:rotate(${flight.heading ?? 0}deg)">${PLANE}</span>`, iconSize: [26, 26], iconAnchor: [13, 13] });
        L.marker(here, { icon, keyboard: true, title: flightTitle(flight) })
          .bindTooltip(flightTooltip(flight), { direction: "top", offset: [0, -10] })
          .on("click", () => onSelect?.(index))
          .addTo(group);
        points.push(here);
      }
    });

    bounds.current = points.length > 1 ? L.latLngBounds(points) : null;
    if (bounds.current) instance.fitBounds(bounds.current, { padding: [28, 28], maxZoom: 7 });
    else if (points.length === 1) instance.setView(points[0]!, 6);
  }, [flights, airports, bases, routes, divisions, onSelect]);

  return (
    <>
      <div ref={container} className="live-map" style={{ height }} role="region" aria-label={label ?? "Map of flights and routes"} />
      <MapHint />
    </>
  );
}

import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useEffect, useRef } from "react";
import type { Airport, Division, Route } from "./data";
import { greatCircle, routeDivision } from "./data";
import { DIVISION_COLORS } from "./LiveMap";
import { routeKey } from "./explore";

interface Props {
  routes: Route[];
  airports: Record<string, Airport>;
  bases: string[];
  divisions: Division[];
  /** Airport whose routes are emphasised; others fade. */
  selectedAirport?: string | null;
  /** Route (by routeKey) drawn on top in signal orange. */
  selectedRoute?: string | null;
  onAirportClick?: (icao: string) => void;
  onRouteClick?: (key: string) => void;
  /** Range ring in nautical miles around an airport. */
  ring?: { icao: string; nm: number; label: string } | null;
  /** Extra great-circle line, e.g. an unscheduled charter leg. */
  extraLeg?: [string, string] | null;
  height?: number;
  label: string;
}

const has = (a: Airport | undefined): a is Airport & { lat: number; lon: number } => a?.lat != null && a.lon != null;

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c);
}

export function ExploreMap({ routes, airports, bases, divisions, selectedAirport, selectedRoute, onAirportClick, onRouteClick, ring, extraLeg, height = 460, label }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layer = useRef<L.LayerGroup | null>(null);
  const bounds = useRef<L.LatLngBounds | null>(null);
  const handlers = useRef({ onAirportClick, onRouteClick });
  handlers.current = { onAirportClick, onRouteClick };

  useEffect(() => {
    if (!container.current || map.current) return;
    const instance = L.map(container.current, { zoomControl: true, scrollWheelZoom: false, worldCopyJump: true }).setView([39.7, -86.3], 4);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 12,
      className: "map-tiles",
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(instance);
    map.current = instance;
    layer.current = L.layerGroup().addTo(instance);
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

  // Fit only when the set of routes, ring or leg changes, not on every selection click.
  const fitKey = `${routes.length}:${routes[0] ? routeKey(routes[0]) : ""}:${ring?.icao ?? ""}${ring?.nm ?? ""}:${extraLeg?.join("-") ?? ""}`;
  const lastFit = useRef("");

  useEffect(() => {
    const instance = map.current;
    const group = layer.current;
    if (!instance || !group) return;
    group.clearLayers();
    const points: L.LatLngExpression[] = [];
    const served = new Set<string>();

    if (ring) {
      const centre = airports[ring.icao];
      if (has(centre)) {
        const circle = L.circle([centre.lat, centre.lon], { radius: ring.nm * 1852, color: "#e8703a", weight: 2, dashArray: "8 6", fillColor: "#e8703a", fillOpacity: 0.06, interactive: false }).addTo(group);
        circle.bindTooltip(escapeHtml(ring.label), { sticky: true });
        const b = circle.getBounds();
        points.push(b.getNorthWest(), b.getSouthEast());
      }
    }

    const drawn = new Set<string>();
    let highlight: Route | undefined;
    for (const route of routes) {
      const key = routeKey(route);
      if (key === selectedRoute) highlight = route;
      const pair = [route.from, route.to].sort().join("-");
      if (drawn.has(pair)) continue;
      drawn.add(pair);
      const a = airports[route.from];
      const b = airports[route.to];
      if (!has(a) || !has(b)) continue;
      const touches = !selectedAirport || route.from === selectedAirport || route.to === selectedAirport;
      const color = DIVISION_COLORS[Math.max(0, routeDivision(route, divisions)) % DIVISION_COLORS.length];
      const line = L.polyline(greatCircle([a.lat, a.lon], [b.lat, b.lon], 48), {
        color,
        weight: selectedAirport && touches ? 3.5 : 2,
        opacity: touches ? 0.85 : 0.15,
        dashArray: route.kind === "cargo" ? "6 6" : undefined,
        interactive: Boolean(onRouteClick) && touches,
      }).addTo(group);
      if (onRouteClick && touches) {
        line.bindTooltip(`${escapeHtml(key)} · ${escapeHtml(route.from)} – ${escapeHtml(route.to)} · ${route.distance_nm ?? "?"} nm`, { sticky: true });
        line.on("click", () => handlers.current.onRouteClick?.(key));
      }
      served.add(route.from).add(route.to);
    }

    if (highlight) {
      const a = airports[highlight.from];
      const b = airports[highlight.to];
      if (has(a) && has(b)) {
        L.polyline(greatCircle([a.lat, a.lon], [b.lat, b.lon], 64), { color: "#1b2328", weight: 7, opacity: 0.35, interactive: false }).addTo(group);
        L.polyline(greatCircle([a.lat, a.lon], [b.lat, b.lon], 64), { color: "#e8703a", weight: 4, opacity: 1, interactive: false }).addTo(group);
      }
    }

    if (extraLeg) {
      const a = airports[extraLeg[0]];
      const b = airports[extraLeg[1]];
      if (has(a) && has(b)) {
        L.polyline(greatCircle([a.lat, a.lon], [b.lat, b.lon], 64), { color: "#e8703a", weight: 4, opacity: 1, interactive: false }).addTo(group);
        served.add(extraLeg[0]).add(extraLeg[1]);
      }
    }

    for (const icao of served) {
      const airport = airports[icao];
      if (!has(airport)) continue;
      const base = bases.includes(icao);
      const selected = icao === selectedAirport;
      const marker = L.circleMarker([airport.lat, airport.lon], {
        radius: selected ? 9 : base ? 7 : 5,
        color: "#1b2328",
        weight: selected ? 3 : 1.5,
        fillColor: selected || base ? "#e8703a" : "#ffffff",
        fillOpacity: 1,
        bubblingMouseEvents: false,
      })
        .bindTooltip(`${escapeHtml(icao)} · ${escapeHtml(airport.name)}${base ? " (base)" : ""}`, { direction: "top" })
        .addTo(group);
      if (onAirportClick) marker.on("click", () => handlers.current.onAirportClick?.(icao));
      points.push([airport.lat, airport.lon]);
    }

    if (lastFit.current !== fitKey) {
      lastFit.current = fitKey;
      bounds.current = points.length > 1 ? L.latLngBounds(points) : null;
      if (bounds.current) instance.fitBounds(bounds.current, { padding: [28, 28], maxZoom: 7 });
      else if (points.length === 1) instance.setView(points[0]!, 6);
    }
  }, [routes, airports, bases, divisions, selectedAirport, selectedRoute, ring, extraLeg, fitKey, onAirportClick, onRouteClick]);

  return <div ref={container} className="live-map" style={{ height }} role="region" aria-label={label} />;
}

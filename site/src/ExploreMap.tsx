import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useEffect, useRef } from "react";
import type { Airport, Division, Route } from "./data";
import { greatCircle, routeDivision } from "./data";
import { DIVISION_COLORS, MapHint, touchFirst } from "./LiveMap";
import { markerLabel, markerOrder, markerTabStop, moveIndex, routeKey, wireMarker } from "./explore";

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
  /** Escape on a focused marker. */
  onClearSelection?: () => void;
  /** Range ring in nautical miles around an airport. */
  ring?: { icao: string; nm: number; label: string } | null;
  /** Extra great-circle line, e.g. an unscheduled charter leg. */
  extraLeg?: [string, string] | null;
  height?: number;
  label: string;
  /** What a marker is to assistive technology: a "link" where selecting it opens a page (the default), a "button" where it toggles a selection. */
  markerRole?: "button" | "link";
  /** Id of the text that explains the map's keys. */
  describedBy?: string;
}

const has = (a: Airport | undefined): a is Airport & { lat: number; lon: number } => a?.lat != null && a.lon != null;

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c);
}

export function ExploreMap({ routes, airports, bases, divisions, selectedAirport, selectedRoute, onAirportClick, onRouteClick, onClearSelection, ring, extraLeg, height = 460, label, markerRole = "link", describedBy }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layer = useRef<L.LayerGroup | null>(null);
  const bounds = useRef<L.LatLngBounds | null>(null);
  const handlers = useRef({ onAirportClick, onRouteClick, onClearSelection });
  handlers.current = { onAirportClick, onRouteClick, onClearSelection };

  useEffect(() => {
    if (!container.current || map.current) return;
    // On touch screens one finger scrolls the page past the map; two fingers move and zoom it.
    const instance = L.map(container.current, { zoomControl: true, scrollWheelZoom: false, worldCopyJump: true, dragging: !touchFirst() }).setView([39.7, -86.3], 4);
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
    // Redrawing replaces the marker elements; remember which one had keyboard focus.
    const active = typeof document !== "undefined" ? document.activeElement : null;
    const refocus = active && container.current?.contains(active) ? active.getAttribute("data-icao") : null;
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
    const counts = new Map<string, number>();
    for (const route of routes) {
      for (const end of [route.from, route.to]) counts.set(end, (counts.get(end) ?? 0) + 1);
      const key = routeKey(route);
      if (key === selectedRoute) highlight = route;
      const pair = [route.from, route.to].sort().join("-");
      if (drawn.has(pair)) continue;
      drawn.add(pair);
      const a = airports[route.from];
      const b = airports[route.to];
      if (!has(a) || !has(b)) continue;
      const touches = !selectedAirport || route.from === selectedAirport || route.to === selectedAirport;
      // The class gives the line its theme colour (styles.css .route--dN); `color` is the fallback.
      const division = Math.max(0, routeDivision(route, divisions)) % DIVISION_COLORS.length;
      const line = L.polyline(greatCircle([a.lat, a.lon], [b.lat, b.lon], 48), {
        color: DIVISION_COLORS[division],
        className: `route route--d${division}`,
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
        L.polyline(greatCircle([a.lat, a.lon], [b.lat, b.lon], 64), { color: "#1b2328", className: "route-casing", weight: 7, opacity: 0.35, interactive: false }).addTo(group);
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

    // Markers are added in keyboard order (bases, then west to east). One of them is the map's tab
    // stop and the arrow keys move between them, so the markers cost one Tab press, not one each.
    const order = markerOrder([...served].filter((icao) => has(airports[icao])), airports, bases);
    const tabStop = markerTabStop(order, selectedAirport, refocus);
    const elements = new Map<string, HTMLElement | SVGElement>();
    const focusMarker = (icao: string | undefined) => {
      const el = icao ? elements.get(icao) : undefined;
      if (!el) return;
      for (const other of elements.values()) other.setAttribute("tabindex", "-1");
      el.setAttribute("tabindex", "0");
      if ("focus" in el) (el as HTMLElement).focus({ preventScroll: true });
    };
    for (const icao of order) {
      const airport = airports[icao] as Airport & { lat: number; lon: number };
      const base = bases.includes(icao);
      const selected = icao === selectedAirport;
      const marker = L.circleMarker([airport.lat, airport.lon], {
        radius: selected ? 9 : base ? 7 : 5,
        color: "#1b2328",
        weight: selected ? 3 : 1.5,
        fillColor: selected || base ? "#e8703a" : "#ffffff",
        fillOpacity: 1,
        bubblingMouseEvents: false,
        className: "airport-marker",
      })
        .bindTooltip(`${escapeHtml(icao)} · ${escapeHtml(airport.name)}${base ? " (base)" : ""}`, { direction: "top" })
        .addTo(group);
      if (onAirportClick) {
        marker.on("click", () => handlers.current.onAirportClick?.(icao));
        const el = marker.getElement();
        if (el) {
          elements.set(icao, el as SVGElement);
          wireMarker(el as unknown as Parameters<typeof wireMarker>[0], icao, markerLabel(icao, airport, counts.get(icao) ?? 0, { base, selected }), selected, {
            onSelect: (code) => handlers.current.onAirportClick?.(code),
            onMove: (code, action) => focusMarker(order[moveIndex(order.indexOf(code), order.length, action)]),
            onClear: () => handlers.current.onClearSelection?.(),
          }, { tabStop: icao === tabStop, role: markerRole });
          el.addEventListener("focus", () => marker.openTooltip());
          el.addEventListener("blur", () => marker.closeTooltip());
        }
      }
      points.push([airport.lat, airport.lon]);
    }
    if (refocus) focusMarker(refocus);

    if (lastFit.current !== fitKey) {
      lastFit.current = fitKey;
      bounds.current = points.length > 1 ? L.latLngBounds(points) : null;
      if (bounds.current) instance.fitBounds(bounds.current, { padding: [28, 28], maxZoom: 7 });
      else if (points.length === 1) instance.setView(points[0]!, 6);
    }
  }, [routes, airports, bases, divisions, selectedAirport, selectedRoute, ring, extraLeg, fitKey, onAirportClick, onRouteClick, markerRole]);

  return (
    <>
      <div ref={container} className="live-map" style={{ height }} role="region" aria-label={label} aria-describedby={describedBy} />
      <MapHint />
    </>
  );
}

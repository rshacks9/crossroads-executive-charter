import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useEffect, useRef } from "react";
import type { Airport, LiveFlight } from "./data";
import { formatFeet } from "./data";

interface Props {
  flights: LiveFlight[];
  airports: Record<string, Airport>;
  bases: string[];
  height?: number;
  onSelect?: (index: number) => void;
}

const PLANE =
  '<svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true"><path d="M12 2c.8 0 1.4.7 1.4 1.6v5.6l7.6 4.4v2l-7.6-2.3v4.6l2.2 1.6v1.7L12 20.1l-3.6 1.1v-1.7l2.2-1.6v-4.6L3 15.6v-2l7.6-4.4V3.6C10.6 2.7 11.2 2 12 2z"/></svg>';

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c);
}

export function LiveMap({ flights, airports, bases, height = 440, onSelect }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layer = useRef<L.LayerGroup | null>(null);
  const bounds = useRef<L.LatLngBounds | null>(null);

  useEffect(() => {
    if (!container.current || map.current) return;
    const instance = L.map(container.current, {
      zoomControl: true,
      scrollWheelZoom: false,
      worldCopyJump: true,
      attributionControl: true,
    }).setView([39.7, -86.3], 4);
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
      if (bounds.current) instance.fitBounds(bounds.current, { padding: [36, 36], maxZoom: 7 });
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

    for (const icao of bases) {
      const airport = airports[icao];
      if (airport?.lat == null || airport.lon == null) continue;
      L.circleMarker([airport.lat, airport.lon], { radius: 6, color: "#1b2328", weight: 2, fillColor: "#e8703a", fillOpacity: 1 })
        .bindTooltip(`${escapeHtml(icao)} · base`, { direction: "top" })
        .addTo(group);
      points.push([airport.lat, airport.lon]);
    }

    flights.forEach((flight, index) => {
      const from = airports[flight.from];
      const to = airports[flight.to];
      const hasFrom = from?.lat != null && from.lon != null;
      const hasTo = to?.lat != null && to.lon != null;
      const here = flight.lat != null && flight.lon != null ? ([flight.lat, flight.lon] as [number, number]) : null;
      if (hasFrom && here) {
        L.polyline([[from!.lat!, from!.lon!], here], { color: "#e8703a", weight: 2.5 }).addTo(group);
      }
      if (hasTo && (here || hasFrom)) {
        L.polyline([here ?? [from!.lat!, from!.lon!], [to!.lat!, to!.lon!]], { color: "#1b2328", weight: 1.5, dashArray: "4 6", opacity: 0.55 }).addTo(group);
      }
      for (const airport of [hasFrom ? from : null, hasTo ? to : null]) {
        if (!airport) continue;
        L.circleMarker([airport.lat!, airport.lon!], { radius: 3.5, color: "#1b2328", weight: 1.5, fillColor: "#ffffff", fillOpacity: 1 })
          .bindTooltip(escapeHtml(airport.icao), { direction: "top" })
          .addTo(group);
        points.push([airport.lat!, airport.lon!]);
      }
      if (here) {
        const icon = L.divIcon({
          className: "plane-icon",
          html: `<span style="transform:rotate(${flight.heading ?? 0}deg)">${PLANE}</span>`,
          iconSize: [26, 26],
          iconAnchor: [13, 13],
        });
        const label = escapeHtml(flight.callsign ?? flight.flight_number ?? "Flight");
        L.marker(here, { icon, keyboard: true, title: `${flight.callsign ?? "Flight"} ${flight.from} to ${flight.to}` })
          .bindTooltip(
            `<strong>${label}</strong><br>${escapeHtml(flight.from)} → ${escapeHtml(flight.to)}<br>${escapeHtml(flight.aircraft ?? "")} · ${escapeHtml(formatFeet(flight.altitude_ft))}`,
            { direction: "top", offset: [0, -10] },
          )
          .on("click", () => onSelect?.(index))
          .addTo(group);
        points.push(here);
      }
    });

    bounds.current = points.length > 1 ? L.latLngBounds(points) : null;
    if (bounds.current) instance.fitBounds(bounds.current, { padding: [36, 36], maxZoom: 7 });
    else if (points.length === 1) instance.setView(points[0]!, 6);
  }, [flights, airports, bases, onSelect]);

  return <div ref={container} className="live-map" style={{ height }} role="region" aria-label="Map of flights in progress" />;
}

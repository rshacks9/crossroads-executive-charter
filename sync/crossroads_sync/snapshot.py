"""Pure transform: raw vAMSYS Operations API payloads -> public site snapshot.

Only fields on an explicit allowlist reach the snapshot. Internal remarks, pilot IDs, SimBrief
settings, NOTAMs and anything else not listed below never leave this function. Pilot usernames are
included only when the site config sets ``show_pilot_names`` to true.
"""

from __future__ import annotations

import html
import math
import re
from datetime import datetime, timezone
from typing import Any, Iterable, Mapping

from . import SCHEMA

MAX_LIVE = 250
MAX_ROUTES = 3000
MAX_EVENTS = 12
MAX_RECENT = 12
MAX_REGISTRATIONS = 60
MAX_TEXT = 600

_CONTROL = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")
_TAG = re.compile(r"<[^>]*>")
_SPACE = re.compile(r"\s+")
_CODE = re.compile(r"^[A-Z0-9]{2,8}$")
_HMS = re.compile(r"^(\d{1,3}):([0-5]\d)(?::([0-5]\d))?$")
ROUTE_KINDS = ("scheduled", "cargo", "charter", "training", "vfr", "repositioning", "jumpseat")
SOURCES = ("vamsys", "preview", "sample")


# --------------------------------------------------------------------------- scalar helpers


def text(value: Any, limit: int = 160) -> str | None:
    if not isinstance(value, str):
        return None
    cleaned = _SPACE.sub(" ", _CONTROL.sub("", value)).strip()
    if not cleaned:
        return None
    return cleaned if len(cleaned) <= limit else cleaned[: limit - 1].rstrip() + "…"


def plain_text(value: Any, limit: int = MAX_TEXT) -> str | None:
    """Strip markup from vAMSYS rich text so the site never renders source HTML."""
    if not isinstance(value, str):
        return None
    stripped = _TAG.sub(" ", value)
    return text(html.unescape(stripped), limit)


def integer(value: Any) -> int | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, int):
        return value
    if isinstance(value, float) and math.isfinite(value):
        return int(round(value))
    return None


def number(value: Any, digits: int = 4) -> float | None:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return None
    if not math.isfinite(float(value)):
        return None
    return round(float(value), digits)


def code(value: Any) -> str | None:
    if not isinstance(value, str):
        return None
    candidate = value.strip().upper()
    return candidate if _CODE.match(candidate) else None


def https_url(value: Any) -> str | None:
    if not isinstance(value, str):
        return None
    candidate = value.strip()
    if candidate.startswith("https://") and len(candidate) <= 500 and not _CONTROL.search(candidate):
        return candidate
    return None


def timestamp(value: Any) -> str | None:
    if not isinstance(value, str) or not value.strip():
        return None
    raw = value.strip().replace("Z", "+00:00")
    try:
        parsed = datetime.fromisoformat(raw)
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def minutes_from_hms(value: Any) -> int | None:
    if not isinstance(value, str):
        return None
    match = _HMS.match(value.strip())
    if not match:
        return None
    hours, minutes, seconds = match.group(1), match.group(2), match.group(3) or "0"
    return int(hours) * 60 + int(minutes) + (1 if int(seconds) >= 30 else 0)


def _lat(value: Any) -> float | None:
    result = number(value, 5)
    return result if result is not None and -90 <= result <= 90 else None


def _lon(value: Any) -> float | None:
    result = number(value, 5)
    return result if result is not None and -180 <= result <= 180 else None


def _dicts(value: Any) -> list[dict[str, Any]]:
    return [item for item in value if isinstance(item, dict)] if isinstance(value, list) else []


def _data(payload: Any) -> Any:
    return payload.get("data") if isinstance(payload, dict) else None


# --------------------------------------------------------------------------- builder


class _Airports:
    """Collects only the airports the snapshot actually references."""

    def __init__(self, raw_airports: Iterable[dict[str, Any]]) -> None:
        self.by_id: dict[int, dict[str, Any]] = {}
        for item in raw_airports:
            identifier = integer(item.get("id"))
            icao = code(item.get("icao"))
            if identifier is None or icao is None:
                continue
            country = item.get("country") if isinstance(item.get("country"), dict) else {}
            self.by_id[identifier] = {
                "icao": icao,
                "iata": code(item.get("iata")),
                "name": text(item.get("name"), 120) or icao,
                "country": text(country.get("name"), 80),
                "lat": _lat(item.get("latitude")),
                "lon": _lon(item.get("longitude")),
                "base": item.get("base") is True,
            }
        self.used: dict[str, dict[str, Any]] = {}

    def icao_for(self, airport_id: Any) -> str | None:
        identifier = integer(airport_id)
        record = self.by_id.get(identifier) if identifier is not None else None
        if record is None:
            return None
        self.used.setdefault(record["icao"], record)
        return record["icao"]

    def add_live(self, airport: Any) -> str | None:
        if not isinstance(airport, dict):
            return None
        icao = code(airport.get("icao")) or code(airport.get("identifier"))
        if icao is None:
            return None
        if icao not in self.used:
            country = airport.get("country") if isinstance(airport.get("country"), dict) else {}
            self.used[icao] = {
                "icao": icao,
                "iata": code(airport.get("iata")),
                "name": text(airport.get("name"), 120) or icao,
                "country": text(country.get("name"), 80),
                "lat": _lat(airport.get("lat")),
                "lon": _lon(airport.get("lon")),
                "base": False,
            }
        return icao


def _stats(payload: Any) -> dict[str, Any] | None:
    data = _data(payload)
    if not isinstance(data, dict):
        return None
    pireps = data.get("pireps") if isinstance(data.get("pireps"), dict) else {}
    flight = data.get("flightTime") if isinstance(data.get("flightTime"), dict) else {}
    transport = data.get("transport") if isinstance(data.get("transport"), dict) else {}
    period = data.get("period") if isinstance(data.get("period"), dict) else {}
    seconds = integer(flight.get("seconds"))
    return {
        "from": timestamp(period.get("from")),
        "to": timestamp(period.get("to")),
        "flights": integer(pireps.get("accepted")),
        "flight_hours": round(seconds / 3600) if seconds is not None and seconds >= 0 else None,
        "passengers": integer(transport.get("passengers")),
        "cargo": integer(transport.get("cargo")),
        "distance": integer(transport.get("distanceFlown")),
        "average_landing_rate": integer(pireps.get("averageLandingRate")),
    }


def _fleet(raw_fleet: list[dict[str, Any]], aircraft_by_fleet: Mapping[Any, Any]) -> tuple[list[dict[str, Any]], dict[int, str]]:
    fleet: list[dict[str, Any]] = []
    codes: dict[int, str] = {}
    for item in raw_fleet:
        identifier = integer(item.get("id"))
        fleet_code = code(item.get("code"))
        if identifier is None or fleet_code is None:
            continue
        codes[identifier] = fleet_code
        if item.get("hide_in_phoenix") is True:
            continue
        aircraft = _dicts(aircraft_by_fleet.get(identifier, aircraft_by_fleet.get(str(identifier))))
        visible = [plane for plane in aircraft if plane.get("hide_in_phoenix") is not True]
        registrations = sorted({reg for reg in (text(p.get("registration"), 12) for p in visible) if reg})
        kind = item.get("type") if item.get("type") in ("pax", "cargo", "pax-cargo", "pax-containers", "cargo-containers") else None
        fleet.append(
            {
                "code": fleet_code,
                "name": text(item.get("name"), 80) or fleet_code,
                "type": kind,
                "max_pax": integer(item.get("max_pax")),
                "max_cargo": integer(item.get("max_cargo")),
                "weight_unit": item.get("weight_unit") if item.get("weight_unit") in ("lbs", "kg") else None,
                "aircraft_count": len(visible),
                "registrations": registrations[:MAX_REGISTRATIONS],
                "image": https_url(item.get("image_url")),
                "image_attribution": text(item.get("image_attribution"), 160),
                "image_link": https_url(item.get("image_linkback")),
            }
        )
    fleet.sort(key=lambda entry: (-entry["aircraft_count"], entry["name"]))
    return fleet, codes


def _routes(raw_routes: list[dict[str, Any]], airports: _Airports, fleet_codes: Mapping[int, str]) -> list[dict[str, Any]]:
    routes: list[dict[str, Any]] = []
    for item in raw_routes:
        if item.get("hidden") is True:
            continue
        origin = airports.icao_for(item.get("departure_id"))
        destination = airports.icao_for(item.get("arrival_id"))
        if origin is None or destination is None:
            continue
        types = sorted(
            {fleet_codes[fid] for fid in (integer(v) for v in (item.get("fleet_ids") or [])) if fid in fleet_codes}
        )
        days = [text(str(day), 12) for day in (item.get("service_days") or []) if isinstance(day, (str, int)) and not isinstance(day, bool)]
        raw_tags = item.get("tag") if isinstance(item.get("tag"), list) else []
        kind = item.get("type") if item.get("type") in ROUTE_KINDS else "scheduled"
        routes.append(
            {
                "kind": kind,
                "tags": [t for t in (text(tag, 30) for tag in raw_tags if isinstance(tag, str)) if t][:6],
                "flight_number": text(item.get("flight_number"), 12),
                "callsign": text(item.get("callsign"), 12),
                "from": origin,
                "to": destination,
                "distance_nm": integer(item.get("flight_distance")),
                "duration_min": minutes_from_hms(item.get("flight_length")),
                "departure_time": text(item.get("departure_time"), 8),
                "types": types,
                "days": [day for day in days if day],
            }
        )
        if len(routes) >= MAX_ROUTES:
            break
    routes.sort(key=lambda r: (r["from"], r["to"], r["flight_number"] or ""))
    return routes


def _hubs(raw_hubs: list[dict[str, Any]], airports: _Airports) -> list[dict[str, Any]]:
    hubs = []
    for item in sorted(raw_hubs, key=lambda h: (integer(h.get("order")) or 0, str(h.get("name")))):
        name = text(item.get("name"), 80)
        if not name:
            continue
        icaos = [icao for icao in (airports.icao_for(a) for a in (item.get("airport_ids") or [])) if icao]
        hubs.append(
            {
                "name": name,
                "default": item.get("default") is True,
                "pilots": integer(item.get("pilots_count")),
                "airports": icaos,
            }
        )
    return hubs


def _ranks(raw_ranks: list[dict[str, Any]]) -> list[dict[str, Any]]:
    ranks = []
    for item in sorted(raw_ranks, key=lambda r: integer(r.get("level")) or 0):
        name = text(item.get("name"), 60)
        if not name:
            continue
        ranks.append(
            {
                "level": integer(item.get("level")),
                "name": name,
                "abbreviation": text(item.get("abbreviation"), 12),
                "honorary": item.get("honorary_rank") is True,
                "hours": integer(item.get("hours")),
                "flights": integer(item.get("pireps")),
                "points": integer(item.get("points")),
                "description": plain_text(item.get("description"), 280),
                "image": https_url(item.get("image")),
                "pilots": integer(item.get("regular_pilots_count")),
            }
        )
    return ranks


def _events(raw_events: list[dict[str, Any]], now: datetime) -> list[dict[str, Any]]:
    current = now.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    events = []
    for item in raw_events:
        name = text(item.get("name"), 120)
        start = timestamp(item.get("start"))
        end = timestamp(item.get("end"))
        if not name or (end is not None and end < current):
            continue
        tags = item.get("tags") if isinstance(item.get("tags"), list) else []
        events.append(
            {
                "name": name,
                "kind": text(item.get("subtype"), 40) or text(item.get("type"), 40),
                "description": plain_text(item.get("description"), MAX_TEXT),
                "start": start,
                "end": end,
                "image": https_url(item.get("image")),
                "tags": [t for t in (text(tag, 30) for tag in tags if isinstance(tag, str)) if t][:6],
                "registration_required": item.get("registration_required") is True,
                "registrations": integer(item.get("registration_count")),
                "points": integer(item.get("points")),
            }
        )
    events.sort(key=lambda e: (e["start"] or "9999", e["name"]))
    return events[:MAX_EVENTS]


def _live(raw_live: list[dict[str, Any]], airports: _Airports, show_pilots: bool) -> list[dict[str, Any]]:
    flights = []
    for item in raw_live[:MAX_LIVE]:
        origin = airports.add_live(item.get("departureAirport"))
        destination = airports.add_live(item.get("arrivalAirport"))
        if origin is None or destination is None:
            continue
        booking = item.get("booking") if isinstance(item.get("booking"), dict) else {}
        aircraft = item.get("aircraft") if isinstance(item.get("aircraft"), dict) else {}
        progress = item.get("progress") if isinstance(item.get("progress"), dict) else {}
        pilot = item.get("pilot") if isinstance(item.get("pilot"), dict) else {}
        rank = pilot.get("rank") if isinstance(pilot.get("rank"), dict) else {}
        location = progress.get("location") if isinstance(progress.get("location"), dict) else {}
        lat = _lat(progress.get("latitude"))
        lon = _lon(progress.get("longitude"))
        if lat is None or lon is None:
            lat, lon = _lat(location.get("lat")), _lon(location.get("lon"))
        flights.append(
            {
                "callsign": text(booking.get("callsign"), 12),
                "flight_number": text(booking.get("flightNumber"), 12),
                "from": origin,
                "to": destination,
                "phase": text(progress.get("currentPhase"), 30),
                "aircraft": code(aircraft.get("code")) or text(aircraft.get("type"), 12),
                "aircraft_name": text(aircraft.get("name"), 60),
                "registration": text(aircraft.get("registration"), 12),
                "pilot": text(pilot.get("username"), 40) if show_pilots else None,
                "rank": text(rank.get("abbreviation"), 12),
                "network": text(booking.get("network"), 20),
                "lat": lat,
                "lon": lon,
                "altitude_ft": integer(progress.get("altitude")),
                "groundspeed_kt": integer(progress.get("groundSpeed")),
                "heading": integer(progress.get("magneticHeading")),
                "route_nm": integer(progress.get("routeDistance")),
                "remaining_nm": integer(progress.get("distanceRemaining")),
                "eta": timestamp(progress.get("estimatedArrivalTime")) or timestamp(progress.get("eta")),
            }
        )
    return flights


def _recent(raw_pireps: list[dict[str, Any]], airports: _Airports, fleet_codes: Mapping[int, str]) -> list[dict[str, Any]]:
    recent = []
    for item in raw_pireps:
        if item.get("status") != "accepted":
            continue
        origin = airports.icao_for(item.get("departure_airport_id"))
        destination = airports.icao_for(item.get("arrival_airport_id"))
        if origin is None or destination is None:
            continue
        seconds = integer(item.get("flight_length"))
        recent.append(
            {
                "callsign": text(item.get("callsign"), 12),
                "flight_number": text(item.get("flight_number"), 12),
                "from": origin,
                "to": destination,
                "aircraft": fleet_codes.get(integer(item.get("fleet_id")) or -1),
                "landing_rate": integer(item.get("landing_rate")),
                "duration_min": round(seconds / 60) if seconds is not None and seconds >= 0 else None,
                "landed": timestamp(item.get("landing_time")) or timestamp(item.get("on_blocks_time")),
            }
        )
    recent.sort(key=lambda r: r["landed"] or "", reverse=True)
    return recent[:MAX_RECENT]


def _divisions(value: Any) -> list[dict[str, Any]]:
    """Operating divisions from site.config.json; fleets are matched to them by ICAO type code."""
    divisions = []
    for item in _dicts(value)[:8]:
        name = text(item.get("name"), 40)
        if not name:
            continue
        fleets = [c for c in (code(v) for v in (item.get("fleets") or [])) if c]
        divisions.append(
            {
                "name": name,
                "summary": text(item.get("summary"), 240),
                "base": code(item.get("base")),
                "fleets": fleets,
            }
        )
    return divisions


def site_settings(site: Mapping[str, Any]) -> dict[str, Any]:
    return {
        "divisions": _divisions(site.get("divisions")),
        "name": text(site.get("name"), 80) or "Crossroads Executive & Charter",
        "short_name": text(site.get("short_name"), 30) or "Crossroads",
        "tagline": text(site.get("tagline"), 160),
        "join_url": https_url(site.get("join_url")),
        "pilot_login_url": https_url(site.get("pilot_login_url")),
        "discord_url": https_url(site.get("discord_url")),
        "contact_email": text(site.get("contact_email"), 120),
    }


def build_snapshot(
    raw: Mapping[str, Any],
    site: Mapping[str, Any],
    *,
    now: datetime,
    source: str,
    unavailable: Iterable[str] = (),
) -> dict[str, Any]:
    if source not in SOURCES:
        raise ValueError(f"source must be one of {SOURCES}")
    airports = _Airports(_dicts(raw.get("airports")))
    fleet, fleet_codes = _fleet(_dicts(raw.get("fleet")), raw.get("aircraft_by_fleet") or {})
    routes = _routes(_dicts(raw.get("routes")), airports, fleet_codes)
    hubs = _hubs(_dicts(raw.get("hubs")), airports)
    live = _live(_dicts(_data(raw.get("flight_map")) or raw.get("flight_map")), airports, site.get("show_pilot_names") is True)
    recent = _recent(_dicts(raw.get("pireps")), airports, fleet_codes)
    return {
        "schema": SCHEMA,
        "source": source,
        "generated_at": now.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "unavailable": sorted(set(unavailable)),
        "airline": site_settings(site),
        "stats": {
            "all_time": _stats(raw.get("stats_all_time")),
            "last_30_days": _stats(raw.get("stats_30_days")),
        },
        "live": live,
        "fleet": fleet,
        "routes": routes,
        "hubs": hubs,
        "ranks": _ranks(_dicts(raw.get("ranks"))),
        "events": _events(_dicts(raw.get("events")), now),
        "recent_flights": recent,
        "airports": dict(sorted(airports.used.items())),
    }

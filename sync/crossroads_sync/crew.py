"""Crew Tools briefings: live weather, runway winds, fuel estimates and approach cards.

All calculations use Kimi's Jumpseat modules (vendored unchanged in ``kimi_tools``):
weather parsing and crosswind components from weather_briefing, trip fuel from fuel_planner and
approach cards from approach_briefing. This module only gathers inputs and shapes the output.
"""

from __future__ import annotations

import json
import re
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable, Iterable, Mapping

from kimi_tools import approach as kimi_approach
from kimi_tools import fuel_core as kimi_fuel
from kimi_tools import weather as kimi_weather

HERE = Path(__file__).resolve().parent
RUNWAYS_FILE = HERE / "runways.json"
PROFILES_FILE = HERE / "fuel_profiles.json"

WEATHER_API = "https://aviationweather.gov/api/data"
MAX_WEATHER_BYTES = 2 * 1024 * 1024
_ICAO = re.compile(r"^[A-Z0-9]{3,4}$")
GATE_DISTANCES_NM = [10, 5, 3, 1]
THRESHOLD_CROSSING_FT = 50
GLIDE_PATH_DEG = 3.0
CALM_KT = 3

Fetcher = Callable[[str], Any]


# --------------------------------------------------------------------------- weather fetch


def _default_fetch(url: str) -> Any:
    request = urllib.request.Request(url, headers={"Accept": "application/json", "User-Agent": "crossroads-crew-tools/1"})
    with urllib.request.urlopen(request, timeout=15) as response:  # noqa: S310 - fixed https host
        body = response.read(MAX_WEATHER_BYTES + 1)
    if len(body) > MAX_WEATHER_BYTES:
        raise ValueError("weather response too large")
    return json.loads(body.decode("utf-8")) if body.strip() else []


def fetch_weather(icaos: Iterable[str], fetch: Fetcher = _default_fetch) -> dict[str, dict[str, Any]]:
    """METARs and TAFs from aviationweather.gov for the given stations (one request each)."""
    ids = sorted({i for i in icaos if isinstance(i, str) and _ICAO.match(i)})
    if not ids:
        return {}
    joined = ",".join(ids)
    metars = fetch(f"{WEATHER_API}/metar?ids={joined}&format=json")
    tafs = fetch(f"{WEATHER_API}/taf?ids={joined}&format=json")
    result: dict[str, dict[str, Any]] = {}
    for item in metars if isinstance(metars, list) else []:
        if isinstance(item, dict) and item.get("icaoId") in ids and isinstance(item.get("rawOb"), str):
            clouds = [
                {"cover": c.get("cover"), "base_ft": c.get("base")}
                for c in item.get("clouds") or []
                if isinstance(c, dict) and isinstance(c.get("cover"), str)
            ][:6]
            category = item.get("fltCat") if item.get("fltCat") in ("VFR", "MVFR", "IFR", "LIFR") else None
            result.setdefault(item["icaoId"], {}).update({"metar": item["rawOb"], "flight_category": category, "clouds": clouds})
    for item in tafs if isinstance(tafs, list) else []:
        if isinstance(item, dict) and item.get("icaoId") in ids and isinstance(item.get("rawTAF"), str):
            result.setdefault(item["icaoId"], {})["taf"] = item["rawTAF"]
    return result


# --------------------------------------------------------------------------- helpers


def load_runways(path: Path = RUNWAYS_FILE) -> dict[str, list[dict[str, Any]]]:
    return json.loads(path.read_text(encoding="utf-8"))["runways"]


def load_profiles(path: Path = PROFILES_FILE) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def _kimi_profile(code: str, raw: Mapping[str, Any]) -> kimi_fuel.AircraftProfile:
    return kimi_fuel.parse_profile(
        {
            "schema_version": 1,
            "id": code.lower(),
            "fuel_unit": "kg",
            "flow_unit": "kg/h",
            "consumption": {k: raw[k] for k in kimi_fuel.PHASE_NAMES},
            "reserve_minutes": raw.get("reserve_minutes", 45),
            "contingency_fraction": raw.get("contingency_fraction", 0.05),
            "provenance": {
                "evidence": "DERIVED",
                "source": "Crossroads planning estimate from typical published fuel flows",
                "date": "2026-11-10",
                "confidence": "unverifiable",
                "notes": "Quick-look estimate only; dispatch with SimBrief.",
            },
        },
        origin=f"fuel_profiles.json:{code}",
    )


def split_phases(block_minutes: int, defaults: Mapping[str, Any]) -> dict[str, float]:
    """Split block time into Kimi's phases, scaling climb/descent down on very short legs."""
    taxi = float(defaults.get("taxi", 15))
    climb = float(defaults.get("climb", 20))
    descent = float(defaults.get("descent", 25))
    airborne = max(float(block_minutes) - taxi, 1.0)
    if climb + descent > airborne * 0.8:
        scale = airborne * 0.8 / (climb + descent)
        climb, descent = climb * scale, descent * scale
    cruise = max(airborne - climb - descent, 0.0)
    return {"taxi": taxi, "climb": round(climb, 1), "cruise": round(cruise, 1), "descent": round(descent, 1)}


def _metar_summary(raw: str, now: float) -> dict[str, Any] | None:
    try:
        parsed = kimi_weather.parse_metar(raw, now)
    except kimi_weather.WeatherError:
        return None
    keep = ("raw", "station", "wind", "visibility", "temperature_c", "dewpoint_c", "altimeter", "warnings")
    summary = {k: parsed[k] for k in keep if k in parsed}
    for key in ("observed_at", "age_s", "stale"):
        if key in parsed:
            summary[key] = parsed[key]
    return summary


def _runway_winds(runways: list[dict[str, Any]], wind: Mapping[str, Any] | None) -> tuple[list[dict[str, Any]], str | None]:
    rows: list[dict[str, Any]] = []
    for rw in runways:
        row = {k: rw.get(k) for k in ("id", "reciprocal", "heading_true_deg", "length_ft", "width_ft", "surface", "elevation_ft")}
        row["wind"] = None
        if wind and rw.get("heading_true_deg") is not None and not wind.get("variable") and wind.get("direction_deg") is not None:
            try:
                row["wind"] = kimi_weather.calculate_crosswind(dict(wind), float(rw["heading_true_deg"]))
            except kimi_weather.WeatherError:
                row["wind"] = None
        rows.append(row)
    if not rows:
        return rows, None
    speed = float(wind.get("speed_kt", 0)) if wind else 0.0
    with_wind = [r for r in rows if r["wind"]]
    if speed < CALM_KT or not with_wind:
        preferred = max(rows, key=lambda r: (r["length_ft"] or 0))
    else:
        preferred = max(with_wind, key=lambda r: (r["wind"]["headwind_kt"] - 10 * r["wind"]["tailwind_kt"] - 0.2 * r["wind"]["crosswind_kt"], r["length_ft"] or 0))
    return rows, preferred["id"]


def _approach_card(runway: Mapping[str, Any], wind: Mapping[str, Any] | None, vref: float | None) -> dict[str, Any]:
    weather_in: dict[str, Any] = {}
    if wind and not wind.get("variable") and wind.get("direction_deg") is not None:
        weather_in = {"wind_direction_true_deg": wind["direction_deg"], "wind_speed_kt": wind["speed_kt"]}
    aircraft: dict[str, Any] = {"threshold_crossing_height_ft": THRESHOLD_CROSSING_FT, "gate_distances_nm": GATE_DISTANCES_NM}
    if vref:
        aircraft["approach_speed_kt"] = vref + 5  # Vref + 5 kt as a generic Vapp
    runway_in = {
        "identifier": runway.get("id"),
        "reciprocal_identifier": runway.get("reciprocal"),
        "heading_true_deg": runway.get("heading_true_deg"),
        "threshold": runway.get("threshold"),
        "end": runway.get("end"),
        "threshold_elevation_ft": runway.get("elevation_ft"),
        "length_ft": runway.get("length_ft"),
        "glide_path_deg": GLIDE_PATH_DEG,
    }
    runway_in = {k: v for k, v in runway_in.items() if v is not None}
    card = kimi_approach.build_briefing(runway_in, weather_in, aircraft)
    return {k: card[k] for k in ("runway", "wind", "aircraft", "target_gates", "warnings") if k in card}


# --------------------------------------------------------------------------- builder


def build_crew(
    snapshot: Mapping[str, Any],
    *,
    now: datetime,
    weather_raw: Mapping[str, Mapping[str, Any]] | None,
    runways: Mapping[str, list[dict[str, Any]]] | None = None,
    profiles: Mapping[str, Any] | None = None,
) -> dict[str, Any]:
    runways = runways if runways is not None else load_runways()
    profiles = profiles if profiles is not None else load_profiles()
    epoch = now.timestamp()
    defaults = profiles.get("defaults", {}).get("phase_minutes", {})
    raw_profiles = profiles.get("profiles", {})

    airports: dict[str, Any] = {}
    preferred_runway: dict[str, dict[str, Any]] = {}
    for icao in sorted(snapshot.get("airports", {})):
        wx = (weather_raw or {}).get(icao, {})
        metar = _metar_summary(wx["metar"], epoch) if wx.get("metar") else None
        rows, preferred = _runway_winds(runways.get(icao, []), metar.get("wind") if metar else None)
        airports[icao] = {
            "flight_category": wx.get("flight_category"),
            "clouds": wx.get("clouds", []),
            "metar": metar,
            "taf": wx.get("taf"),
            "runways": rows,
            "preferred_runway": preferred,
        }
        if preferred:
            preferred_runway[icao] = next(r for r in runways.get(icao, []) if r["id"] == preferred)

    plans: dict[str, Any] = {}
    approaches: dict[str, dict[str, Any]] = {}
    for route in snapshot.get("routes", []):
        key = route.get("callsign") or route.get("flight_number")
        if not key or route.get("duration_min") is None:
            continue
        phases = split_phases(route["duration_min"], defaults)
        per_type: dict[str, Any] = {}
        for code in route.get("types", []):
            raw = raw_profiles.get(code)
            if not raw:
                continue
            trip = kimi_fuel.calculate_trip(_kimi_profile(code, raw), phases)
            per_type[code] = {
                "phases": {p["phase"]: {"minutes": p["minutes"], "fuel_kg": round(p["fuel"])} for p in trip["phases"]},
                "trip_kg": round(trip["trip_fuel"]),
                "contingency_kg": round(trip["contingency_fuel"]),
                "reserve_minutes": trip["reserve_minutes"],
                "reserve_kg": round(trip["reserve_fuel"]),
                "total_kg": round(trip["total_fuel"]),
            }
            arrival = route.get("to")
            if arrival in preferred_runway and code not in approaches.get(arrival, {}):
                wind = (airports[arrival]["metar"] or {}).get("wind")
                approaches.setdefault(arrival, {})[code] = _approach_card(preferred_runway[arrival], wind, raw.get("vref_kt"))
        if per_type:
            plans[key] = per_type

    return {
        "generated_at": now.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "weather_source": "aviationweather.gov" if weather_raw else None,
        "airports": airports,
        "plans": plans,
        "approaches": approaches,
        "notes": {
            "fuel": "Quick-look estimate from Kimi's fuel_planner with Crossroads planning profiles. Dispatch with SimBrief for real figures.",
            "approach": f"{GLIDE_PATH_DEG:.0f}° glide path, {THRESHOLD_CROSSING_FT} ft threshold crossing, Vref + 5 kt. Simulation use only.",
            "runways": "Runway data from OurAirports (public domain). Preferred runway = most headwind, avoiding tailwind; longest runway when calm.",
        },
    }

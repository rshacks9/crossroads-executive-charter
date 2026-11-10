"""Deterministic, offline approach cards from explicitly supplied data."""
from __future__ import annotations

import json
import math
from collections.abc import Mapping, Sequence
from typing import Any

__all__ = ["BriefingInputError", "Plugin", "build_briefing", "render_json", "render_text"]

_FEET_PER_NM = 1852.0 / 0.3048
_EARTH_RADIUS_M = 6371008.8


class BriefingInputError(ValueError):
    """A supplied value is malformed or outside its documented range."""


def _mapping(value: Any, name: str) -> Mapping[str, Any]:
    if not isinstance(value, Mapping):
        raise BriefingInputError(f"{name} must be an object")
    return value


def _number(
    data: Mapping[str, Any],
    key: str,
    section: str,
    *,
    minimum: float | None = None,
    maximum: float | None = None,
    positive: bool = False,
) -> float | None:
    if key not in data:
        return None
    value = data[key]
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise BriefingInputError(f"{section}.{key} must be a number")
    result = float(value)
    if not math.isfinite(result):
        raise BriefingInputError(f"{section}.{key} must be finite")
    if positive and result <= 0:
        raise BriefingInputError(f"{section}.{key} must be greater than zero")
    if minimum is not None and result < minimum:
        raise BriefingInputError(f"{section}.{key} must be at least {minimum:g}")
    if maximum is not None and result > maximum:
        raise BriefingInputError(f"{section}.{key} must be at most {maximum:g}")
    return result


def _text(data: Mapping[str, Any], key: str, section: str) -> str | None:
    if key not in data:
        return None
    value = data[key]
    if not isinstance(value, str) or not value.strip():
        raise BriefingInputError(f"{section}.{key} must be a non-empty string")
    return value.strip()


def _rounded(value: float) -> float:
    result = round(value, 1)
    return 0.0 if result == 0 else result


def _heading(value: float) -> float:
    result = value % 360.0
    return 360.0 if result == 0 else result


def _point(value: Any, name: str) -> tuple[float, float] | None:
    if value is None:
        return None
    point = _mapping(value, name)
    latitude = _number(point, "latitude_deg", name, minimum=-90, maximum=90)
    longitude = _number(point, "longitude_deg", name, minimum=-180, maximum=180)
    if latitude is None or longitude is None:
        return None
    return latitude, longitude


def _geometry(
    threshold: tuple[float, float], end: tuple[float, float]
) -> tuple[float, float]:
    lat1, lon1 = (math.radians(value) for value in threshold)
    lat2, lon2 = (math.radians(value) for value in end)
    dlat = lat2 - lat1
    dlon = lon2 - lon1
    haversine = (
        math.sin(dlat / 2) ** 2
        + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
    )
    distance_m = 2 * _EARTH_RADIUS_M * math.asin(min(1.0, math.sqrt(haversine)))
    if distance_m == 0:
        raise BriefingInputError("runway.threshold and runway.end must be different positions")
    y = math.sin(dlon) * math.cos(lat2)
    x = math.cos(lat1) * math.sin(lat2) - math.sin(lat1) * math.cos(lat2) * math.cos(dlon)
    heading = _heading(math.degrees(math.atan2(y, x)))
    return heading, distance_m / 0.3048


def _warning(warnings: list[dict[str, str]], code: str, message: str) -> None:
    warnings.append({"code": code, "message": message})


def _wind_components(
    runway_heading: float, wind_direction: float, speed: float
) -> dict[str, float | str]:
    angle = math.radians(wind_direction - runway_heading)
    headwind = speed * math.cos(angle)
    crosswind = speed * math.sin(angle)
    rounded_crosswind = _rounded(crosswind)
    return {
        "headwind_kt": _rounded(headwind),
        "tailwind_kt": _rounded(max(0.0, -headwind)),
        "crosswind_kt": rounded_crosswind,
        "crosswind_from": (
            "none" if rounded_crosswind == 0 else "right" if rounded_crosswind > 0 else "left"
        ),
    }


def _gate_distances(aircraft: Mapping[str, Any]) -> list[float] | None:
    if "gate_distances_nm" not in aircraft:
        return None
    raw = aircraft["gate_distances_nm"]
    if isinstance(raw, (str, bytes)) or not isinstance(raw, Sequence):
        raise BriefingInputError("aircraft.gate_distances_nm must be an array")
    distances: list[float] = []
    for index, value in enumerate(raw):
        item = _number(
            {str(index): value}, str(index), "aircraft.gate_distances_nm", minimum=0
        )
        assert item is not None
        if item in distances:
            raise BriefingInputError("aircraft.gate_distances_nm must not contain duplicates")
        distances.append(item)
    return sorted(distances, reverse=True)


def build_briefing(
    runway: Mapping[str, Any], weather: Mapping[str, Any], aircraft: Mapping[str, Any]
) -> dict[str, Any]:
    """Build a JSON-compatible card without reading airport, weather, or aircraft data."""
    runway = _mapping(runway, "runway")
    weather = _mapping(weather, "weather")
    aircraft = _mapping(aircraft, "aircraft")
    warnings: list[dict[str, str]] = []

    identifier = _text(runway, "identifier", "runway")
    if identifier is None:
        _warning(warnings, "runway.identifier_missing", "Runway identifier was not supplied.")
    reciprocal_identifier = _text(runway, "reciprocal_identifier", "runway")
    supplied_heading = _number(
        runway, "heading_true_deg", "runway", minimum=0, maximum=360
    )
    threshold = _point(runway.get("threshold"), "runway.threshold")
    end = _point(runway.get("end"), "runway.end")
    geometry: tuple[float, float] | None = None
    if threshold is not None and end is not None:
        geometry = _geometry(threshold, end)

    runway_output: dict[str, Any] = {}
    if identifier is not None:
        runway_output["identifier"] = identifier
    if reciprocal_identifier is not None:
        runway_output["reciprocal_identifier"] = reciprocal_identifier

    heading: float | None = supplied_heading
    orientation_source = "provided"
    if heading is None and geometry is not None:
        heading = geometry[0]
        orientation_source = "threshold_end_geometry"
    if heading is None:
        runway_output["orientation"] = {"status": "unavailable"}
        _warning(
            warnings,
            "runway.heading_unavailable",
            "Supply runway.heading_true_deg or complete threshold/end coordinates.",
        )
    else:
        heading = _heading(heading)
        runway_output["orientation"] = {
            "heading_true_deg": _rounded(heading),
            "reciprocal_heading_true_deg": _rounded(_heading(heading + 180.0)),
            "source": orientation_source,
        }

    threshold_elevation = _number(runway, "threshold_elevation_ft", "runway")
    if threshold_elevation is not None:
        runway_output["threshold_elevation_ft"] = _rounded(threshold_elevation)
    length = _number(runway, "length_ft", "runway", positive=True)
    if length is None and geometry is not None:
        length = geometry[1]
    if length is not None:
        runway_output["length_ft"] = _rounded(length)
    glide_path = _number(runway, "glide_path_deg", "runway", minimum=0, maximum=90)
    if glide_path is not None and (glide_path <= 0 or glide_path >= 90):
        raise BriefingInputError("runway.glide_path_deg must be between zero and 90 degrees")
    if glide_path is not None:
        runway_output["glide_path_deg"] = _rounded(glide_path)

    wind_direction = _number(
        weather, "wind_direction_true_deg", "weather", minimum=0, maximum=360
    )
    wind_speed = _number(weather, "wind_speed_kt", "weather", minimum=0)
    wind_gust = _number(weather, "wind_gust_kt", "weather", minimum=0)
    if wind_gust is not None and wind_speed is not None and wind_gust < wind_speed:
        raise BriefingInputError("weather.wind_gust_kt must not be less than weather.wind_speed_kt")
    if wind_direction is None:
        _warning(
            warnings,
            "weather.direction_missing",
            "Wind direction from, in true degrees, was not supplied.",
        )
    if wind_speed is None:
        _warning(warnings, "weather.speed_missing", "Sustained wind speed was not supplied.")

    weather_output: dict[str, Any] = {}
    if wind_direction is not None:
        weather_output["wind_direction_true_deg"] = _rounded(_heading(wind_direction))
    if wind_speed is not None:
        weather_output["wind_speed_kt"] = _rounded(wind_speed)
    if wind_gust is not None:
        weather_output["wind_gust_kt"] = _rounded(wind_gust)
    if heading is not None and wind_direction is not None and wind_speed is not None:
        weather_output["components"] = _wind_components(heading, wind_direction, wind_speed)
        if wind_gust is not None:
            weather_output["gust_components"] = _wind_components(
                heading, wind_direction, wind_gust
            )
    else:
        weather_output["components"] = {"status": "unavailable"}
        if heading is None and wind_direction is not None and wind_speed is not None:
            _warning(
                warnings,
                "weather.components_unavailable",
                "Wind components require the runway true heading.",
            )

    name = _text(aircraft, "name", "aircraft")
    approach_speed = _number(aircraft, "approach_speed_kt", "aircraft", positive=True)
    crossing_height = _number(
        aircraft, "threshold_crossing_height_ft", "aircraft", minimum=0
    )
    distances = _gate_distances(aircraft)
    if approach_speed is None:
        _warning(
            warnings,
            "aircraft.approach_speed_missing",
            "Target approach speed was not supplied by the aircraft profile.",
        )
    if crossing_height is None:
        _warning(
            warnings,
            "aircraft.threshold_crossing_height_missing",
            "Threshold crossing height was not supplied by the aircraft profile.",
        )
    if not distances:
        _warning(
            warnings,
            "aircraft.gate_distances_missing",
            "No target gate distances were supplied by the aircraft profile.",
        )

    aircraft_output: dict[str, Any] = {}
    if name is not None:
        aircraft_output["name"] = name
    if approach_speed is not None:
        aircraft_output["approach_speed_kt"] = _rounded(approach_speed)
    if crossing_height is not None:
        aircraft_output["threshold_crossing_height_ft"] = _rounded(crossing_height)
    if distances:
        aircraft_output["gate_distances_nm"] = [_rounded(value) for value in distances]

    gates: list[dict[str, float]] = []
    if distances:
        if glide_path is None:
            _warning(
                warnings,
                "runway.glide_path_missing",
                "Gate heights are unavailable without the intended glide path angle.",
            )
        if threshold_elevation is None:
            _warning(
                warnings,
                "runway.threshold_elevation_missing",
                "Gate MSL altitudes are unavailable without runway threshold elevation.",
            )
        for distance in distances:
            gate: dict[str, float] = {"distance_to_threshold_nm": _rounded(distance)}
            if approach_speed is not None:
                gate["target_speed_kt"] = _rounded(approach_speed)
            if glide_path is not None and crossing_height is not None:
                height = crossing_height + distance * _FEET_PER_NM * math.tan(
                    math.radians(glide_path)
                )
                gate["height_above_threshold_ft"] = _rounded(height)
                if threshold_elevation is not None:
                    gate["altitude_ft_msl"] = _rounded(threshold_elevation + height)
            gates.append(gate)

    return {
        "schema_version": 1,
        "runway": runway_output,
        "wind": weather_output,
        "aircraft": aircraft_output,
        "target_gates": gates,
        "warnings": warnings,
    }


def render_json(card: Mapping[str, Any]) -> str:
    """Render stable, finite JSON with a trailing newline."""
    return json.dumps(
        card, sort_keys=True, indent=2, ensure_ascii=False, allow_nan=False
    ) + "\n"


def _component_text(components: Mapping[str, Any]) -> str:
    if components.get("status") == "unavailable":
        return "unavailable"
    if components["headwind_kt"] < 0:
        along = f"{components['tailwind_kt']:.1f} kt tailwind"
    else:
        along = f"{components['headwind_kt']:.1f} kt headwind"
    side = components["crosswind_from"]
    if side == "none":
        return f"{along}, no crosswind"
    return f"{along}, {abs(components['crosswind_kt']):.1f} kt crosswind from {side}"


def render_text(card: Mapping[str, Any]) -> str:
    """Render a card as deterministic plain text, preserving unavailable values."""
    runway = card["runway"]
    weather = card["wind"]
    aircraft = card["aircraft"]
    lines = ["APPROACH BRIEFING", f"Runway: {runway.get('identifier', 'unavailable')}"]
    orientation = runway["orientation"]
    if orientation.get("status") == "unavailable":
        lines.append("Runway heading: unavailable")
    else:
        lines.append(
            f"Runway heading: {orientation['heading_true_deg']:.1f}° true; "
            f"reciprocal {orientation['reciprocal_heading_true_deg']:05.1f}° true"
        )
    if "length_ft" in runway:
        lines.append(f"Runway length: {runway['length_ft']:.1f} ft")

    if "wind_direction_true_deg" in weather and "wind_speed_kt" in weather:
        wind = (
            f"Wind: {weather['wind_direction_true_deg']:.1f}° true from at "
            f"{weather['wind_speed_kt']:.1f} kt"
        )
        if "wind_gust_kt" in weather:
            wind += f", gusting {weather['wind_gust_kt']:.1f} kt"
        lines.append(wind)
    else:
        lines.append("Wind: unavailable")
    lines.append(f"Wind components: {_component_text(weather['components'])}")
    if "gust_components" in weather:
        lines.append(f"Gust components: {_component_text(weather['gust_components'])}")
    lines.append(f"Aircraft profile: {aircraft.get('name', 'unavailable')}")
    if "approach_speed_kt" in aircraft:
        lines.append(f"Approach speed: {aircraft['approach_speed_kt']:.1f} kt")
    else:
        lines.append("Approach speed: unavailable")
    if "glide_path_deg" in runway:
        lines.append(f"Glide path: {runway['glide_path_deg']:.1f}°")

    gates = card["target_gates"]
    if not gates:
        lines.append("Target gates: unavailable")
    else:
        lines.append("Target gates (distance to threshold):")
        for gate in gates:
            parts: list[str] = []
            if "altitude_ft_msl" in gate:
                parts.append(f"{gate['altitude_ft_msl']:.1f} ft MSL")
            else:
                parts.append("MSL altitude unavailable")
            if "height_above_threshold_ft" in gate:
                parts.append(f"{gate['height_above_threshold_ft']:.1f} ft above threshold")
            if "target_speed_kt" in gate:
                parts.append(f"target {gate['target_speed_kt']:.1f} kt")
            lines.append(f"  {gate['distance_to_threshold_nm']:.1f} NM: {', '.join(parts)}")

    if card["warnings"]:
        lines.append("Warnings:")
        for warning in card["warnings"]:
            lines.append(f"  WARNING [{warning['code']}]: {warning['message']}")
    return "\n".join(lines) + "\n"


_POINT_SCHEMA = {
    "type": "object",
    "properties": {
        "latitude_deg": {"type": "number", "minimum": -90, "maximum": 90},
        "longitude_deg": {"type": "number", "minimum": -180, "maximum": 180},
    },
    "additionalProperties": False,
}

_INPUT_SCHEMA = {
    "type": "object",
    "properties": {
        "runway": {
            "type": "object",
            "properties": {
                "identifier": {"type": "string"},
                "reciprocal_identifier": {"type": "string"},
                "heading_true_deg": {"type": "number", "minimum": 0, "maximum": 360},
                "threshold": _POINT_SCHEMA,
                "end": _POINT_SCHEMA,
                "threshold_elevation_ft": {"type": "number"},
                "length_ft": {"type": "number"},
                "glide_path_deg": {"type": "number"},
            },
            "additionalProperties": False,
        },
        "weather": {
            "type": "object",
            "properties": {
                "wind_direction_true_deg": {"type": "number", "minimum": 0, "maximum": 360},
                "wind_speed_kt": {"type": "number", "minimum": 0},
                "wind_gust_kt": {"type": "number", "minimum": 0},
            },
            "additionalProperties": False,
        },
        "aircraft": {
            "type": "object",
            "properties": {
                "name": {"type": "string"},
                "approach_speed_kt": {"type": "number"},
                "threshold_crossing_height_ft": {"type": "number", "minimum": 0},
                "gate_distances_nm": {
                    "type": "array",
                    "items": {"type": "number", "minimum": 0},
                },
            },
            "additionalProperties": False,
        },
        "format": {"type": "string", "enum": ["json", "text"]},
    },
    "additionalProperties": False,
}


class Plugin:
    """Host lifecycle adapter; construction and import register nothing."""

    def __init__(self) -> None:
        self._bus: Any = None
        self._registry: Any = None
        self._resolver: Any = None
        self._registered = False
        self._started = False

    def start(self, bus: Any, registry: Any, resolver: Any) -> None:
        if self._started:
            return
        if not self._registered:
            registry.register(
                "approach_briefing_build",
                self._handle,
                description="Build an offline approach card from supplied runway, weather, and aircraft data.",
                input_schema=_INPUT_SCHEMA,
                tier=0,
            )
            self._registered = True
        self._bus = bus
        self._registry = registry
        self._resolver = resolver
        self._started = True

    def stop(self) -> None:
        self._bus = None
        self._resolver = None
        self._started = False

    def _handle(self, args: Mapping[str, Any]) -> str:
        args = _mapping(args, "args")
        unknown = set(args) - {"runway", "weather", "aircraft", "format"}
        if unknown:
            raise BriefingInputError(f"Unknown argument: {sorted(unknown)[0]}")
        output = args.get("format", "json")
        if output not in {"json", "text"}:
            raise BriefingInputError("format must be 'json' or 'text'")
        card = build_briefing(
            args.get("runway", {}), args.get("weather", {}), args.get("aircraft", {})
        )
        return render_text(card) if output == "text" else render_json(card)

"""Pure, offline performance arithmetic using only caller-supplied data."""
from __future__ import annotations

import math
from collections.abc import Mapping
from typing import Any

__all__ = [
    "CalculationError",
    "calculate_density_altitude",
    "calculate_wind_components",
    "calculate_descent_point",
    "convert_units",
]

PROVENANCE = "UNVERIFIED"
DATA_SOURCE = "custom-data"
FEET_PER_NAUTICAL_MILE = 1852.0 / 0.3048


class CalculationError(ValueError):
    """Caller input cannot produce a finite, defined calculation."""


def _number(value: Any, name: str) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise CalculationError(f"{name} must be a finite number")
    try:
        result = float(value)
    except (OverflowError, ValueError):
        raise CalculationError(f"{name} must be a finite number") from None
    if not math.isfinite(result):
        raise CalculationError(f"{name} must be a finite number")
    return result


def _finite_result(value: float, name: str) -> float:
    if not math.isfinite(value):
        raise CalculationError(f"{name} is outside the finite numeric range")
    return value


DATA_STATUS = "USER_PROVIDED_UNCERTIFIED"
DISCLAIMER = (
    "UNCERTIFIED SIMULATION ESTIMATE — NOT FOR REAL-WORLD FLIGHT PLANNING OR OPERATIONAL USE."
)


def _base_result() -> dict[str, Any]:
    return {
        "provenance": PROVENANCE,
        "data_source": DATA_SOURCE,
        "certified_performance": False,
        "data_status": DATA_STATUS,
        "disclaimer": DISCLAIMER,
    }


def calculate_density_altitude(
    pressure_altitude_ft: float,
    oat_c: float,
) -> dict[str, Any]:
    """Approximate dry-air density altitude from pressure altitude and OAT."""
    pressure_altitude = _number(pressure_altitude_ft, "pressure_altitude_ft")
    oat = _number(oat_c, "oat_c")
    if oat < -273.15:
        raise CalculationError("oat_c must not be below absolute zero")

    isa_temperature = _finite_result(
        15.0 - 0.0019812 * pressure_altitude,
        "isa_temperature_c",
    )
    density_altitude = _finite_result(
        pressure_altitude + 120.0 * (oat - isa_temperature),
        "density_altitude_ft",
    )
    return {
        "pressure_altitude_ft": pressure_altitude,
        "oat_c": oat,
        "isa_temperature_c": isa_temperature,
        "density_altitude_ft": density_altitude,
        "isa_method": "15 - 0.0019812 * pressure_altitude_ft",
        "method": "pressure_altitude_ft + 120 * (oat_c - isa_temperature_c)",
        "limitations": "Dry-air ISA-deviation approximation; humidity is not included.",
        **_base_result(),
    }


def _direction(value: Any, name: str) -> float:
    return _number(value, name) % 360.0


def _clean_zero(value: float) -> float:
    return 0.0 if abs(value) < 1e-12 else value


def _limit_check(component_kt: float, limit_kt: float) -> dict[str, Any]:
    return {
        "limit_kt": limit_kt,
        "margin_kt": _finite_result(limit_kt - component_kt, "limit margin"),
        "exceeded": component_kt > limit_kt,
    }


def _validate_limits(limits: Mapping[str, Any]) -> dict[str, Any]:
    allowed = {
        "max_crosswind_kt",
        "max_headwind_kt",
        "max_tailwind_kt",
        "source",
    }
    unknown = set(limits).difference(allowed)
    if unknown:
        names = ", ".join(sorted(str(name) for name in unknown))
        raise CalculationError(f"unknown aircraft limit field(s): {names}")
    source = limits.get("source")
    if not isinstance(source, str) or not source.strip():
        raise CalculationError("aircraft_limits.source must identify the custom-data source")
    supplied = [name for name in allowed.difference({"source"}) if name in limits]
    if not supplied:
        raise CalculationError("aircraft_limits must supply at least one numeric limit")

    validated: dict[str, Any] = {
        "source": source.strip(),
        "provenance": PROVENANCE,
        "data_source": DATA_SOURCE,
    }
    for name in sorted(supplied):
        value = _number(limits[name], f"aircraft_limits.{name}")
        if value < 0:
            raise CalculationError(f"aircraft_limits.{name} must not be negative")
        validated[name] = value
    return validated


def calculate_wind_components(
    wind_direction_deg: float,
    wind_speed_kt: float,
    runway_heading_deg: float,
    aircraft_limits: Mapping[str, Any] | None = None,
) -> dict[str, Any]:
    """Resolve meteorological wind into runway components and optional custom-limit checks."""
    wind_direction = _direction(wind_direction_deg, "wind_direction_deg")
    runway_heading = _direction(runway_heading_deg, "runway_heading_deg")
    wind_speed = _number(wind_speed_kt, "wind_speed_kt")
    if wind_speed < 0:
        raise CalculationError("wind_speed_kt must not be negative")
    if aircraft_limits is not None and not isinstance(aircraft_limits, Mapping):
        raise CalculationError("aircraft_limits must be an object")
    limits = _validate_limits(aircraft_limits) if aircraft_limits is not None else None

    relative_angle = ((wind_direction - runway_heading + 180.0) % 360.0) - 180.0
    angle_radians = math.radians(relative_angle)
    headwind = _clean_zero(wind_speed * math.cos(angle_radians))
    crosswind = _clean_zero(wind_speed * math.sin(angle_radians))
    tailwind = _clean_zero(max(-headwind, 0.0))

    checks: dict[str, dict[str, Any]] = {}
    if limits is not None:
        components = {
            "max_crosswind_kt": ("crosswind", abs(crosswind)),
            "max_headwind_kt": ("headwind", max(headwind, 0.0)),
            "max_tailwind_kt": ("tailwind", tailwind),
        }
        for limit_name, (check_name, component) in components.items():
            if limit_name in limits:
                checks[check_name] = _limit_check(component, limits[limit_name])

    return {
        "wind_direction_deg": wind_direction,
        "wind_speed_kt": wind_speed,
        "runway_heading_deg": runway_heading,
        "relative_wind_angle_deg": relative_angle,
        "headwind_kt": headwind,
        "crosswind_kt": crosswind,
        "tailwind_kt": tailwind,
        "crosswind_sign": "positive from the right; negative from the left",
        "limit_checks": checks,
        "within_custom_limits": (
            all(not check["exceeded"] for check in checks.values()) if checks else None
        ),
        "aircraft_limits": limits,
        "limitations": "Limit comparisons are arithmetic only, not operational approval.",
        **_base_result(),
    }


def calculate_descent_point(
    current_altitude_ft: float,
    target_altitude_ft: float,
    ground_speed_kt: float,
    descent_rate_fpm: float,
    buffer_nm: float = 0.0,
) -> dict[str, Any]:
    """Compute a geometric descent start point for a positive downward rate."""
    current_altitude = _number(current_altitude_ft, "current_altitude_ft")
    target_altitude = _number(target_altitude_ft, "target_altitude_ft")
    ground_speed = _number(ground_speed_kt, "ground_speed_kt")
    descent_rate = _number(descent_rate_fpm, "descent_rate_fpm")
    buffer = _number(buffer_nm, "buffer_nm")
    altitude_to_lose = current_altitude - target_altitude
    if altitude_to_lose <= 0:
        raise CalculationError("current_altitude_ft must be greater than target_altitude_ft")
    if ground_speed <= 0:
        raise CalculationError("ground_speed_kt must be greater than zero")
    if descent_rate <= 0:
        raise CalculationError("descent_rate_fpm must be a positive downward rate")
    if buffer < 0:
        raise CalculationError("buffer_nm must not be negative")

    time_min = _finite_result(altitude_to_lose / descent_rate, "time_min")
    distance = _finite_result(ground_speed * time_min / 60.0, "distance_nm")
    start_distance = _finite_result(distance + buffer, "start_distance_nm")
    descent_angle = math.degrees(
        math.atan2(altitude_to_lose, distance * FEET_PER_NAUTICAL_MILE)
    )
    return {
        "current_altitude_ft": current_altitude,
        "target_altitude_ft": target_altitude,
        "ground_speed_kt": ground_speed,
        "descent_rate_fpm": descent_rate,
        "altitude_to_lose_ft": altitude_to_lose,
        "time_min": time_min,
        "distance_nm": distance,
        "buffer_nm": buffer,
        "start_distance_nm": start_distance,
        "descent_angle_deg": descent_angle,
        "method": "time_min = altitude_to_lose_ft / descent_rate_fpm; distance_nm = ground_speed_kt * time_min / 60",
        "limitations": "Constant ground speed and descent rate; no wind, routing, deceleration, or procedure constraints.",
        **_base_result(),
    }


_LINEAR_UNITS: dict[str, tuple[str, float]] = {
    "m": ("length", 1.0),
    "km": ("length", 1000.0),
    "ft": ("length", 0.3048),
    "in": ("length", 0.0254),
    "nm": ("length", 1852.0),
    "mi": ("length", 1609.344),
    "m/s": ("speed", 1.0),
    "km/h": ("speed", 1000.0 / 3600.0),
    "kt": ("speed", 1852.0 / 3600.0),
    "mph": ("speed", 1609.344 / 3600.0),
    "ft/s": ("speed", 0.3048),
    "ft/min": ("speed", 0.3048 / 60.0),
    "pa": ("pressure", 1.0),
    "hpa": ("pressure", 100.0),
    "inhg": ("pressure", 3386.389),
    "psi": ("pressure", 6894.757293168),
    "kg": ("mass", 1.0),
    "lb": ("mass", 0.45359237),
}

_UNIT_ALIASES = {
    "meter": "m",
    "meters": "m",
    "metre": "m",
    "metres": "m",
    "kilometer": "km",
    "kilometers": "km",
    "kilometre": "km",
    "kilometres": "km",
    "foot": "ft",
    "feet": "ft",
    "inch": "in",
    "inches": "in",
    "nauticalmile": "nm",
    "nauticalmiles": "nm",
    "mile": "mi",
    "miles": "mi",
    "statutemile": "mi",
    "statutemiles": "mi",
    "mps": "m/s",
    "kmh": "km/h",
    "kph": "km/h",
    "knot": "kt",
    "knots": "kt",
    "kts": "kt",
    "fps": "ft/s",
    "fpm": "ft/min",
    "pascal": "pa",
    "pascals": "pa",
    "hectopascal": "hpa",
    "hectopascals": "hpa",
    "millibar": "hpa",
    "millibars": "hpa",
    "mbar": "hpa",
    "kilogram": "kg",
    "kilograms": "kg",
    "pound": "lb",
    "pounds": "lb",
    "lbs": "lb",
    "celsius": "c",
    "°c": "c",
    "fahrenheit": "f",
    "°f": "f",
    "kelvin": "k",
}


def _unit(value: Any, name: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise CalculationError(f"{name} must be a non-empty unit string")
    normalized = value.strip().lower().replace(" ", "").replace("_", "")
    normalized = _UNIT_ALIASES.get(normalized, normalized)
    if normalized not in _LINEAR_UNITS and normalized not in {"c", "f", "k"}:
        raise CalculationError(f"unsupported {name}: {value}")
    return normalized


def _temperature_to_kelvin(value: float, unit: str) -> float:
    if unit == "c":
        if value < -273.15:
            raise CalculationError("temperature must not be below absolute zero")
        return value + 273.15
    if unit == "f":
        if value < -459.67:
            raise CalculationError("temperature must not be below absolute zero")
        return (value + 459.67) * (5.0 / 9.0)
    if value < 0:
        raise CalculationError("temperature must not be below absolute zero")
    return value


def convert_units(value: float, from_unit: str, to_unit: str) -> dict[str, Any]:
    """Convert one finite value between compatible documented units."""
    numeric = _number(value, "value")
    source = _unit(from_unit, "from_unit")
    target = _unit(to_unit, "to_unit")

    if source in {"c", "f", "k"} or target in {"c", "f", "k"}:
        if source not in {"c", "f", "k"} or target not in {"c", "f", "k"}:
            raise CalculationError("temperature units can only convert to other temperature units")
        kelvin = _finite_result(_temperature_to_kelvin(numeric, source), "converted value")
        if target == "k":
            converted = kelvin
        elif target == "c":
            converted = kelvin - 273.15
        else:
            converted = kelvin * (9.0 / 5.0) - 459.67
        dimension = "temperature"
    else:
        source_dimension, source_factor = _LINEAR_UNITS[source]
        target_dimension, target_factor = _LINEAR_UNITS[target]
        if source_dimension != target_dimension:
            raise CalculationError(
                f"cannot convert {source_dimension} unit {from_unit} to {target_dimension} unit {to_unit}"
            )
        if source == target:
            converted = numeric
        else:
            converted = numeric * source_factor / target_factor
        dimension = source_dimension

    return {
        "input_value": numeric,
        "from_unit": source,
        "to_unit": target,
        "value": _finite_result(converted, "converted value"),
        "dimension": dimension,
        **_base_result(),
    }

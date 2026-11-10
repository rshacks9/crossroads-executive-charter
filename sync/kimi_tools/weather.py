from __future__ import annotations

import math
import re
from datetime import datetime, timezone
from typing import Any

DEFAULT_METAR_STALE_AFTER_S = 90 * 60


class WeatherError(ValueError):
    pass


def _normalise_text(text: str, kind: str) -> str:
    if not isinstance(text, str) or not text.strip():
        raise WeatherError(f"{kind} text must be a non-empty string.")
    if len(text) > 12000 or any(ord(char) < 32 and char not in "\r\n\t" for char in text):
        raise WeatherError(f"{kind} text is too long or contains control characters.")
    return " ".join(text.upper().split())


def _month_candidate(year: int, month: int, offset: int) -> tuple[int, int]:
    index = year * 12 + month - 1 + offset
    return index // 12, index % 12 + 1


def _day_time_epoch(day: int, hour: int, minute: int, now: float) -> float:
    current = datetime.fromtimestamp(now, timezone.utc)
    candidates = []
    for offset in (-2, -1, 0, 1):
        year, month = _month_candidate(current.year, current.month, offset)
        try:
            candidate = datetime(year, month, day, hour, minute, tzinfo=timezone.utc)
        except ValueError:
            continue
        if candidate.timestamp() <= now + 300:
            candidates.append(candidate.timestamp())
    if not candidates:
        raise WeatherError("The weather timestamp is invalid or too far in the future.")
    return max(candidates)


def _iso(epoch: float) -> str:
    return datetime.fromtimestamp(epoch, timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _temperature(value: str) -> float:
    return float(-int(value[1:]) if value.startswith("M") else int(value))


def _wind(token: str) -> dict[str, Any] | None:
    match = re.fullmatch(r"(\d{3}|VRB)(\d{2,3})(?:G(\d{2,3}))?(KT|MPS|KMH)", token)
    if not match:
        return None
    direction, speed, gust, unit = match.groups()
    factor = 1.0 if unit == "KT" else 1.94384449 if unit == "MPS" else 0.539956803
    result: dict[str, Any] = {
        "direction_deg": None if direction == "VRB" else int(direction),
        "speed_kt": round(int(speed) * factor, 1),
        "variable": direction == "VRB",
    }
    if gust is not None:
        result["gust_kt"] = round(int(gust) * factor, 1)
    return result


def _validate_stale_after(value: float) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not 0 <= value <= 31536000:
        raise WeatherError("The staleness limit must be a finite number between 0 and 31536000 seconds.")
    return float(value)


def _age_fields(epoch: float, now: float, stale_after_s: float) -> dict[str, Any]:
    stale_after_s = _validate_stale_after(stale_after_s)
    return {
        "observed_at": _iso(epoch),
        "observed_epoch": epoch,
        "age_s": int(round(max(0.0, now - epoch))),
        "stale": now - epoch > stale_after_s,
    }


def _station(tokens: list[str], time_index: int, prefixes: tuple[str, ...]) -> str:
    return next((token for token in tokens[:time_index] if token not in prefixes), "")


def parse_metar(text: str, now: float, *, stale_after_s: float = DEFAULT_METAR_STALE_AFTER_S) -> dict[str, Any]:
    raw = _normalise_text(text, "METAR")
    tokens = raw.split()
    time_index = next((index for index, token in enumerate(tokens) if re.fullmatch(r"\d{6}Z", token)), None)
    if time_index is None:
        raise WeatherError("METAR text must include a DDHHMMZ observation time.")
    stamp = tokens[time_index]
    observed_epoch = _day_time_epoch(int(stamp[:2]), int(stamp[2:4]), int(stamp[4:6]), now)
    result: dict[str, Any] = {
        "kind": "METAR",
        "raw": raw,
        **_age_fields(observed_epoch, now, stale_after_s),
        "warnings": [],
    }
    station = _station(tokens, time_index, ("METAR", "SPECI", "COR", "AUTO"))
    if station:
        result["station"] = station
    for token in tokens[time_index + 1:]:
        wind = _wind(token)
        if wind is not None and "wind" not in result:
            result["wind"] = wind
            continue
        if wind is None and re.match(r"^(?:\d{3}|VRB)\d{2,3}", token):
            raise WeatherError(f"METAR has a malformed wind token: {token}.")
        visibility = re.fullmatch(r"(\d+(?:\.\d+)?)SM", token)
        if visibility and "visibility" not in result:
            result["visibility"] = {"value": float(visibility.group(1)), "unit": "SM"}
            continue
        if re.fullmatch(r"\d{4}", token) and "visibility" not in result:
            result["visibility"] = {"value": float(token), "unit": "m"}
            continue
        temperatures = re.fullmatch(r"(M?\d{2})/(M?\d{2})", token)
        if temperatures and "temperature_c" not in result:
            result["temperature_c"] = _temperature(temperatures.group(1))
            result["dewpoint_c"] = _temperature(temperatures.group(2))
            continue
        altimeter = re.fullmatch(r"A(\d{4})", token)
        if altimeter and "altimeter" not in result:
            result["altimeter"] = {"value": int(altimeter.group(1)) / 100.0, "unit": "inHg"}
            continue
        qnh = re.fullmatch(r"Q(\d{4})", token)
        if qnh and "altimeter" not in result:
            result["altimeter"] = {"value": int(qnh.group(1)), "unit": "hPa"}
    if "wind" not in result:
        result["warnings"].append("METAR wind is unavailable.")
    return result


def _validity_epochs(stamp: str, issued_epoch: float) -> tuple[float, float]:
    match = re.fullmatch(r"(\d{2})(\d{2})/(\d{2})(\d{2})", stamp)
    if not match:
        raise WeatherError("TAF validity must use the DDHH/DDHH form.")
    start_day, start_hour, end_day, end_hour = (int(value) for value in match.groups())
    issued = datetime.fromtimestamp(issued_epoch, timezone.utc)
    starts = []
    ends = []
    for offset in (-1, 0, 1, 2):
        year, month = _month_candidate(issued.year, issued.month, offset)
        try:
            starts.append(datetime(year, month, start_day, start_hour, tzinfo=timezone.utc).timestamp())
            ends.append(datetime(year, month, end_day, end_hour, tzinfo=timezone.utc).timestamp())
        except ValueError:
            continue
    if not starts or not ends:
        raise WeatherError("TAF validity contains an invalid day or hour.")
    start = min(starts, key=lambda value: abs(value - issued_epoch))
    later_ends = [value for value in ends if value > start]
    if not later_ends:
        raise WeatherError("TAF validity must end after it starts.")
    return start, min(later_ends)


def parse_taf(
    text: str,
    now: float,
    *,
    stale_after_s: float = 24 * 60 * 60,
) -> dict[str, Any]:
    raw = _normalise_text(text, "TAF")
    tokens = raw.split()
    time_index = next((index for index, token in enumerate(tokens) if re.fullmatch(r"\d{6}Z", token)), None)
    if time_index is None:
        raise WeatherError("TAF text must include a DDHHMMZ issue time.")
    stamp = tokens[time_index]
    issued_epoch = _day_time_epoch(int(stamp[:2]), int(stamp[2:4]), int(stamp[4:6]), now)
    result: dict[str, Any] = {
        "kind": "TAF",
        "raw": raw,
        "issued_at": _iso(issued_epoch),
        "issued_epoch": issued_epoch,
        "age_s": int(round(max(0.0, now - issued_epoch))),
        "warnings": [],
    }
    station = _station(tokens, time_index, ("TAF", "AMD", "COR"))
    if station:
        result["station"] = station
    validity_index = next((index for index, token in enumerate(tokens) if re.fullmatch(r"\d{4}/\d{4}", token)), None)
    if validity_index is not None:
        valid_from, valid_until = _validity_epochs(tokens[validity_index], issued_epoch)
        status = "future" if now < valid_from else "expired" if now >= valid_until else "current"
        result.update({
            "valid_from": _iso(valid_from),
            "valid_from_epoch": valid_from,
            "valid_until": _iso(valid_until),
            "valid_until_epoch": valid_until,
            "status": status,
            "stale": status == "expired" or now - issued_epoch > _validate_stale_after(stale_after_s),
        })
    else:
        result["status"] = "unknown"
        result["stale"] = now - issued_epoch > _validate_stale_after(stale_after_s)
        result["warnings"].append("TAF validity is unavailable.")
    for token in tokens[time_index + 1:]:
        if validity_index is not None and tokens.index(token) == validity_index:
            continue
        wind = _wind(token)
        if wind is not None:
            result["wind"] = wind
            break
        if re.match(r"^(?:\d{3}|VRB)\d{2,3}", token):
            raise WeatherError(f"TAF has a malformed wind token: {token}.")
    if "wind" not in result:
        result["warnings"].append("TAF wind is unavailable.")
    return result


def _sample_number(sample: Any, key: str) -> float:
    value = sample[key]
    if isinstance(value, bool) or not isinstance(value, (int, float)) or value != value or value in (float("inf"), float("-inf")):
        raise WeatherError(f"Simulator sample field {key} must be a finite number.")
    return float(value)


def parse_sim_sample(
    sample: Any,
    now: float,
    *,
    stale_after_s: float = 30.0,
) -> dict[str, Any]:
    if not isinstance(sample, dict):
        raise WeatherError("Simulator sample must be an object keyed by canonical field names.")
    weather_keys = ("wind_dir", "wind_kt", "oat", "baro", "sl_press")
    if not any(key in sample for key in weather_keys):
        raise WeatherError("Simulator sample contains no supported weather fields.")
    result: dict[str, Any] = {"kind": "SIM_SAMPLE", "warnings": []}
    if "t_wall" in sample:
        observed_epoch = _sample_number(sample, "t_wall")
        if observed_epoch < 0:
            raise WeatherError("Simulator sample field t_wall cannot be negative.")
        result.update(_age_fields(observed_epoch, now, stale_after_s))
        if now - observed_epoch < -300:
            result["warnings"].append("Simulator sample t_wall is more than five minutes in the future.")
    else:
        result["warnings"].append("Simulator sample has no t_wall; age and staleness are unavailable.")
    if "wind_dir" in sample or "wind_kt" in sample:
        wind: dict[str, Any] = {"variable": False}
        if "wind_dir" in sample:
            direction = _sample_number(sample, "wind_dir")
            if not 0 <= direction <= 360:
                raise WeatherError("Simulator sample wind_dir must be between 0 and 360 degrees.")
            wind["direction_deg"] = direction
        if "wind_kt" in sample:
            speed = _sample_number(sample, "wind_kt")
            if speed < 0:
                raise WeatherError("Simulator sample wind_kt cannot be negative.")
            wind["speed_kt"] = speed
        result["wind"] = wind
    if "oat" in sample:
        result["temperature_c"] = _sample_number(sample, "oat")
    if "baro" in sample:
        value = _sample_number(sample, "baro")
        if value <= 0:
            raise WeatherError("Simulator sample baro must be positive.")
        result["altimeter"] = {"value": value, "unit": "inHg"}
    if "sl_press" in sample:
        value = _sample_number(sample, "sl_press")
        if value <= 0:
            raise WeatherError("Simulator sample sl_press must be positive.")
        result["qnh"] = {"value": value, "unit": "hPa"}
    return result


DISCLAIMER = (
    "Offline, informational calculation only; not a certified weather briefing. "
    "No live weather was retrieved; verify current conditions through approved aviation sources."
)


def _finite(value: Any, name: str) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
        raise WeatherError(f"{name} must be a finite number.")
    return float(value)


def _rounded(value: float) -> float:
    result = round(value, 1)
    return 0.0 if result == 0 else result


def _crosswind_side(value: float) -> str:
    rounded = _rounded(value)
    return "left" if rounded < 0 else "right" if rounded > 0 else "none"


def calculate_crosswind(wind: dict[str, Any], runway_heading_deg: float) -> dict[str, Any]:
    """Calculate components for wind coming *from* a direction on a runway heading."""
    if not isinstance(wind, dict):
        raise WeatherError("Wind must be an object with direction_deg and speed_kt.")
    heading = _finite(runway_heading_deg, "Runway heading")
    if not 0 <= heading <= 360:
        raise WeatherError("Runway heading must be between 0 and 360 degrees.")
    if wind.get("variable") is True or wind.get("direction_deg") is None:
        raise WeatherError("A variable or missing wind direction cannot produce a crosswind component.")
    direction = _finite(wind.get("direction_deg"), "Wind direction")
    speed = _finite(wind.get("speed_kt"), "Wind speed")
    if not 0 <= direction <= 360:
        raise WeatherError("Wind direction must be between 0 and 360 degrees.")
    if speed < 0:
        raise WeatherError("Wind speed cannot be negative.")

    def components(strength: float) -> tuple[float, float]:
        angle = math.radians(direction - heading)
        return strength * math.cos(angle), strength * math.sin(angle)

    headwind, crosswind = components(speed)
    result: dict[str, Any] = {
        "headwind_kt": _rounded(max(0.0, headwind)),
        "tailwind_kt": _rounded(max(0.0, -headwind)),
        "crosswind_kt": _rounded(abs(crosswind)),
        "crosswind_from": _crosswind_side(crosswind),
    }
    if "gust_kt" in wind:
        gust = _finite(wind["gust_kt"], "Gust speed")
        if gust < 0:
            raise WeatherError("Gust speed cannot be negative.")
        gust_headwind, gust_crosswind = components(gust)
        result.update({
            "gust_headwind_kt": _rounded(max(0.0, gust_headwind)),
            "gust_tailwind_kt": _rounded(max(0.0, -gust_headwind)),
            "gust_crosswind_kt": _rounded(abs(gust_crosswind)),
            "gust_crosswind_from": _crosswind_side(gust_crosswind),
        })
    return result


def _number_text(value: float) -> str:
    return f"{value:g}"


def _component_text(components: dict[str, Any], *, gust: bool = False) -> str:
    prefix = "gust_" if gust else ""
    crosswind = components[prefix + "crosswind_kt"]
    side = components[prefix + "crosswind_from"]
    cross_text = (
        f"{_number_text(crosswind)} kt {side} crosswind"
        if side != "none" else "0 kt crosswind"
    )
    if gust:
        cross_text = "gust " + cross_text
    headwind = components[prefix + "headwind_kt"]
    tailwind = components[prefix + "tailwind_kt"]
    along = (
        f"{_number_text(tailwind)} kt tailwind"
        if tailwind > 0 else f"{_number_text(headwind)} kt headwind"
    )
    return f"{cross_text}, {along}"


def build_briefing(
    *,
    metar: Any = None,
    taf: Any = None,
    sample: Any = None,
    runway_heading_deg: Any = None,
    now: float,
    metar_stale_after_s: float = DEFAULT_METAR_STALE_AFTER_S,
    taf_stale_after_s: float = 24 * 60 * 60,
    sample_stale_after_s: float = 30.0,
) -> dict[str, Any]:
    """Build deterministic offline advice while retaining every source-level failure."""
    now = _finite(now, "Current time")
    if now < 0:
        raise WeatherError("Current time cannot be negative.")
    sources: dict[str, Any] = {}
    errors: list[dict[str, str]] = []
    warnings: list[str] = []
    valid_sources: list[str] = []
    supplied = {"metar": metar, "taf": taf, "sim_sample": sample}
    parsers = {
        "metar": lambda: parse_metar(metar, now, stale_after_s=metar_stale_after_s),
        "taf": lambda: parse_taf(taf, now, stale_after_s=taf_stale_after_s),
        "sim_sample": lambda: parse_sim_sample(sample, now, stale_after_s=sample_stale_after_s),
    }
    labels = {"metar": "METAR", "taf": "TAF", "sim_sample": "SIM_SAMPLE"}
    for name in ("metar", "taf", "sim_sample"):
        if supplied[name] is None:
            continue
        try:
            parsed = parsers[name]()
        except (WeatherError, TypeError, ValueError, OverflowError) as exc:
            message = str(exc)
            sources[name] = {"kind": labels[name], "valid": False, "error": message}
            errors.append({"source": name, "error": message})
        else:
            sources[name] = parsed
            valid_sources.append(name)
            warnings.extend(f"{labels[name]}: {warning}" for warning in parsed["warnings"])
    if not any(value is not None for value in supplied.values()):
        errors.append({"source": "inputs", "error": "No weather sources were supplied."})

    crosswind: dict[str, Any] | None = None
    wind_source: str | None = None
    for name in ("metar", "sim_sample"):
        parsed = sources.get(name)
        if name in valid_sources and isinstance(parsed.get("wind"), dict):
            wind_source = name
            break
    if wind_source is not None:
        if runway_heading_deg is None:
            warnings.append("Runway heading is unavailable; crosswind was not calculated.")
        else:
            try:
                crosswind = calculate_crosswind(sources[wind_source]["wind"], runway_heading_deg)
            except WeatherError as exc:
                errors.append({"source": "runway_heading", "error": str(exc)})
            else:
                crosswind["source"] = wind_source
                crosswind["stale"] = bool(sources[wind_source].get("stale", False))
    elif runway_heading_deg is not None:
        warnings.append("Observed wind is unavailable; crosswind was not calculated.")
    if crosswind is None and "taf" in valid_sources and "wind" in sources["taf"]:
        warnings.append("TAF wind is forecast data and is not used for observed crosswind components.")

    if not valid_sources:
        status = "invalid"
    elif errors:
        status = "partial"
    else:
        status = "ok"
    lines: list[str] = []
    if valid_sources:
        lines.append("Offline weather sources: " + ", ".join(labels[name] for name in valid_sources) + ".")
    else:
        lines.append("No usable offline weather source was parsed.")
    if crosswind is not None:
        source_label = labels[wind_source] if wind_source is not None else "unknown"
        if crosswind["stale"]:
            lines.append(f"STALE {source_label} wind; confirm its age before using the calculation.")
        component_text = _component_text(crosswind)
        if "gust_crosswind_kt" in crosswind:
            component_text += "; " + _component_text(crosswind, gust=True)
        lines.append(component_text + f". Source: {source_label}.")
    else:
        lines.append("Observed crosswind components are unavailable.")
    return {
        "status": status,
        "sources": sources,
        "crosswind": crosswind,
        "briefing": "\n".join(lines),
        "disclaimer": DISCLAIMER,
        "warnings": warnings,
        "errors": errors,
    }

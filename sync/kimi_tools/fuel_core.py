"""Offline fuel arithmetic using only explicit, user-provided aircraft profiles."""
from __future__ import annotations

import copy
from dataclasses import dataclass
from datetime import date
import json
import math
from pathlib import Path
import re
from types import MappingProxyType
from typing import Any, Iterable, Mapping, Optional


PHASE_NAMES = ("taxi", "climb", "cruise", "descent", "holding")
FUEL_UNITS = ("kg", "lb")
FLOW_UNITS = ("kg/h", "lb/h")
DATA_STATUS = "USER_PROVIDED_UNCERTIFIED"

_ID_RE = re.compile(r"^[a-z0-9][a-z0-9_-]{0,63}$")
_LB_KG = 0.45359237
_FLOW_FACTORS = {"kg/h": 1.0, "lb/h": _LB_KG}
_PROFILE_KEYS = {
    "schema_version", "id", "fuel_unit", "flow_unit", "consumption",
    "reserve_minutes", "contingency_fraction", "provenance",
}
_PROVENANCE_KEYS = {"evidence", "source", "date", "confidence", "notes"}
_EVIDENCE = {"MEASURED", "BOOK", "DERIVED"}
_CONFIDENCE = {"confirmed", "partly", "contradicted", "unverifiable"}


class FuelPlannerError(ValueError):
    """Base class for invalid profiles, units, and planning inputs."""


class UnitError(FuelPlannerError):
    """A unit is unknown or belongs to the wrong physical dimension."""


class ProfileError(FuelPlannerError):
    """A profile or phase list is missing, malformed, or inconsistent."""


@dataclass(frozen=True)
class Provenance:
    evidence: str
    source: str
    date: str
    confidence: str
    notes: str = ""

    def as_dict(self) -> dict[str, Any]:
        return {
            "evidence": self.evidence,
            "source": self.source,
            "date": self.date,
            "confidence": self.confidence,
            "notes": self.notes,
        }


@dataclass(frozen=True)
class AircraftProfile:
    id: str
    fuel_unit: str
    flow_unit: str
    consumption: Mapping[str, float]
    reserve_minutes: float
    contingency_fraction: float
    provenance: Provenance
    origin: str = ""

    def summary(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "fuel_unit": self.fuel_unit,
            "flow_unit": self.flow_unit,
            "reserve_minutes": self.reserve_minutes,
            "contingency_fraction": self.contingency_fraction,
            "provenance": self.provenance.as_dict(),
        }


def _status() -> dict[str, Any]:
    return {"certified_performance": False, "data_status": DATA_STATUS}


def _number(
    value: Any,
    where: str,
    *,
    minimum: Optional[float] = 0.0,
    maximum: Optional[float] = None,
    positive: bool = False,
    error: type[FuelPlannerError] = ProfileError,
) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise error(f"{where} must be a finite number")
    result = float(value)
    if not math.isfinite(result):
        raise error(f"{where} must be a finite number")
    if positive and result <= 0.0:
        raise error(f"{where} must be greater than zero")
    if minimum is not None and result < minimum:
        raise error(f"{where} must be at least {minimum}")
    if maximum is not None and result > maximum:
        raise error(f"{where} must be at most {maximum}")
    return result


def validate_fuel_unit(unit: Any) -> str:
    if unit not in FUEL_UNITS:
        raise UnitError(
            f"fuel unit {unit!r} is unsupported; use kg or lb "
            "(volume requires an explicit density and is not accepted)"
        )
    return unit


def validate_flow_unit(unit: Any) -> str:
    if unit not in FLOW_UNITS:
        raise UnitError(
            f"flow unit {unit!r} is unsupported; use kg/h or lb/h "
            "(volume requires an explicit density and is not accepted)"
        )
    return unit


def fuel_to_kg(value: Any, unit: Any) -> float:
    amount = _number(value, "fuel amount", error=UnitError)
    validate_fuel_unit(unit)
    return amount * _LB_KG if unit == "lb" else amount


def fuel_from_kg(value: float, unit: Any) -> float:
    validate_fuel_unit(unit)
    result = value / _LB_KG if unit == "lb" else value
    return round(result, 12)


def flow_to_kg_h(value: Any, unit: Any) -> float:
    amount = _number(value, "fuel flow", positive=True, error=UnitError)
    validate_flow_unit(unit)
    return amount * _FLOW_FACTORS[unit]


def flow_from_kg_h(value: float, unit: Any) -> float:
    validate_flow_unit(unit)
    return round(value / _FLOW_FACTORS[unit], 12)


def _text(value: Any, where: str, *, allow_empty: bool = False) -> str:
    if not isinstance(value, str) or not value.isprintable():
        raise ProfileError(f"{where} must be printable text")
    result = value.strip()
    if not result and not allow_empty:
        raise ProfileError(f"{where} must not be empty")
    return result


def parse_profile(raw: Any, *, origin: str = "") -> AircraftProfile:
    if not isinstance(raw, Mapping):
        raise ProfileError("aircraft profile must be a JSON object")
    unknown = set(raw).difference(_PROFILE_KEYS)
    if unknown:
        raise ProfileError(f"profile has unknown fields: {', '.join(sorted(unknown))}")
    required = _PROFILE_KEYS
    missing = required.difference(raw)
    if missing:
        raise ProfileError(f"profile is missing fields: {', '.join(sorted(missing))}")
    if type(raw["schema_version"]) is not int or raw["schema_version"] != 1:
        raise ProfileError("profile schema_version must be 1")
    profile_id = _text(raw["id"], "profile id")
    if not _ID_RE.fullmatch(profile_id):
        raise ProfileError("profile id must use 1-64 lower-case letters, digits, underscores, or hyphens")
    fuel_unit = validate_fuel_unit(raw["fuel_unit"])
    flow_unit = validate_flow_unit(raw["flow_unit"])

    raw_consumption = raw["consumption"]
    if not isinstance(raw_consumption, Mapping):
        raise ProfileError("consumption must be an object")
    if set(raw_consumption) != set(PHASE_NAMES):
        raise ProfileError(
            "consumption must contain exactly " + ", ".join(PHASE_NAMES)
        )
    consumption = {
        name: _number(raw_consumption[name], f"consumption.{name}", positive=True)
        for name in PHASE_NAMES
    }
    reserve_minutes = _number(raw["reserve_minutes"], "reserve_minutes")
    contingency_fraction = _number(
        raw["contingency_fraction"], "contingency_fraction", maximum=1.0
    )

    raw_provenance = raw["provenance"]
    if not isinstance(raw_provenance, Mapping):
        raise ProfileError("provenance must be an object")
    unknown = set(raw_provenance).difference(_PROVENANCE_KEYS)
    if unknown:
        raise ProfileError(f"provenance has unknown fields: {', '.join(sorted(unknown))}")
    missing = {"evidence", "source", "date", "confidence"}.difference(raw_provenance)
    if missing:
        raise ProfileError(f"provenance is missing fields: {', '.join(sorted(missing))}")
    evidence = _text(raw_provenance["evidence"], "provenance.evidence")
    if evidence not in _EVIDENCE:
        raise ProfileError("provenance.evidence must be MEASURED, BOOK, or DERIVED")
    confidence = _text(raw_provenance["confidence"], "provenance.confidence")
    if confidence not in _CONFIDENCE:
        raise ProfileError(
            "provenance.confidence must be confirmed, partly, contradicted, or unverifiable"
        )
    source = _text(raw_provenance["source"], "provenance.source")
    date_text = _text(raw_provenance["date"], "provenance.date")
    try:
        parsed_date = date.fromisoformat(date_text)
    except ValueError:
        raise ProfileError("provenance.date must be an ISO date (YYYY-MM-DD)") from None
    if parsed_date.isoformat() != date_text:
        raise ProfileError("provenance.date must be an ISO date (YYYY-MM-DD)")
    notes = _text(raw_provenance.get("notes", ""), "provenance.notes", allow_empty=True)
    provenance = Provenance(evidence, source, date_text, confidence, notes)
    return AircraftProfile(
        profile_id,
        fuel_unit,
        flow_unit,
        MappingProxyType(consumption),
        reserve_minutes,
        contingency_fraction,
        provenance,
        origin,
    )


def _reject_constant(value: str) -> None:
    raise ValueError(f"non-finite JSON number {value}")


def _unique_object(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
    result: dict[str, Any] = {}
    for key, value in pairs:
        if key in result:
            raise ValueError(f"duplicate JSON field {key!r}")
        result[key] = value
    return result


class ProfileStore:
    """Reads profiles only below resolver.data_dir('fuel_planner')/profiles."""

    def __init__(self, resolver: Any) -> None:
        self.directory = Path(resolver.data_dir("fuel_planner")) / "profiles"

    def _path(self, profile_id: Any) -> Path:
        if not isinstance(profile_id, str) or not _ID_RE.fullmatch(profile_id):
            raise ProfileError("invalid profile id")
        base = self.directory.resolve()
        path = (base / f"{profile_id}.json").resolve()
        if path.parent != base:
            raise ProfileError("profile path escapes the fuel_planner data directory")
        return path

    def load(self, profile_id: str) -> AircraftProfile:
        path = self._path(profile_id)
        try:
            with path.open("r", encoding="utf-8-sig") as handle:
                raw = json.load(
                    handle,
                    parse_constant=_reject_constant,
                    object_pairs_hook=_unique_object,
                )
        except (OSError, ValueError) as exc:
            raise ProfileError(f"could not read profile {profile_id!r}: {exc}") from None
        profile = parse_profile(raw, origin=str(path))
        if profile.id != profile_id:
            raise ProfileError(
                f"profile file {profile_id!r} contains id {profile.id!r}; rename the file or fix the id"
            )
        return profile

    def list_profiles(self) -> list[dict[str, Any]]:
        try:
            paths = sorted(self.directory.glob("*.json"), key=lambda item: item.name)
        except OSError as exc:
            raise ProfileError(f"could not list profiles: {exc}") from None
        result: list[dict[str, Any]] = []
        for path in paths:
            profile_id = path.stem
            try:
                profile = self.load(profile_id)
                item = {"valid": True, **profile.summary()}
            except ProfileError as exc:
                item = {"id": profile_id, "valid": False, "error": str(exc)}
            item["path"] = str(path)
            result.append(item)
        return result


def _normalise_phases(
    profile: AircraftProfile,
    phases: Any,
) -> tuple[tuple[str, float], ...]:
    if isinstance(phases, Mapping):
        supplied: Iterable[Any] = (
            {"phase": name, "minutes": minutes} for name, minutes in phases.items()
        )
    elif isinstance(phases, Iterable) and not isinstance(phases, (str, bytes)):
        supplied = phases
    else:
        raise ProfileError("phases must be an ordered list or an object of phase minutes")
    result: list[tuple[str, float]] = []
    for index, item in enumerate(supplied):
        if isinstance(item, Mapping):
            if set(item) != {"phase", "minutes"}:
                raise ProfileError(f"phases[{index}] must contain only phase and minutes")
            name, minutes = item["phase"], item["minutes"]
        elif isinstance(item, (tuple, list)) and len(item) == 2:
            name, minutes = item
        else:
            raise ProfileError(f"phases[{index}] must contain phase and minutes")
        if name not in PHASE_NAMES:
            raise ProfileError(f"phases[{index}].phase is unknown: {name!r}")
        duration = _number(minutes, f"phases[{index}].minutes")
        result.append((name, duration))
    return tuple(result)


def _profile_provenance(profile: AircraftProfile) -> dict[str, Any]:
    return {
        "profile_id": profile.id,
        "profile_file": profile.origin or None,
        "profile": profile.provenance.as_dict(),
        "calculation": "DERIVED",
    }


def calculate_trip(
    profile: AircraftProfile,
    phases: Any,
    reserve_minutes: Optional[float] = None,
    contingency_fraction: Optional[float] = None,
) -> dict[str, Any]:
    """Return trip, reserve, contingency, and total fuel in profile.fuel_unit."""
    normalised = _normalise_phases(profile, phases)
    reserve = profile.reserve_minutes if reserve_minutes is None else _number(
        reserve_minutes, "reserve_minutes"
    )
    contingency = profile.contingency_fraction if contingency_fraction is None else _number(
        contingency_fraction, "contingency_fraction", maximum=1.0
    )
    phase_results: list[dict[str, Any]] = []
    trip_kg = 0.0
    for name, minutes in normalised:
        flow_kg_h = flow_to_kg_h(profile.consumption[name], profile.flow_unit)
        fuel_kg = flow_kg_h * minutes / 60.0
        trip_kg += fuel_kg
        phase_results.append({
            "phase": name,
            "minutes": minutes,
            "fuel_flow": profile.consumption[name],
            "flow_unit": profile.flow_unit,
            "fuel": fuel_from_kg(fuel_kg, profile.fuel_unit),
        })
    holding_kg_h = flow_to_kg_h(profile.consumption["holding"], profile.flow_unit)
    reserve_kg = holding_kg_h * reserve / 60.0
    contingency_kg = trip_kg * contingency
    provenance = _profile_provenance(profile)
    provenance["inputs"] = "user profile plus caller-supplied phase times and planning overrides"
    return {
        "profile_id": profile.id,
        "fuel_unit": profile.fuel_unit,
        "phases": phase_results,
        "trip_fuel": fuel_from_kg(trip_kg, profile.fuel_unit),
        "reserve_minutes": reserve,
        "reserve_fuel": fuel_from_kg(reserve_kg, profile.fuel_unit),
        "contingency_fraction": contingency,
        "contingency_fuel": fuel_from_kg(contingency_kg, profile.fuel_unit),
        "total_fuel": fuel_from_kg(trip_kg + reserve_kg + contingency_kg, profile.fuel_unit),
        "formulas": {
            "trip": "sum(phase minutes / 60 * phase fuel flow)",
            "reserve": "reserve minutes / 60 * holding fuel flow",
            "contingency": "trip fuel * contingency fraction",
            "total": "trip fuel + reserve fuel + contingency fuel",
        },
        "provenance": provenance,
        **_status(),
    }


def _warning(
    code: str,
    severity: str,
    message: str,
    provenance: Mapping[str, Any],
) -> dict[str, Any]:
    return {
        "code": code,
        "severity": severity,
        "message": message,
        "provenance": copy.deepcopy(dict(provenance)),
    }


def project_fuel(
    profile: AircraftProfile,
    current_fuel: Any,
    current_fuel_unit: Any,
    remaining_phases: Any,
    reserve_minutes: Optional[float] = None,
    contingency_fraction: Optional[float] = None,
    *,
    source: str = "caller",
    sample_t: Optional[float] = None,
    observed_fuel_flow_kg_h: Optional[float] = None,
    extra_warnings: Iterable[tuple[str, str, str]] = (),
) -> dict[str, Any]:
    """Project landing fuel and compare it with user-provided planning buffers."""
    current_kg = fuel_to_kg(current_fuel, current_fuel_unit)
    current = fuel_from_kg(current_kg, profile.fuel_unit)
    plan = calculate_trip(profile, remaining_phases, reserve_minutes, contingency_fraction)
    projected = current - plan["trip_fuel"]
    buffer_fuel = plan["reserve_fuel"] + plan["contingency_fuel"]
    provenance = _profile_provenance(profile)
    current_source: dict[str, Any] = {
        "source": source,
        "value": current,
        "unit": profile.fuel_unit,
        "supplied_unit": current_fuel_unit,
    }
    if source == "sample":
        current_source.update({"field": "fuel", "unit": "lb", "t": sample_t})
    provenance["current_fuel"] = current_source
    provenance["future_flow"] = {
        "source": "user_profile",
        "profile_id": profile.id,
        "flow_unit": profile.flow_unit,
    }
    if observed_fuel_flow_kg_h is not None:
        provenance["observed_flow"] = {
            "source": "canonical fuel and t samples",
            "calculation": "fuel decrease / elapsed simulation time",
        }

    warnings: list[dict[str, Any]] = []
    if projected < 0.0:
        warnings.append(_warning(
            "ARRIVAL_FUEL_NEGATIVE",
            "critical",
            "The user-profile calculation projects fuel below zero before arrival; cross-check the pilot's fuel plan.",
            provenance,
        ))
    if projected < plan["reserve_fuel"]:
        warnings.append(_warning(
            "RESERVE_SHORTFALL",
            "warning",
            "Projected landing fuel is below the user-provided reserve; cross-check the pilot's fuel plan.",
            provenance,
        ))
    if buffer_fuel > plan["reserve_fuel"] and projected < buffer_fuel:
        warnings.append(_warning(
            "PLAN_BUFFER_SHORTFALL",
            "caution",
            "Projected landing fuel is below the user-provided reserve plus contingency buffer.",
            provenance,
        ))
    for code, severity, message in extra_warnings:
        warnings.append(_warning(code, severity, message, provenance))

    observed = None
    if observed_fuel_flow_kg_h is not None:
        observed = flow_from_kg_h(observed_fuel_flow_kg_h, profile.flow_unit)
    return {
        "state": "ok",
        "profile_id": profile.id,
        "current_fuel": current,
        "fuel_unit": profile.fuel_unit,
        "remaining_phases": [
            {"phase": item["phase"], "minutes": item["minutes"]} for item in plan["phases"]
        ],
        "trip_fuel": plan["trip_fuel"],
        "reserve_fuel": plan["reserve_fuel"],
        "contingency_fuel": plan["contingency_fuel"],
        "total_fuel": plan["total_fuel"],
        "planned_landing_buffer": buffer_fuel,
        "projected_landing_fuel": projected,
        "observed_fuel_flow": observed,
        "observed_flow_unit": profile.flow_unit if observed is not None else None,
        "warnings": warnings,
        "provenance": provenance,
        **_status(),
    }


class FuelProjector:
    """Small-state, sample-driven projection using canonical t seconds and fuel pounds."""

    def __init__(self, *, bus: Any = None) -> None:
        self._bus = bus
        self._profile: Optional[AircraftProfile] = None
        self._remaining: list[dict[str, Any]] = []
        self._reserve_minutes: Optional[float] = None
        self._contingency_fraction: Optional[float] = None
        self._previous_t: Optional[float] = None
        self._initial_t: Optional[float] = None
        self._initial_fuel: Optional[float] = None
        self._last: Optional[dict[str, Any]] = None
        self._warning_signature: Optional[tuple[tuple[str, str], ...]] = None

    def configure(
        self,
        profile: AircraftProfile,
        remaining_phases: Any,
        reserve_minutes: Optional[float] = None,
        contingency_fraction: Optional[float] = None,
    ) -> dict[str, Any]:
        plan = calculate_trip(profile, remaining_phases, reserve_minutes, contingency_fraction)
        self._profile = profile
        self._remaining = [
            {"phase": item["phase"], "minutes": item["minutes"]}
            for item in plan["phases"] if item["minutes"] > 0.0
        ]
        self._reserve_minutes = plan["reserve_minutes"]
        self._contingency_fraction = plan["contingency_fraction"]
        self._previous_t = None
        self._initial_t = None
        self._initial_fuel = None
        self._warning_signature = None
        self._last = {
            "state": "waiting_for_sample",
            "profile_id": profile.id,
            "remaining_phases": copy.deepcopy(self._remaining),
            "warnings": [],
            "provenance": _profile_provenance(profile),
            **_status(),
        }
        return copy.deepcopy(self._last)

    def reset(self) -> None:
        self._profile = None
        self._remaining = []
        self._reserve_minutes = None
        self._contingency_fraction = None
        self._previous_t = None
        self._initial_t = None
        self._initial_fuel = None
        self._last = None
        self._warning_signature = None

    def status(self) -> dict[str, Any]:
        if self._last is None:
            return {"state": "not_configured", "warnings": [], **_status()}
        return copy.deepcopy(self._last)

    def _advance(self, elapsed_minutes: float) -> None:
        left = elapsed_minutes
        remaining: list[dict[str, Any]] = []
        for item in self._remaining:
            minutes = item["minutes"]
            if left <= 0.0:
                remaining.append(item)
                continue
            used = min(left, minutes)
            minutes -= used
            left -= used
            if minutes > 0.0:
                remaining.append({"phase": item["phase"], "minutes": minutes})
        self._remaining = remaining

    def _unavailable(self, code: str, message: str, sample_t: Any = None) -> dict[str, Any]:
        assert self._profile is not None
        plan = calculate_trip(
            self._profile, self._remaining, self._reserve_minutes, self._contingency_fraction
        )
        provenance = _profile_provenance(self._profile)
        provenance["current_fuel"] = {
            "source": "sample", "field": "fuel", "unit": "lb", "t": sample_t,
        }
        provenance["future_flow"] = {
            "source": "user_profile",
            "profile_id": self._profile.id,
            "flow_unit": self._profile.flow_unit,
        }
        result = {
            "state": "unavailable",
            "profile_id": self._profile.id,
            "current_fuel": None,
            "fuel_unit": self._profile.fuel_unit,
            "remaining_phases": copy.deepcopy(self._remaining),
            "trip_fuel": plan["trip_fuel"],
            "reserve_fuel": plan["reserve_fuel"],
            "contingency_fuel": plan["contingency_fuel"],
            "total_fuel": plan["total_fuel"],
            "planned_landing_buffer": plan["reserve_fuel"] + plan["contingency_fuel"],
            "projected_landing_fuel": None,
            "observed_fuel_flow": None,
            "observed_flow_unit": None,
            "warnings": [_warning(code, "warning", message, provenance)],
            "provenance": provenance,
            **_status(),
        }
        self._remember(result)
        return result

    def _remember(self, result: dict[str, Any]) -> None:
        self._last = result
        signature = tuple((item["code"], item["severity"]) for item in result["warnings"])
        if self._bus is not None and signature != self._warning_signature:
            self._bus.publish("fuel_planner.warning", result, src="fuel_planner")
        self._warning_signature = signature

    def on_sample(self, sample: Any) -> Optional[dict[str, Any]]:
        if self._profile is None:
            return None
        if not isinstance(sample, Mapping):
            return self._unavailable("INVALID_SAMPLE", "Fuel projection needs a sample object.")
        raw_t = sample.get("t")
        try:
            t = _number(raw_t, "sample.t", minimum=None, error=FuelPlannerError)
        except FuelPlannerError:
            return self._unavailable("INVALID_SAMPLE", "Fuel projection needs finite simulation time t.")
        if "fuel" not in sample:
            return self._unavailable(
                "FUEL_UNAVAILABLE", "Canonical fuel is absent; projected landing fuel is unavailable.", t
            )
        try:
            fuel_lb = _number(sample["fuel"], "sample.fuel", error=FuelPlannerError)
        except FuelPlannerError:
            return self._unavailable(
                "FUEL_UNAVAILABLE", "Canonical fuel is invalid; projected landing fuel is unavailable.", t
            )

        extra: list[tuple[str, str, str]] = []
        if self._previous_t is None or t < self._previous_t:
            if self._previous_t is not None:
                extra.append((
                    "SIM_TIME_RESET",
                    "caution",
                    "Simulation time moved backwards; the projection restarted without consuming phase time.",
                ))
            self._previous_t = t
            self._initial_t = t
            self._initial_fuel = fuel_lb
        elif t > self._previous_t:
            elapsed_minutes = (t - self._previous_t) / 60.0
            self._advance(elapsed_minutes)
            self._previous_t = t

        observed_kg_h = None
        if self._initial_t is not None and self._initial_fuel is not None and t > self._initial_t:
            elapsed_hours = (t - self._initial_t) / 3600.0
            burned_lb = self._initial_fuel - fuel_lb
            if burned_lb >= 0.0:
                observed_kg_h = (burned_lb * _LB_KG) / elapsed_hours
        result = project_fuel(
            self._profile,
            fuel_lb,
            "lb",
            self._remaining,
            self._reserve_minutes,
            self._contingency_fraction,
            source="sample",
            sample_t=t,
            observed_fuel_flow_kg_h=observed_kg_h,
            extra_warnings=extra,
        )
        self._remember(result)
        return result

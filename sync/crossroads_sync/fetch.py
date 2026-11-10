"""Collect the raw vAMSYS payloads the public snapshot needs (GET only, ops:read)."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any, Callable

from vamsys.client import VamsysError

# Without these the site has nothing to show, so a failure here fails the whole sync and the
# previously deployed snapshot stays live.
REQUIRED = ("fleet", "airports", "routes", "hubs", "ranks")
# These degrade gracefully: the snapshot lists them under "unavailable" and the site hides them.
OPTIONAL = ("stats_all_time", "stats_30_days", "flight_map", "events", "pireps")

MAX_FLEETS_FOR_AIRCRAFT = 80


def _iso(moment: datetime) -> str:
    return moment.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def fetch_raw(client: Any, *, now: datetime, page_size: int = 100) -> tuple[dict[str, Any], list[str]]:
    page = {"page[size]": page_size}
    calls: dict[str, Callable[[], Any]] = {
        "fleet": lambda: client.get_collection("/fleet", page),
        "airports": lambda: client.get_collection("/airports", page),
        "routes": lambda: client.get_collection("/routes", {**page, "filter[hidden]": "false"}),
        "hubs": lambda: client.get_collection("/hubs", page),
        "ranks": lambda: client.get_collection("/ranks", page),
        "stats_all_time": lambda: client.get_json(
            "/statistics/airline", {"from": "2000-01-01T00:00:00Z", "to": _iso(now)}
        ),
        "stats_30_days": lambda: client.get_json(
            "/statistics/airline", {"from": _iso(now - timedelta(days=30)), "to": _iso(now)}
        ),
        "flight_map": lambda: client.get_json("/flight-map"),
        "events": lambda: client.get_collection("/activities/events", {"page[size]": 50}),
        # One page of the newest accepted PIREPs is enough for "recent flights".
        "pireps": lambda: (client.get_json("/pireps", {"filter[status]": "accepted", "sort": "-id", "page[size]": 25}) or {}).get("data"),
    }
    raw: dict[str, Any] = {}
    unavailable: list[str] = []
    for name, call in calls.items():
        try:
            raw[name] = call()
        except VamsysError:
            if name in REQUIRED:
                raise
            raw[name] = None
            unavailable.append(name)

    aircraft_by_fleet: dict[int, Any] = {}
    visible = [f for f in raw["fleet"] if isinstance(f, dict) and f.get("hide_in_phoenix") is not True]
    for item in visible[:MAX_FLEETS_FOR_AIRCRAFT]:
        fleet_id = item.get("id")
        if isinstance(fleet_id, int) and not isinstance(fleet_id, bool):
            try:
                aircraft_by_fleet[fleet_id] = client.get_collection(f"/fleet/{fleet_id}/aircraft", page)
            except VamsysError:
                if "aircraft" not in unavailable:
                    unavailable.append("aircraft")
    raw["aircraft_by_fleet"] = aircraft_by_fleet
    return raw, unavailable

from __future__ import annotations

import copy
import json
import unittest
from datetime import datetime, timezone
from pathlib import Path

from crossroads_sync import SCHEMA
from crossroads_sync.snapshot import build_snapshot, minutes_from_hms, plain_text, timestamp

SAMPLE = json.loads((Path(__file__).parents[1] / "crossroads_sync" / "sample_raw.json").read_text(encoding="utf-8"))
NOW = datetime(2026, 11, 10, 18, 0, tzinfo=timezone.utc)
SITE = {"name": "Crossroad Executive & Charter", "join_url": "https://example.test/join"}


def build(raw=None, site=None, **kwargs):
    return build_snapshot(raw if raw is not None else SAMPLE, site if site is not None else SITE, now=NOW, source="sample", **kwargs)


class AllowlistTests(unittest.TestCase):
    def test_private_fields_never_reach_snapshot(self):
        dumped = json.dumps(build())
        for secret in ("never published", "internal_remarks", "internal_note", "pilot_id", "simbrief"):
            self.assertNotIn(secret, dumped)

    def test_pilot_usernames_hidden_by_default(self):
        snapshot = build()
        self.assertTrue(snapshot["live"])
        self.assertTrue(all(flight["pilot"] is None for flight in snapshot["live"]))
        self.assertNotIn("sample.pilot1", json.dumps(snapshot))

    def test_pilot_usernames_only_when_opted_in(self):
        snapshot = build(site={**SITE, "show_pilot_names": True})
        self.assertEqual({f["pilot"] for f in snapshot["live"]}, {"sample.pilot1", "sample.pilot2", "sample.pilot3"})

    def test_truthy_non_boolean_does_not_opt_in(self):
        snapshot = build(site={**SITE, "show_pilot_names": "yes"})
        self.assertTrue(all(flight["pilot"] is None for flight in snapshot["live"]))


class ContentTests(unittest.TestCase):
    def setUp(self):
        self.snapshot = build()

    def test_envelope(self):
        self.assertEqual(self.snapshot["schema"], SCHEMA)
        self.assertEqual(self.snapshot["source"], "sample")
        self.assertEqual(self.snapshot["generated_at"], "2026-11-10T18:00:00Z")
        self.assertEqual(self.snapshot["unavailable"], [])

    def test_hidden_fleet_and_aircraft_excluded(self):
        codes = [f["code"] for f in self.snapshot["fleet"]]
        self.assertNotIn("TRN1", codes)
        cj4 = next(f for f in self.snapshot["fleet"] if f["code"] == "C25C")
        self.assertEqual(cj4["aircraft_count"], 3)
        self.assertNotIn("N523CX", cj4["registrations"])

    def test_hidden_routes_excluded_and_joined(self):
        numbers = [r["flight_number"] for r in self.snapshot["routes"]]
        self.assertNotIn("999", numbers)
        route = next(r for r in self.snapshot["routes"] if r["flight_number"] == "101")
        self.assertEqual((route["from"], route["to"]), ("KTYQ", "KTEB"))
        self.assertEqual(route["types"], ["C25C", "C700"])
        self.assertEqual(route["duration_min"], 115)

    def test_only_accepted_pireps_newest_first(self):
        recent = self.snapshot["recent_flights"]
        self.assertEqual([r["callsign"] for r in recent], ["CXC102", "CXC700", "CXC930", "CXC305"])
        self.assertEqual(recent[0]["duration_min"], 127)
        self.assertEqual(recent[0]["aircraft"], "C700")

    def test_past_events_dropped_and_markup_stripped(self):
        names = [e["name"] for e in self.snapshot["events"]]
        self.assertNotIn("Past event (filtered out)", names)
        first = self.snapshot["events"][0]
        self.assertNotIn("<", first["description"])
        self.assertIn("CXC210", first["description"])

    def test_airports_only_those_referenced(self):
        airports = self.snapshot["airports"]
        self.assertIn("KSDL", airports)
        self.assertEqual(airports["KIND"]["lat"], 39.7173)
        for route in self.snapshot["routes"]:
            self.assertIn(route["from"], airports)
            self.assertIn(route["to"], airports)

    def test_stats(self):
        all_time = self.snapshot["stats"]["all_time"]
        self.assertEqual(all_time["flights"], 1284)
        self.assertEqual(all_time["flight_hours"], 2630)


class RobustnessTests(unittest.TestCase):
    def test_empty_raw_still_builds(self):
        snapshot = build(raw={})
        self.assertEqual(snapshot["fleet"], [])
        self.assertEqual(snapshot["live"], [])
        self.assertIsNone(snapshot["stats"]["all_time"])

    def test_garbage_values_are_dropped_not_crashing(self):
        raw = copy.deepcopy(SAMPLE)
        raw["fleet"].append({"id": True, "code": "BAD"})
        raw["fleet"][0]["image_url"] = "javascript:alert(1)"
        raw["airports"][0]["latitude"] = float("nan")
        raw["routes"].append({"departure_id": 404, "arrival_id": 1})
        raw["flight_map"]["data"].append({"departureAirport": None})
        raw["ranks"].append("not a dict")
        snapshot = build(raw=raw)
        self.assertNotIn("javascript", json.dumps(snapshot))
        self.assertIsNone(snapshot["airports"]["KIND"]["lat"])
        self.assertEqual(len(snapshot["live"]), 3)

    def test_non_https_site_links_dropped(self):
        snapshot = build(site={"join_url": "http://insecure.test", "discord_url": "https://discord.gg/x"})
        self.assertIsNone(snapshot["airline"]["join_url"])
        self.assertEqual(snapshot["airline"]["discord_url"], "https://discord.gg/x")

    def test_unknown_source_rejected(self):
        with self.assertRaises(ValueError):
            build_snapshot({}, {}, now=NOW, source="other")

    def test_unavailable_listed(self):
        self.assertEqual(build(unavailable=["events", "flight_map", "events"])["unavailable"], ["events", "flight_map"])


class HelperTests(unittest.TestCase):
    def test_minutes_from_hms(self):
        self.assertEqual(minutes_from_hms("01:55:00"), 115)
        self.assertEqual(minutes_from_hms("2:05"), 125)
        self.assertEqual(minutes_from_hms("00:44:30"), 45)
        self.assertIsNone(minutes_from_hms("soon"))

    def test_timestamp_normalises_to_utc(self):
        self.assertEqual(timestamp("2026-11-10T13:00:00-05:00"), "2026-11-10T18:00:00Z")
        self.assertEqual(timestamp("2026-11-10 18:00:00"), "2026-11-10T18:00:00Z")
        self.assertIsNone(timestamp("not a date"))

    def test_plain_text(self):
        self.assertEqual(plain_text("<p>Hi &amp; <b>welcome</b></p>"), "Hi & welcome")
        self.assertTrue(plain_text("x" * 1000, 10).endswith("…"))


if __name__ == "__main__":
    unittest.main()

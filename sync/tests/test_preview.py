from __future__ import annotations

import json
import unittest
from datetime import datetime, timezone
from pathlib import Path

from crossroads_sync.snapshot import build_snapshot

ROOT = Path(__file__).parents[1]
PREVIEW = json.loads((ROOT / "crossroads_sync" / "preview_raw.json").read_text(encoding="utf-8"))
SITE = json.loads((ROOT.parent / "site.config.json").read_text(encoding="utf-8"))
NOW = datetime(2026, 11, 10, 18, 0, tzinfo=timezone.utc)


class PreviewTests(unittest.TestCase):
    def setUp(self):
        self.snapshot = build_snapshot(PREVIEW, SITE, now=NOW, source="preview")

    def test_preview_never_contains_invented_activity(self):
        self.assertEqual(self.snapshot["live"], [])
        self.assertEqual(self.snapshot["recent_flights"], [])
        self.assertIsNone(self.snapshot["stats"]["all_time"])
        self.assertIsNone(self.snapshot["stats"]["last_30_days"])

    def test_preview_mirrors_the_vamsys_setup(self):
        self.assertEqual(len(self.snapshot["routes"]), 56)
        self.assertEqual(len(self.snapshot["fleet"]), 13)
        self.assertEqual(len(self.snapshot["airports"]), 23)
        self.assertEqual(self.snapshot["hubs"][0]["airports"], ["KTYQ", "KIND"])

    def test_hub_rule_small_jets_ktyq_everything_else_kind(self):
        small = {"C510", "C25C", "LJ35"}
        for route in self.snapshot["routes"]:
            ends = {route["from"], route["to"]}
            if "KTYQ" in ends:
                self.assertTrue(set(route["types"]) <= small, route)
            else:
                self.assertTrue(set(route["types"]).isdisjoint(small), route)

    def test_cargo_routes_flagged_and_freighters_only(self):
        cargo = [r for r in self.snapshot["routes"] if r["kind"] == "cargo"]
        self.assertEqual(len(cargo), 8)
        self.assertTrue(all(set(r["types"]) <= {"MD11", "A306"} for r in cargo))

    def test_divisions_cover_every_fleet_exactly_once(self):
        divisions = self.snapshot["airline"]["divisions"]
        assigned = [code for d in divisions for code in d["fleets"]]
        self.assertEqual(sorted(assigned), sorted(f["code"] for f in self.snapshot["fleet"]))
        self.assertEqual(len(assigned), len(set(assigned)))

    def test_bad_division_entries_are_dropped(self):
        site = {**SITE, "divisions": [{"name": ""}, {"name": "X", "fleets": ["bad code!", "C510"], "base": "nope!"}, "junk"]}
        divisions = build_snapshot(PREVIEW, site, now=NOW, source="preview")["airline"]["divisions"]
        self.assertEqual(divisions, [{"name": "X", "summary": None, "base": None, "fleets": ["C510"]}])


if __name__ == "__main__":
    unittest.main()

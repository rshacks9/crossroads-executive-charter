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
        # Updates 1-6 (58 routes), update 7 (100) and update 8 (134: 114 new, 20 restored) as imported 2026-11-11.
        self.assertEqual(len(self.snapshot["routes"]), 310)
        self.assertEqual(len(self.snapshot["fleet"]), 19)
        self.assertEqual(len(self.snapshot["airports"]), 112)
        self.assertEqual(self.snapshot["hubs"][0]["airports"], ["KTYQ", "KIND"])

    def test_hub_rule_small_jets_ktyq_everything_else_kind(self):
        # KTYQ takes light and mid jets up to Citation X size; KIND takes everything bigger.
        small = {"C510", "PRM1", "C25C", "LJ35", "E55P", "H25B", "C750"}
        for route in self.snapshot["routes"]:
            ends = {route["from"], route["to"]}
            if ends == {"KTYQ", "KIND"}:
                # CRX733/734, the base-to-base positioning leg, is flown by the KTYQ jets.
                self.assertTrue(set(route["types"]) <= small, route)
                continue
            if "KTYQ" in ends:
                self.assertTrue(set(route["types"]) <= small, route)
            if "KIND" in ends:
                self.assertTrue(set(route["types"]).isdisjoint(small), route)

    def test_new_jets_and_registrations(self):
        regs = {f["code"]: f["registrations"] for f in self.snapshot["fleet"]}
        self.assertEqual(regs["PRM1"], ["N390CR"])
        self.assertEqual(regs["C750"], ["N750CR"])
        self.assertEqual(regs["H25B"], ["N800CR"])
        self.assertEqual(regs["E55P"], ["N300CR"])
        phenom = [r for r in self.snapshot["routes"] if "E55P" in r["types"]]
        self.assertGreater(len(phenom), 130)
        hawker = [r for r in self.snapshot["routes"] if "H25B" in r["types"]]
        self.assertGreater(len(hawker), 50)

    def test_cargo_routes_flagged_and_freighters_only(self):
        cargo = [r for r in self.snapshot["routes"] if r["kind"] == "cargo"]
        self.assertEqual(len(cargo), 20)
        self.assertTrue(all(set(r["types"]) <= {"MD11", "A306", "B77L"} for r in cargo))

    def test_divisions_cover_every_fleet_exactly_once(self):
        divisions = self.snapshot["airline"]["divisions"]
        assigned = [code for d in divisions for code in d["fleets"]]
        self.assertEqual(sorted(assigned), sorted(f["code"] for f in self.snapshot["fleet"]))
        self.assertEqual(len(assigned), len(set(assigned)))

    def test_bad_division_entries_are_dropped(self):
        site = {**SITE, "divisions": [{"name": ""}, {"name": "X", "fleets": ["bad code!", "C510"], "base": "nope!"}, "junk"]}
        divisions = build_snapshot(PREVIEW, site, now=NOW, source="preview")["airline"]["divisions"]
        self.assertEqual(divisions, [{"name": "X", "summary": None, "base": None, "fleets": ["C510"]}])


class SimAircraftTests(unittest.TestCase):
    def test_every_fleet_names_its_msfs_aircraft(self):
        snapshot = build_snapshot(PREVIEW, SITE, now=NOW, source="preview")
        sim = snapshot["airline"]["sim_aircraft"]
        self.assertEqual(sorted(sim), sorted(f["code"] for f in snapshot["fleet"]))
        self.assertEqual(sim["B77L"], "PMDG 777F")

    def test_bad_sim_entries_dropped(self):
        site = {**SITE, "sim_aircraft": {"not a code!": "x", "C510": "", "LJ35": "Learjet"}}
        sim = build_snapshot(PREVIEW, site, now=NOW, source="preview")["airline"]["sim_aircraft"]
        self.assertEqual(sim, {"LJ35": "Learjet"})


if __name__ == "__main__":
    unittest.main()

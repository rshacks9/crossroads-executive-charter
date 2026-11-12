from __future__ import annotations

import importlib.util
import json
import tempfile
import unittest
from unittest import mock
from datetime import datetime, timezone
from pathlib import Path

from crossroads_sync.snapshot import build_snapshot

ROOT = Path(__file__).parents[1]
PREVIEW = json.loads((ROOT / "crossroads_sync" / "preview_raw.json").read_text(encoding="utf-8"))
SITE = json.loads((ROOT.parent / "site.config.json").read_text(encoding="utf-8"))
NOW = datetime(2026, 11, 10, 18, 0, tzinfo=timezone.utc)

# tools/ is not a package, so the builder is loaded from its file.
_spec = importlib.util.spec_from_file_location("build_preview", ROOT / "tools" / "build_preview.py")
build_preview = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(build_preview)


class PreviewTests(unittest.TestCase):
    def setUp(self):
        self.snapshot = build_snapshot(PREVIEW, SITE, now=NOW, source="preview")

    def test_preview_never_contains_invented_activity(self):
        self.assertEqual(self.snapshot["live"], [])
        self.assertEqual(self.snapshot["recent_flights"], [])
        self.assertIsNone(self.snapshot["stats"]["all_time"])
        self.assertIsNone(self.snapshot["stats"]["last_30_days"])

    def test_preview_mirrors_the_vamsys_setup(self):
        # Updates 1-6 (58 routes), update 7 (100), update 8 (134: 114 new, 20 restored) and updates 9-11
        # (18 new) as imported 2026-11-11, and round 13 (6 new routes, KBAF, the Piper M600) on 2026-11-12.
        self.assertEqual(len(self.snapshot["routes"]), 316)
        self.assertEqual(len(self.snapshot["fleet"]), 20)
        self.assertEqual(len(self.snapshot["airports"]), 113)
        self.assertEqual(self.snapshot["hubs"][0]["airports"], ["KTYQ", "KIND"])

    def test_hub_rule_small_jets_ktyq_everything_else_kind(self):
        # KTYQ takes the M600 and light and mid jets up to Citation X size; KIND takes everything bigger.
        small = {"M600", "C510", "PRM1", "C25C", "LJ35", "E55P", "H25B", "C750"}
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
        # Round 13: the Piper M600 flies only Westfield-Barnes to Bradley and back.
        self.assertEqual(regs["M600"], ["N600CR"])
        m600 = sorted(r["callsign"] for r in self.snapshot["routes"] if "M600" in r["types"])
        self.assertEqual(m600, ["CRX751", "CRX752"])
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


class BuilderTests(unittest.TestCase):
    HEADER = ("ID,Departure Airport (ICAO/IATA),Arrival Airport (ICAO/IATA),Type,Callsign,Flight Number,"
              "Fleet IDs,_delete,Service Days,Tags,Is Hidden\n")

    def build(self, *rows: str) -> dict:
        """Run the builder on one import file made of these rows (no file is written)."""
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "routes.csv"
            path.write_text(self.HEADER + "".join(rows), encoding="utf-8")
            with mock.patch.object(build_preview, "ROUTES_CSV", [(path, 1)]):
                return build_preview.build_raw()

    def test_committed_preview_matches_the_builder(self):
        # Rebuild with: python -B tools/build_preview.py
        self.assertEqual(build_preview.build_raw(), PREVIEW)

    def test_hidden_routes_stay_hidden(self):
        raw = self.build(",KTYQ,KTEB,scheduled,CRX101,CX101,32199,FALSE,,executive,TRUE\n",
                         ",KTEB,KTYQ,scheduled,CRX102,CX102,32199,FALSE,,executive,\n")
        self.assertEqual([(r["callsign"], r["hidden"]) for r in raw["routes"]], [("CRX101", True), ("CRX102", False)])
        snapshot = build_snapshot(raw, SITE, now=NOW, source="preview")
        self.assertEqual([r["callsign"] for r in snapshot["routes"]], ["CRX102"])

    def test_rows_the_preview_cannot_mirror_stop_the_build(self):
        for row in (",KTYQ,KTEB,scheduled,CRX101,CX101,32199,TRUE,,executive,FALSE\n",
                    ",KTYQ,KTEB,scheduled,CRX101,CX101,32199,FALSE,\"1,2\",executive,FALSE\n",
                    ",KTYQ,KTEB,scheduled,CRX101,CX101,32199,FALSE,,executive,maybe\n"):
            with self.subTest(row=row), self.assertRaises(SystemExit):
                self.build(row)


class SimAircraftTests(unittest.TestCase):
    def test_every_fleet_names_its_msfs_aircraft(self):
        snapshot = build_snapshot(PREVIEW, SITE, now=NOW, source="preview")
        sim = snapshot["airline"]["sim_aircraft"]
        self.assertEqual(sorted(sim), sorted(f["code"] for f in snapshot["fleet"]))
        self.assertEqual(sim["B77L"], "PMDG 777F (add-on)")
        self.assertEqual(sim["A388"], "iniBuilds A380 (add-on)")
        # Each label ends in what kind of model it is, such as "(add-on)".
        for type_code, label in sim.items():
            self.assertRegex(label, r" [(][^()]+[)]$", type_code)

    def test_bad_sim_entries_dropped(self):
        site = {**SITE, "sim_aircraft": {"not a code!": "x", "C510": "", "LJ35": "Learjet"}}
        sim = build_snapshot(PREVIEW, site, now=NOW, source="preview")["airline"]["sim_aircraft"]
        self.assertEqual(sim, {"LJ35": "Learjet"})


if __name__ == "__main__":
    unittest.main()

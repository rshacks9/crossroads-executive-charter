from __future__ import annotations

import io
import json
import os
import tempfile
import unittest
from contextlib import redirect_stderr, redirect_stdout
from datetime import datetime, timezone
from pathlib import Path
from unittest import mock

from crossroads_sync import crew
from crossroads_sync.__main__ import main
from crossroads_sync.snapshot import build_snapshot

ROOT = Path(__file__).parents[1]
PREVIEW = json.loads((ROOT / "crossroads_sync" / "preview_raw.json").read_text(encoding="utf-8"))
SITE = json.loads((ROOT.parent / "site.config.json").read_text(encoding="utf-8"))
CONFIG = ROOT.parent / "site.config.json"
NOW = datetime(2026, 11, 10, 22, 10, tzinfo=timezone.utc)
SNAPSHOT = build_snapshot(PREVIEW, SITE, now=NOW, source="preview")

WEATHER = {
    "KIND": {"metar": "METAR KIND 102154Z 32007KT 10SM CLR 18/09 A3002", "flight_category": "VFR", "clouds": []},
    "KTYQ": {"metar": "METAR KTYQ 102156Z 00000KT 10SM CLR 17/08 A3003", "flight_category": "VFR", "clouds": []},
    "KTEB": {"metar": "METAR KTEB 102151Z 23007KT 10SM FEW250 15/05 A3001", "flight_category": "VFR", "taf": "TAF KTEB 101720Z 1018/1124 23008KT P6SM FEW250"},
    "KASE": {"metar": "METAR KASE 102153Z VRB04KT 10SM SCT120 05/M08 A3010", "flight_category": "VFR"},
}


class CrewBuildTests(unittest.TestCase):
    def setUp(self):
        self.crew = crew.build_crew(SNAPSHOT, now=NOW, weather_raw=WEATHER)

    def test_every_route_gets_a_fuel_plan_for_every_type(self):
        self.assertEqual(len(self.crew["plans"]), len(SNAPSHOT["routes"]))
        for route in SNAPSHOT["routes"]:
            self.assertEqual(sorted(self.crew["plans"][route["callsign"]]), sorted(route["types"]))

    def test_fuel_plan_uses_kimi_formulas(self):
        plan = self.crew["plans"]["CRX101"]["C25C"]
        trip = sum(p["fuel_kg"] for p in plan["phases"].values())
        self.assertAlmostEqual(plan["trip_kg"], trip, delta=2)
        self.assertEqual(plan["reserve_kg"], 315)  # 45 min at the CJ4's 420 kg/h holding flow
        self.assertEqual(plan["total_kg"], plan["trip_kg"] + plan["contingency_kg"] + plan["reserve_kg"])

    def test_preferred_runway_maximises_headwind(self):
        self.assertEqual(self.crew["airports"]["KIND"]["preferred_runway"], "32")
        self.assertEqual(self.crew["airports"]["KTEB"]["preferred_runway"], "24")

    def test_calm_or_variable_wind_picks_longest_runway(self):
        self.assertEqual(self.crew["airports"]["KTYQ"]["preferred_runway"], "18")  # both 7,001 ft; first wins
        kase = self.crew["airports"]["KASE"]
        self.assertTrue(all(r["wind"] is None for r in kase["runways"]))
        self.assertIsNotNone(kase["preferred_runway"])

    def test_public_notes_name_no_internal_tools(self):
        notes = " ".join(self.crew["notes"].values())
        self.assertIn("Crossroads planning profiles", self.crew["notes"]["fuel"])
        for internal in ("Kimi", "kimi", "fuel_planner", "Jumpseat"):
            self.assertNotIn(internal, notes)

    def test_approach_cards_have_glide_path_gates(self):
        card = self.crew["approaches"]["KTEB"]["C25C"]
        self.assertEqual(card["runway"]["identifier"], "24")
        self.assertEqual([g["distance_to_threshold_nm"] for g in card["target_gates"]], [10.0, 5.0, 3.0, 1.0])
        self.assertAlmostEqual(card["target_gates"][-1]["height_above_threshold_ft"], 50 + 6076.1 * 0.0524, delta=3)
        self.assertEqual(card["aircraft"]["approach_speed_kt"], 120.0)  # CJ4 Vref 115 + 5

    def test_airport_without_weather_still_lists_runways(self):
        kmia = self.crew["airports"]["KMIA"]
        self.assertIsNone(kmia["metar"])
        self.assertTrue(kmia["runways"])
        self.assertIsNotNone(kmia["preferred_runway"])

    def test_taf_passed_through(self):
        self.assertTrue(self.crew["airports"]["KTEB"]["taf"].startswith("TAF KTEB"))

    def test_no_weather_at_all(self):
        result = crew.build_crew(SNAPSHOT, now=NOW, weather_raw=None)
        self.assertIsNone(result["weather_source"])
        self.assertEqual(len(result["plans"]), len(SNAPSHOT["routes"]))

    def test_bad_metar_is_dropped_not_fatal(self):
        result = crew.build_crew(SNAPSHOT, now=NOW, weather_raw={"KIND": {"metar": "garbage"}})
        self.assertIsNone(result["airports"]["KIND"]["metar"])


class PhaseSplitTests(unittest.TestCase):
    def test_normal_leg(self):
        self.assertEqual(crew.split_phases(120, {}), {"taxi": 15.0, "climb": 20.0, "cruise": 60.0, "descent": 25.0})

    def test_short_leg_scales_climb_and_descent(self):
        phases = crew.split_phases(40, {})
        self.assertLessEqual(phases["climb"] + phases["descent"], 25 * 0.8 + 0.1)
        self.assertGreaterEqual(phases["cruise"], 0)


class FetchTests(unittest.TestCase):
    def test_fetch_filters_and_shapes(self):
        calls = []

        def fake(url):
            calls.append(url)
            if "/metar" in url:
                return [
                    {"icaoId": "KIND", "rawOb": "METAR KIND 102154Z 32007KT 10SM CLR 18/09 A3002", "fltCat": "VFR", "clouds": [{"cover": "FEW", "base": 2500}]},
                    {"icaoId": "ZZZZ", "rawOb": "not ours"},
                    {"icaoId": "KTYQ", "rawOb": 42},
                ]
            return [{"icaoId": "KIND", "rawTAF": "TAF KIND ..."}]

        result = crew.fetch_weather(["KIND", "KTYQ", "bad id!"], fetch=fake)
        self.assertEqual(sorted(result), ["KIND"])
        self.assertEqual(result["KIND"]["clouds"], [{"cover": "FEW", "base_ft": 2500}])
        self.assertTrue(all(url.startswith("https://aviationweather.gov/api/data/") for url in calls))
        self.assertTrue(all("KIND,KTYQ" in url for url in calls))

    def test_cli_survives_weather_outage(self):
        with tempfile.TemporaryDirectory() as tmp:
            out = Path(tmp) / "snapshot.json"
            with mock.patch("crossroads_sync.crew.fetch_weather", side_effect=OSError("down")), redirect_stdout(io.StringIO()) as stdout, redirect_stderr(io.StringIO()):
                code = main(["--preview", "--config", str(CONFIG), "--output", str(out)])
            self.assertEqual(code, 0)
            self.assertIn("crew=no-weather", stdout.getvalue())
            document = json.loads((Path(tmp) / "crew.json").read_text(encoding="utf-8"))
            self.assertIsNone(document["weather_source"])

    def test_cli_sample_mode_stays_offline(self):
        with tempfile.TemporaryDirectory() as tmp:
            out = Path(tmp) / "snapshot.json"
            with mock.patch("crossroads_sync.crew.fetch_weather", side_effect=AssertionError("network used")), redirect_stdout(io.StringIO()) as stdout:
                code = main(["--sample", "--config", str(CONFIG), "--output", str(out)])
            self.assertEqual(code, 0)
            self.assertIn("crew=skipped", stdout.getvalue())
            self.assertFalse((Path(tmp) / "crew.json").exists())


class VendoredKimiModulesTests(unittest.TestCase):
    UPSTREAM = ROOT.parents[1] / "venture" / "plugins"
    PAIRS = {
        "weather.py": "weather_briefing/weather.py",
        "fuel_core.py": "fuel_planner/core.py",
        "performance.py": "performance_calculator/calculations.py",
        "approach.py": "approach_briefing/plugin.py",
    }

    @unittest.skipUnless((ROOT.parents[1] / "venture" / "plugins").is_dir(), "Kimi's workspace not present")
    def test_vendored_files_match_upstream(self):
        for local, upstream in self.PAIRS.items():
            self.assertEqual((ROOT / "kimi_tools" / local).read_bytes(), (self.UPSTREAM / upstream).read_bytes(), local)


if __name__ == "__main__":
    unittest.main()

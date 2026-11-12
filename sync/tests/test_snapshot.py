from __future__ import annotations

import copy
import json
import unittest
from datetime import datetime, timezone
from pathlib import Path

from crossroads_sync import SCHEMA
from crossroads_sync.snapshot import build_snapshot, minutes_from_hms, plain_text, text, timestamp

SAMPLE = json.loads((Path(__file__).parents[1] / "crossroads_sync" / "sample_raw.json").read_text(encoding="utf-8"))
NOW = datetime(2026, 11, 10, 18, 0, tzinfo=timezone.utc)
SITE = {"name": "Crossroads Executive & Charter", "join_url": "https://example.test/join"}


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


class AutomationTests(unittest.TestCase):
    """automation_flights in site.config.json: the founder's flights flown with his automation tools."""

    @staticmethod
    def flagged(snapshot):
        return [f["callsign"] for f in snapshot["live"] + snapshot["recent_flights"] if f["automation"]]

    @staticmethod
    def with_bookings():
        """The sample with PIREP booking ids as vAMSYS gives them: CXC102 was flown from booking 41, CXC700 has none."""
        raw = copy.deepcopy(SAMPLE)
        raw["pireps"][0]["booking_id"] = 41
        raw["pireps"][1]["booking_id"] = None
        return raw

    def test_nothing_is_flagged_without_a_list(self):
        snapshot = build()
        self.assertTrue(snapshot["live"] and snapshot["recent_flights"])
        self.assertTrue(all(f["automation"] is False for f in snapshot["live"] + snapshot["recent_flights"]))

    def test_a_pirep_id_flags_that_pirep(self):
        self.assertEqual(self.flagged(build(site={**SITE, "automation_flights": [{"pirep_id": 500}]})), ["CXC700"])

    def test_a_booking_id_flags_the_flight_in_the_air_and_the_pirep_filed_from_it(self):
        # Booking 1 is CXC101 in the air (the flight map's bookingId); booking 41 is CXC102's PIREP.
        site = {**SITE, "automation_flights": [{"booking_id": 1}, {"booking_id": 41}]}
        self.assertEqual(self.flagged(build(raw=self.with_bookings(), site=site)), ["CXC101", "CXC102"])

    def test_one_entry_can_give_both_ids(self):
        site = {**SITE, "automation_flights": [{"booking_id": 2, "pirep_id": 500, "note": "CXC512 and a PIREP"}]}
        self.assertEqual(self.flagged(build(site=site)), ["CXC512", "CXC700"])

    def test_callsigns_and_dates_flag_nothing_because_every_pilot_shares_them(self):
        # A route's callsign belongs to the route: another pilot's CXC102 on the same day.
        raw = copy.deepcopy(SAMPLE)
        other = copy.deepcopy(raw["pireps"][0])
        other.update({"id": 999001, "pilot_id": 424242})
        raw["pireps"].append(other)
        entries = [{"callsign": "CXC102", "date": "2026-11-10"}, {"callsign": "CXC101", "date": "2026-11-10"}]
        self.assertEqual(self.flagged(build(raw=raw, site={**SITE, "automation_flights": entries})), [])
        # Listed by its PIREP, the founder's CXC102 is labelled and the other pilot's is not.
        recent = build(raw=raw, site={**SITE, "automation_flights": [{"pirep_id": 501}]})["recent_flights"]
        self.assertEqual(sorted(r["automation"] for r in recent if r["callsign"] == "CXC102"), [False, True])

    def test_incomplete_or_malformed_entries_flag_nothing(self):
        entries = [
            {"callsign": "CXC102", "date": "2026-11-10"},
            {"note": "CXC101"},
            {"booking_id": True},
            {"booking_id": "1"},
            {"booking_id": 1.0},
            {"booking_id": 0},
            {"booking_id": -41},
            {"pirep_id": True},
            {"pirep_id": "501"},
            {"pirep_id": 501.0},
            {"pirep_id": -501},
            "CXC102",
            None,
            501,
        ]
        self.assertEqual(self.flagged(build(raw=self.with_bookings(), site={**SITE, "automation_flights": entries})), [])
        for value in ("CXC102", {"booking_id": 1}, 501):
            with self.subTest(value=value):
                self.assertEqual(self.flagged(build(site={**SITE, "automation_flights": value})), [])

    def test_ids_from_vamsys_must_be_whole_numbers_too(self):
        raw = self.with_bookings()
        raw["flight_map"]["data"][0]["bookingId"] = True
        raw["flight_map"]["data"][1]["bookingId"] = "2"
        raw["pireps"][0]["booking_id"] = "41"
        site = {**SITE, "automation_flights": [{"booking_id": 1}, {"booking_id": 2}, {"booking_id": 41}]}
        self.assertEqual(self.flagged(build(raw=raw, site=site)), [])

    def test_a_nonsense_flight_length_does_not_stop_the_sync(self):
        raw = copy.deepcopy(SAMPLE)
        raw["pireps"][0]["flight_length"] = 10**11
        self.assertEqual(self.flagged(build(raw=raw, site={**SITE, "automation_flights": [{"pirep_id": 501}]})), ["CXC102"])

    def test_the_list_and_the_ids_never_reach_the_snapshot(self):
        raw = self.with_bookings()
        raw["pireps"][1]["id"] = 987654
        raw["flight_map"]["data"][2]["bookingId"] = 4875999
        site = {**SITE, "automation_flights": [{"pirep_id": 987654}, {"booking_id": 4875999, "note": "private-note"}]}
        snapshot = build(raw=raw, site=site)
        self.assertEqual(self.flagged(snapshot), ["CXC815", "CXC700"])
        dumped = json.dumps(snapshot)
        for leaked in ("automation_flights", "pirep_id", "booking_id", "bookingId", "987654", "4875999", "private-note"):
            self.assertNotIn(leaked, dumped)

    def test_the_config_lists_the_three_setup_test_flights_by_booking(self):
        config = json.loads((Path(__file__).parents[2] / "site.config.json").read_text(encoding="utf-8"))
        setup = {4875826: "CRX115", 4875854: "CRX116", 4875919: "CRX121"}
        entries = config["automation_flights"]
        self.assertLessEqual(set(setup), {e.get("booking_id") for e in entries})
        whole = lambda v: isinstance(v, int) and not isinstance(v, bool) and v > 0
        for entry in entries:
            with self.subTest(entry=entry):
                self.assertTrue(whole(entry.get("booking_id")) or whole(entry.get("pirep_id")))
        pireps = [
            {"id": n, "status": "accepted", "callsign": callsign, "booking_id": booking, "departure_airport_id": 4, "arrival_airport_id": 2, "landing_time": f"2026-11-11T0{n}:00:00Z", "flight_length": 2500}
            for n, (booking, callsign) in enumerate(sorted(setup.items()), start=1)
        ]
        # Someone else's CRX115 from another booking, the same day, stays unlabelled.
        pireps.append({**pireps[0], "id": 9, "booking_id": 4879999, "landing_time": "2026-11-11T09:00:00Z"})
        recent = build(raw={**SAMPLE, "pireps": pireps}, site=config)["recent_flights"]
        self.assertEqual(sorted(r["callsign"] for r in recent if r["automation"]), ["CRX115", "CRX116", "CRX121"])
        self.assertEqual(len(recent), 4)


class GroupFlightTests(unittest.TestCase):
    def test_weekday_and_utc_time_are_kept(self):
        site = {**SITE, "group_flight": {"weekday": " sunday ", "utc": "20:00"}}
        self.assertEqual(build(site=site)["airline"]["group_flight"], {"weekday": "Sunday", "utc": "20:00"})

    def test_none_unless_both_are_valid(self):
        self.assertIsNone(build()["airline"]["group_flight"])
        for value in (
            None,
            "Sunday 20:00",
            {"weekday": "Sun", "utc": "20:00"},
            {"weekday": "Sunday", "utc": "8pm"},
            {"weekday": "Sunday", "utc": "24:00"},
            {"weekday": "Sunday", "utc": "20:00:00"},
            {"weekday": "Sunday"},
            {"utc": "20:00"},
            {"weekday": 7, "utc": "20:00"},
        ):
            with self.subTest(value=value):
                self.assertIsNone(build(site={**SITE, "group_flight": value})["airline"]["group_flight"])


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

    def test_text_within_the_limit_is_unchanged(self):
        line = "Light jets to Teterboro, Aspen, Toronto, Geneva and Le Bourget."
        self.assertEqual(text(line, len(line)), line)
        self.assertEqual(text(line, 320), line)
        self.assertEqual(text("  Teterboro,\n\tAspen  "), "Teterboro, Aspen")

    def test_text_is_never_cut_inside_a_word(self):
        line = "Light jets to Teterboro, Aspen, Toronto, Geneva and Le Bourget."
        self.assertEqual(text(line, 42), "Light jets to Teterboro, Aspen, Toronto…")
        self.assertEqual(text(line, 62), "Light jets to Teterboro, Aspen, Toronto, Geneva and Le…")
        for limit in range(8, len(line)):
            cut = text(line, limit)
            kept = cut[:-1]
            self.assertTrue(cut.endswith("…"), cut)
            self.assertLessEqual(len(cut), limit, cut)
            self.assertTrue(line.startswith(kept), cut)
            # The kept text ends where a word ends: a space or a comma follows it in the original.
            self.assertIn(line[len(kept)], " ,", cut)
        # One long word has no boundary to cut at, so it is cut at the limit.
        self.assertEqual(text("x" * 1000, 10), "x" * 9 + "…")

    def test_division_summaries_kept_whole_up_to_320_characters(self):
        sentence = "Teterboro, Aspen, Boca Raton, Vail, Toronto, Geneva and Le Bourget."
        whole, too_long = " ".join([sentence] * 4), " ".join([sentence] * 5)
        site = {**SITE, "divisions": [{"name": "Executive", "summary": whole}, {"name": "Long", "summary": too_long}]}
        divisions = build(site=site)["airline"]["divisions"]
        self.assertGreater(len(whole), 240)
        self.assertEqual(divisions[0]["summary"], whole)
        cut = divisions[1]["summary"]
        self.assertTrue(cut.endswith("…"))
        self.assertLessEqual(len(cut), 320)
        self.assertIn(too_long[len(cut) - 1], " ,")


if __name__ == "__main__":
    unittest.main()

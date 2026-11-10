"""Build crossroads_sync/preview_raw.json: the real CRX7489 schedule as it stands in vAMSYS.

The preview is what the public site shows until the vAMSYS API is connected. It mirrors the airports,
fleets, aircraft, hub, ranks and routes entered in Orwell (see ../../vamsys-data/README.md) and
deliberately contains no live flights, statistics or PIREPs: those only ever come from vAMSYS.

    python -B tools/build_preview.py
"""

from __future__ import annotations

import csv
import json
import math
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
DATA = ROOT.parent / "vamsys-data"
# Applied in order, exactly as they were imported into vAMSYS. Rows without an ID create a route; vAMSYS
# numbered those sequentially from the first ID listed here.
ROUTES_CSV = [
    (DATA / "routes-import.csv", 14214036),
    (DATA / "routes-update-2.csv", 14214095),
    (DATA / "routes-update-3.csv", None),
]
OUT = ROOT / "crossroads_sync" / "preview_raw.json"

AIRPORTS = [  # icao, iata, name, country, lat, lon, base
    ("KIND", "IND", "Indianapolis International", "United States", 39.7173, -86.2944, True),
    ("KTYQ", None, "Indianapolis Executive", "United States", 40.0306, -86.2514, True),
    ("KTEB", "TEB", "Teterboro", "United States", 40.8501, -74.0608, False),
    ("KHPN", "HPN", "Westchester County (White Plains)", "United States", 41.0670, -73.7076, False),
    ("KASE", "ASE", "Aspen/Pitkin County", "United States", 39.2232, -106.8688, False),
    ("KAPF", "APF", "Naples Municipal", "United States", 26.1526, -81.7753, False),
    ("KSDL", "SCF", "Scottsdale", "United States", 33.6229, -111.9105, False),
    ("KLAS", "LAS", "Las Vegas Harry Reid International", "United States", 36.0840, -115.1537, False),
    ("KDAL", "DAL", "Dallas Love Field", "United States", 32.8471, -96.8518, False),
    ("KMDW", "MDW", "Chicago Midway", "United States", 41.7868, -87.7522, False),
    ("KBNA", "BNA", "Nashville International", "United States", 36.1245, -86.6782, False),
    ("KEYW", "EYW", "Key West International", "United States", 24.5561, -81.7596, False),
    ("KMCO", "MCO", "Orlando International", "United States", 28.4294, -81.3090, False),
    ("KBOS", "BOS", "Boston Logan International", "United States", 42.3656, -71.0096, False),
    ("KLAX", "LAX", "Los Angeles International", "United States", 33.9416, -118.4085, False),
    ("EGGW", "LTN", "London Luton", "United Kingdom", 51.8747, -0.3683, False),
    ("LFPB", "LBG", "Paris Le Bourget", "France", 48.9694, 2.4414, False),
    ("MMSD", "SJD", "Los Cabos International", "Mexico", 23.1518, -109.7215, False),
    ("TNCM", "SXM", "Princess Juliana (St Maarten)", "Sint Maarten", 18.0410, -63.1089, False),
    ("KMIA", "MIA", "Miami International", "United States", 25.7959, -80.2870, False),
    ("KONT", "ONT", "Ontario International", "United States", 34.0560, -117.6012, False),
    ("PANC", "ANC", "Ted Stevens Anchorage International", "United States", 61.1743, -149.9962, False),
    ("EDDP", "LEJ", "Leipzig/Halle", "Germany", 51.4239, 12.2364, False),
]

FLEETS = [  # id, code, name, type, max_pax, max_cargo, unit, registrations, cruise_kt
    (32199, "C510", "Cessna Citation Mustang", "pax", 4, None, "lbs", ["N510CR"], 340),
    (32200, "C25C", "Cessna Citation CJ4", "pax", 9, None, "lbs", ["N525CR"], 430),
    (32201, "LJ35", "Learjet 35A", "pax", 8, None, "lbs", ["N35CR"], 440),
    (32202, "C700", "Cessna Citation Longitude", "pax", 12, None, "lbs", ["N700CR"], 470),
    (32203, "E175", "Embraer E175", "pax", 76, None, "lbs", ["N175CR"], 450),
    (32204, "E190", "Embraer E190", "pax", 100, None, "lbs", ["N190CR"], 450),
    (32205, "GLF6", "Gulfstream G650", "pax", 16, None, "lbs", ["N650CR"], 490),
    (32206, "GA7C", "Gulfstream G700", "pax", 19, None, "lbs", ["N707CR"], 490),
    (32207, "B752", "Boeing 757-200", "pax", 180, None, "lbs", ["N757CR"], 460),
    (32208, "A346", "Airbus A340-600 Executive", "pax", 100, None, "kg", ["N346CR"], 480),
    (32209, "BCS3", "Airbus A220-300 Executive", "pax", 48, None, "kg", ["N223CR"], 450),
    (32210, "MD11", "McDonnell Douglas MD-11F", "cargo", None, 91000, "kg", ["N611CR"], 480),
    (32211, "A306", "Airbus A300-600F", "cargo", None, 48000, "kg", ["N306CR"], 450),
    (32213, "A388", "Airbus A380-800 Executive", "pax", 150, None, "kg", ["N380CR"], 490),
    (32214, "B77L", "Boeing 777F", "cargo", None, 102000, "kg", ["N777CR"], 490),
]

RANKS = [  # level, name, abbr, hours, pireps, honorary
    (1, "Cadet", "Cdt", 0, 0, False),
    (2, "First Officer", "FO", 10, 5, False),
    (3, "Captain", "CPT", 25, 15, False),
    (4, "Senior Captain", "SCPT", 75, 40, False),
    (5, "Charter Captain", "CCPT", 150, 80, False),
    (6, "Chief Pilot", "CP", 300, 150, False),
]


def great_circle_nm(a: tuple[float, float], b: tuple[float, float]) -> int:
    lat1, lon1, lat2, lon2 = map(math.radians, (*a, *b))
    h = math.sin((lat2 - lat1) / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin((lon2 - lon1) / 2) ** 2
    return round(2 * 3440.065 * math.asin(math.sqrt(h)))


def final_routes() -> list[dict[str, str]]:
    """Apply the import files in order, the way vAMSYS did (rows with an ID update; others create)."""
    by_id: dict[str, dict[str, str]] = {}
    for path, first_new_id in ROUTES_CSV:
        next_id = first_new_id
        with path.open(encoding="utf-8") as handle:
            for row in csv.DictReader(handle):
                if row["ID"]:
                    if row["ID"] not in by_id:
                        raise SystemExit(f"{path.name}: update for unknown route {row['ID']}")
                    by_id[row["ID"]] = row
                else:
                    if next_id is None:
                        raise SystemExit(f"{path.name}: creates routes but has no starting ID")
                    by_id[str(next_id)] = row
                    next_id += 1
    return list(by_id.values())


def main() -> None:
    airport_ids = {icao: i + 1 for i, (icao, *_rest) in enumerate(AIRPORTS)}
    coords = {icao: (lat, lon) for icao, _i, _n, _c, lat, lon, _b in AIRPORTS}
    speeds = {fid: kt for fid, *_rest, kt in FLEETS}
    raw = {
        "_note": "Real CRX7489 schedule mirrored from vAMSYS for the pre-launch site. No live or statistical data.",
        "airports": [
            {"id": airport_ids[icao], "icao": icao, "iata": iata, "name": name, "base": base,
             "country": {"name": country}, "latitude": lat, "longitude": lon}
            for icao, iata, name, country, lat, lon, base in AIRPORTS
        ],
        "hubs": [{"id": 8697, "name": "Indianapolis", "order": 1, "default": True, "pilots_count": None,
                  "airport_ids": [airport_ids["KTYQ"], airport_ids["KIND"]]}],
        "fleet": [
            {"id": fid, "code": code, "name": name, "type": kind, "max_pax": pax, "max_cargo": cargo,
             "weight_unit": unit, "hide_in_phoenix": False, "image_url": None}
            for fid, code, name, kind, pax, cargo, unit, _regs, _kt in FLEETS
        ],
        "aircraft_by_fleet": {str(fid): [{"registration": r} for r in regs] for fid, *_m, regs, _kt in FLEETS},
        "ranks": [
            {"id": level, "level": level, "name": name, "abbreviation": abbr, "honorary_rank": honorary,
             "hours": hours, "pireps": pireps, "points": 0, "regular_pilots_count": None, "description": None}
            for level, name, abbr, hours, pireps, honorary in RANKS
        ],
        "routes": [],
        "events": [],
        "flight_map": {"data": []},
        "pireps": [],
        "stats_all_time": None,
        "stats_30_days": None,
    }
    for n, row in enumerate(final_routes(), start=1):
        dep, arr = row["Departure Airport (ICAO/IATA)"], row["Arrival Airport (ICAO/IATA)"]
        fleet_ids = [int(x) for x in row["Fleet IDs"].split(",") if x.strip()]
        distance = great_circle_nm(coords[dep], coords[arr])
        cruise = min(speeds[f] for f in fleet_ids)
        minutes = round(distance / cruise * 60 + 25)  # taxi, climb and descent allowance
        raw["routes"].append({
            "id": n, "type": row["Type"], "departure_id": airport_ids[dep], "arrival_id": airport_ids[arr],
            "callsign": row["Callsign"], "flight_number": row["Flight Number"], "flight_distance": distance,
            "flight_length": f"{minutes // 60:02d}:{minutes % 60:02d}:00", "fleet_ids": fleet_ids,
            "tag": [t for t in row["Tags"].split(",") if t], "service_days": [], "hidden": False,
        })
    OUT.write_text(json.dumps(raw, indent=1) + "\n", encoding="utf-8")
    print(f"wrote {OUT.name}: {len(raw['routes'])} routes, {len(raw['fleet'])} fleets, {len(raw['airports'])} airports")


if __name__ == "__main__":
    main()

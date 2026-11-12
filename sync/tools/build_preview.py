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
# Applied in order, exactly as they were imported into vAMSYS. Rows with an ID update that route; rows
# without one create a route, and a file that creates routes must list a starting ID. That number is a
# record only: it is Orwell's first new ID for the first import, updates 2 and 5 and round 13, and a
# placeholder for updates 7, 8, 9 and 11. The preview numbers its routes by position (see build_raw); the
# real Orwell IDs are in orwell-route-ids-2026-11-11.csv and route-ids-13.csv.
ROUTES_CSV = [
    (DATA / "routes-import.csv", 14214036),
    (DATA / "routes-update-2.csv", 14214095),
    (DATA / "routes-update-3.csv", None),
    (DATA / "routes-update-4-b390.csv", None),
    (DATA / "routes-update-5-c750-kbdl.csv", 14214327),
    (DATA / "routes-update-6-kbdl-mustang.csv", None),
    # Network expansion as imported 2026-11-11 (Orwell import #30334, 122/122 OK): 100 new routes and
    # 22 edits. The 20 routes to the 8 airports vAMSYS rejected were dropped. vAMSYS assigns the real
    # IDs; these only need to be unique inside the preview.
    (DATA / "routes-update-7-import.csv", 14215001),
    # Update 8 as imported 2026-11-11 (Orwell import #30335, 134/134 OK): 114 new routes plus the 20
    # update-7 routes restored once it turned out their 8 airports were never rejected. Network 292.
    (DATA / "routes-update-8-import.csv", 14216001),
    # Update 9 (import #30336): KCMH-KTYQ pair. Update 10 (#30337): Phenom 300E on CRX113/114 and 415/416.
    (DATA / "routes-update-9-kcmh.csv", 14217001),
    (DATA / "routes-update-10-phenom.csv", None),
    # Update 11 (import #30348, 158/158 OK): Phenom on every light-jet route in range, airport-restriction
    # fixes, CJ4 on KDAL-KVNY, and 16 new routes (CRX733-748). Network 310 routes at 112 airports.
    (DATA / "routes-update-11-import.csv", 14218001),
    # Round 13 (import #30364, 6/6 OK): CRX749/750 KTYQ-KBAF for the KTYQ jets, CRX751/752 KBAF-KBDL for
    # the Piper M600 and CRX445/446 KBDL-KLAX for the A340-600, G650 and G700. Orwell numbered them
    # 14217673-14217678 in file order (route-ids-13.csv). Network 316 routes at 113 airports.
    (DATA / "routes-update-13-import.csv", 14217673),
]
# The planning file (routes-update-7-expansion.csv) used a placeholder for the Hawker fleet; kept so it
# still builds if anyone points ROUTES_CSV back at it.
FLEET_PLACEHOLDERS = {"HAWKER": "32217"}
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
    # Added with routes 5 (KBDL) and 7 (network expansion). Coordinates from OurAirports (public domain).
    ("CYYZ", "YYZ", "Toronto Pearson International", "Canada", 43.6759, -79.6294, False),
    ("EGLF", "FAB", "Farnborough", "United Kingdom", 51.2758, -0.7763, False),
    ("EGSS", "STN", "London Stansted", "United Kingdom", 51.8850, 0.2350, False),
    ("KACK", "ACK", "Nantucket Memorial", "United States", 41.2531, -70.0602, False),
    ("KAGC", "AGC", "Allegheny County (Pittsburgh)", "United States", 40.3544, -79.9302, False),
    ("KAPA", "APA", "Centennial (Denver)", "United States", 39.5701, -104.8490, False),
    ("KAUS", "AUS", "Austin-Bergstrom International", "United States", 30.1975, -97.6620, False),
    ("KBCT", "BCT", "Boca Raton", "United States", 26.3785, -80.1077, False),
    ("KBDL", "BDL", "Bradley International (Hartford)", "United States", 41.9386, -72.6880, False),
    ("KBED", "BED", "Hanscom Field (Bedford)", "United States", 42.4700, -71.2890, False),
    ("KCHS", "CHS", "Charleston International", "United States", 32.8962, -80.0382, False),
    ("KCLT", "CLT", "Charlotte Douglas International", "United States", 35.2140, -80.9431, False),
    ("KCMH", "CMH", "John Glenn Columbus International", "United States", 39.9980, -82.8919, False),
    ("KDEN", "DEN", "Denver International", "United States", 39.8600, -104.6738, False),
    ("KDTS", "DSI", "Destin Executive", "United States", 30.4001, -86.4715, False),
    ("KDTW", "DTW", "Detroit Metropolitan Wayne County", "United States", 42.2138, -83.3538, False),
    ("KEGE", "EGE", "Eagle County Regional (Vail)", "United States", 39.6426, -106.9180, False),
    ("KEWR", "EWR", "Newark Liberty International", "United States", 40.6894, -74.1705, False),
    ("KHOU", "HOU", "Houston William P. Hobby", "United States", 29.6453, -95.2768, False),
    ("KIAD", "IAD", "Washington Dulles International", "United States", 38.9445, -77.4558, False),
    ("KIAH", "IAH", "Houston George Bush Intercontinental", "United States", 29.9844, -95.3414, False),
    ("KJAX", "JAX", "Jacksonville International", "United States", 30.4925, -81.6878, False),
    ("KMEM", "MEM", "Memphis International", "United States", 35.0438, -89.9763, False),
    ("KMKC", "MKC", "Charles B. Wheeler Downtown (Kansas City)", "United States", 39.1232, -94.5928, False),
    ("KMSP", "MSP", "Minneapolis-St Paul International", "United States", 44.8801, -93.2217, False),
    ("KMYR", "MYR", "Myrtle Beach International", "United States", 33.6797, -78.9283, False),
    ("KOAK", "OAK", "Oakland International", "United States", 37.7201, -122.2212, False),
    ("KOSU", "OSU", "Ohio State University (Columbus)", "United States", 40.0798, -83.0730, False),
    ("KPDK", "PDK", "DeKalb-Peachtree (Atlanta)", "United States", 33.8763, -84.3021, False),
    ("KPHX", "PHX", "Phoenix Sky Harbor International", "United States", 33.4353, -112.0059, False),
    ("KPTK", "PTK", "Oakland County International (Pontiac)", "United States", 42.6655, -83.4201, False),
    ("KSDF", "SDF", "Louisville Muhammad Ali International", "United States", 38.1706, -85.7351, False),
    ("KSEA", "SEA", "Seattle-Tacoma International", "United States", 47.4479, -122.3103, False),
    ("KSJC", "SJC", "San Jose Mineta International", "United States", 37.3625, -121.9292, False),
    ("KSUS", "SUS", "Spirit of St. Louis", "United States", 38.6621, -90.6520, False),
    ("KTPA", "TPA", "Tampa International", "United States", 27.9755, -82.5332, False),
    ("KVNY", "VNY", "Van Nuys", "United States", 34.2098, -118.4900, False),
    ("LFMN", "NCE", "Nice Cote d'Azur", "France", 43.6584, 7.2159, False),
    ("LSGG", "GVA", "Geneva", "Switzerland", 46.2381, 6.1090, False),
    ("MMUN", "CUN", "Cancun International", "Mexico", 21.0408, -86.8735, False),
    ("TXKF", "BDA", "Bermuda L.F. Wade International", "Bermuda", 32.3638, -64.6782, False),
    # Update 8: the 8 airports from update 7 that do exist in Orwell, plus the 39 added in round 8.
    # Coordinates from OurAirports (public domain).
    ("EBLG", "LGG", "Liege", "Belgium", 50.6386, 5.4439, False),
    ("EDDM", "MUC", "Munich", "Germany", 48.3538, 11.7861, False),
    ("EGLC", "LCY", "London City", "United Kingdom", 51.5053, 0.0553, False),
    ("EINN", "SNN", "Shannon", "Ireland", 52.7020, -8.9248, False),
    ("KADS", "ADS", "Addison (Dallas)", "United States", 32.9686, -96.8364, False),
    ("KAFW", "AFW", "Fort Worth Alliance", "United States", 32.9904, -97.3195, False),
    ("KBFI", "BFI", "King County International (Boeing Field)", "United States", 47.5270, -122.2999, False),
    ("KBKL", "BKL", "Burke Lakefront", "United States", 41.5175, -81.6833, False),
    ("KBZN", "BZN", "Bozeman Yellowstone International", "United States", 45.7789, -111.1537, False),
    ("KCMI", "CMI", "University of Illinois Willard", "United States", 40.0398, -88.2762, False),
    ("KCRQ", "CLD", "McClellan-Palomar (Carlsbad)", "United States", 33.1283, -117.2800, False),
    ("KFRG", "FRG", "Republic (Farmingdale)", "United States", 40.7286, -73.4143, False),
    ("KHDN", "HDN", "Yampa Valley (Steamboat Springs)", "United States", 40.4812, -107.2180, False),
    ("KHXD", "HHH", "Hilton Head", "United States", 32.2244, -80.6975, False),
    ("KJAC", "JAC", "Jackson Hole", "United States", 43.6073, -110.7380, False),
    ("KLNK", "LNK", "Lincoln (Nebraska)", "United States", 40.8449, -96.7618, False),
    ("KMMU", "MMU", "Morristown Municipal", "United States", 40.7991, -74.4149, False),
    ("KMSN", "MSN", "Dane County Regional (Madison)", "United States", 43.1399, -89.3375, False),
    ("KMSY", "MSY", "Louis Armstrong New Orleans International", "United States", 29.9934, -90.2647, False),
    ("KMTJ", "MTJ", "Montrose Regional", "United States", 38.5098, -107.8940, False),
    ("KOPF", "OPF", "Miami-Opa Locka Executive", "United States", 25.9070, -80.2784, False),
    ("KPDX", "PDX", "Portland International", "United States", 45.5887, -122.5980, False),
    ("KPHL", "PHL", "Philadelphia International", "United States", 39.8719, -75.2411, False),
    ("KPVD", "PVD", "Rhode Island T. F. Green International", "United States", 41.7250, -71.4257, False),
    ("KPWM", "PWM", "Portland International Jetport", "United States", 43.6462, -70.3093, False),
    ("KRNO", "RNO", "Reno Tahoe International", "United States", 39.4991, -119.7680, False),
    ("KSAT", "SAT", "San Antonio International", "United States", 29.5337, -98.4698, False),
    ("KSLC", "SLC", "Salt Lake City International", "United States", 40.7889, -111.9799, False),
    ("KSMO", "SMO", "Santa Monica Municipal", "United States", 34.0158, -118.4510, False),
    ("KSNA", "SNA", "John Wayne Orange County International", "United States", 33.6751, -117.8693, False),
    ("KSRQ", "SRQ", "Sarasota Bradenton International", "United States", 27.3946, -82.5544, False),
    ("KSTL", "STL", "St. Louis Lambert International", "United States", 38.7487, -90.3700, False),
    ("KSUN", "SUN", "Friedman Memorial (Sun Valley)", "United States", 43.5044, -114.2960, False),
    ("KTMB", "TMB", "Miami Executive", "United States", 25.6479, -80.4328, False),
    ("KTRK", "TKF", "Truckee Tahoe", "United States", 39.3186, -120.1406, False),
    ("KUNV", "SCE", "State College Regional", "United States", 40.8494, -77.8485, False),
    ("LEMD", "MAD", "Madrid-Barajas Adolfo Suarez", "Spain", 40.4934, -3.5722, False),
    ("LIML", "LIN", "Milano Linate", "Italy", 45.4451, 9.2767, False),
    ("LSZH", "ZRH", "Zurich", "Switzerland", 47.4581, 8.5481, False),
    ("MBPV", "PLS", "Providenciales International", "Turks and Caicos Islands", 21.7737, -72.2683, False),
    ("MDPC", "PUJ", "Punta Cana International", "Dominican Republic", 18.5671, -68.3646, False),
    ("MKJS", "MBJ", "Sangster International", "Jamaica", 18.5034, -77.9132, False),
    ("MMMX", "MEX", "Mexico City Benito Juarez International", "Mexico", 19.4358, -99.0703, False),
    ("MYNN", "NAS", "Lynden Pindling International", "Bahamas", 25.0390, -77.4662, False),
    ("PHNL", "HNL", "Daniel K. Inouye International", "United States", 21.3184, -157.9257, False),
    ("TIST", "STT", "Cyril E. King", "U.S. Virgin Islands", 18.3371, -64.9773, False),
    ("TJSJ", "SJU", "Luis Munoz Marin International", "Puerto Rico", 18.4394, -66.0018, False),
    # Update 11.
    ("KMVY", "MVY", "Martha's Vineyard", "United States", 41.3931, -70.6143, False),
    # Round 13 (Orwell airport 907144). IATA code and coordinates from OurAirports (public domain).
    ("KBAF", "BAF", "Westfield-Barnes Regional", "United States", 42.1578, -72.7156, False),
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
    (32215, "PRM1", "Beechcraft Premier IA", "pax", 6, None, "lbs", ["N390CR"], 450),
    (32216, "C750", "Cessna Citation X", "pax", 8, None, "lbs", ["N750CR"], 500),
    (32217, "H25B", "Hawker 800XP", "pax", 8, None, "lbs", ["N800CR"], 430),
    (32220, "E55P", "Embraer Phenom 300E", "pax", 9, None, "lbs", ["N300CR"], 450),
    # Round 13: Orwell fleet 32230; N600CR is Orwell aircraft 304909.
    (32230, "M600", "Piper M600", "pax", 5, None, "lbs", ["N600CR"], 260),
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


def flag(row: dict[str, str], column: str, path: Path) -> bool:
    """A TRUE/FALSE column of an import file. An empty cell is FALSE; anything else stops the build."""
    value = (row.get(column) or "").strip().upper()
    if value not in ("", "TRUE", "FALSE"):
        raise SystemExit(f"{path.name}: {row['Callsign']} has {column} {value!r}")
    return value == "TRUE"


def final_routes() -> list[dict[str, str]]:
    """Apply the import files in order, the way vAMSYS did (rows with an ID update; others create)."""
    # Keyed by callsign (unique per route): from update 10 on the files carry the real Orwell IDs, which
    # differ from the placeholder IDs this preview gave the routes created by updates 7 and 8.
    by_callsign: dict[str, dict[str, str]] = {}
    for path, first_new_id in ROUTES_CSV:
        with path.open(encoding="utf-8") as handle:
            for row in csv.DictReader(handle):
                callsign = row["Callsign"]
                # Hidden routes are mirrored (snapshot.py keeps them off the site). Deletions and service
                # days are not, so a file that uses them stops the build instead of being published wrongly.
                if flag(row, "_delete", path):
                    raise SystemExit(f"{path.name}: {callsign} deletes a route, which the preview does not mirror")
                if (row.get("Service Days") or "").strip():
                    raise SystemExit(f"{path.name}: {callsign} has service days, which the preview does not mirror")
                row["Is Hidden"] = "TRUE" if flag(row, "Is Hidden", path) else "FALSE"
                if row["ID"]:
                    if callsign not in by_callsign:
                        raise SystemExit(f"{path.name}: update for unknown route {callsign}")
                else:
                    if first_new_id is None:
                        raise SystemExit(f"{path.name}: creates routes but has no starting ID")
                    if callsign in by_callsign:
                        raise SystemExit(f"{path.name}: {callsign} already exists")
                by_callsign[callsign] = row
    return list(by_callsign.values())


def build_raw() -> dict:
    """The preview mirror, built from the import files. Nothing is written."""
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
        fleet_ids = [int(FLEET_PLACEHOLDERS.get(x.strip(), x)) for x in row["Fleet IDs"].split(",") if x.strip()]
        distance = great_circle_nm(coords[dep], coords[arr])
        cruise = min(speeds[f] for f in fleet_ids)
        minutes = round(distance / cruise * 60 + 25)  # taxi, climb and descent allowance
        raw["routes"].append({
            "id": n, "type": row["Type"], "departure_id": airport_ids[dep], "arrival_id": airport_ids[arr],
            "callsign": row["Callsign"], "flight_number": row["Flight Number"], "flight_distance": distance,
            "flight_length": f"{minutes // 60:02d}:{minutes % 60:02d}:00", "fleet_ids": fleet_ids,
            "tag": [t for t in row["Tags"].split(",") if t], "service_days": [],
            "hidden": row["Is Hidden"] == "TRUE",
        })
    return raw


def main() -> None:
    raw = build_raw()
    OUT.write_text(json.dumps(raw, indent=1) + "\n", encoding="utf-8", newline="\n")
    print(f"wrote {OUT.name}: {len(raw['routes'])} routes, {len(raw['fleet'])} fleets, {len(raw['airports'])} airports")


if __name__ == "__main__":
    main()

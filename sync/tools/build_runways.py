"""Extract runway data for the Crossroads network from OurAirports (public domain).

    curl -o runways.csv https://davidmegginson.github.io/ourairports-data/runways.csv
    python -B tools/build_runways.py runways.csv

Writes crossroads_sync/runways.json, keyed by ICAO. Re-run when airports are added to the network.
Source: https://ourairports.com/data/ (public domain). For simulation use only, not for real navigation.
"""

from __future__ import annotations

import csv
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PREVIEW = ROOT / "crossroads_sync" / "preview_raw.json"
OUT = ROOT / "crossroads_sync" / "runways.json"


def number(value: str) -> float | None:
    try:
        return float(value) if value.strip() else None
    except ValueError:
        return None


def main(path: str) -> None:
    wanted = {a["icao"] for a in json.loads(PREVIEW.read_text(encoding="utf-8"))["airports"]}
    runways: dict[str, list[dict]] = {icao: [] for icao in sorted(wanted)}
    with open(path, encoding="utf-8", newline="") as handle:
        for row in csv.DictReader(handle):
            icao = row["airport_ident"]
            if icao not in wanted or row["closed"] == "1":
                continue
            length = number(row["length_ft"])
            if not length or length < 2000:
                continue
            for end, other in (("le", "he"), ("he", "le")):
                ident = row[f"{end}_ident"].strip()
                if not ident or ident.upper().startswith("H"):
                    continue
                heading = number(row[f"{end}_heading_degT"])
                lat, lon = number(row[f"{end}_latitude_deg"]), number(row[f"{end}_longitude_deg"])
                olat, olon = number(row[f"{other}_latitude_deg"]), number(row[f"{other}_longitude_deg"])
                if heading is None:
                    # OurAirports leaves some headings blank; fall back to the runway number.
                    digits = "".join(c for c in ident if c.isdigit())
                    heading = float(digits) * 10 if digits else None
                runways[icao].append({
                    "id": ident,
                    "reciprocal": row[f"{other}_ident"].strip() or None,
                    "heading_true_deg": heading,
                    "length_ft": length,
                    "width_ft": number(row["width_ft"]),
                    "surface": row["surface"].strip() or None,
                    "threshold": {"lat": lat, "lon": lon} if lat is not None and lon is not None else None,
                    "end": {"lat": olat, "lon": olon} if olat is not None and olon is not None else None,
                    "elevation_ft": number(row[f"{end}_elevation_ft"]),
                    "displaced_threshold_ft": number(row[f"{end}_displaced_threshold_ft"]),
                })
    missing = [icao for icao, items in runways.items() if not items]
    if missing:
        raise SystemExit(f"no runways found for {missing}")
    OUT.write_text(json.dumps({"_source": "OurAirports runways.csv (public domain), simulation use only",
                               "runways": runways}, indent=1) + "\n", encoding="utf-8")
    print(f"wrote {OUT.name}: {sum(len(v) for v in runways.values())} runway ends at {len(runways)} airports")


if __name__ == "__main__":
    main(sys.argv[1])

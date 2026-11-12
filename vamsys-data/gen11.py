"""Route update 11 generator (network quality audit). Claude 2026-11-11.

Rebuilds the current network from every imported CSV (applied in order, keyed by callsign), then writes:
  routes-update-11-edits.csv    edits to existing routes (ID column filled where the Orwell ID is known,
                                otherwise 'NEEDID')
  routes-update-11-new.csv      new routes (empty ID)
  routes-update-11-import.csv   edits + new, written only when every edit row has a real ID
  airports-to-add-11.txt        airports the new routes need
  summary11.tsv                 one line per change, with the reason

Usage:  python gen11.py [IDS_CSV]
IDS_CSV (optional) is 'Callsign,ID' lines read from Orwell (Routes list / export). It overrides the IDs below.
"""
import csv, math, os, sys

D = os.path.dirname(os.path.abspath(__file__))
# OurAirports airports.csv and runways.csv (https://ourairports.com/data/): the ourairports folder next to this
# script, or the folder named by the OURAIRPORTS_DIR environment variable.
OA = os.environ.get("OURAIRPORTS_DIR") or os.path.join(D, "ourairports")
HDR = ["ID", "Departure Airport (ICAO/IATA)", "Arrival Airport (ICAO/IATA)", "Type", "Callsign", "Flight Number",
       "Fleet IDs", "_delete", "Service Days", "Tags", "Is Hidden"]
DEP, ARR = HDR[1], HDR[2]
FILES = ["routes-import.csv", "routes-update-2.csv", "routes-update-3.csv", "routes-update-4-b390.csv",
         "routes-update-5-c750-kbdl.csv", "routes-update-6-kbdl-mustang.csv", "routes-update-7-import.csv",
         "routes-update-8-import.csv", "routes-update-9-kcmh.csv", "routes-update-10-phenom.csv"]
# First Orwell ID of the new rows in each file. Import 1, update 2 and update 5 are confirmed by later edit files.
# Update 7 is DERIVED: CRX415 (its 47th new row) is 14214835 per update 10, so the block starts at 14214789,
# assuming vAMSYS numbers an import sequentially (it did for imports 1 and 2). Verify before importing.
# Updates 8 and 9: unknown until read from Orwell.
START = {"routes-import.csv": 14214036, "routes-update-2.csv": 14214095,
         "routes-update-5-c750-kbdl.csv": 14214327, "routes-update-7-import.csv": 14214789}

net, ids = {}, {}
for f in FILES:
    n = 0
    for r in csv.DictReader(open(os.path.join(D, f), encoding="utf-8-sig")):
        cs = r["Callsign"]
        if r["ID"]:
            ids[cs] = r["ID"]
        else:
            if f in START: ids.setdefault(cs, str(START[f] + n))
            n += 1
        net[cs] = dict(r)
if len(sys.argv) > 1:
    for line in open(sys.argv[1], encoding="utf-8-sig"):
        p = [x.strip() for x in line.split(",")]
        if len(p) >= 2 and p[0].startswith("CRX") and p[1].isdigit(): ids[p[0]] = p[1]

AP, RWY = {}, {}
for r in csv.DictReader(open(os.path.join(OA, "airports.csv"), encoding="utf-8")):
    AP[r["ident"]] = (float(r["latitude_deg"]), float(r["longitude_deg"]), r["name"], r["iso_country"])
for r in csv.DictReader(open(os.path.join(OA, "runways.csv"), encoding="utf-8")):
    if r["closed"] == "1" or not r["length_ft"]: continue
    if not any(s in r["surface"].upper() for s in ("ASP", "CON", "PEM", "BIT", "PAV")): continue
    RWY[r["airport_ident"]] = max(RWY.get(r["airport_ident"], 0), int(r["length_ft"]))
RWY["KSMO"] = 3500  # shortened in 2017


def nm(a, b):
    la1, lo1 = map(math.radians, AP[a][:2]); la2, lo2 = map(math.radians, AP[b][:2])
    return 3440.065 * math.acos(min(1, math.sin(la1) * math.sin(la2) + math.cos(la1) * math.cos(la2) * math.cos(lo2 - lo1)))


# light/mid jets: fleet id -> (type, planning range nm, minimum runway ft); same rules as gen8 plus the Phenom
LIGHT = {"32199": ("C510", 950, 3400), "32200": ("CJ4", 1800, 3400), "32201": ("LJ35", 1700, 5000),
         "32215": ("PRM1", 1150, 4000), "32220": ("E55P", 1950, 3400), "32217": ("H25B", 2300, 5500),
         "32216": ("C750", 2900, 5500)}
ORDER = ["32199", "32200", "32201", "32215", "32220", "32217", "32216"]
MOUNTAIN = {"KASE", "KEGE", "KJAC", "KSUN", "KMTJ", "KHDN", "KBZN", "KTRK"}  # no Mustang / Premier (owner's KASE rule)
E55P = "32220"


def light_ok(f, a, b):
    _, rng, rw = LIGHT[f]
    if nm(a, b) > rng or min(RWY.get(a, 0), RWY.get(b, 0)) < rw: return False
    if f in ("32199", "32215") and (a in MOUNTAIN or b in MOUNTAIN): return False
    return True


def light(a, b):
    return [f for f in ORDER if light_ok(f, a, b)]


edits, summary = {}, []


def set_fleets(cs, fleets, why):
    r = dict(edits.get(cs, net[cs]))
    old = r["Fleet IDs"]
    new = ",".join(fleets)
    if new == old: return
    r["Fleet IDs"] = new
    edits[cs] = r
    summary.append(("edit", cs, r[DEP], r[ARR], old, new, why))


def fleets_of(cs):
    return (edits.get(cs) or net[cs])["Fleet IDs"].split(",")


def both(cs):
    n = int(cs[3:]); other = f"CRX{n + 1 if n % 2 else n - 1}"
    return [cs, other]


# ---- 1. removals (realism) ----
def drop(cs, remove, why):
    for c in both(cs):
        set_fleets(c, [f for f in fleets_of(c) if f not in remove], why)


def replace(cs, fleets, why):
    for c in both(cs):
        set_fleets(c, fleets, why)


drop("CRX119", {"32199"}, "KTYQ-KEYW is 956 nm, over the Mustang's 950 nm planning range")
drop("CRX119", {"32217", "32216"}, "KEYW runway 5,076 ft is under the 5,500 ft Hawker/Citation X minimum used since update 8")
drop("CRX139", {"32217", "32216"}, "KDTS runway 5,001 ft is under the 5,500 ft Hawker/Citation X minimum (same rule as KHXD)")
drop("CRX155", {"32217", "32216"}, "KOSU runway 5,004 ft is under the 5,500 ft Hawker/Citation X minimum (same rule as KHXD)")
drop("CRX401", {"32209"}, "Teterboro has a 100,000 lb maximum-weight limit; the A220-300 (MTOW ~154,000 lb) cannot use it")
drop("CRX407", {"32205", "32206"}, "Aspen limits wingspan to 95 ft; G650 (99.6 ft) and G700 (103 ft) are too wide. Longitude stays")
drop("CRX413", {"32208"}, "A340-600 into Van Nuys (8,001 ft, GA airport) is unrealistic; 757 and G650 stay")
drop("CRX501", {"32208"}, "A340-600 into London Luton (7,086 ft) is unrealistic; G650/G700 stay")
drop("CRX507", {"32208"}, "A340-600 into St Maarten (7,546 ft) is unrealistic; A220 and the business jets stay")
replace("CRX539", ["32199", "32200", "32220"],
        "London City needs steep-approach approval; Gulfstreams removed. Mustang, CJ4 and Phenom 300 are LCY-approved types")

replace("CRX415", ["32200", "32205", "32206", "32220"], "KDAL-KVNY leg swapped to the CJ4 on request (2026-11-11); CJ4 added")

# ---- 2. add the Phenom 300E wherever the light jets fly and it is in range ----
for cs in sorted(net, key=lambda c: int(c[3:])):
    fl = fleets_of(cs)
    if not any(f in LIGHT for f in fl) or E55P in fl: continue
    a, b = net[cs][DEP], net[cs][ARR]
    if light_ok(E55P, a, b):
        new = [f for f in ORDER if f in fl or f == E55P] + [f for f in fl if f not in LIGHT]
        set_fleets(cs, new, f"add Phenom 300E ({nm(a, b):.0f} nm, runway {min(RWY[a], RWY[b])} ft)")
    else:
        summary.append(("skip", cs, a, b, ",".join(fl), "", f"Phenom not added: {nm(a, b):.0f} nm / runway {min(RWY.get(a,0), RWY.get(b,0))} ft"))

# ---- 3. new routes: gaps in the light-jet network (CRX733+) ----
new_rows = []


def ltags(a, b, extra=()):
    t = ["executive", *extra]
    if a in MOUNTAIN or b in MOUNTAIN: t.append("ski")
    if AP[a][3] != "US" or AP[b][3] != "US": t.append("international")
    if nm(a, b) <= 350: t.append("short-hop")
    return ",".join(t)


cs = 733
NEW = [("KTYQ", "KIND", ("positioning",), "base-to-base positioning leg (crew swaps, maintenance, customs)"),
       ("KTYQ", "KMVY", (), "Martha's Vineyard summer charter from base"),
       ("KTEB", "KMVY", (), "New York - Martha's Vineyard, one of the busiest summer executive pairs"),
       ("KVNY", "KLAS", (), "Los Angeles - Las Vegas weekend shuttle"),
       ("KAPA", "KASE", (), "Denver Centennial - Aspen, the classic ski shuttle"),
       ("KOPF", "MYNN", (), "Miami - Nassau short international hop"),
       ("KHPN", "KBCT", (), "Westchester - Boca Raton winter commuter"),
       ("KMDW", "KTEB", (), "Chicago - New York business shuttle")]
for a, b, extra, why in NEW:
    fl = light(a, b)
    assert fl, (a, b)
    for x, y in ((a, b), (b, a)):
        new_rows.append({"ID": "", DEP: x, ARR: y, "Type": "scheduled", "Callsign": f"CRX{cs}", "Flight Number": f"CX{cs}",
                         "Fleet IDs": ",".join(fl), "_delete": "FALSE", "Service Days": "", "Tags": ltags(x, y, extra),
                         "Is Hidden": "FALSE"})
        summary.append(("new", f"CRX{cs}", x, y, "", ",".join(fl), f"{nm(x, y):.0f} nm; {why}"))
        cs += 1

# ---- write ----
def write(name, rows):
    with open(os.path.join(D, name), "w", encoding="utf-8", newline="") as fh:
        w = csv.DictWriter(fh, HDR, lineterminator="\n"); w.writeheader(); w.writerows(rows)


edit_rows = []
for c in sorted(edits, key=lambda c: int(c[3:])):
    r = dict(edits[c]); r["ID"] = ids.get(c, "NEEDID"); edit_rows.append(r)
write("routes-update-11-edits.csv", edit_rows)
write("routes-update-11-new.csv", new_rows)
missing = [r["Callsign"] for r in edit_rows if r["ID"] == "NEEDID"]
if not missing:
    write("routes-update-11-import.csv", edit_rows + new_rows)
existing_ap = {r[DEP] for r in net.values()} | {r[ARR] for r in net.values()}
need = sorted({r[DEP] for r in new_rows} | {r[ARR] for r in new_rows} - existing_ap)
need = [a for a in need if a not in existing_ap]
with open(os.path.join(D, "airports-to-add-11.txt"), "w", encoding="utf-8") as fh:
    for a in need: fh.write(f"{a},{AP[a][2]}\n")
with open(os.path.join(D, "summary11.tsv"), "w", encoding="utf-8") as fh:
    fh.write("kind\tcallsign\tfrom\tto\told fleets\tnew fleets\treason\n")
    for s in summary: fh.write("\t".join(s) + "\n")
print(f"network {len(net)} routes; edits {len(edit_rows)} ({len(missing)} need an Orwell ID); new {len(new_rows)}; airports to add {need}")
if missing: print("NEEDID:", " ".join(missing))

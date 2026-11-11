import csv, glob, os, sys
D = r"C:\Users\gafft\Documents\kimi\tasks\2026-11-10\05-28-47-1ca902c1\crossroads-site\vamsys-data"
HDR = "ID,Departure Airport (ICAO/IATA),Arrival Airport (ICAO/IATA),Type,Callsign,Flight Number,Fleet IDs,_delete,Service Days,Tags,Is Hidden"
FLEETS = {str(i) for i in range(32199, 32218)} - {"32212"}
name = sys.argv[1] if len(sys.argv) > 1 else "routes-update-8-import.csv"
f8 = os.path.join(D, name); errs = []
ref = open(os.path.join(D, "routes-update-7-import.csv"), encoding="utf-8").readline().rstrip("\n")
if open(f8, encoding="utf-8").readline().rstrip("\n") != HDR or ref != HDR: errs.append("header mismatch")
old_cs, exist = set(), set()
for f in glob.glob(os.path.join(D, "routes-*.csv")):
    b = os.path.basename(f)
    if b.startswith("routes-update-8"): continue
    for r in csv.DictReader(open(f, encoding="utf-8")):
        if b == "routes-update-7-expansion.csv": continue  # never imported as a whole; its imported twin is -import
        old_cs.add(r["Callsign"]); exist |= {r["Departure Airport (ICAO/IATA)"], r["Arrival Airport (ICAO/IATA)"]}
exist |= {"KBKL", "KHXD", "KJAC", "KMSY", "KPHL", "MBPV", "MYNN", "PHNL"}  # verified present in Orwell 2026-11-11
add = {l.split(",")[0] for l in open(os.path.join(D, "airports-to-add-8.txt"), encoding="utf-8") if l.strip()}
rej = set()
logf = os.path.join(D, "airports-added-8.log")
if os.path.exists(logf):
    for l in open(logf, encoding="utf-8"):
        if l.startswith("REJECTED"): rej.add(l.split()[1])
aps = exist | (add - rej)
rows = list(csv.DictReader(open(f8, encoding="utf-8"))); seen = set()
for r in rows:
    cs = r["Callsign"]
    if r["ID"]: errs.append(f"unexpected ID {cs}")
    if cs in seen: errs.append(f"dup {cs}")
    seen.add(cs)
    if cs in old_cs: errs.append(f"reuses {cs}")
    if r["Flight Number"] != "CX" + cs[3:]: errs.append(f"flt {cs}")
    for k in ("Departure Airport (ICAO/IATA)", "Arrival Airport (ICAO/IATA)"):
        if r[k] not in aps: errs.append(f"airport {r[k]} {cs}")
    for fl in r["Fleet IDs"].split(","):
        if fl not in FLEETS: errs.append(f"fleet {fl} {cs}")
    if r["Type"] not in ("scheduled", "cargo"): errs.append(f"type {cs}")
    if r["_delete"] != "FALSE" or r["Is Hidden"] != "FALSE": errs.append(f"flags {cs}")
P = {(r["Departure Airport (ICAO/IATA)"], r["Arrival Airport (ICAO/IATA)"]): r for r in rows}
for (a, b), r in P.items():
    if (b, a) not in P: errs.append(f"no return {a}-{b}")
    elif r["Fleet IDs"] != P[(b, a)]["Fleet IDs"]: errs.append(f"fleet mismatch {a}-{b}")
if len(P) != len(rows): errs.append("duplicate city pair")
print(f"{name}: {len(rows)} routes, {len(add)} airports listed, {len(rej)} rejected, {len(old_cs)} prior callsigns, {len(exist)} existing airports")
print("ERRORS:", errs or "none")

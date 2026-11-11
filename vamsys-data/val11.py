"""Validate route update 11. Usage: python val11.py [routes-update-11-import.csv | -edits+new]
Checks the header, unique callsigns, edits matching existing routes (same callsign, pair and type), new callsigns
unused, known fleet IDs and airports, and, on the network after the update, return legs with identical fleets and
the light-jet range / runway / mountain rules."""
import csv, os, sys
sys.dont_write_bytecode = True
import gen11 as g  # rebuilds the pre-update network (prints its own one-line summary)

D = g.D
HDR = ",".join(g.HDR)
FLEETS = {str(i) for i in range(32199, 32218)} - {"32212"} | {"32220"}
args = sys.argv[1:] or ["routes-update-11-edits.csv", "routes-update-11-new.csv"]
if args == ["-edits+new"]: args = ["routes-update-11-edits.csv", "routes-update-11-new.csv"]
errs, rows = [], []
for name in args:
    p = os.path.join(D, name)
    if open(p, encoding="utf-8").readline().rstrip("\n") != HDR: errs.append(f"header mismatch {name}")
    rows += list(csv.DictReader(open(p, encoding="utf-8")))
ref = open(os.path.join(D, "routes-update-8-import.csv"), encoding="utf-8").readline().rstrip("\n")
if ref != HDR: errs.append("header differs from update 8")

add = {l.split(",")[0] for l in open(os.path.join(D, "airports-to-add-11.txt"), encoding="utf-8") if l.strip()}
rej = set()
logf = os.path.join(D, "airports-added-11.log")
if os.path.exists(logf):
    rej = {l.split()[1] for l in open(logf, encoding="utf-8-sig") if l.startswith("REJECTED")}
aps = {r[g.DEP] for r in g.net.values()} | {r[g.ARR] for r in g.net.values()} | (add - rej)

after = {c: dict(r) for c, r in g.net.items()}
seen = set()
for r in rows:
    cs = r["Callsign"]
    if cs in seen: errs.append(f"dup {cs}")
    seen.add(cs)
    if r["Flight Number"] != "CX" + cs[3:]: errs.append(f"flight number {cs}")
    if r["ID"]:
        if cs not in g.net: errs.append(f"edit of unknown route {cs}")
        else:
            o = g.net[cs]
            if (o[g.DEP], o[g.ARR], o["Type"]) != (r[g.DEP], r[g.ARR], r["Type"]): errs.append(f"edit changes pair/type {cs}")
            if r["ID"] != "NEEDID" and r["ID"] != g.ids.get(cs, r["ID"]): errs.append(f"ID {r['ID']} for {cs} differs from known {g.ids[cs]}")
            if r["ID"] == "NEEDID" and len(args) == 1: errs.append(f"missing ID {cs}")
    elif cs in g.net: errs.append(f"new route reuses callsign {cs}")
    for k in (g.DEP, g.ARR):
        if r[k] not in aps: errs.append(f"airport {r[k]} {cs}")
    for fl in r["Fleet IDs"].split(","):
        if fl not in FLEETS: errs.append(f"fleet {fl} {cs}")
    if r["_delete"] != "FALSE" or r["Is Hidden"] != "FALSE": errs.append(f"flags {cs}")
    after[cs] = r

P = {}
for c, r in after.items():
    k = (r[g.DEP], r[g.ARR])
    if k in P and not (P[k] in g.net and c in g.net): errs.append(f"duplicate city pair {k} {P[k]} {c}")
    P.setdefault(k, c)  # KIND-KLAS exists twice by design (CRX203 group charter, CRX411 executive)
for (a, b), c in P.items():
    if (b, a) not in P: errs.append(f"no return {c} {a}-{b}")
    elif after[c]["Fleet IDs"] != after[P[(b, a)]]["Fleet IDs"]: errs.append(f"fleet mismatch {c}/{P[(b, a)]}")
    for f in after[c]["Fleet IDs"].split(","):
        if f in g.LIGHT and not g.light_ok(f, a, b): errs.append(f"light-jet rule {c} {a}-{b} {g.LIGHT[f][0]}")
    lightf = [f for f in after[c]["Fleet IDs"].split(",") if f in g.LIGHT]
    if lightf and g.E55P not in lightf and g.light_ok(g.E55P, a, b): errs.append(f"Phenom missing {c}")
    if not after[c]["Fleet IDs"]: errs.append(f"no fleets {c}")
print(f"val11: {len(rows)} rows checked, network after update {len(after)} routes, {len(aps)} airports")
print("ERRORS:", errs or "none")

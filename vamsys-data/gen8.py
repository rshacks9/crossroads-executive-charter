"""Route update 8 generator. Claude 2026-11-11.
Usage: python gen8.py [REJECTED_CODES_COMMA]  -> writes routes-update-8-expansion.csv (all), airports-to-add-8.txt,
and routes-update-8-import.csv (pairs touching rejected airports removed), plus summary8.tsv."""
import csv, glob, math, os, sys
OUT = r"C:\Users\gafft\Documents\kimi\tasks\2026-11-10\05-28-47-1ca902c1\crossroads-site\vamsys-data"
OA = r"C:\Users\gafft\AppData\Local\Temp\claude\C--Users-gafft\d5d5954c-857c-4da5-ba8d-0b22c087b576\scratchpad\ourairports"
HERE = os.path.dirname(os.path.abspath(__file__))
HDR = "ID,Departure Airport (ICAO/IATA),Arrival Airport (ICAO/IATA),Type,Callsign,Flight Number,Fleet IDs,_delete,Service Days,Tags,Is Hidden"
REJ = set(x for x in (sys.argv[1].split(",") if len(sys.argv) > 1 else []) if x)

# existing network: airports in every imported file (update-7-expansion was not imported; its -import twin was)
EXIST = set(); OLD_CS = set()
for f in glob.glob(os.path.join(OUT, "routes-*.csv")):
    b = os.path.basename(f)
    if b.startswith("routes-update-8"): continue
    for r in csv.DictReader(open(f, encoding="utf-8")):
        OLD_CS.add(r["Callsign"])
        if b != "routes-update-7-expansion.csv":
            EXIST.add(r["Departure Airport (ICAO/IATA)"]); EXIST.add(r["Arrival Airport (ICAO/IATA)"])

# OurAirports coordinates, elevation, longest paved runway
AP = {}
for r in csv.DictReader(open(os.path.join(OA, "airports.csv"), encoding="utf-8")):
    AP[r["ident"]] = (float(r["latitude_deg"]), float(r["longitude_deg"]), r["name"], int(r["elevation_ft"] or 0), r["iso_country"])
RWY = {}
for r in csv.DictReader(open(os.path.join(OA, "runways.csv"), encoding="utf-8")):
    if r["closed"] == "1" or not r["length_ft"]: continue
    if not any(s in r["surface"].upper() for s in ("ASP", "CON", "PEM", "BIT", "PAV")): continue
    RWY[r["airport_ident"]] = max(RWY.get(r["airport_ident"], 0), int(r["length_ft"]))
RWY["KSMO"] = 3500  # shortened in 2017; OurAirports may still show 4,973

def nm(a, b):
    la1, lo1 = map(math.radians, AP[a][:2]); la2, lo2 = map(math.radians, AP[b][:2])
    return 3440.065 * math.acos(min(1, math.sin(la1)*math.sin(la2) + math.cos(la1)*math.cos(la2)*math.cos(lo2-lo1)))

# (fleet id, planning range nm, minimum runway ft)
LIGHT = [("32199", 950, 3400), ("32200", 1800, 3400), ("32201", 1700, 5000), ("32215", 1150, 4000),
         ("32217", 2300, 5500), ("32216", 2900, 5500)]
MOUNTAIN = {"KASE", "KEGE", "KJAC", "KSUN", "KMTJ", "KHDN", "KBZN", "KTRK"}  # owner's KASE rule: no Mustang / Premier
def light(a, b):
    d = nm(a, b); rw = min(RWY.get(a, 0), RWY.get(b, 0)); out = []
    for f, r, m in LIGHT:
        if d > r or rw < m: continue
        if f in ("32199", "32215") and (a in MOUNTAIN or b in MOUNTAIN): continue
        out.append(f)
    return out

rows, summary = [], []
def pair(div, cs, a, b, fleets, tags, typ="scheduled"):
    assert fleets, (a, b)
    for i, (x, y) in enumerate(((a, b), (b, a))):
        n = cs + i
        rows.append(("", x, y, typ, f"CRX{n}", f"CX{n}", ",".join(fleets), "FALSE", "", tags, "FALSE"))
    summary.append((div, f"CRX{cs}/{cs+1}", a, b, round(nm(a, b)), ",".join(fleets), tags))
    return cs + 2

SKI = {"KSUN", "KMTJ", "KHDN", "KBZN", "KTRK", "KASE"}
INTL = lambda c: AP[c][4] != "US" or c in ("TJSJ", "TIST")
def ltags(a, b):
    t = ["executive"]
    if a in SKI or b in SKI: t.append("ski")
    if (AP[a][4] != "US") or (AP[b][4] != "US"): t.append("international")
    elif a in ("TJSJ", "TIST") or b in ("TJSJ", "TIST"): t.append("caribbean")
    if nm(a, b) <= 350: t.append("short-hop")
    return ",".join(t)

# 1. KTYQ light/mid jets: CRX175-198 then the new CRX701+ block
KTYQ = ["KSUN", "KMTJ", "KHDN", "KBZN", "KSRQ", "KOPF", "TJSJ", "TIST", "MKJS", "MDPC", "KMMU", "KFRG",
        "KPVD", "KPWM", "KSNA", "KRNO", "KTRK", "KADS", "KSAT", "KMSN"]
cs = 175
for d in KTYQ:
    if cs > 198: cs = max(cs, 701)
    cs = pair("Executive KTYQ (light/mid jets)", cs, "KTYQ", d, light("KTYQ", d), ltags("KTYQ", d))
# 2. point-to-point light/mid jets (continue CRX7xx)
P2P = [("KTEB", "KTMB"), ("KMMU", "KACK"), ("KSMO", "KLAS"), ("KCRQ", "KSDL"), ("KVNY", "KTRK"),
       ("KADS", "KASE"), ("KSNA", "KSUN")]
for a, b in P2P:
    cs = pair("Executive point-to-point (light/mid jets)", cs, a, b, light(a, b), ltags(a, b))

# 3. KIND large-jet executive CRX431+
LONG, G6, G7, A22, A34, A38, E75, E90, B75 = "32202", "32205", "32206", "32209", "32208", "32213", "32203", "32204", "32207"
cs = 431
for d, f in (("KBZN", [LONG, G6, G7, A22]), ("KHDN", [LONG, G6, G7, A22, B75]), ("KSUN", [LONG, G6, G7]),
             ("KTRK", [LONG, G6, G7]), ("KOPF", [LONG, G6, G7]), ("KSNA", [LONG, G6, G7]),
             ("TIST", [LONG, G6, G7, A22])):
    cs = pair("Executive KIND (large jets)", cs, "KIND", d, f, ltags("KIND", d))

# 4. transatlantic CRX529+
cs = 529
for a, b, f in (("KIND", "LSZH", [G6, G7, A34, A38]), ("KIND", "LIML", [G6, G7]), ("KIND", "LEMD", [G6, G7, A34, A38]),
                ("KIND", "EDDM", [G6, G7, A34, A38]), ("KIND", "EINN", [G6, G7, A34]), ("EINN", "EGLC", [G6, G7]),
                ("KTEB", "LSZH", [G6, G7])):
    cs = pair("Transatlantic executive", cs, a, b, f, "executive,international")

# 5. sports / college charter CRX325+
def sports(d):
    dist = nm("KIND", d); rw = RWY.get(d, 0); f = []
    if dist <= 1500 and rw >= 6000: f.append(E75)
    if dist <= 1900 and rw >= 6500: f.append(E90)
    if rw >= 7000: f.append(B75)
    if dist <= 3000 and rw >= 6500: f.append(A22)
    if d in ("KPDX", "KBFI", "KSLC") and rw >= 10000: f.append(A34)
    return f
cs = 325
COLLEGE = {"KMSN", "KCMI", "KUNV", "KLNK"}
for d in ["KSAT", "KSTL", "KMSN", "KBFI", "KPDX", "KCMI", "KUNV", "KLNK", "KSLC"]:
    cs = pair("Sports / college charter (KIND)", cs, "KIND", d, sports(d),
              "sports-charter,college" if d in COLLEGE else "sports-charter")

# 6. group charter CRX209+
cs = 209
for d in ["TJSJ", "MKJS", "MDPC", "KRNO"]:
    dist = nm("KIND", d); f = []
    if dist <= 1500: f.append(E75)
    if dist <= 1900: f.append(E90)
    f += [B75, A22]
    t = "group-charter" + (",international" if AP[d][4] != "US" else (",caribbean" if d == "TJSJ" else ""))
    cs = pair("Group charter (KIND)", cs, "KIND", d, f, t)

# 7. cargo CRX615+
cs = 615
for d, f in (("KAFW", ["32210", "32211", "32214"]), ("MMMX", ["32210", "32211", "32214"]), ("EBLG", ["32210", "32214"])):
    cs = pair("Cargo charter (KIND)", cs, "KIND", d, f, "cargo-charter", typ="cargo")

# 8. restore the 20 update-7 routes that were dropped because their airports looked rejected.
# Orwell's airport list (read 2026-11-11 05:45) shows all eight airports exist (IDs 906907-906926), so these can go in.
RESTORE = {"KBKL", "KHXD", "KJAC", "KMSY", "KPHL", "MBPV", "MYNN", "PHNL"}
imported7 = {r["Callsign"] for r in csv.DictReader(open(os.path.join(OUT, "routes-update-7-import.csv"), encoding="utf-8"))}
restored = []
for r in csv.DictReader(open(os.path.join(OUT, "routes-update-7-expansion.csv"), encoding="utf-8")):
    if r["ID"] or r["Callsign"] in imported7: continue
    a, b = r["Departure Airport (ICAO/IATA)"], r["Arrival Airport (ICAO/IATA)"]
    assert a in RESTORE or b in RESTORE, r
    fl = r["Fleet IDs"].replace("HAWKER", "32217")
    if "KHXD" in (a, b): fl = ",".join(x for x in fl.split(",") if x not in ("32217", "32216"))  # 5,000 ft runway
    restored.append(("", a, b, r["Type"], r["Callsign"], r["Flight Number"], fl,
                     "FALSE", "", r["Tags"], "FALSE"))
    if int(r["Callsign"][3:]) % 2:
        summary.append(("Restored from update 7", f'{r["Callsign"]}/{int(r["Callsign"][3:])+1}', a, b, round(nm(a, b)),
                        fl, r["Tags"]))
rows += restored

def q(s): return f'"{s}"' if "," in s else s
def line(r): r = list(r); r[6] = f'"{r[6]}"'; r[9] = q(r[9]); return ",".join(r)
def write(name, rs):
    with open(os.path.join(OUT, name), "w", newline="\n", encoding="utf-8") as fh:
        fh.write(HDR + "\n"); [fh.write(line(r) + "\n") for r in rs]
write("routes-update-8-expansion.csv", rows)
keep = [r for r in rows if r[1] not in REJ and r[2] not in REJ]
write("routes-update-8-import.csv", keep)
used = sorted({x for r in rows for x in (r[1], r[2])} - EXIST - RESTORE)
with open(os.path.join(OUT, "airports-to-add-8.txt"), "w", newline="\n", encoding="utf-8") as fh:
    for k in used: fh.write(f"{k},{AP[k][2]}\n")
with open(os.path.join(HERE, "summary8.tsv"), "w", encoding="utf-8") as fh:
    for s in summary:
        a, b = s[2], s[3]
        fh.write("\t".join(map(str, s)) + f"\t{RWY.get(a,0)}/{RWY.get(b,0)}\t{'DROPPED' if a in REJ or b in REJ else ''}\n")
print(f"existing airports {len(EXIST)}, prior callsigns {len(OLD_CS)}; {len(rows)} routes generated, {len(keep)} kept; {len(used)} new airports")

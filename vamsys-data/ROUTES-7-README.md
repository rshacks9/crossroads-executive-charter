# Route update 7: network expansion

Generated 2026-11-11. Import `routes-update-7-expansion.csv` through Operations > Data > Imports > Routes,
**after** adding the airports in `airports-to-add-7.txt` and creating the Hawker fleet.

## Before importing

1. Create the Hawker 800XP fleet (H25B, based KTYQ), then replace every literal `HAWKER` in the CSV
   with its fleet ID (find/replace; it only ever appears inside the quoted Fleet IDs column).
2. Add the 48 airports in `airports-to-add-7.txt`. If the lookup rejects one (as it did KPBI), drop
   that airport's route pair from the CSV before importing.
3. Import the CSV. It has 142 rows: 22 edits (rows with an ID) and 120 new routes (ID empty).

## Edits to existing routes (22 rows)

- CRX101-120 (IDs 14214036-14214055): add `32216` (Citation X) and `HAWKER` to the current fleet list.
  Adding the Citation X was my call, not part of the brief: until now it flew only CRX121/122. To
  add only the Hawker, delete `32216,` from those 20 rows.
- CRX121/122 (IDs 14214327/14214328): add `HAWKER` only (now `32216,32199,HAWKER`).
- Tags and everything else stay as they were in updates 2-6.

## Callsign blocks used

| Block | Division |
| --- | --- |
| CRX123-174 | Executive KTYQ light/mid jets (incl. 2 point-to-point pairs, CRX171-174) |
| CRX205-208 | Group charter, KIND |
| CRX305-324 | Sports charter, KIND |
| CRX413-430 | Executive KIND large jets (incl. owner-requested KDAL-KVNY and KVNY-KIND) |
| CRX509-528 | International / long-range (KIND plus KTEB-EGGW and KVNY-PHNL) |
| CRX609-614 | Cargo charter, KIND (type `cargo`) |

Still free: CRX175-199, 209-299, 325-399, 431-499, 529-599, 615-699.

## Routes by division

### Executive KTYQ (light/mid jets) (48 routes)

| Callsigns | From | To | GC nm | Fleets | Tags |
| --- | --- | --- | --- | --- | --- |
| CRX123/124 | KTYQ | KVNY | 1573 | 32200,32201,HAWKER,32216 | executive |
| CRX125/126 | KTYQ | KBCT | 875 | 32199,32200,32201,32215,HAWKER,32216 | executive |
| CRX127/128 | KTYQ | KEGE | 951 | 32200,32201,HAWKER,32216 | executive,ski |
| CRX129/130 | KTYQ | KPDK | 381 | 32199,32200,32201,32215,HAWKER,32216 | executive |
| CRX131/132 | KTYQ | KPTK | 203 | 32199,32200,32201,32215,HAWKER,32216 | executive,short-hop |
| CRX133/134 | KTYQ | KIAD | 413 | 32199,32200,32201,32215,HAWKER,32216 | executive |
| CRX135/136 | KTYQ | KBED | 690 | 32199,32200,32201,32215,HAWKER,32216 | executive |
| CRX137/138 | KTYQ | KHXD | 540 | 32199,32200,32201,32215,HAWKER,32216 | executive |
| CRX139/140 | KTYQ | KDTS | 578 | 32199,32200,32201,32215,HAWKER,32216 | executive |
| CRX141/142 | KTYQ | KAUS | 813 | 32199,32200,32201,32215,HAWKER,32216 | executive |
| CRX143/144 | KTYQ | KHOU | 765 | 32199,32200,32201,32215,HAWKER,32216 | executive |
| CRX145/146 | KTYQ | KAPA | 857 | 32199,32200,32201,32215,HAWKER,32216 | executive |
| CRX147/148 | KTYQ | KMKC | 390 | 32199,32200,32201,32215,HAWKER,32216 | executive |
| CRX149/150 | KTYQ | KSUS | 220 | 32199,32200,32201,32215,HAWKER,32216 | executive,short-hop |
| CRX151/152 | KTYQ | KCLT | 384 | 32199,32200,32201,32215,HAWKER,32216 | executive |
| CRX153/154 | KTYQ | KSDF | 114 | 32199,32200,32201,32215,HAWKER,32216 | executive,short-hop |
| CRX155/156 | KTYQ | KOSU | 146 | 32199,32200,32201,32215,HAWKER,32216 | executive,short-hop |
| CRX157/158 | KTYQ | KBKL | 226 | 32199,32200,32201,32215,HAWKER,32216 | executive,short-hop |
| CRX159/160 | KTYQ | KAGC | 290 | 32199,32200,32201,32215,HAWKER,32216 | executive,short-hop |
| CRX161/162 | KTYQ | KMYR | 518 | 32199,32200,32201,32215,HAWKER,32216 | executive |
| CRX163/164 | KTYQ | KCHS | 522 | 32199,32200,32201,32215,HAWKER,32216 | executive |
| CRX165/166 | KTYQ | MYNN | 1003 | 32200,32201,32215,HAWKER,32216 | executive,international |
| CRX167/168 | KTYQ | KJAC | 1112 | 32200,32201,HAWKER,32216 | executive,ski |
| CRX169/170 | KTYQ | KACK | 740 | 32199,32200,32201,32215,HAWKER,32216 | executive |

### Executive point-to-point (light/mid jets) (4 routes)

| Callsigns | From | To | GC nm | Fleets | Tags |
| --- | --- | --- | --- | --- | --- |
| CRX171/172 | KTEB | KBCT | 919 | 32199,32200,32201,32215,HAWKER,32216 | executive |
| CRX173/174 | KBED | KACK | 91 | 32199,32200,32201,32215,HAWKER,32216 | executive,short-hop |

### Executive KIND (large jets) (18 routes)

| Callsigns | From | To | GC nm | Fleets | Tags |
| --- | --- | --- | --- | --- | --- |
| CRX413/414 | KIND | KVNY | 1571 | 32207,32205,32208 | executive |
| CRX415/416 | KDAL | KVNY | 1084 | 32205,32206 | executive |
| CRX417/418 | KIND | KBCT | 859 | 32202,32205,32206 | executive |
| CRX419/420 | KIND | KEGE | 951 | 32202,32205,32206 | executive,ski |
| CRX421/422 | KIND | KSJC | 1668 | 32202,32205,32206,32209 | executive |
| CRX423/424 | KIND | KIAD | 413 | 32202,32205,32206,32209 | executive |
| CRX425/426 | KIND | KAPA | 856 | 32202,32205,32206,32209 | executive |
| CRX427/428 | KIND | KJAC | 1117 | 32202,32205,32206 | executive,ski |
| CRX429/430 | KIND | KBED | 698 | 32202,32205,32206 | executive |

### International (KIND / point-to-point) (20 routes)

| Callsigns | From | To | GC nm | Fleets | Tags |
| --- | --- | --- | --- | --- | --- |
| CRX509/510 | KIND | LSGG | 3839 | 32205,32206,32208,32213 | executive,international |
| CRX511/512 | KIND | LFMN | 3961 | 32205,32206,32208 | executive,international |
| CRX513/514 | KIND | EGLF | 3457 | 32205,32206 | executive,international |
| CRX515/516 | KIND | PHNL | 3766 | 32205,32206,32208,32213 | executive,international |
| CRX517/518 | KIND | MMUN | 1122 | 32202,32205,32206,32209,32203,32204,32207 | group-charter,international |
| CRX519/520 | KIND | MBPV | 1294 | 32202,32205,32206,32209,32203,32204,32207 | group-charter,international |
| CRX521/522 | KIND | TXKF | 1135 | 32202,32205,32206,32209,32207 | executive,international |
| CRX523/524 | KIND | CYYZ | 382 | 32202,32205,32206,32209,32203,32204 | executive,international |
| CRX525/526 | KTEB | EGGW | 2989 | 32205,32206 | executive,international |
| CRX527/528 | KVNY | PHNL | 2217 | 32202,32205,32206 | executive,international |

### Sports charter (KIND) (20 routes)

| Callsigns | From | To | GC nm | Fleets | Tags |
| --- | --- | --- | --- | --- | --- |
| CRX305/306 | KIND | KJAX | 598 | 32203,32204,32207,32209 | sports-charter |
| CRX307/308 | KIND | KIAH | 734 | 32203,32204,32207,32209,32208,32213 | sports-charter |
| CRX309/310 | KIND | KDEN | 846 | 32203,32204,32207,32209,32208 | sports-charter |
| CRX311/312 | KIND | KPHX | 1291 | 32203,32204,32207,32209,32208 | sports-charter |
| CRX313/314 | KIND | KMSP | 437 | 32203,32204,32207,32209 | sports-charter |
| CRX315/316 | KIND | KPHL | 510 | 32203,32204,32207,32209,32208 | sports-charter |
| CRX317/318 | KIND | KDTW | 201 | 32203,32204,32207,32209 | sports-charter |
| CRX319/320 | KIND | KMEM | 331 | 32203,32204,32207,32209 | sports-charter |
| CRX321/322 | KIND | KSEA | 1617 | 32204,32207,32209,32208 | sports-charter |
| CRX323/324 | KIND | KCMH | 158 | 32203,32204,32207,32209 | sports-charter |

### Group charter (KIND) (4 routes)

| Callsigns | From | To | GC nm | Fleets | Tags |
| --- | --- | --- | --- | --- | --- |
| CRX205/206 | KIND | KMSY | 615 | 32203,32204,32207,32209 | group-charter |
| CRX207/208 | KIND | KTPA | 729 | 32203,32204,32207,32209 | group-charter |

### Cargo charter (KIND) (6 routes)

| Callsigns | From | To | GC nm | Fleets | Tags |
| --- | --- | --- | --- | --- | --- |
| CRX609/610 | KIND | KEWR | 559 | 32210,32211,32214 | cargo-charter |
| CRX611/612 | KIND | KOAK | 1676 | 32210,32211,32214 | cargo-charter |
| CRX613/614 | KIND | EGSS | 3476 | 32210,32214 | cargo-charter |

**Total: 120 new routes (60 pairs).**

Fleet key: 32199 C510, 32200 CJ4, 32201 LJ35, 32215 PRM1, 32216 C750, HAWKER H25B; 32202 Longitude,
32205 G650, 32206 G700, 32209 A220, 32208 A340, 32213 A380, 32203 E175, 32204 E190, 32207 757;
32210 MD-11F, 32211 A300F, 32214 777F.

## Range assumptions (planning limits, great-circle nm)

Each KTYQ jet was put on a route only if the great-circle distance is within its planning limit:

| Fleet | Limit used | Basis |
| --- | --- | --- |
| C510 Mustang | 950 | ~1,000 nm per the brief, less a margin |
| PRM1 Premier IA | 1,150 | ~1,300 nm book range, less a margin |
| LJ35 | 1,700 | ~1,800 nm per the brief |
| CJ4 | 1,800 | ~2,000 nm book range, less a margin |
| Hawker 800XP | 2,300 | ~2,500 nm per the brief |
| C750 Citation X | 2,900 | ~3,000 nm per the brief |

Sports legs from KIND: E175 only up to 1,500 nm, E190 up to 1,900 nm, A220 up to 3,000 nm. The 757 is on every domestic sports and group leg.
Transatlantic and Honolulu legs (3,450-3,960 nm) are G650/G700, plus the A340/A380 where the airport takes them.
Distances come from approximate coordinates (within about 0.1 deg), so they are good to roughly +/-10 nm.

Mountain airports (KEGE, KJAC) follow the owner's existing KASE rule: no Mustang or Premier.

## Uncertain / worth a look

- **A340-600 at KVNY (CRX413/414):** the owner asked for it, but Van Nuys has an 8,000 ft runway and
  no A346 would realistically go there. Kept as requested.
- **757 to KVNY** is plausible (8,000 ft) but tight at heavy weights.
- **Mustang KTYQ-KBCT (875 nm) and KTEB-KBCT (919 nm)** are near its limit; drop 32199 if fuel planning shows it is short.
- **CJ4/LJ35 KTYQ-KVNY (1,573 nm)** are westbound into the jet stream; winter headwinds may need a fuel stop.
- **LJ35 KTYQ-KJAC / KEGE**: these are hot-and-high airports. The routes are legal, but the Learjet's performance there will be marginal.
- **A380 at KIAH (sports) and LSGG/PHNL** is fine for the runways; the A380 isn't on LFMN.
- **TXKF (Bermuda), MBPV and MYNN**: I believe OurAirports lists all three. They are the most likely ones for the vAMSYS lookup to reject.
  The same caveat applies to the smaller fields KBKL, KOSU, KHXD, KDTS, KMKC and KSUS. They are all real public airports.
- **Coverage check:** only 5 of the 48 new codes (KIAD, KIAH, KDEN, KPHX, KMEM) also appear in the local
  medium-cargo runway files (155 files). The rest were checked from general knowledge, not a database.
- Hawker isn't on any KIND (large-jet) route, since it's KTYQ-based.

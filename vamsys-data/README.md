# vAMSYS setup record (airline CRX7489)

Entered into Orwell on 2026-11-10.

## Operating rule

- **KTYQ (Indianapolis Executive):** aircraft up to Citation X size: Mustang, CJ4, Learjet 35A.
- **KIND (Indianapolis International):** everything bigger: Longitude, G650, G700, E-Jets, 757,
  A220, A340, A380 and the freighters.
- One vAMSYS hub, "Indianapolis", contains both airports and is the default for new pilots.

## Divisions and fleets (fleet ID → type, aircraft)

| Division | Fleet | ID | Aircraft |
| --- | --- | --- | --- |
| Executive (KTYQ) | Cessna Citation Mustang (C510) | 32199 | N510CR |
| Executive (KTYQ) | Cessna Citation CJ4 (C25C) | 32200 | N525CR |
| Executive (KTYQ) | Learjet 35A (LJ35) | 32201 | N35CR |
| Executive (KIND) | Cessna Citation Longitude (C700) | 32202 | N700CR |
| Executive (KIND) | Gulfstream G650 (GLF6) | 32205 | N650CR |
| Executive (KIND) | Gulfstream G700 (GA7C) | 32206 | N707CR |
| Executive charter (KIND) | Airbus A220-300 Executive (BCS3), 48 seats | 32209 | N223CR |
| Executive charter (KIND) | Airbus A340-600 Executive (A346), 100 seats | 32208 | N346CR |
| Executive charter (KIND) | Airbus A380-800 Executive (A388), 150 seats | 32213 | N380CR |
| Group/sports charter (KIND) | Embraer E175 (E175) | 32203 | N175CR |
| Group/sports charter (KIND) | Embraer E190 (E190) | 32204 | N190CR |
| Group/sports charter (KIND) | Boeing 757-200 (B752) | 32207 | N757CR |
| Cargo charter (KIND) | McDonnell Douglas MD-11F (MD11), 91,000 kg | 32210 | N611CR |
| Cargo charter (KIND) | Airbus A300-600F (A306), 48,000 kg | 32211 | N306CR |
| Cargo charter (KIND) | Boeing 777F (B77L), 102,000 kg | 32214 | N777CR |

## Airports (23)

KIND, KTYQ (bases); KTEB, KHPN, KASE, KAPF, KSDL, KLAS, KDAL, KMDW, KBNA, KEYW, KMCO, KBOS, KLAX;
EGGW, LFPB, MMSD, TNCM (long-range executive); KMIA, KONT, PANC, EDDP (cargo).
vAMSYS's airport lookup rejected KPBI and PBI (Palm Beach), so it was skipped.

## Routes (56)

Imported through Operations → Data → Imports → Routes. Files are applied in order:

1. `routes-import.csv`: the original 28 routes.
2. `routes-update-2.csv`: updates those 28 by ID (route IDs 14214036–14214063) to follow the
   KTYQ/KIND rule, and adds 28 more:
   - CRX101–120: KTYQ small-jet executive
   - CRX201–204: KIND group charters (E-Jets, 757, A220)
   - CRX301–304: KIND sports charters (E190, 757, A220, A340)
   - CRX401–412: KIND big-jet executive
   - CRX501–508: KIND long-range executive (London Luton, Le Bourget, Los Cabos, St Maarten)
   - CRX601–608: KIND cargo charters, type `cargo` (Miami, Ontario, Anchorage, Leipzig)
3. `routes-update-3.csv`: adds the A380 to CRX303/304 (LAX), 411/412 (LAS) and 503/504 (Le Bourget),
   and the 777F to all eight cargo routes. Routes created by update 2 have IDs 14214095–14214122.

## Ranks

Cadet (0 h, vAMSYS default), First Officer 10 h / 5 PIREPs, Captain 25 / 15, Senior Captain 75 / 40,
Charter Captain 150 / 80, Chief Pilot 300 / 150. Icons in `../brand/png/ranks`. vAMSYS ranks don't
restrict aircraft; the route-to-fleet assignments above do that.

## Pilot portal content

- Custom page **Pilot Handbook** (Documents category, page 3114): bases, divisions, flight-number
  blocks, callsign, how a flight works, ranks.

## Update 8 (2026-11-11)

Import #30335 added 134 routes (network now 292) and 39 airports (now 111). Details, page IDs, tours,
comms and settings are in `ORWELL-CHANGES-8.md`. The eight "rejected" airports from update 7 actually
exist in Orwell; their 20 routes were restored in update 8. New callsign block CRX701-799 (light jets,
KTYQ and point-to-point).

## Update 11 (2026-11-11)

Import #30348 (158/158): 142 fleet edits and 16 new routes, CRX733-748. Network now **310 routes, 112
airports** (KMVY added), 19 fleets with the Phenom 300E (32220, E55P, N300CR). Also page 3120 Featured
Routes, tour 66748 Crossroads Circuit, alert 4543, NOTAMs 6293-6295, brand colours and a new Phoenix
dashboard (hero banner, link tiles, full-width globe map). Details and the FedEx Virtual comparison are in
`ORWELL-CHANGES-11.md`. Real Orwell route IDs: `orwell-route-ids-2026-11-11.csv` (do not derive IDs).

## Round 13 (2026-11-12)

Import #30364 (6/6): CRX749/750 KTYQ-KBAF for the seven KTYQ jets, CRX751/752 KBAF-KBDL for the Piper M600
only, and CRX445/446 KBDL-KLAX for the A340-600, G650 and G700. Network now **316 routes, 113 airports** (KBAF
Westfield-Barnes Regional added, Orwell airport 907144), 20 fleets with the Piper M600 (32230, M600, 5 seats,
N600CR = aircraft 304909). The fleet form has no base field; the website puts the M600 in the Executive
division at KTYQ. Also alert 4542 corrected and Charter of the Week alerts 4544 and 4545. The operator's step
log stays private this round; the import file is `routes-update-13-import.csv`. Real Orwell route IDs of the six new
routes, and of CRX739-748: `route-ids-13.csv`.

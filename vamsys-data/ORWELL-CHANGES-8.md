# Orwell changes, round 8 (2026-11-11)

All changes were made in Orwell as Tom Gaff (CRX0001) through Chrome UI Automation, and each one was read back afterwards. No billing, staff, API key or security settings were changed. Nobody was invited or emailed, and no existing data was deleted.

## 1. Routes: import 30335

| | |
| --- | --- |
| File | `routes-update-8-import.csv` (identical to `routes-update-8-expansion.csv`, because no airport was rejected) |
| Import | **#30335**, Routes, 11 Nov 26 10:50Z: **Rows 134 / Processed 134 / Successful 134** |
| Network | 158 routes before, **292 after** |
| Validation | `val8.py`: header matches update 7, callsigns unique and new, every route has a return with the same fleets, fleet IDs known, every airport present. Result: no errors |
| Generator | `gen8.py` uses OurAirports coordinates and runways (scratchpad `ourairports/`). Planning ranges: C510 950, PRM1 1,150, LJ35 1,700, CJ4 1,800, H25B 2,300, C750 2,900 nm. Minimum runways: C510/CJ4 3,400, PRM1 4,000, LJ35 5,000, H25B/C750 5,500 ft. Mountain rule: no Mustang or Premier at KASE, KEGE, KJAC, KSUN, KMTJ, KHDN, KBZN, KTRK |

The import has two parts:

- **114 new routes (57 pairs)** in previously unused callsign blocks: CRX175-198 and the new **CRX701-730** block (KTYQ and point-to-point light jets), CRX209-216, CRX325-342, CRX431-444, CRX529-542 and CRX615-620.
- **20 restored update-7 routes (10 pairs):** CRX137/138, 157/158, 165/166, 167/168, 205/206, 315/316, 427/428, 515/516, 519/520 and 527/528. They were dropped from update 7 because their airports looked rejected, but all eight airports exist in Orwell (see section 2). `HAWKER` was replaced by 32217. Hawker and Citation X were removed from KTYQ-KHXD because of its 5,000 ft runway.

Judgement calls worth a look:

- **EINN-EGLC (CRX539/540)** is a G650/G700 London City hop, as a nod to the BA001 Shannon stop. In real life, London City allows only steep-approach-approved aircraft.
- **KSMO (CRX721/722)** is Mustang and CJ4 only, because the runway is 3,500 ft. **KCRQ (CRX723/724)** is Mustang, CJ4 and Premier, with a 4,897 ft runway.
- **KIND-KUNV (State College)** has no 757, because the runway is 6,701 ft. **KHDN** has the 757 for ski groups.
- **KTYQ-TIST** (1,705 nm) leaves out the Learjet, whose limit is 1,700 nm. **KTEB-KTMB** (966 nm) leaves out the Mustang.
- Penn State's airport is **KUNV**, not KSCE.

## 2. Airports: 39 added, 0 rejected

All 39 codes in `airports-to-add-8.txt` were created with the one-tab method; see `airports-added-8.log`. A read-back of the airport list (111 airports, no duplicates) confirmed every one.

**Finding:** the 8 codes in the brief's rejected list (KPBI aside) are **not** rejected. KBKL, KHXD, KJAC, KMSY, KPHL, MBPV, MYNN and PHNL all exist, with IDs 906907-906926, created during the update-7 run. The update-7 script misread the form after a save. KPBI was not retried.

New airports: EBLG EDDM EGLC EINN KADS KAFW KBFI KBZN KCMI KCRQ KFRG KHDN KLNK KMMU KMSN KMTJ KOPF KPDX KPVD KPWM KRNO KSAT KSLC KSMO KSNA KSRQ KSTL KSUN KTMB KTRK KUNV LEMD LIML LSZH MDPC MKJS MMMX TIST TJSJ.

## 3. Custom pages (HQ > Pages > Custom Pages, category Documents, enabled)

The source text for each page is in `pages-8/*.md`. Pages were converted to HTML (`md2html.py`) and pasted into the editor's Source Code dialog. Every page ends with the "fictional virtual airline for flight simulation" disclaimer.

| ID | Title | Phoenix URL | Notes |
| --- | --- | --- | --- |
| 3114 | Pilot Handbook | /phoenix/documents/handbook | **Rewritten:** all six KTYQ types, the new callsign blocks (incl. CRX701-799), all 4 divisions with the current network, and CRX/CX numbering |
| 3115 | Fleet Guide | /phoenix/documents/fleet-guide | 18 fleets by division with registrations (incl. N390CR, N800CR, N750CR), planning ranges, cabins and payloads |
| 3116 | Route Guide | /phoenix/documents/route-guide | Callsign blocks, destinations by theme, how to pick a flight, tags, Jumpseat |
| 3117 | Booking & PIREP Guide | /phoenix/documents/booking-pirep-guide | Book, plan, fly and file, plus airline rules. **Set as the Rules Page shown at registration** |
| 3118 | About & Contact | /phoenix/documents/about-contact | Airline summary, staff (Tom Gaff CRX0001), how to get help, full disclaimer |
| 3119 | Ranks & Milestones | /phoenix/documents/ranks-milestones | Rank table, which matches Orwell, plus the two tours with badges and informal milestones. The URL was changed from `ranks` because that clashed with the built-in Ranks document |

## 4. Rewards and badges

- vAMSYS has **no standalone awards or badges module.** HQ > Rewards contains only Ranks, Scoring Groups and AutoReject Rules, and `/orwell/hq/rewards/awards` returns 404. Badges come from **Activities**, so I turned on the Activities module and created two tours. Each tour has **Create Placeholder Badge** turned on, so finishing it awards a badge plus bonus points.

| Activity ID | Name | Window | Legs | Points |
| --- | --- | --- | --- | --- |
| 66693 | Ski Season Tour 2026-27 | 11 Nov 2026 to 15 Apr 2027 (registration the same) | KTYQ-KEGE-KTYQ-KASE-KTYQ-KJAC-KTYQ-KSUN-KTYQ (8 airport-pair legs) | 500 |
| 66694 | Across the Pond: Transatlantic Executive Tour | 11 Nov 2026 to 30 Jun 2027 | KIND-LFPB-KIND-LSGG-KIND-LSZH-KIND (6 legs) | 750 |

- **Skipped:** milestone badges for first flight, hours, landing rate and per-division flying. vAMSYS has no trigger for them in this tier; ranks cover hours and flights. They appear as informal "milestones" on page 3119. Placeholder badge images could be replaced with real artwork in each activity later.

## 5. Comms

| Type | ID | Title | Settings |
| --- | --- | --- | --- |
| Alert | 4541 | Welcome to Crossroads Executive & Charter | Info, Phoenix dashboard, permanent |
| Alert | 4542 | Network update: 292 routes, ski season, the Caribbean and Europe | Info, Phoenix dashboard, permanent (delete or set an end date when stale) |
| NOTAM | 6292 | Ski season: mountain airport operations | Info, Low priority, tag `operations`, not must-read |

Comms has no separate news feature: it offers only Alerts and (now) NOTAMs.

## 6. Settings and dashboard

| Where | Change | Before -> after |
| --- | --- | --- |
| HQ > Pages > Phoenix Dashboard | Applied **Default Config** and saved | The dashboard had **no rows**, so the Phoenix home page was blank and the alerts were invisible. It now shows the booking/PIREP buttons, stats, alerts, NOTAMs, boxes and map |
| Settings > vAMSYS Modules | Enable Activities | Off -> On |
| Settings > vAMSYS Modules | Enable NOTAM | Off -> On |
| Settings > vAMSYS Modules | Enable Route Changelist (shows pilots new and ending routes) | Off -> On |
| Settings > Booking & Dispatch | Flight Centre use Fleet Filters (filter by fleet; 18 fleets) | Off -> On |
| Settings > Pilot Registration | Login/Register Link Modifier (required field, was empty) | empty -> `crossroads` |
| Settings > Pilot Registration | Rules Page | none -> Booking & PIREP Guide (3117) |

Left as they were (already sensible): VA name, slogan, website and support email (Basic Settings); Jumpseat, Jumpseat to bases and Jumpseat anywhere (on); route tags (on); departure times (on); booking validity 24 h; Roster Generator (on); Claims and Marketing (off).

**For the website agent / owner:** the registration link modifier is now `crossroads`, so `site.config.json` `join_url` can be set once the exact vAMSYS register URL format is confirmed. I did not touch the website.

## 7. Skipped / not available

- **Fleet descriptions:** the fleet edit form has no description field (only name, type code, type, seats, prefixes, Hide in Phoenix and scoring group). The Fleet Guide page covers this instead.
- **Hub description:** the hub form has only name, default and airports. Nothing to add.
- **Awards module:** not in vAMSYS; done with tours and badges instead (section 4).
- **Social icons / Discord:** none exists (`discord_url` is null), so nothing was added.

## 8. Route list (import 30335)

| Division | Callsigns | From | To | GC nm | Fleets | Tags |
| --- | --- | --- | --- | --- | --- | --- |
| Executive KTYQ (light/mid jets) | CRX175/176 | KTYQ | KSUN | 1267 | 32200,32201,32217,32216 | executive,ski |
| Executive KTYQ (light/mid jets) | CRX177/178 | KTYQ | KMTJ | 1008 | 32200,32201,32217,32216 | executive,ski |
| Executive KTYQ (light/mid jets) | CRX179/180 | KTYQ | KHDN | 959 | 32200,32201,32217,32216 | executive,ski |
| Executive KTYQ (light/mid jets) | CRX181/182 | KTYQ | KBZN | 1143 | 32200,32201,32217,32216 | executive,ski |
| Executive KTYQ (light/mid jets) | CRX183/184 | KTYQ | KSRQ | 781 | 32199,32200,32201,32215,32217,32216 | executive |
| Executive KTYQ (light/mid jets) | CRX185/186 | KTYQ | KOPF | 899 | 32199,32200,32201,32215,32217,32216 | executive |
| Executive KTYQ (light/mid jets) | CRX187/188 | KTYQ | TJSJ | 1666 | 32200,32201,32217,32216 | executive,international |
| Executive KTYQ (light/mid jets) | CRX189/190 | KTYQ | TIST | 1705 | 32200,32217,32216 | executive,international |
| Executive KTYQ (light/mid jets) | CRX191/192 | KTYQ | MKJS | 1363 | 32200,32201,32217,32216 | executive,international |
| Executive KTYQ (light/mid jets) | CRX193/194 | KTYQ | MDPC | 1586 | 32200,32201,32217,32216 | executive,international |
| Executive KTYQ (light/mid jets) | CRX195/196 | KTYQ | KMMU | 543 | 32199,32200,32201,32215,32217,32216 | executive |
| Executive KTYQ (light/mid jets) | CRX197/198 | KTYQ | KFRG | 588 | 32199,32200,32201,32215,32217,32216 | executive |
| Executive KTYQ (light/mid jets) | CRX701/702 | KTYQ | KPVD | 680 | 32199,32200,32201,32215,32217,32216 | executive |
| Executive KTYQ (light/mid jets) | CRX703/704 | KTYQ | KPWM | 744 | 32199,32200,32201,32215,32217,32216 | executive |
| Executive KTYQ (light/mid jets) | CRX705/706 | KTYQ | KSNA | 1557 | 32200,32201,32217,32216 | executive |
| Executive KTYQ (light/mid jets) | CRX707/708 | KTYQ | KRNO | 1538 | 32200,32201,32217,32216 | executive |
| Executive KTYQ (light/mid jets) | CRX709/710 | KTYQ | KTRK | 1557 | 32200,32201,32217,32216 | executive,ski |
| Executive KTYQ (light/mid jets) | CRX711/712 | KTYQ | KADS | 663 | 32199,32200,32201,32215,32217,32216 | executive |
| Executive KTYQ (light/mid jets) | CRX713/714 | KTYQ | KSAT | 870 | 32199,32200,32201,32215,32217,32216 | executive |
| Executive KTYQ (light/mid jets) | CRX715/716 | KTYQ | KMSN | 232 | 32199,32200,32201,32215,32217,32216 | executive,short-hop |
| Executive point-to-point (light/mid jets) | CRX717/718 | KTEB | KTMB | 966 | 32200,32201,32215,32217,32216 | executive |
| Executive point-to-point (light/mid jets) | CRX719/720 | KMMU | KACK | 199 | 32199,32200,32201,32215,32217,32216 | executive,short-hop |
| Executive point-to-point (light/mid jets) | CRX721/722 | KSMO | KLAS | 204 | 32199,32200 | executive,short-hop |
| Executive point-to-point (light/mid jets) | CRX723/724 | KCRQ | KSDL | 271 | 32199,32200,32215 | executive,short-hop |
| Executive point-to-point (light/mid jets) | CRX725/726 | KVNY | KTRK | 317 | 32200,32201,32217,32216 | executive,ski,short-hop |
| Executive point-to-point (light/mid jets) | CRX727/728 | KADS | KASE | 614 | 32200,32201,32217,32216 | executive,ski |
| Executive point-to-point (light/mid jets) | CRX729/730 | KSNA | KSUN | 613 | 32200,32201,32217,32216 | executive,ski |
| Executive KIND (large jets) | CRX431/432 | KIND | KBZN | 1149 | 32202,32205,32206,32209 | executive,ski |
| Executive KIND (large jets) | CRX433/434 | KIND | KHDN | 960 | 32202,32205,32206,32209,32207 | executive,ski |
| Executive KIND (large jets) | CRX435/436 | KIND | KSUN | 1271 | 32202,32205,32206 | executive,ski |
| Executive KIND (large jets) | CRX437/438 | KIND | KTRK | 1558 | 32202,32205,32206 | executive,ski |
| Executive KIND (large jets) | CRX439/440 | KIND | KOPF | 882 | 32202,32205,32206 | executive |
| Executive KIND (large jets) | CRX441/442 | KIND | KSNA | 1554 | 32202,32205,32206 | executive |
| Executive KIND (large jets) | CRX443/444 | KIND | TIST | 1694 | 32202,32205,32206,32209 | executive,international |
| Transatlantic executive | CRX529/530 | KIND | LSZH | 3886 | 32205,32206,32208,32213 | executive,international |
| Transatlantic executive | CRX531/532 | KIND | LIML | 3977 | 32205,32206 | executive,international |
| Transatlantic executive | CRX533/534 | KIND | LEMD | 3646 | 32205,32206,32208,32213 | executive,international |
| Transatlantic executive | CRX535/536 | KIND | EDDM | 3967 | 32205,32206,32208,32213 | executive,international |
| Transatlantic executive | CRX537/538 | KIND | EINN | 3146 | 32205,32206,32208 | executive,international |
| Transatlantic executive | CRX539/540 | EINN | EGLC | 339 | 32205,32206 | executive,international |
| Transatlantic executive | CRX541/542 | KTEB | LSZH | 3410 | 32205,32206 | executive,international |
| Sports / college charter (KIND) | CRX325/326 | KIND | KSAT | 856 | 32203,32204,32207,32209 | sports-charter |
| Sports / college charter (KIND) | CRX327/328 | KIND | KSTL | 198 | 32203,32204,32207,32209 | sports-charter |
| Sports / college charter (KIND) | CRX329/330 | KIND | KMSN | 247 | 32203,32204,32207,32209 | sports-charter,college |
| Sports / college charter (KIND) | CRX331/332 | KIND | KBFI | 1617 | 32204,32207,32209,32208 | sports-charter |
| Sports / college charter (KIND) | CRX333/334 | KIND | KPDX | 1627 | 32204,32207,32209,32208 | sports-charter |
| Sports / college charter (KIND) | CRX335/336 | KIND | KCMI | 93 | 32203,32204,32207,32209 | sports-charter,college |
| Sports / college charter (KIND) | CRX337/338 | KIND | KUNV | 393 | 32203,32204,32209 | sports-charter,college |
| Sports / college charter (KIND) | CRX339/340 | KIND | KLNK | 484 | 32203,32204,32207,32209 | sports-charter,college |
| Sports / college charter (KIND) | CRX341/342 | KIND | KSLC | 1175 | 32203,32204,32207,32209,32208 | sports-charter |
| Group charter (KIND) | CRX209/210 | KIND | TJSJ | 1655 | 32204,32207,32209 | group-charter,international |
| Group charter (KIND) | CRX211/212 | KIND | MKJS | 1346 | 32203,32204,32207,32209 | group-charter,international |
| Group charter (KIND) | CRX213/214 | KIND | MDPC | 1573 | 32204,32207,32209 | group-charter,international |
| Group charter (KIND) | CRX215/216 | KIND | KRNO | 1539 | 32204,32207,32209 | group-charter |
| Cargo charter (KIND) | CRX615/616 | KIND | KAFW | 668 | 32210,32211,32214 | cargo-charter |
| Cargo charter (KIND) | CRX617/618 | KIND | MMMX | 1385 | 32210,32211,32214 | cargo-charter |
| Cargo charter (KIND) | CRX619/620 | KIND | EBLG | 3684 | 32210,32214 | cargo-charter |
| Restored from update 7 | CRX137/138 | KTYQ | KHXD | 540 | 32199,32200,32201,32215 | executive |
| Restored from update 7 | CRX157/158 | KTYQ | KBKL | 226 | 32199,32200,32201,32215,32217,32216 | executive,short-hop |
| Restored from update 7 | CRX165/166 | KTYQ | MYNN | 1003 | 32200,32201,32215,32217,32216 | executive,international |
| Restored from update 7 | CRX167/168 | KTYQ | KJAC | 1112 | 32200,32201,32217,32216 | executive,ski |
| Restored from update 7 | CRX427/428 | KIND | KJAC | 1117 | 32202,32205,32206 | executive,ski |
| Restored from update 7 | CRX515/516 | KIND | PHNL | 3767 | 32205,32206,32208,32213 | executive,international |
| Restored from update 7 | CRX519/520 | KIND | MBPV | 1294 | 32202,32205,32206,32209,32203,32204,32207 | group-charter,international |
| Restored from update 7 | CRX527/528 | KVNY | PHNL | 2217 | 32202,32205,32206 | executive,international |
| Restored from update 7 | CRX315/316 | KIND | KPHL | 510 | 32203,32204,32207,32209,32208 | sports-charter |
| Restored from update 7 | CRX205/206 | KIND | KMSY | 616 | 32203,32204,32207,32209 | group-charter |

Fleet key: 32199 C510, 32200 CJ4, 32201 LJ35, 32215 PRM1, 32216 C750, 32217 H25B; 32202 Longitude, 32205 G650, 32206 G700, 32209 A220, 32208 A340, 32213 A380, 32203 E175, 32204 E190, 32207 757; 32210 MD-11F, 32211 A300F, 32214 777F.

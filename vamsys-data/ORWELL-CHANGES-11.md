# Orwell changes, round 11 (2026-11-11)

Round 11 is a quality pass on the route network and the pilot-portal content. Phase 1 (offline audit, files, drafts) ran while a VATSIM flight was in progress, so Chrome was not touched until the flight ended. Phase 2 (Orwell) results are under **Phase 2 status**.

No billing, staff, API key or security settings were changed. Nobody was invited or emailed, and no data was deleted.

## 1. Route network audit (offline)

`gen11.py` rebuilds the current network from every imported CSV (routes-import, updates 2-10, applied in order and keyed by callsign): **294 routes, 111 airports**. It checks each route's fleets against planning range and minimum runway (OurAirports data, as in gen8), and against the mountain rule.

| Check | Result |
| --- | --- |
| Missing return legs | none |
| Fleet mismatch between a route and its return | none |
| Light-jet range / runway / mountain violations | KTYQ-KEYW Mustang (956 nm > 950); Hawker/Citation X at KEYW 5,076 ft, KDTS 5,001 ft and KOSU 5,004 ft (under the 5,500 ft rule that already kept them out of KHXD) |
| A340-600 at short or GA fields | KVNY (8,001 ft), EGGW (7,086 ft), TNCM (7,546 ft) |
| Gulfstreams at London City | CRX539/540 EINN-EGLC: LCY needs steep-approach approval |
| Gulfstreams at Aspen | CRX407/408 KIND-KASE: Aspen's 95 ft wingspan limit excludes the G650 (99.6 ft) and G700 (103 ft) |
| A220 at Teterboro | CRX401/402: TEB's 100,000 lb weight limit excludes the A220-300 |
| Phenom 300E coverage | on 4 routes; 128 more light-jet routes are within its range (1,950 nm, 3,400 ft) |
| Duplicate city pair | KIND-KLAS appears twice (CRX203 group charter, CRX411 executive). Intentional, left alone |

**Flagged, not changed (owner's call):**

- **MD-11F to Leipzig (3,881 nm) and Liege (3,684 nm)** is over a full-payload MD-11F range. The Fleet Guide now says to reduce payload; the alternative is to drop 32210 from CRX607/608 and 619/620.
- **G700 at Teterboro** (MTOW about 107,600 lb is over the 100,000 lb limit; operators fly there with prior permission). It stays on CRX401/402 and CRX525/541.
- **G650/G700 at Santa Ana** (5,700 ft runway): realistic, since G650s use SNA every day. They stay.
- **KHPN-KBCT Mustang** (937 nm) is within 950 nm but tight.
- **EINN-EGLC is now a light-jet route in Europe.** Pilots reach Shannon by Jumpseat.

## 2. Route update 11 files

| File | Contents |
| --- | --- |
| `routes-update-11-edits.csv` | 142 edits by route ID: the Phenom (32220) added to 128 routes, the realism fixes in section 1, and the CJ4 on CRX415/416 KDAL-KVNY (owner's swap). 66 rows from updates 8/9 (and the 8 restored update-7 routes) had `NEEDID` until their Orwell IDs were read |
| `routes-update-11-new.csv` | 16 new routes (8 pairs, CRX733-748) |
| `routes-update-11-import.csv` | edits plus new routes, written by `gen11.py` once every ID is known |
| `airports-to-add-11.txt` | KMVY (Martha's Vineyard) |
| `summary11.tsv` | one line per change, with the reason |
| `val11.py` | validator: header (same as update 8), unique callsigns, edits keep pair and type, new callsigns unused, fleet IDs known (incl. 32220), airports known, and on the post-update network: returns with identical fleets, light-jet rules, Phenom present wherever eligible. **Result: no errors** |

New routes (all light/mid jets, with fleets from the same range, runway and mountain rules):

| Callsigns | Route | nm | Why |
| --- | --- | --- | --- |
| CRX733/734 | KTYQ-KIND | 19 | base-to-base positioning (tag `positioning`) |
| CRX735/736 | KTYQ-KMVY | 715 | Martha's Vineyard from base |
| CRX737/738 | KTEB-KMVY | 159 | the busiest summer executive pair out of New York |
| CRX739/740 | KVNY-KLAS | 199 | LA-Vegas shuttle |
| CRX741/742 | KAPA-KASE | 96 | Denver Centennial-Aspen ski shuttle (no Mustang or Premier) |
| CRX743/744 | KOPF-MYNN | 161 | Miami-Nassau |
| CRX745/746 | KHPN-KBCT | 937 | Westchester-Boca Raton |
| CRX747/748 | KMDW-KTEB | 619 | Chicago-New York |

Orwell route IDs: import 1 (14214036+), update 2 (14214095+) and update 5 (14214327/8) are confirmed. Update 7 new rows were derived as 14214789 + n from CRX415 = 14214835, and needed checking in Orwell. Updates 8 and 9 had to be read from Orwell.

## 3. Content drafts (`pages-11/`)

| Page | ID | Change |
| --- | --- | --- |
| Pilot Handbook | 3114 | Phenom added, KTYQ-KIND positioning leg, point-to-point shuttles, cold-and-dark flight flow, new **Flying on VATSIM** section (pilot at the controls, monitors and makes every call, human in the loop, no unattended/paused/accelerated aircraft, callsign/remarks, Code of Conduct) |
| Fleet Guide | 3115 | 19 fleets, Phenom 300E N300CR row and intro, airport restrictions section, MD-11F payload note |
| Route Guide | 3116 | Phenom, positioning tag, shuttles, Martha's Vineyard, Aspen/LCY notes, pointer to Featured Routes |
| Booking & PIREP Guide | 3117 | cold-and-dark start, VATSIM human-in-the-loop rule in Fly and in airline rules |
| Ranks & Milestones | 3119 | Phenom on the ski tour, new Crossroads Circuit tour |
| **Featured Routes** (new) | - | Charter of the Week (CRX113/114 Phenom launch) and six picks |
| Comms | - | `pages-11/comms-11.md`: Charter of the Week alert, 3 NOTAMs (Phenom in service, airport restrictions, VATSIM etiquette), Crossroads Circuit tour text and legs |

Every page keeps the "fictional virtual airline for flight simulation" disclaimer.

## Phase 2 status

### Routes: import 30348

| | |
| --- | --- |
| File | `routes-update-11-import.csv` (142 edits by ID + 16 new routes; includes the owner's CJ4 on CRX415/416 KDAL-KVNY) |
| Import | **#30348**, Routes, 11 Nov 26 18:13Z: **Rows 158 / Processed 158 / Successful 158** |
| Network | 294 routes before, **310 after** (new CRX733-748 = route IDs 14215249-14215264) |
| Route IDs | All 294 read from the Orwell routes list (`orwell-route-ids-2026-11-11.csv`). The derived update-7 IDs were partly wrong (for example CRX309 is 14214767, not 14214867), so the import uses only the IDs read from Orwell. Every edit ID was cross-checked against that list before import |
| Read-back | CRX539 EINN-EGLC now has Mustang, CJ4 and Phenom (Gulfstreams off). CRX415 has CJ4, Phenom, G650 and G700. CRX739-748 are in the list |

`IMPORT11_DONE` was created for the main session.

### Airports

- **KMVY** Martha's Vineyard: created as Orwell airport **907032** (Navigraph name MARTHA'S VINEYARD), logged in `airports-added-11.log`. Nothing was rejected.

### Custom pages (HQ > Pages > Custom Pages)

Sources are in `pages-11/*.md`, converted with `md2html.py` and set through the editor's Source Code dialog. Each page was read back in Phoenix after saving, and each keeps the fictional-airline disclaimer.

| ID | Page | Change | Read-back |
| --- | --- | --- | --- |
| 3114 | Pilot Handbook | Phenom, positioning leg, shuttles, cold-and-dark flow, new **Flying on VATSIM** section | "Flying on VATSIM" and "Phenom 300E (new)" visible at /phoenix/documents/handbook |
| 3115 | Fleet Guide | 19 fleets, Phenom section, airport restrictions | "Airport restrictions we follow" visible |
| 3116 | Route Guide | Phenom, shuttles, Martha's Vineyard, restrictions, Featured Routes pointer | "Point-to-point shuttles" visible |
| 3117 | Booking & PIREP Guide | cold-and-dark start, VATSIM human-in-the-loop rule | "Start cold and dark" visible |
| 3119 | Ranks & Milestones | Crossroads Circuit tour, Phenom on the ski tour | "Crossroads Circuit" visible |
| **3120** | **Featured Routes** (new, Documents, enabled, URL `/phoenix/documents/featured-routes`) | Charter of the Week (CRX113/114 Phenom launch) plus six picks and the tours | Page, table row CRX741/742 and disclaimer visible; it appears in the Documents menu |

The editor shows no "Saved" toast to UI Automation, so the Phoenix read-back is the proof of each save.

### Activities

| ID | Name | Window | Legs | Points |
| --- | --- | --- | --- | --- |
| **66748** | Crossroads Circuit | 11 Nov 2026 to 31 Dec 2027 (registration the same) | KTYQ-KSDF-KTYQ-KMDW-KTYQ-KCMH-KTYQ-KBNA-KTYQ (8 legs) | 300, placeholder badge on |

### Comms

| Type | ID | Title | Settings |
| --- | --- | --- | --- |
| Alert | 4543 | Charter of the Week: Phenom 300E launch, CRX113 KTYQ-Dallas Love | Info, Phoenix dashboard, permanent. It shows on the dashboard. Replace it weekly (no end date was set) |
| NOTAM | 6293 | Phenom 300E N300CR in service | Info, Low, tag `fleet` |
| NOTAM | 6294 | Airport restrictions now applied to the route network | Info, Low, tag `operations` |
| NOTAM | 6295 | Flying Crossroads on VATSIM | Info, Low, tag `vatsim` |

None is must-read. All three NOTAMs were read back at /phoenix/notams.

### FedEx Virtual Air Cargo look-and-feel study (read only)

Looked at as pilot FDX2317 through Phoenix (Select Virtual Airline), plus the public pages `vamsys.io/login/fedexvac`, `vamsys.io/register/fedexvac` and flyfdx-vac.org. Nothing was changed in FedEx's airline, and the browser was switched back to Crossroads afterwards (confirmed: CRX0001 dashboard).

| What FedEx VAC does | Where it is set in vAMSYS | Crossroads now |
| --- | --- | --- |
| Brand-coloured Phoenix: purple top bar, orange accents, orange plane icons on the map | HQ > Settings > **Style Settings** colour overrides, plus an uploaded CSS stylesheet for the heavier restyling (upper-case card headers, coloured buttons) | Colour overrides set (below). **No CSS stylesheet uploaded** (see Skipped) |
| Large hero banner at the top of the dashboard (seasonal artwork with name and slogan) | Phoenix Dashboard: Image component (or Picture Board) | Hero banner added, rendered from the brand assets |
| Full-width orange "Join our communication center" Discord button | Dashboard Buttons / custom button | Not added: Crossroads has no Discord (`discord_url` is null) |
| Pilot statistics tiles and recent PIREP boxes side by side | Pilot Statistics + PIREP and Booking Boxes | Already present |
| Three branded image buttons (Book your flight, Events, Itinerary generator) | Image components with a link URL | Three branded tiles: Book Your Flight, Featured Routes, Pilot Handbook |
| "N live flights" table | Flight List component | Already present |
| **Large live map as a globe with big orange aircraft icons**, full page width at the bottom | Flight Map component in a Full Block with a Map Height; icon colour from Style Settings > Plane Icon | Added: full-width Flight Map, 650 px, orange icons. It renders as a globe |
| Extra sidebar links (Pilot Support, Discord, SOPs, Itinerary Generator) | Custom pages with "Page links to external URL", Resources category | Not added (no external resources to link yet) |
| Public login/register pages with logo, background and slogan; registration open to anyone | Logo Settings, Basic Settings, Pilot Registration | Logo, background and slogan already set. `vamsys.io/register/crossroads` redirects to the login page: public registration is not open, which looks tied to the trial ("VA Under Trial due to end 2026-11-24"). No setting for it exists under Pilot Registration |

**Not a setting:** there is no aircraft-icon size or map-style option anywhere in Orwell. FedEx's icons look large because its map is big and zooms in on the live flights. The Crossroads map now has the same size and behaviour; with no flight in progress it shows the whole globe.

### Style Settings (HQ > Settings > Style Settings)

| Field | Before | After |
| --- | --- | --- |
| Menu Item Active - Light / Dark | empty | `#b9501f` / `#f29a6c` |
| Menu Item Hover - Light / Dark | empty | `#e8703a` / `#e8703a` |
| Plane Icon - Light / Dark | empty | `#e8703a` / `#e8703a` (brand orange, as on the logo) |
| Body Background - Light | empty | `#f7f9fa` |
| Menu Background - Dark | empty | `#1b2328` |
| Top Bar Background - Dark | empty | `#141b20` |

Read-back: the active menu item in Phoenix is now orange. Two vAMSYS quirks to know: the form only shows some saved values after a reload (they reappear once any field is edited), and **Card Background - Dark is also applied to table footers in light mode**, so it and Body Background - Dark were set and then cleared again. Colour fields only register when typed; values set programmatically are dropped on save.

### Phoenix Dashboard (HQ > Pages > Phoenix Dashboard)

Artwork is in `brand/png/dashboard/` (script `brand/render-dashboard-banner.py`).

| Change | Detail |
| --- | --- |
| Hero banner | New Image component after the Buttons row, left column: `crossroads-dashboard-hero-1600x520.jpg` (logo, "Executive and charter flying from the Crossroads of America", fictional-airline line) |
| Featured Routes tile | The default layout's empty Image component (bottom of the left column) now holds `crossroads-tile-featured-800x200.png`, linked to /phoenix/documents/featured-routes |
| Right-column tiles | Two Image components: Book Your Flight (/phoenix/flight-center/book) and Pilot Handbook (/phoenix/documents/handbook) |
| Big map | New row, Full Block, Flight Map with Map Height 650 |
| Small map | The Flight Map in the right column is **hidden** (Hide Component), not deleted |
| PIREP and Booking Boxes | "Header Items" was empty for both boxes, which blocked every save of the dashboard ("must be at least 1"). Callsign is now ticked for both |

Read-back in Phoenix: hero, three tiles, flight list and the globe map all render. The two right-column tiles sit apart (one at the top, one at the bottom of the column) because the column stretches to the height of the left one; the owner may prefer to move them in the editor.

### Website (repo rshacks9/crossroads-executive-charter)

- `sync/tools/build_preview.py`: applies updates 9, 10 and 11, keyed by callsign (the later files carry real Orwell IDs); adds KMVY and the Phenom fleet. Preview is now **310 routes, 19 fleets, 112 airports**.
- `runways.json` rebuilt for KMVY; `fuel_profiles.json` gets a Phenom planning profile; `site.config.json` lists E55P (FSReborn Phenom 300E).
- `site/src/content.ts`: Phenom fleet entry, Crossroads Circuit tour, three news items (Phenom, update 11 and airport restrictions, the new tour); FAQ line on VATSIM etiquette.
- Tests: sync 49 passed, site 54 passed.

### Skipped or left for the owner

- **CSS stylesheet** (the rest of FedEx's look: coloured buttons, alert colour, upper-case card headers). It needs Phoenix's class names and a visual check on every page, so it was not uploaded blind. The buttons and alert boxes are still vAMSYS blue.
- **Rank image for "Staff Team":** the top bar shows an "85 x 36" placeholder where FedEx shows a rank epaulette. Ranks belong to HQ > Rewards and were not touched.
- **Alerts 4541 and 4542 are stale** (4541 lists the KTYQ types without the Phenom; 4542 says 292 routes). They were not edited. Alert 4543 has no end date.
- **Hero position:** the banner is under the three buttons and two-thirds wide, not full width at the very top as on FedEx. The builder only reorders by drag, which was not attempted.
- **Public registration, Discord button, extra sidebar links:** see the table above.
- **MD-11F to Leipzig and Liege, G700 at Teterboro:** flagged in section 1, not changed.

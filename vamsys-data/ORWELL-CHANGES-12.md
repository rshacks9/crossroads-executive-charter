# Orwell changes, round 12 (2026-11-11)

Round 12 is the look-and-feel pass that round 11 left open: the Phoenix stylesheet, the dashboard arrangement, rank images, stale alerts and a few extras. The reference is FedEx Virtual Air Cargo's Phoenix dashboard, looked at read-only and left unchanged.

No billing, plan, staff, API key or security settings were touched. Nothing was deleted: superseded dashboard components are hidden. Rank requirements were not changed.

Screenshots of the result are not in this repository.

## 1. CSS stylesheet (HQ > Settings > Style Settings > Stylesheet)

| | Before | After |
| --- | --- | --- |
| CSS File | none | `brand/phoenix-crossroads.css` v1.1 (5 KB), stored by vAMSYS as `01M762J5NXCE3YT51VSQV234KQ.css` for v1.0 and replaced by v1.1 |
| Colour overrides | round 11 values | unchanged (re-typed before each save, see quirks) |

How the class names were obtained (nothing guessed): the page source of the Crossroads dashboard, handbook and profile pages (view-source), the public vAMSYS app stylesheets on `assets.vamsys.io` (build b3c542f), and FedEx VAC's own uploaded stylesheet, which is public on `cdn.vamsys.xyz`. vAMSYS loads the uploaded file into a `custom-va-style` element after its own CSS.

What the stylesheet does:

| Area | Change | Contrast |
| --- | --- | --- |
| `--primary` scale | vAMSYS blue replaced by brand orange; buttons, tab underline and links follow | white on `#b9501f` 4.9:1, on `#a94619` 5.9:1 |
| Top bar (`.app-header`) | ink `#1b2328` in both modes with an orange rule; the dark-background logo is shown in light mode too | on-ink text 14:1 |
| Sidebar | active item gets an orange edge and tint | unchanged text colours |
| Alert boxes (`main .alert.alert-info`) | ink panel with orange left edge instead of blue | 14:1 |
| Cards (`.card > .card-header`) | ink header, white upper-case title (Live Flights, Rank Tracker, document pages) | white on ink 15:1 |
| Statistic tiles (`.fi-section`) | orange top rule, small upper-case headings | n/a |
| Tabs, table headings | upper-case, letter-spaced | n/a |
| Booking box, info buttons | ink instead of blue | white on ink |
| Dark mode | lighter orange for primary text, lighter tab labels | `#f29a6c` on the dark card about 7:1 |

Checked visually in light and dark mode on the dashboard, NOTAMs, routes, PIREPs, profile, events and handbook pages, and the UTC clock dropdown. Nothing rendered broken, so the upload stays.

Two things found on the way:

- **v1.0 was rejected** ("must be a file of type: text/css") because a comment contained an HTML tag and the server sniffed the file as HTML. The file must not contain angle-bracket tags (noted in its header).
- **Dark mode needs a page reload** after the lightbulb is clicked. That is vAMSYS behaviour, not the stylesheet.

To remove the stylesheet: Style Settings, scroll to Stylesheet, click the X on the file, re-type the five colour values listed under quirks, Save.

## 2. Phoenix Dashboard (HQ > Pages > Phoenix Dashboard)

FedEx's arrangement, read from its page source: full-width hero and one button; statistics (half) beside PIREP boxes (half); three image tiles in thirds; full-width live-flight list and a 600 px map.

**Before:** one row holding a two-thirds block (buttons, hero, statistics, alerts, boxes, NOTAMs, social icons, Featured tile), a third block (events, hidden small map, Book and Handbook tiles) and a full block (flight list); then a row with the 650 px map.

**After (what pilots see, top to bottom):**

| Row | Blocks | Components |
| --- | --- | --- |
| new | Full | Hero image `crossroads-dashboard-hero-1600x520.jpg`, Buttons (booking, events, PIREPs) |
| new | Half + Half | Pilot Statistics (All Time) / PIREP and Booking Boxes (Bookings, Past PIREPs, 5 items, header: callsign), Social Icons, Events (slideshow of all activities) |
| new | Third x3 | Tiles: Book Your Flight (/phoenix/flight-center/book), Featured Routes (/phoenix/documents/featured-routes), Pilot Handbook (/phoenix/documents/handbook), all same tab |
| new | Full | Alerts, NOTAMs (5 per page, only when unread, as before) |
| new | Full | Flight List |
| existing | Full | Flight Map, 650 px (unchanged) |

**How it was done, and what is left in the builder:** the builder only drags within one list (rows among rows, blocks within a row, components within a block), so nothing can be dragged from the old two-thirds block into a full-width block. The new rows were therefore built with "Insert Between Rows" and every component of the old first row is now set to **Hide Component** (13 components: 12 switched in this round, the small map was already hidden; none deleted). The old row is still the first row in the builder and renders nothing. Two more hidden leftovers are in the new rows (an Alerts under the hero and a NOTAMs under the statistics, both moved to the full-width row).

**Not done:** dragging the hidden old row to the bottom of the builder. It is cosmetic (builder tidiness and a few pixels of extra space above the hero). It needs a zoomed-out long drag with auto-scroll, so it was left for later. No drag was performed at all in this round; the target layout did not need one.

**Not a setting:** icon size and map centre. With no flight in progress the globe shows Africa and Europe; with live flights it zooms to them, as on FedEx.

## 3. Rank images (HQ > Rewards > Ranks)

New set `brand/png/ranks/v2/` (170x72, twice the recommended 85x36), drawn by `brand/render-rank-icons-v2.ps1`: the same shoulder boards as before plus a slate outline so the ink board is visible on the ink top bar.

| Rank | ID | Before | After |
| --- | --- | --- | --- |
| Cadet | 30793 | placeholder | `rank-0-cadet.png` (1 stripe) |
| Staff Team | 30794 | placeholder ("85 x 36" in the top bar) | `rank-staff-team.png` (orange STAFF band and star) |
| First Officer | 30810 | v1 image | `rank-1-first-officer.png` |
| Captain | 30811 | v1 image | `rank-2-captain.png` |
| Senior Captain | 30812 | v1 image | `rank-3-senior-captain.png` |
| Charter Captain | 30813 | v1 image | `rank-4-charter-captain.png` |
| Chief Pilot | 30814 | v1 image | `rank-5-chief-pilot.png` |

Only the Rank Icon field was changed. The list was read back afterwards: hours and PIREP requirements are as before (10/5, 25/15, 75/40, 150/80, 300/150).

## 4. Alerts (Operations > Comms > Alerts)

| ID | Before | After |
| --- | --- | --- |
| 4541 | "... (Mustang, Premier, Learjet 35A, CJ4, Hawker 800XP, Citation X) ..." | "... (Mustang, Premier, Learjet 35A, CJ4, Phenom 300E, Hawker 800XP, Citation X) ..." |
| 4542 | title and text say 292 routes | title "Network update: 310 routes, ski season, the Caribbean and Europe"; text "Our network grew to 310 routes on 11 November." |
| 4543 | no end date | Stop Showing 18 Nov 2026 23:59Z |

All three were read back (alerts list and the dashboard). Left alone: alert 4542 still lists London City among the G650/G700 trips, which round 11 moved to light jets.

## 5. Extras

| What | Detail |
| --- | --- |
| Sidebar links | Two Standalone custom pages that link out: **3121 Featured Routes** (icon `route`) and **3122 Pilot Handbook** (icon `book-open`), enabled, pointing at the existing Documents pages. They show as top-level sidebar items, as FedEx's Pilot Support and SOP links do |
| Tours were invisible | All three tours had an empty **Show from**, which vAMSYS treats as hidden: Phoenix > Events said "No Events to Show". Show from is now the tour's start for 66693 Ski Season Tour, 66694 Across the Pond and 66748 Crossroads Circuit. Start, end and registration dates were not changed |
| Tour banners | `brand/png/tours/crossroads-tour-*-1200x500.jpg` (script `brand/render-tour-banners.ps1`) uploaded as the Image of each tour. They show on the Events page and in the dashboard Events slideshow |

## Could not be done, or not verified

- **Badge image for tour 66748.** The tour form has only a "View Activity Badge" button; clicking it opened nothing visible, and there is no badge section under HQ > Rewards. The badge image was not changed.
- **Event or other activity entries** were not created: there is nothing real to announce, and the three tours now fill the Events page.
- **Plan-gated:** public registration (`vamsys.io/register/crossroads` still redirects to login during the trial, as in round 11). Nothing else attempted in this round was blocked by the trial.
- **Discord button:** still none; Crossroads has no Discord.
- **Not verified:** how the pages look on a phone or a wide monitor (only one desktop window size was checked); the stylesheet on Phoenix pages that were not opened (booking map, rosters, statistics, claims); whether the stylesheet also applies to the public login page.
- **Repo:** the new brand files and this document were committed after the round, on 2026-11-11. They are records and source artwork: the site build reads none of them, so the public site did not change.

## vAMSYS quirks worth knowing

- Style Settings shows only some saved colour values after a reload. Before every save, re-type: Menu Item Active `#b9501f` / `#f29a6c`, Menu Item Hover `#e8703a` / `#e8703a`, Body Background Light `#f7f9fa`.
- File fields (stylesheet, rank icon, images) only turn into an upload control once scrolled into view; before that they look empty even when a file is stored.
- Leaving a form with unsaved changes raises the browser's "Leave site?" dialog.
- Date-time fields: type the digits segment by segment and press Right after the year (it accepts six digits).
- Tour forms have three "Set to Now" buttons (start, show from, registration start) and per-leg "Show from" fields; use "Copy Start" next to Show From.

## For the owner

- Decide whether the hidden old row should be dragged to the bottom of the dashboard builder or deleted.
- Replace the Charter of the Week alert before 18 November.

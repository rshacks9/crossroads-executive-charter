# Crossroads Executive & Charter: public website

The public face of the airline: home page with live stats, a live flight map, fleet (with livery
renders), route network filtered by division/base/aircraft, divisions and services with sample
itineraries, career and ranks, a how-to-fly walkthrough, the pilot handbook and SOPs, an about page,
and news/NOTAMs plus vAMSYS events. Light and dark themes.

Data-driven pages (all generated in the browser from `snapshot.json`, logic in `site/src/explore.ts`,
tests in `explore.test.ts` and `pages.test.tsx`): an interactive route explorer (`#/routes`, click an
airport for its great circles), a page per destination (`#/airport/KASE`, runways from `crew.json`), a
page per aircraft type with a planning-range ring (`#/fleet/C750`), a page per route with SimBrief and
vAMSYS links (`#/route/CRX101`), a charter planning tool (`#/plan`), pilot resources with generated
briefing cards and a schedule CSV (`#/resources`), network stats (`#/stats`), site search (Ctrl+K or
Cmd+K) and a 404 page. Its data comes from vAMSYS, so the site updates itself as pilots
fly. Joining, booking and PIREPs stay in vAMSYS. This site links there and never duplicates them.

```
vAMSYS Operations API ──(ops:read, every 20 min)──> sync/ ──> site/public/data/snapshot.json ──> static site
        secrets stay here ┘                       allowlisted public fields only
```

## Layout

| Path | What it is |
| --- | --- |
| `site.config.json` | Airline name, tagline, join/login/Discord links, `show_pilot_names`, the weekly group flight |
| `sync/crossroads_sync/` | Builds the snapshot. `snapshot.py` is the allowlist; `fetch.py` makes the GET calls |
| `sync/vamsys/` | Kimi's read-only vAMSYS client, vendored unchanged from `va-website/infrastructure/vamsys` |
| `site/` | Vite + React + TypeScript static site; Leaflet map on OpenStreetMap tiles |
| `site/src/content.ts` | Editorial content vAMSYS doesn't hold: aircraft roles and planning figures, sample itineraries, SOPs, news. No statistics or member claims |
| `sync/crossroads_sync/crew.py` | Builds `crew.json` for the Crew Tools page (see below) |
| `sync/kimi_tools/` | Kimi's Jumpseat calculation modules (weather, fuel, performance, approach), vendored unchanged |
| `.github/workflows/sync-deploy.yml` | Test → pull vAMSYS → build → deploy to GitHub Pages, on a schedule |
| `site/src/html-facts.ts` | The page title and descriptions, written from the snapshot's counts. `site/vite.config.ts` fills them into `site/index.html` at build time and the app uses the same functions, so no count is typed by hand |
| `.github/workflows/screenshots.yml` | Screenshots and page checks at phone, desktop and wide-monitor sizes, plus the link-preview card. Never deploys (see below) |
| `site/tools/shots.mjs` | The capture script that job runs |
| `brand/` | Logo, rank, tour and link-preview artwork, with the scripts that draw it |

## Crew Tools (`#/crew`)

A ready-made briefing for every route and aircraft type, rebuilt by the same 20-minute job:

- **Weather**: live METAR and TAF from aviationweather.gov for every airport in the network, parsed
  with Kimi's `weather.parse_metar`, plus flight category.
- **Runway winds**: head/tail/crosswind for every runway end (`weather.calculate_crosswind`), using
  OurAirports runway data (public domain, `sync/tools/build_runways.py` rebuilds `runways.json`).
  The preferred runway is the one with the best headwind and least tailwind/crosswind.
- **Fuel estimate**: phase-by-phase fuel from Kimi's `fuel_core.calculate_trip` with the planning
  profiles in `fuel_profiles.json`. These are estimates; pilots dispatch with SimBrief.
- **Approach card**: 3° glide path gates at 10/5/3/1 nm, Vapp and descent rate from Kimi's
  `approach.build_briefing`.

If the weather service is down the job still deploys (`crew=no-weather` in the log) and the page
shows briefings without weather. Set `CROSSROADS_NO_WEATHER=1` to skip the fetch. For flight
simulation only.

## Run it locally

```bash
cd sync
python -B -m unittest discover -s tests -t .
python -B -m crossroads_sync --sample --config ../site.config.json --output ../site/public/data/snapshot.json

cd ../site
npm install
npm test
npm run dev        # http://localhost:5180
```

Live data locally: set `VAMSYS_CLIENT_ID` and `VAMSYS_CLIENT_SECRET` in your shell (never in a file
here), then run the same command without `--sample`. Re-run the `--sample` command before
committing, so the committed snapshot stays fictional.

## Screenshots and page checks

`.github/workflows/screenshots.yml` builds the site from the schedule preview and never deploys. It
runs the site and sync unit tests (the same ones as the deploy workflow), then captures every page at
phone (390 px), desktop (1366 px) and wide-monitor (2560 px) widths, the main pages in dark mode too,
and records sideways overflow (against the configured width, so a phone that widens its window to fit
a page still counts), console errors, failed requests, broken images and axe accessibility findings.
The result is the `screenshots` artifact (page slices, overview sheets, `report.json`, `summary.md`)
and the run summary.

- Run it by pushing a branch named `shots/<anything>`, or from the Actions tab (Run workflow). Give
  the `url` input the live address to check what is deployed instead of a fresh build.
- Layout and accessibility findings are reported, not failed on. The job fails when a unit test
  fails, when a capture errors or when the page head is wrong: a placeholder left unfilled, a count
  that differs from the data, or a title or description that changes once the app has loaded.
- A second job renders the link-preview card and uploads it as the `share-image` artifact.
  `brand/README.md` says how to change the card.

## Go live (one-time)

1. **vAMSYS client.** In Orwell: Settings → API → API v3 → New Client, grant type *Client
   Credentials*, scope `ops:read` only.
2. **Repository.** Push this folder to its own GitHub repository. A public repo gets unlimited free
   Actions minutes. A private one gets 2,000 free minutes a month, which runs every 20 min would
   exceed, so change the cron to hourly (`0 * * * *`) there.
3. **Secrets.** Repository → Settings → Secrets and variables → Actions: add `VAMSYS_CLIENT_ID` and
   `VAMSYS_CLIENT_SECRET`.
4. **Pages.** Repository → Settings → Pages → Source: *GitHub Actions*. Run the workflow once from the
   Actions tab. Add a custom domain there if you have one.
5. **Links.** Fill `pilot_login_url` and `discord_url` in `site.config.json` (https only).
   `join_url` says whether pilot registration is open. Set it to `https://vamsys.io/register/crossroads`
   once that page shows the vAMSYS sign-up form; every "Register on vAMSYS" button and the footer link
   then go straight to it. While it is unset the join buttons read "How to join" and open the Fly with
   us page (`#/pilots`), which says registration isn't open yet. On 2026-11-12 the register page
   redirected to the vAMSYS sign-in page, so `join_url` stays unset until that changes.
6. **Group flight.** `group_flight` holds the weekly group flight's weekday and UTC start time
   (`{"weekday": "Sunday", "utc": "20:00"}`). The News page shows it in UTC and Indianapolis time
   (15:00 in winter, 16:00 in summer) while vAMSYS lists no events, and until `join_url` is set it
   says the group flight starts once registration opens. Remove the entry to show no group flight.

## Privacy and safety

- Only fields named in `snapshot.py` reach the site. Internal remarks and notes, pilot IDs, SimBrief
  settings and NOTAMs are never copied. Tests check this.
- Pilot usernames on the live map are **off** unless `show_pilot_names` is exactly `true`. Turn it
  on only if your pilots have agreed to it.
- Hidden fleets, hidden aircraft and hidden routes stay hidden. Only accepted PIREPs appear.
- Rich text from vAMSYS is reduced to plain text, and only `https://` image/link URLs are kept.
- If a required call (fleet, airports, routes, hubs, ranks) fails, the job fails and the last good
  site stays up. Optional sections (stats, live map, events, recent flights) are hidden and flagged
  if their call fails.

## Not yet verified against a live vAMSYS airline

These were built from the published OpenAPI document (v3.0.0) with no real credentials yet. Check
them on the first live run:

- Units: PIREP `flight_length` treated as seconds, route `flight_length` as `HH:MM[:SS]`, distances as nm.
- `page[size]=100` is accepted (override with `CROSSROADS_PAGE_SIZE` if vAMSYS rejects it).
- Route `departure_time` timezone (shown without a zone).
- Empty `service_days` shown as "Daily".

## Map tiles

The map uses OpenStreetMap's standard tile server, which is free with attribution for light use. If
traffic grows, switch the URL in `site/src/LiveMap.tsx` to a hosted provider (MapTiler, Stadia,
Thunderforest) with your own key.

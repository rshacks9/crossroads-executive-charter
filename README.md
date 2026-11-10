# Crossroads Executive & Charter: public website

The public face of the airline: home page with live stats, a live flight map, fleet, route network,
pilot ranks and hubs, and events. Its data comes from vAMSYS, so the site updates itself as pilots
fly. Joining, booking and PIREPs stay in vAMSYS. This site links there and never duplicates them.

```
vAMSYS Operations API ──(ops:read, every 20 min)──> sync/ ──> site/public/data/snapshot.json ──> static site
        secrets stay here ┘                       allowlisted public fields only
```

## Layout

| Path | What it is |
| --- | --- |
| `site.config.json` | Airline name, tagline, join/login/Discord links, `show_pilot_names` |
| `sync/crossroads_sync/` | Builds the snapshot. `snapshot.py` is the allowlist; `fetch.py` makes the GET calls |
| `sync/vamsys/` | Kimi's read-only vAMSYS client, vendored unchanged from `../va-website/infrastructure/vamsys` |
| `site/` | Vite + React + TypeScript static site; Leaflet map on OpenStreetMap tiles |
| `.github/workflows/sync-deploy.yml` | Test → pull vAMSYS → build → deploy to GitHub Pages, on a schedule |

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
5. **Links.** Fill `join_url`, `pilot_login_url` and `discord_url` in `site.config.json` (https only).
   Until `join_url` is set, the Join buttons point at the Pilots page instead.

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

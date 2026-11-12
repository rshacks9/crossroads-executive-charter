import { useCallback, useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { AirlineEvent, Division, FleetType, LiveFlight, Route, Snapshot } from "./data";
import {
  POINT_TO_POINT,
  filterRoutes,
  formatCompact,
  formatDate,
  formatFeet,
  formatNumber,
  formatWeight,
  hashParam,
  networkFacts,
  progressPercent,
  relativeAge,
  routeBase,
  routeInDivision,
} from "./data";
import { FLEET_INFO, NEWS, PEGASUS_URL, SERVICES, baseFor } from "./content";
import type { NewsItem } from "./content";
import { LiveMap, divisionColor } from "./LiveMap";
import { ExploreMap } from "./ExploreMap";
import { ExplorerPanel, RouteTable } from "./explore-pages";
import { airportHref, divisionBaseLabel, mapLegendKeys, networkStats, routeHref, typeHref } from "./explore";

export interface PageProps {
  snapshot: Snapshot;
}

// ------------------------------------------------------------------ shared bits

export function SectionHead({ eyebrow, title, action, intro }: { eyebrow: string; title: string; action?: { href: string; label: string }; intro?: string }) {
  return (
    <div className="section-head">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h2>{title}</h2>
        {intro ? <p className="section-intro">{intro}</p> : null}
      </div>
      {action ? <a className="text-link" href={action.href}>{action.label} →</a> : null}
    </div>
  );
}

export function PageHeader({ eyebrow, title, lede, children }: { eyebrow: string; title: string; lede?: string; children?: ReactNode }) {
  return (
    <header className="page-header">
      <div className="page-header__inner">
        <p className="eyebrow eyebrow--on-ink">{eyebrow}</p>
        <h1 className="page-title">{title}</h1>
        {lede ? <p className="page-header__lede">{lede}</p> : null}
        {children}
      </div>
    </header>
  );
}

export function Leg({ from, to, snapshot }: { from: string; to: string; snapshot: Snapshot }) {
  const a = snapshot.airports[from];
  const b = snapshot.airports[to];
  return (
    <span className="leg">
      <abbr title={a?.name ?? from}>{from}</abbr>
      <span className="leg__arrow" aria-label="to">→</span>
      <abbr title={b?.name ?? to}>{to}</abbr>
    </span>
  );
}

function Progress({ flight }: { flight: LiveFlight }) {
  const pct = progressPercent(flight);
  if (pct === null) return <span className="muted">—</span>;
  return (
    <span className="progress" role="img" aria-label={`${pct}% complete`}>
      <span className="progress__bar" style={{ width: `${pct}%` }} />
    </span>
  );
}

export function bases(snapshot: Snapshot): string[] {
  return [...new Set(snapshot.hubs.flatMap((hub) => hub.airports))];
}

/**
 * Where new pilots sign up: the vAMSYS application when join_url is set, otherwise the airline's
 * vAMSYS sign-in page (it carries the Register link), otherwise the Fly-with-us page.
 */
export function joinHref(snapshot: Pick<Snapshot, "airline">): { href: string; external: boolean } {
  const { join_url, pilot_login_url } = snapshot.airline;
  if (join_url) return { href: join_url, external: true };
  if (pilot_login_url) return { href: pilot_login_url, external: true };
  return { href: "#/pilots", external: false };
}

export const REGISTER_LABEL = "Register on vAMSYS";

export function JoinButton({ snapshot, label = REGISTER_LABEL, quiet = false }: { snapshot: Snapshot; label?: string; quiet?: boolean }) {
  const join = joinHref(snapshot);
  return (
    <a className={`button${quiet ? " button--ghost" : ""}`} href={join.href} rel={join.external ? "noopener" : undefined}>
      {label}
    </a>
  );
}

function divisionFor(snapshot: Snapshot, code: string): { division: Division; index: number } | null {
  const index = snapshot.airline.divisions.findIndex((d) => d.fleets.includes(code));
  return index >= 0 ? { division: snapshot.airline.divisions[index]!, index } : null;
}

export function DivisionDot({ index }: { index: number }) {
  return <span className="division-dot" style={{ background: divisionColor(index) }} aria-hidden="true" />;
}

export function shortName(name: string): string {
  return name.replace(/^(Cessna|Airbus|Embraer|Boeing|Gulfstream|McDonnell Douglas|Beechcraft) /, "");
}

/** Key for a route map: only the division colours, and the dashed cargo line, that it draws for `routes`. */
export function MapLegend({ snapshot, routes }: { snapshot: Snapshot; routes: Route[] }) {
  const divisions = snapshot.airline.divisions;
  if (!divisions.length) return null;
  const keys = mapLegendKeys(routes, divisions, snapshot.airports);
  const drawn = keys.divisions.filter((i) => i < divisions.length);
  if (!drawn.length && !keys.cargo) return null;
  return (
    <ul className="legend" aria-label="Map legend">
      {drawn.map((i) => (
        <li key={divisions[i]!.name}><DivisionDot index={i} />{divisions[i]!.name}</li>
      ))}
      {keys.cargo ? <li><span className="legend__dash" aria-hidden="true" />Cargo routes dashed</li> : null}
    </ul>
  );
}

function LiveUnavailable({ snapshot }: PageProps) {
  return snapshot.unavailable.includes("flight_map") ? (
    <p className="callout">Live tracking is temporarily unavailable. It will return on the next data refresh.</p>
  ) : null;
}

function FlightCard({ flight, snapshot }: { flight: LiveFlight; snapshot: Snapshot }) {
  return (
    <li className="flight-card">
      <div className="flight-card__top">
        <strong className="callsign">{flight.callsign ?? flight.flight_number ?? "Flight"}</strong>
        <span className="phase">{flight.phase ?? "En route"}</span>
      </div>
      <Leg from={flight.from} to={flight.to} snapshot={snapshot} />
      <Progress flight={flight} />
      <p className="flight-card__meta">
        {flight.aircraft ?? "Aircraft"} · {formatFeet(flight.altitude_ft)}
        {flight.groundspeed_kt != null ? ` · ${flight.groundspeed_kt} kt` : ""}
        {flight.pilot ? ` · ${flight.rank ? `${flight.rank} ` : ""}${flight.pilot}` : ""}
      </p>
    </li>
  );
}

export function EventItem({ event }: { event: AirlineEvent }) {
  const start = event.start ? new Date(event.start) : null;
  const valid = start && !Number.isNaN(start.getTime());
  return (
    <li className="event">
      <div className="event__date" aria-hidden={valid ? "true" : undefined}>
        {valid ? (
          <>
            <span>{start.toLocaleString("en-US", { month: "short" })}</span>
            <strong>{start.getDate()}</strong>
          </>
        ) : (
          <strong>TBA</strong>
        )}
      </div>
      <div className="event__body">
        <h3>{event.name}</h3>
        <p className="event__when">
          {event.start ? formatDate(event.start, true) : "Date to be announced"}
          {event.end && event.start && event.end.slice(0, 10) !== event.start.slice(0, 10) ? ` – ${formatDate(event.end)}` : ""}
        </p>
        {event.description ? <p>{event.description}</p> : null}
        <p className="tags">
          {event.kind ? <span className="tag">{event.kind.replace(/-/g, " ")}</span> : null}
          {event.tags.filter((t) => t.toLowerCase() !== event.kind?.replace(/-/g, " ").toLowerCase()).map((tag) => (
            <span className="tag" key={tag}>{tag}</span>
          ))}
          {event.points ? <span className="tag tag--accent">{event.points} pts</span> : null}
          {event.registration_required ? <span className="tag">Registration required</span> : null}
        </p>
      </div>
    </li>
  );
}

export function NewsCard({ item, compact = false }: { item: NewsItem; compact?: boolean }) {
  const date = new Date(`${item.date}T12:00:00Z`);
  return (
    <li className={`news-card news-card--${item.kind.toLowerCase()}`}>
      <p className="news-card__meta">
        <span className="news-card__kind">{item.kind}</span>
        <time dateTime={item.date}>{date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })}</time>
      </p>
      <h3>{item.title}</h3>
      {!compact ? <p>{item.body}</p> : null}
      {item.link ? <a className="text-link" href={item.link.href}>{item.link.label} →</a> : null}
    </li>
  );
}

function airframes(snapshot: Snapshot): number {
  return snapshot.fleet.reduce((sum, f) => sum + f.aircraft_count, 0);
}

// ------------------------------------------------------------------ home

/** The first accepted PIREPs, from the launch announcement. Shown only until vAMSYS supplies recent flights. */
const FIRST_FLIGHTS = [
  { callsign: "CRX115", from: "KTYQ", to: "KMDW", aircraft: "Premier IA" },
  { callsign: "CRX116", from: "KMDW", to: "KTYQ", aircraft: "Citation Mustang" },
  { callsign: "CRX121", from: "KTYQ", to: "KBDL", aircraft: "Citation X" },
];

export function HomePage({ snapshot }: PageProps) {
  const { airline, stats, live, recent_flights: recent, fleet } = snapshot;
  const facts = networkFacts(snapshot);
  const all = stats.all_time;
  const month = stats.last_30_days;
  const baseList = bases(snapshot);
  const e190 = FLEET_INFO.E190?.livery;

  return (
    <>
      <section className="hero">
        <div className="hero__inner">
          <div className="hero__copy">
            <p className="eyebrow eyebrow--on-ink">Virtual airline · Indianapolis, Indiana</p>
            <h1>{airline.name}</h1>
            {airline.tagline ? <p className="hero__lede">{airline.tagline}</p> : null}
            <p className="hero__pitch">
              From the four-seat Citation Mustang to a 150-seat executive A380 and the 777F: {facts.aircraftTypes} aircraft types, {facts.routes} routes from two Indianapolis bases, and one career path.
            </p>
            <div className="hero__actions">
              <JoinButton snapshot={snapshot} />
              <a className="button button--ghost" href={live.length ? "#/live" : "#/routes"}>
                {live.length ? `${live.length} ${live.length === 1 ? "flight" : "flights"} in the air` : "Explore the network"}
              </a>
            </div>
          </div>
          <aside className="hero__panel" aria-label="Our two bases">
            <p className="hero__panel-title">Two bases, one airline</p>
            {baseList.map((icao) => {
              const airport = snapshot.airports[icao];
              const routes = snapshot.routes.filter((r) => routeBase(r, baseList) === icao).length;
              const types = fleet.filter((f) => baseFor(f.code) === icao).length;
              return (
                <div key={icao} className="hero__base">
                  <strong>{icao}</strong>
                  <span>{airport?.name ?? icao}</span>
                  <span className="hero__base-facts">{types} types · {routes} routes</span>
                </div>
              );
            })}
            <p className="hero__panel-note">{icaoNote(baseList)}</p>
          </aside>
        </div>
      </section>

      <section className="stats" aria-label={all ? "Airline statistics from vAMSYS" : "Network at a glance"}>
        <div className="stats__inner">
          {all ? (
            <>
              <div className="stat"><span className="stat__value">{formatCompact(all.flights)}</span><span className="stat__label">Flights flown</span></div>
              <div className="stat"><span className="stat__value">{formatCompact(all.flight_hours)}</span><span className="stat__label">Flight hours</span></div>
              <div className="stat"><span className="stat__value">{formatCompact(all.passengers)}</span><span className="stat__label">Passengers carried</span></div>
              <div className="stat"><span className="stat__value">{formatNumber(month?.flights ?? null)}</span><span className="stat__label">Flights, last 30 days</span></div>
              <div className="stat"><span className="stat__value">{all.average_landing_rate != null ? `${Math.abs(Math.round(all.average_landing_rate))}` : "—"}</span><span className="stat__label">Avg landing, fpm</span></div>
            </>
          ) : (
            <>
              <div className="stat"><span className="stat__value">{facts.aircraftTypes}</span><span className="stat__label">Aircraft types</span></div>
              <div className="stat"><span className="stat__value">{formatNumber(airframes(snapshot))}</span><span className="stat__label">Airframes</span></div>
              <div className="stat"><span className="stat__value">{facts.routes}</span><span className="stat__label">Scheduled routes</span></div>
              <div className="stat"><span className="stat__value">{facts.destinations}</span><span className="stat__label">Destinations</span></div>
              <div className="stat"><span className="stat__value">{facts.countries}</span><span className="stat__label">Countries</span></div>
            </>
          )}
        </div>
        <p className="stats__source">{all ? "Statistics from vAMSYS, updated with every sync." : "Counted from the published schedule. Flight statistics appear once live vAMSYS data is connected."}</p>
      </section>

      <section className="page">
        <SectionHead eyebrow="Why Crossroads" title="An airline built like a real charter operator" />
        <ul className="reasons">
          <li>
            <h3>Two airports, real logic</h3>
            <p>Light and mid-size jets work from Indianapolis Executive. The Longitude and everything larger fly from Indianapolis International, the way a real operator would split it.</p>
          </li>
          <li>
            <h3>Business jet to freighter</h3>
            <p>{facts.aircraftTypes} types across {airline.divisions.length || "four"} divisions on one schedule. Fly a 47-minute hop to Midway in the morning and a 777F to Leipzig at night.</p>
          </li>
          <li>
            <h3>A career you can see</h3>
            <p>Six ranks from Cadet to Chief Pilot, earned with hours and accepted PIREPs. One logbook covers every aircraft you fly.</p>
          </li>
          <li>
            <h3>Briefed before you board</h3>
            <p>Every route has a Crew Tools briefing with live weather, runway winds, a fuel estimate and an approach card. Book on vAMSYS, dispatch with SimBrief, and Pegasus files the PIREP.</p>
          </li>
        </ul>
      </section>

      {airline.divisions.length ? (
        <section className="page">
          <SectionHead eyebrow="Four divisions" title="Pick your flying" intro={`Every pilot can fly every division. Each route only offers the aircraft that suit it. Divisions share routes, so the counts add up to more than ${snapshot.routes.length}.`} action={{ href: "#/services", label: "Divisions and services" }} />
          <ul className="division-grid">
            {airline.divisions.map((division, i) => {
              const types = fleet.filter((f) => division.fleets.includes(f.code));
              const routeCount = snapshot.routes.filter((r) => routeInDivision(r, division)).length;
              const service = SERVICES.find((s) => s.division === division.name);
              return (
                <li key={division.name} className="division" style={{ ["--accent" as string]: divisionColor(i) }}>
                  <p className="division__base">{divisionBaseLabel(division, fleet)} · {routeCount} of {snapshot.routes.length} routes</p>
                  <h3>{division.name}</h3>
                  {division.summary ? <p className="division__summary">{division.summary}</p> : null}
                  <p className="division__types">{types.map((t) => <span key={t.code} className="chip">{shortName(t.name)}</span>)}</p>
                  <a className="text-link" href={service ? `#/services?d=${service.slug}` : `#/routes?division=${encodeURIComponent(division.name)}`}>Sample itinerary →</a>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {e190 ? (
        <section className="livery-band">
          <div className="livery-band__inner">
            <div className="livery-band__copy">
              <p className="eyebrow eyebrow--on-ink">Our colours</p>
              <h2>White, charcoal and one orange line</h2>
              <p>Our livery is a clean white fuselage with a charcoal and signal-orange cheatline, and the crossroads mark on the tail: two routes meeting at Indianapolis. It's in work now for the E190 and the Citation Mustang.</p>
              <a className="text-link text-link--on-ink" href="#/fleet">See the fleet →</a>
            </div>
            <figure className="livery-band__figure">
              <img src={e190.src} alt={e190.alt} loading="lazy" width={1100} height={280} />
              <figcaption>E190 livery preview render</figcaption>
            </figure>
          </div>
        </section>
      ) : null}

      <section className="page page--split page--split-wide">
        <div>
          <SectionHead
            eyebrow={live.length ? "Right now" : "Where we fly"}
            title={live.length ? "On the map" : "The network"}
            action={{ href: live.length ? "#/live" : "#/routes", label: live.length ? "Full live board" : "All routes" }}
          />
          <LiveUnavailable snapshot={snapshot} />
          <LiveMap flights={live} airports={snapshot.airports} bases={baseList} routes={live.length ? [] : snapshot.routes} divisions={airline.divisions} height={420} label={live.length ? "Live flights" : "Route network"} />
          {!live.length ? <MapLegend snapshot={snapshot} routes={snapshot.routes} /> : null}
          <HomeNumbers snapshot={snapshot} />
        </div>
        <div>
          {live.length ? (
            <>
              <SectionHead eyebrow="In the air" title="Live flights" />
              <ul className="flight-list">
                {live.slice(0, 3).map((flight, i) => <FlightCard key={`${flight.callsign}-${i}`} flight={flight} snapshot={snapshot} />)}
              </ul>
            </>
          ) : null}
          <SectionHead eyebrow="Just landed" title={recent.length ? "Latest flights" : "Logbook firsts"} />
          {recent.length ? (
            <table className="table table--compact">
              <caption className="visually-hidden">Latest flights</caption>
              <thead><tr><th scope="col">Flight</th><th scope="col">Route</th><th scope="col">Aircraft</th><th scope="col" className="num">Landing</th></tr></thead>
              <tbody>
                {recent.slice(0, 6).map((r, i) => (
                  <tr key={`${r.callsign}-${i}`}>
                    <td><strong>{r.callsign ?? r.flight_number ?? "—"}</strong><span className="sub">{r.landed ? relativeAge(r.landed) : ""}</span></td>
                    <td><Leg from={r.from} to={r.to} snapshot={snapshot} /></td>
                    <td>{r.aircraft ?? "—"}</td>
                    <td className="num">{r.landing_rate != null ? `${r.landing_rate} fpm` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <>
              <ul className="firsts">
                {FIRST_FLIGHTS.map((f) => (
                  <li key={f.callsign}>
                    <strong className="callsign">{f.callsign}</strong>
                    <Leg from={f.from} to={f.to} snapshot={snapshot} />
                    <span className="muted">{f.aircraft}</span>
                  </li>
                ))}
              </ul>
              <p className="fineprint">The first three PIREPs accepted on 11 November 2026. Live logbook entries replace this list once vAMSYS data is connected.</p>
            </>
          )}
        </div>
      </section>

      <section className="page">
        <SectionHead eyebrow="News & NOTAMs" title="From the ops desk" action={{ href: "#/news", label: "All news" }} />
        <ul className="news-grid">{NEWS.slice(0, 3).map((item) => <NewsCard key={item.title} item={item} />)}</ul>
      </section>

      <section className="cta-band">
        <div className="cta-band__inner">
          <div>
            <h2>Your first flight is one application away.</h2>
            <p>Start as a Cadet in the Citation Mustang at KTYQ. Where you take it from there is up to you.</p>
          </div>
          <div className="hero__actions">
            <JoinButton snapshot={snapshot} label="Join Crossroads" />
            <a className="button button--ghost" href="#/pilots">How it works</a>
          </div>
        </div>
      </section>
    </>
  );
}

function HomeNumbers({ snapshot }: PageProps) {
  const stats = networkStats(snapshot);
  return (
    <ul className="home-numbers">
      {stats.longest ? <li><span>Longest leg</span><a href={routeHref(stats.longest)}>{routeKey(stats.longest)} to {stats.longest.to === "KIND" || stats.longest.to === "KTYQ" ? stats.longest.from : stats.longest.to} · {formatNumber(stats.longest.distance_nm)} nm</a></li> : null}
      {stats.topAirports[0] ? <li><span>Busiest destination</span><a href={airportHref(stats.topAirports[0].label.split(" ")[0]!)}>{stats.topAirports[0].label} · {stats.topAirports[0].value} routes</a></li> : null}
      <li><span>Explore</span><a href="#/stats">Network stats</a> · <a href="#/destinations">All destinations</a> · <a href="#/plan">Plan a charter</a></li>
    </ul>
  );
}

function routeKey(route: { callsign: string | null; flight_number: string | null; from: string; to: string }): string {
  return route.callsign ?? route.flight_number ?? `${route.from}${route.to}`;
}

function icaoNote(baseList: string[]): string {
  return baseList.includes("KTYQ") && baseList.includes("KIND")
    ? "KTYQ takes jets up to Citation X size. KIND takes the Longitude, Gulfstreams, airliners and freighters."
    : "All operations from Indianapolis.";
}

// ------------------------------------------------------------------ live

export function LivePage({ snapshot }: PageProps) {
  const [selected, setSelected] = useState<number | null>(null);
  const select = useCallback((index: number) => setSelected(index), []);
  const { live } = snapshot;
  const prelaunch = snapshot.source !== "vamsys";
  return (
    <>
      <PageHeader
        eyebrow="Operations"
        title="Live flights"
        lede={live.length
          ? `${live.length} ${live.length === 1 ? "flight is" : "flights are"} in progress. Positions as of ${relativeAge(snapshot.generated_at)}; this page refreshes every minute.`
          : prelaunch
            ? "Live tracking switches on once the vAMSYS data connection is enabled. Until then, here's the network our pilots fly."
            : "No flights are in progress right now. Here's where we fly."}
      />
      <section className="page">
        <LiveUnavailable snapshot={snapshot} />
        <LiveMap flights={live} airports={snapshot.airports} bases={bases(snapshot)} routes={live.length ? [] : snapshot.routes} divisions={snapshot.airline.divisions} height={520} onSelect={select} />
        {!live.length ? <MapLegend snapshot={snapshot} routes={snapshot.routes} /> : null}
        {live.length ? (
          <div className="table-wrap">
            {/* Stacked into cards on phones: the explicit roles keep it a table for assistive technology. */}
            <table className="table" role="table">
              <caption className="visually-hidden">Flights in progress</caption>
              <thead role="rowgroup">
                <tr role="row">
                  <th scope="col" role="columnheader">Flight</th><th scope="col" role="columnheader">Route</th><th scope="col" role="columnheader">Aircraft</th><th scope="col" role="columnheader">Phase</th>
                  <th scope="col" className="num" role="columnheader">Altitude</th><th scope="col" className="num" role="columnheader">Speed</th><th scope="col" role="columnheader">Progress</th><th scope="col" role="columnheader">ETA</th>
                </tr>
              </thead>
              <tbody role="rowgroup">
                {live.map((f, i) => (
                  <tr key={`${f.callsign}-${i}`} role="row" className={selected === i ? "is-selected" : undefined}>
                    <td data-label="Flight" role="cell"><strong>{f.callsign ?? f.flight_number ?? "—"}</strong>{f.pilot ? <span className="sub">{f.rank ? `${f.rank} ` : ""}{f.pilot}</span> : null}</td>
                    <td data-label="Route" role="cell"><Leg from={f.from} to={f.to} snapshot={snapshot} /></td>
                    <td data-label="Aircraft" role="cell">{f.aircraft ?? "—"}{f.registration ? <span className="sub">{f.registration}</span> : null}</td>
                    <td data-label="Phase" role="cell">{f.phase ?? "—"}</td>
                    <td data-label="Altitude" className="num" role="cell">{formatFeet(f.altitude_ft)}</td>
                    <td data-label="Speed" className="num" role="cell">{f.groundspeed_kt != null ? `${f.groundspeed_kt} kt` : "—"}</td>
                    <td data-label="Progress" role="cell"><Progress flight={f} />{f.remaining_nm != null ? <span className="sub">{formatNumber(f.remaining_nm)} nm to go</span> : null}</td>
                    <td data-label="ETA" role="cell">{f.eta ? formatDate(f.eta, true) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>
    </>
  );
}

// ------------------------------------------------------------------ fleet

const KIND: Record<string, string> = {
  pax: "Passenger",
  cargo: "Freighter",
  "pax-cargo": "Passenger & cargo",
  "pax-containers": "Passenger",
  "cargo-containers": "Freighter",
};

const isFreighter = (t: FleetType) => t.type === "cargo" || t.type === "cargo-containers";

function FleetCard({ type, snapshot, accent }: { type: FleetType; snapshot: Snapshot; accent: string }) {
  const info = FLEET_INFO[type.code];
  const base = baseFor(type.code);
  const routes = snapshot.routes.filter((r) => r.types.includes(type.code)).length;
  const sim = snapshot.airline.sim_aircraft?.[type.code];
  return (
    <li className="fleet-card" id={`type-${type.code}`}>
      <div className={`fleet-card__media${info?.livery ? " fleet-card__media--livery" : ""}`} style={{ ["--accent" as string]: accent }}>
        {info?.livery ? (
          <img src={info.livery.src} alt={info.livery.alt} loading="lazy" />
        ) : type.image ? (
          <img src={type.image} alt={type.name} loading="lazy" referrerPolicy="no-referrer" />
        ) : (
          <span className="fleet-card__code" aria-hidden="true">{type.code}</span>
        )}
        {info?.livery ? <span className="fleet-card__badge">Crossroads livery</span> : null}
      </div>
      <div className="fleet-card__body">
        <p className="eyebrow">{type.code}{type.type ? ` · ${KIND[type.type] ?? type.type}` : ""}{info ? ` · ${info.role}` : ""}</p>
        <h3><a className="card-link" href={typeHref(type.code)}>{type.name}</a></h3>
        {info ? <p className="fleet-card__blurb">{info.blurb}</p> : null}
        <dl className="specs specs--4">
          {isFreighter(type)
            ? <div><dt>Payload</dt><dd>{formatWeight(type.max_cargo, type.weight_unit)}</dd></div>
            : <div><dt>Seats</dt><dd>{formatNumber(type.max_pax)}</dd></div>}
          <div><dt>Range</dt><dd>{info ? `${formatNumber(info.range_nm)} nm` : "—"}</dd></div>
          <div><dt>Cruise</dt><dd>{info ? `${info.cruise_kt} kt` : "—"}</dd></div>
          <div><dt>Routes</dt><dd>{routes}</dd></div>
        </dl>
        <p className="fleet-card__row">
          <span className={`tag tag--base tag--${base.toLowerCase()}`}>Base {base}</span>
          {type.registrations.map((r) => <span key={r} className="reg">{r}</span>)}
        </p>
        {sim ? <p className="sim-aircraft"><span>Fly it in MSFS 2024</span>{sim}</p> : null}
        <p className="fleet-card__links">
          <a className="text-link" href={typeHref(type.code)}>Specs, range ring and routes →</a>
          <a className="text-link" href={`#/routes?type=${encodeURIComponent(type.code)}`}>On the map →</a>
        </p>
        {type.image && type.image_attribution && !info?.livery ? (
          <p className="credit">Photo: {type.image_link ? <a href={type.image_link} rel="noopener">{type.image_attribution}</a> : type.image_attribution}</p>
        ) : null}
      </div>
    </li>
  );
}

export function FleetPage({ snapshot }: PageProps) {
  const [baseFilter, setBaseFilter] = useState<"" | "KTYQ" | "KIND">("");
  const total = airframes(snapshot);
  const divisions = snapshot.airline.divisions;
  const groups: { title: string; summary: string | null; index: number; types: FleetType[] }[] = divisions.length
    ? divisions.map((d, index) => ({
        title: d.name, summary: d.summary, index,
        // Keep the order the division lists its aircraft in (smallest to largest), not alphabetical.
        types: snapshot.fleet.filter((f) => d.fleets.includes(f.code)).sort((a, b) => d.fleets.indexOf(a.code) - d.fleets.indexOf(b.code)),
      }))
    : [{ title: "Fleet", summary: null, index: 0, types: snapshot.fleet }];
  const unassigned = divisions.length ? snapshot.fleet.filter((f) => !divisionFor(snapshot, f.code)) : [];
  if (unassigned.length) groups.push({ title: "Other aircraft", summary: null, index: groups.length, types: unassigned });
  const ktyq = snapshot.fleet.filter((f) => baseFor(f.code) === "KTYQ").length;
  const seats = snapshot.fleet.filter((f) => !isFreighter(f)).reduce((s, f) => s + (f.max_pax ?? 0) * f.aircraft_count, 0);

  return (
    <>
      <PageHeader eyebrow="Fleet" title="From Mustang to 777F" lede={`${snapshot.fleet.length} aircraft types and ${formatNumber(total)} airframes, every one registered N…CR. Light and mid-size jets live at Indianapolis Executive, everything larger at Indianapolis International.`}>
        <dl className="header-facts">
          <div><dt>Types</dt><dd>{snapshot.fleet.length}</dd></div>
          <div><dt>At KTYQ</dt><dd>{ktyq}</dd></div>
          <div><dt>At KIND</dt><dd>{snapshot.fleet.length - ktyq}</dd></div>
          <div><dt>Passenger seats</dt><dd>{formatNumber(seats)}</dd></div>
        </dl>
      </PageHeader>
      <section className="page">
        {snapshot.unavailable.includes("aircraft") ? <p className="callout">Airframe counts could not be refreshed this time.</p> : null}
        <div className="chips" role="group" aria-label="Filter by base">
          {(["", "KTYQ", "KIND"] as const).map((b) => (
            <button key={b || "all"} type="button" className="chip-button" aria-pressed={baseFilter === b} onClick={() => setBaseFilter(b)}>
              {b ? `${b} · ${snapshot.airports[b]?.name ?? b}` : "Both bases"}
            </button>
          ))}
        </div>
        {groups.map((group) => {
          const types = group.types.filter((t) => !baseFilter || baseFor(t.code) === baseFilter);
          if (!types.length) return null;
          const accent = divisionColor(group.index);
          return (
            <div key={group.title} className="fleet-group">
              <div className="fleet-group__head">
                <h2><DivisionDot index={group.index} />{group.title}</h2>
                <span className="tag">{types.length} {types.length === 1 ? "type" : "types"}</span>
              </div>
              {group.summary ? <p className="muted fleet-group__summary">{group.summary}</p> : null}
              <ul className="fleet-grid">
                {types.map((type) => <FleetCard key={type.code} type={type} snapshot={snapshot} accent={accent} />)}
              </ul>
            </div>
          );
        })}
        <p className="fineprint fleet-note">
          Range and cruise are rounded Crossroads planning figures for flight simulation, not manufacturer data. Always dispatch with SimBrief.
          Livery images are preview renders of Crossroads paint schemes for the simulator. Aircraft names are used only to identify the simulator models we fly.
        </p>
      </section>
    </>
  );
}

// ------------------------------------------------------------------ routes

export function RoutesPage({ snapshot }: PageProps) {
  const divisions = snapshot.airline.divisions;
  const baseList = bases(snapshot);
  const [query, setQuery] = useState("");
  const [type, setType] = useState(() => {
    const wanted = hashParam("type");
    return snapshot.fleet.some((f) => f.code === wanted) ? wanted : "";
  });
  const [base, setBase] = useState(() => {
    const wanted = hashParam("base");
    return baseList.includes(wanted) || wanted === POINT_TO_POINT ? wanted : "";
  });
  const [divisionName, setDivisionName] = useState(() => {
    const wanted = hashParam("division");
    return divisions.some((d) => d.name === wanted) ? wanted : "";
  });
  const [selectedAirport, setSelectedAirport] = useState<string | null>(() => {
    const wanted = hashParam("airport").toUpperCase();
    return snapshot.routes.some((r) => r.from === wanted || r.to === wanted) ? wanted : null;
  });
  const [selectedRoute, setSelectedRoute] = useState<string | null>(null);
  const division = divisions.find((d) => d.name === divisionName);
  const types = useMemo(
    () => [...new Set(snapshot.routes.filter((r) => routeInDivision(r, division)).flatMap((r) => r.types))].sort(),
    [snapshot.routes, division],
  );
  const shown = useMemo(() => filterRoutes(snapshot.routes, query, type, division, base, baseList), [snapshot.routes, query, type, division, base, baseList]);
  const names = Object.fromEntries(snapshot.fleet.map((f) => [f.code, f.name]));
  const longest = shown.reduce((max, r) => Math.max(max, r.distance_nm ?? 0), 0);
  // Keep the explorer selection valid when filters remove the airport.
  const airportInView = selectedAirport && shown.some((r) => r.from === selectedAirport || r.to === selectedAirport) ? selectedAirport : null;
  const tableRoutes = airportInView ? shown.filter((r) => r.from === airportInView || r.to === airportInView) : shown;
  const airportsServed = new Set(shown.flatMap((r) => [r.from, r.to])).size;
  const listCount = `${tableRoutes.length} ${tableRoutes.length === 1 ? "route" : "routes"}`;

  // The list sits below the map: a button jumps there and moves focus to its heading.
  const jumpToList = () => {
    const heading = document.getElementById("route-list");
    heading?.scrollIntoView({ block: "start" });
    heading?.focus({ preventScroll: true });
  };

  const chooseDivision = (name: string) => {
    setDivisionName(name);
    if (type && !snapshot.routes.some((r) => r.types.includes(type) && routeInDivision(r, divisions.find((d) => d.name === name)))) setType("");
    const hash = name ? `#/routes?division=${encodeURIComponent(name)}` : "#/routes";
    window.history.replaceState(null, "", hash);
  };

  return (
    <>
      <PageHeader eyebrow="Route explorer" title={`${snapshot.routes.length} routes from Indianapolis`} lede="Choose any airport on the map or in the list to see its routes as great circles, then pick a route for distance, block time, the aircraft that fly it and a booking link. Every route can be booked in the vAMSYS pilot portal and has a Crew Tools briefing." />
      <section className="page">
        {divisions.length ? (
          <div className="chips" role="group" aria-label="Filter by division">
            <button type="button" className="chip-button" aria-pressed={!divisionName} onClick={() => chooseDivision("")}>All divisions</button>
            {divisions.map((d, i) => (
              <button key={d.name} type="button" className="chip-button" aria-pressed={divisionName === d.name} onClick={() => chooseDivision(d.name)}>
                <DivisionDot index={i} />{d.name}
              </button>
            ))}
          </div>
        ) : null}
        <form className="filters filters--top" role="search" onSubmit={(e) => e.preventDefault()}>
          <label>
            <span>Search</span>
            <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="ICAO or flight number" autoComplete="off" />
          </label>
          <label>
            <span>Base</span>
            <select value={base} onChange={(e) => setBase(e.target.value)}>
              <option value="">Both bases and point-to-point</option>
              {baseList.map((b) => <option key={b} value={b}>{b} · {snapshot.airports[b]?.name ?? b}</option>)}
              <option value={POINT_TO_POINT}>Point-to-point (away from base)</option>
            </select>
          </label>
          <label>
            <span>Aircraft</span>
            <select value={type} onChange={(e) => setType(e.target.value)}>
              <option value="">All types</option>
              {types.map((t) => <option key={t} value={t}>{names[t] ? `${names[t]} (${t})` : t}</option>)}
            </select>
          </label>
        </form>
        <dl className="route-summary" aria-live="polite">
          <div><dt>Routes shown</dt><dd>{shown.length}</dd></div>
          <div><dt>Airports</dt><dd>{airportsServed}</dd></div>
          <div><dt>Longest</dt><dd>{longest ? `${formatNumber(longest)} nm` : "—"}</dd></div>
        </dl>
        <button type="button" className="text-link text-link--button" onClick={jumpToList}>{`Jump to the ${listCount}`}</button>
        <h2 className="visually-hidden">Route explorer</h2>
        <div className="explorer">
          <div className="explorer__map">
            <ExploreMap
              routes={shown}
              airports={snapshot.airports}
              bases={baseList}
              divisions={divisions}
              selectedAirport={airportInView}
              selectedRoute={selectedRoute}
              onAirportClick={(icao) => { setSelectedAirport((cur) => (cur === icao ? null : icao)); setSelectedRoute(null); }}
              onRouteClick={setSelectedRoute}
              onClearSelection={() => { setSelectedAirport(null); setSelectedRoute(null); }}
              height={520}
              label="Route explorer map"
              describedBy="explorer-keys"
              markerRole="button"
            />
            <MapLegend snapshot={snapshot} routes={shown} />
            <p className="fineprint kbd-hint" id="explorer-keys">Keyboard: Tab to the map, arrow keys to move between airports, Enter or Space to select, Escape to clear.</p>
          </div>
          <ExplorerPanel snapshot={snapshot} routes={shown} selected={airportInView} onSelect={setSelectedAirport} selectedRoute={selectedRoute} onRoute={setSelectedRoute} />
        </div>
        <div className="table-title">
          <h2 className="h3" id="route-list" tabIndex={-1}>{airportInView ? `${listCount} serving ${airportInView}` : `${listCount} shown`}</h2>
          {airportInView ? <button type="button" className="button button--small button--quiet" onClick={() => { setSelectedAirport(null); setSelectedRoute(null); }}>Show all</button> : null}
        </div>
        <RouteTable routes={tableRoutes} snapshot={snapshot} caption={airportInView ? `Routes serving ${airportInView}` : "Routes shown"} />
        <p className="fineprint">Distances are great-circle. Block times are schedule estimates; your SimBrief OFP has the real figure for the day's winds.</p>
      </section>
    </>
  );
}

// ------------------------------------------------------------------ fly with us (walkthrough)

const WALKTHROUGH: { title: string; tool: string; body: string; tips: string[]; link?: { href: string; label: string } }[] = [
  {
    title: "Register and join the hub",
    tool: "vAMSYS",
    body: "Crossroads runs on vAMSYS. Register through the Crossroads sign-in page on vAMSYS (the Register link). Once staff approve your application, you join the Indianapolis hub as a Cadet.",
    tips: ["New pilots: open the Crossroads pilot hub at vamsys.io/login/crossroads and use its Register link", "Use a username you're happy to see on a leaderboard", "Link your SimBrief account in your vAMSYS profile settings"],
  },
  {
    title: "Install Pegasus",
    tool: "Pegasus ACARS",
    body: "Pegasus is vAMSYS's flight tracker. It runs next to your simulator, records the flight from the gate to the gate, and files your PIREP when you're done.",
    tips: ["Download it from the ACARS page in the vAMSYS pilot portal (Phoenix) and sign in with your vAMSYS account", "Check that Pegasus supports your simulator version before your first flight"],
    link: { href: PEGASUS_URL, label: "Pegasus ACARS guide (vAMSYS docs)" },
  },
  {
    title: "Book a route",
    tool: "vAMSYS pilot portal",
    body: "Pick a route from the schedule in the pilot portal. Each route only offers the aircraft that suit it: light and mid-size jets from KTYQ, everything larger from KIND.",
    tips: ["Use the Route network page here to plan by division, base or aircraft", "Cadets: start with the short KTYQ hops (CRX115 to Midway is 126 nm)"],
  },
  {
    title: "Dispatch with SimBrief",
    tool: "SimBrief",
    body: "Generate your OFP from the booking. SimBrief gives you the route, fuel and weights. Load the plan into your aircraft's FMS and check it against the Crew Tools briefing for weather and runway winds.",
    tips: ["Fuel policy: 45 minutes final reserve, always", "Use cost index guidance from the handbook"],
  },
  {
    title: "Fly it",
    tool: "MSFS + Pegasus",
    body: "Spawn at a parking spot at the departure airport, start Pegasus before engine start, and fly the flight. Online on VATSIM or offline, it's up to you.",
    tips: ["Stabilised by 1,000 ft in cloud and 500 ft visual, or go around", "No slew, time acceleration or in-flight refuelling"],
  },
  {
    title: "File the PIREP",
    tool: "Pegasus → vAMSYS",
    body: "Pegasus files the PIREP when you shut down at the gate. Add comments for anything unusual. Staff review it, and accepted flights count toward your hours, your rank and the airline's statistics on this site.",
    tips: ["Target a 60–250 fpm touchdown", "Diversions and go-arounds belong in the comments"],
  },
];

export function PilotsPage({ snapshot }: PageProps) {
  const { airline } = snapshot;
  const facts = networkFacts(snapshot);
  const faqs: { q: string; a: string }[] = [
    { q: "Do I need real-world flying experience?", a: "No. Bring your simulator and a willingness to fly by the book. The career ladder starts you in light jets and you work up from there." },
    { q: "Which simulators and aircraft can I use?", a: "Flights are tracked with vAMSYS's Pegasus ACARS, so any simulator Pegasus supports will work (the vAMSYS Pegasus guide lists them). The fleet page lists the MSFS 2024 model we use for each type. Use any model of the same type you own." },
    { q: "Can I fly the big jets straight away?", a: "Yes. Every route is open to every pilot. Ranks recognise experience by hours and accepted PIREPs. They don't lock you out of aircraft." },
    { q: "Where does each flight start?", a: "Light and mid-size jets (Mustang, Premier IA, CJ4, Learjet 35A, Phenom 300E, Hawker 800XP, Citation X) work from Indianapolis Executive, KTYQ. Everything larger works from Indianapolis International, KIND." },
    { q: "Do I have to fly on VATSIM?", a: "Online or offline, your choice. If you fly online, use your CRX callsign and follow the network's rules: you stay at the controls, monitor the frequency and make every radio call yourself." },
    { q: "Is this a real airline?", a: "No. Crossroads Executive & Charter is a fictional virtual airline for flight simulation. It doesn't sell flights and isn't connected to any real operator." },
  ];

  return (
    <>
      <PageHeader eyebrow="Fly with us" title="How a Crossroads flight works" lede={`Six steps from application to accepted PIREP. Fly our ${facts.routes}-route schedule from home and build your logbook from Cadet to Chief Pilot.`}>
        <div className="hero__actions">
          <JoinButton snapshot={snapshot} label={REGISTER_LABEL} />
          {airline.pilot_login_url ? <a className="button button--ghost" href={airline.pilot_login_url} rel="noopener">Existing pilots: log in</a> : null}
          {airline.discord_url ? <a className="button button--ghost" href={airline.discord_url} rel="noopener">Join our Discord</a> : null}
        </div>
      </PageHeader>

      <section className="page">
        <ol className="walkthrough">
          {WALKTHROUGH.map((step, i) => (
            <li key={step.title} className="walkthrough__step">
              <span className="walkthrough__num" aria-hidden="true">{String(i + 1).padStart(2, "0")}</span>
              <div>
                <p className="eyebrow">{step.tool}</p>
                <h2>{step.title}</h2>
                <p>{step.body}</p>
                <ul className="ticks">{step.tips.map((t) => <li key={t}>{t}</li>)}</ul>
                {step.link ? <a className="text-link" href={step.link.href} rel="noopener" target="_blank">{step.link.label}<span className="visually-hidden"> (opens in a new tab)</span> ↗</a> : null}
              </div>
            </li>
          ))}
        </ol>
        <p className="callout">
          Before your first flight, read the <a href="#/handbook">pilot handbook</a>: callsigns, flight-number blocks, fuel policy and what we expect on landing. Then look at the <a href="#/careers">career ladder</a>.
        </p>
      </section>

      {snapshot.hubs.length ? (
        <section className="page">
          <SectionHead eyebrow="Home base" title="Indianapolis, two airports" />
          <ul className="hub-list">
            {bases(snapshot).map((icao) => {
              const airport = snapshot.airports[icao];
              const here = snapshot.fleet.filter((f) => baseFor(f.code) === icao);
              return (
                <li key={icao} className="hub">
                  <h3>{icao}{airport ? <span className="hub__name">{airport.name}</span> : null}</h3>
                  <p className="hub__airports">{icao === "KTYQ" ? "Light and mid-size jets" : "Large-cabin jets, airliners and freighters"}</p>
                  <p className="division__types">{here.map((t) => <span key={t.code} className="chip">{shortName(t.name)}</span>)}</p>
                  <a className="text-link" href={airportHref(icao)}>{icao} airport page →</a>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      <section className="page page--narrow">
        <SectionHead eyebrow="Questions" title="Before you register" />
        <div className="faq">
          {faqs.map((f) => (
            <details key={f.q}>
              <summary>{f.q}</summary>
              <p>{f.a}</p>
            </details>
          ))}
        </div>
      </section>
    </>
  );
}

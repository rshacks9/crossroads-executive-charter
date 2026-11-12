import { useCallback, useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { AirlineEvent, Division, FleetType, LiveFlight, Rank, Route, Snapshot } from "./data";
import {
  POINT_TO_POINT,
  filterRoutes,
  formatCompact,
  formatDate,
  formatDuration,
  formatFeet,
  formatNumber,
  hashParam,
  networkFacts,
  payloadTonnes,
  progressPercent,
  relativeAge,
  routeBase,
  routeInDivision,
} from "./data";
import { FLEET_INFO, NEWS, PEGASUS_URL, RULES_URL, SERVICES, VATSIM_REMARKS, baseFor } from "./content";
import type { NewsItem } from "./content";
import { LiveMap, divisionColor } from "./LiveMap";
import { ExploreMap } from "./ExploreMap";
import { ExplorerPanel, RouteTable } from "./explore-pages";
import { airportHref, defaultSimTypes, divisionBaseLabel, firstFlight, jumpTo, listJoin, mapLegendKeys, networkStats, routeHref, routesForTypes, typeHref } from "./explore";
import type { FirstFlight } from "./explore";
import { capital, countWords, numberWord } from "./html-facts";

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
        {/* One block for the text, so from 1000 px the header facts can sit beside it (styles.css). */}
        <div className="page-header__text">
          <p className="eyebrow eyebrow--on-ink">{eyebrow}</p>
          <h1 className="page-title">{title}</h1>
          {lede ? <p className="page-header__lede">{lede}</p> : null}
        </div>
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
      <span className="leg__arrow" aria-hidden="true">→</span><span className="visually-hidden"> to </span>
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
 * Registration is open when join_url is set in site.config.json: the airline's vAMSYS sign-up page,
 * https://vamsys.io/register/crossroads. Leave it unset while that page takes no new pilots (on
 * 2026-11-12 it redirected to the vAMSYS sign-in page, and the sign-in page's Create Account link
 * goes to it).
 */
export function registrationOpen(snapshot: Pick<Snapshot, "airline">): boolean {
  return Boolean(snapshot.airline.join_url);
}

/** Where the join buttons go: the vAMSYS sign-up page while registration is open, otherwise the Fly-with-us page. */
export function joinHref(snapshot: Pick<Snapshot, "airline">): { href: string; external: boolean } {
  const { join_url } = snapshot.airline;
  return join_url ? { href: join_url, external: true } : { href: "#/pilots", external: false };
}

export const REGISTER_LABEL = "Register on vAMSYS";
/** The Discord link on Fly with us and in the footer, shown only once discord_url is set in site.config.json. */
export const DISCORD_LABEL = "Join the Discord";
/** The label of the buttons that lead to the Fly-with-us page. */
export const HOW_TO_JOIN = "How to join";

/** "Register on vAMSYS" while registration is open, "How to join" until then. One label per action, site-wide. */
export function JoinButton({ snapshot, quiet = false }: { snapshot: Snapshot; quiet?: boolean }) {
  const join = joinHref(snapshot);
  return (
    <a className={`button${quiet ? " button--ghost" : ""}`} href={join.href} rel={join.external ? "noopener" : undefined}>
      {join.external ? REGISTER_LABEL : HOW_TO_JOIN}
    </a>
  );
}

/** How the home page labels the setup flights: what they were, and that they are not pilot flights. */
export const SETUP_NOTE =
  "Flown by the founder's automation tools while the airline was being built. They are not pilot flights. The latest flights from the vAMSYS logbook replace this list once that data is connected.";

/** The terms of joining, as the airline sets them, shown with the join copy on Home and Fly with us. */
export const JOIN_TERMS = "Free to join; no activity requirement for the first 30 days.";

/** The home page's closing line: a new airline, the join terms, and the KTYQ type that comes with MSFS 2024 when there is one. */
export function foundingLine(snapshot: Pick<Snapshot, "airline" | "fleet">): string {
  const starters = defaultSimTypes(snapshot).filter((f) => baseFor(f.code) === "KTYQ").map((f) => shortName(f.name));
  const start = starters.length
    ? `Start as a Cadet at KTYQ in the ${listJoin(starters)}, which ${starters.length === 1 ? "comes" : "come"} with MSFS 2024.`
    : "Start as a Cadet at KTYQ.";
  return `Crossroads opened on vAMSYS in November 2026 and is just getting started, so you could be one of the first. ${JOIN_TERMS} ${start}`;
}

/** The ranks a pilot earns in order, without the honorary ones. */
export function rankLadder(snapshot: Pick<Snapshot, "ranks">): Rank[] {
  return snapshot.ranks.filter((r) => !r.honorary);
}

/** "Six ranks from Cadet to Chief Pilot": counted and named from the ladder in vAMSYS. */
export function ladderPhrase(ladder: readonly Rank[]): string {
  const first = ladder[0];
  const last = ladder[ladder.length - 1];
  if (!first || !last || ladder.length < 2) return "Ranks";
  return `${capital(countWords(ladder.length, "rank", "ranks"))} from ${first.name} to ${last.name}`;
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
        <time dateTime={item.date}>{date.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })}</time>
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

/**
 * The three setup test flights, flown by the founder's automation tools while the airline was being
 * built. Labelled as such, never as pilot activity. Shown only until vAMSYS supplies recent flights.
 */
const SETUP_FLIGHTS = [
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
  const divisionCount = airline.divisions.length;

  return (
    <>
      <section className="hero">
        <div className="hero__inner">
          <div className="hero__copy">
            <p className="eyebrow eyebrow--on-ink">Fictional virtual airline for flight simulation · Indianapolis, Indiana</p>
            <h1>{airline.name}</h1>
            {airline.tagline ? <p className="hero__lede">{airline.tagline}</p> : null}
            <p className="hero__pitch">
              From the four-seat Citation Mustang to a 150-seat executive A380 and the 777F: {facts.aircraftTypes} aircraft types, {facts.routes} routes, most of them from {numberWord(baseList.length)} Indianapolis bases, and one career path.
            </p>
            <div className="hero__actions">
              <JoinButton snapshot={snapshot} />
              <a className="button button--ghost" href={live.length ? "#/live" : "#/routes"}>
                {live.length ? `${live.length} ${live.length === 1 ? "flight" : "flights"} in the air` : "Explore the network"}
              </a>
            </div>
          </div>
          <aside className="hero__panel" aria-label={baseList.length === 1 ? "Our base" : `Our ${countWords(baseList.length, "base", "bases")}`}>
            <p className="hero__panel-title">{`${capital(countWords(baseList.length, "base", "bases"))}, one airline`}</p>
            {baseList.map((icao) => {
              const airport = snapshot.airports[icao];
              // Every route that starts or ends here, as on the destinations card (the KTYQ-KIND legs count for both).
              const routes = snapshot.routes.filter((r) => r.from === icao || r.to === icao).length;
              const types = fleet.filter((f) => baseFor(f.code) === icao).length;
              return (
                <div key={icao} className="hero__base">
                  <strong>{icao}</strong>
                  <span>{airport?.name ?? icao}</span>
                  <span className="hero__base-facts">{types} types based here · {routes} routes</span>
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
              <div className="stat"><span className="stat__value">{facts.countries}</span><span className="stat__label">Countries and territories</span></div>
            </>
          )}
        </div>
        <p className="stats__source">{all ? "Statistics from vAMSYS, updated with every sync." : "Counted from the published schedule. Flight statistics appear once live vAMSYS data is connected."}</p>
      </section>

      <section className="page">
        <SectionHead eyebrow="Why Crossroads" title="An airline built like a real charter operator" />
        <ul className="reasons">
          <li>
            <h3>{`${capital(countWords(baseList.length, "airport", "airports"))}, real logic`}</h3>
            <p>Light and mid-size aircraft, from the Piper M600 to the Citation X, work from Indianapolis Executive. The Longitude and everything larger fly from Indianapolis International, the way a real operator would split it.</p>
          </li>
          <li>
            <h3>Business jet to freighter</h3>
            <p>{`${facts.aircraftTypes} types${divisionCount ? ` across ${countWords(divisionCount, "division", "divisions")}` : ""} on one schedule.`} Fly a 47-minute hop to Midway in the morning and a 777F to Leipzig at night.</p>
          </li>
          <li>
            <h3>A career you can see</h3>
            <p>{`${ladderPhrase(rankLadder(snapshot))}, earned with hours and accepted PIREPs.`} One logbook covers every aircraft you fly.</p>
          </li>
          <li>
            <h3>Briefed before you board</h3>
            <p>Every route has a Crew Tools briefing with live weather, runway winds, a fuel estimate and an approach card. Book on vAMSYS, dispatch with SimBrief, and Pegasus files the PIREP.</p>
          </li>
        </ul>
      </section>

      {airline.divisions.length ? (
        <section className="page">
          <SectionHead eyebrow={capital(countWords(divisionCount, "division", "divisions"))} title="Pick your flying" intro={`Every pilot can fly every division. Each route only offers the aircraft that suit it. Divisions share routes, so the counts add up to more than ${snapshot.routes.length}.`} action={{ href: "#/services", label: "Divisions and services" }} />
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
                  <a className="text-link" href={service ? `#/services?d=${service.slug}` : `#/routes?division=${encodeURIComponent(division.name)}`}><span>Sample itinerary<span className="visually-hidden">: {division.name}</span> <span aria-hidden="true">→</span></span></a>
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
          {recent.length
            ? <SectionHead eyebrow="Just landed" title="Latest flights" />
            : <SectionHead eyebrow="Airline setup" title="Setup test flights" />}
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
                {SETUP_FLIGHTS.map((f) => (
                  <li key={f.callsign}>
                    <strong className="callsign">{f.callsign}</strong>
                    <Leg from={f.from} to={f.to} snapshot={snapshot} />
                    <span className="muted">{f.aircraft}</span>
                  </li>
                ))}
              </ul>
              <p className="fineprint">{SETUP_NOTE}</p>
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
            <h2>Founding pilots welcome.</h2>
            <p>{foundingLine(snapshot)}</p>
          </div>
          <div className="hero__actions">
            <JoinButton snapshot={snapshot} />
            {registrationOpen(snapshot) ? <a className="button button--ghost" href="#/pilots">{HOW_TO_JOIN}</a> : null}
          </div>
        </div>
      </section>
    </>
  );
}

function HomeNumbers({ snapshot }: PageProps) {
  const stats = networkStats(snapshot);
  const { longest } = stats;
  const place = (icao: string) => snapshot.airports[icao]?.name ?? icao;
  return (
    <ul className="home-numbers">
      {/* The stored route in its own direction, so the flight number matches the order of the airports. */}
      {longest ? <li><span>Longest leg</span><a href={routeHref(longest)}>{routeKey(longest)} {place(longest.from)} to {place(longest.to)} · {formatNumber(longest.distance_nm)} nm</a></li> : null}
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
    ? "KTYQ takes light and mid-size aircraft, from the Piper M600 to the Citation X. KIND takes the Longitude, Gulfstreams, airliners and freighters."
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
            ? "Live tracking switches on once the vAMSYS data connection is enabled. Until then, here's the network you can fly."
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
  const tonnes = payloadTonnes(type.max_cargo, type.weight_unit);
  // With neither a livery render nor a photo the media area is a slim strip with the code.
  const media = info?.livery ? " fleet-card__media--livery" : type.image ? "" : " fleet-card__media--empty";
  return (
    <li className="fleet-card" id={`type-${type.code}`}>
      <div className={`fleet-card__media${media}`} style={{ ["--accent" as string]: accent }}>
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
        {/* The role already says what kind of aircraft it is; the kind word stands in when there is none. */}
        <p className="eyebrow">{type.code}{info ? ` · ${info.role}` : type.type ? ` · ${KIND[type.type] ?? type.type}` : ""}</p>
        <h3><a className="card-link" href={typeHref(type.code)}>{type.name}</a></h3>
        {info ? <p className="fleet-card__blurb">{info.blurb}</p> : null}
        <dl className="specs specs--4">
          {isFreighter(type)
            ? <div><dt>Payload</dt><dd>{tonnes != null ? <>{formatNumber(tonnes)}<span className="specs__unit"> t</span></> : "—"}</dd></div>
            : <div><dt>Seats</dt><dd>{formatNumber(type.max_pax)}</dd></div>}
          <div><dt>Range</dt><dd>{info ? <>{formatNumber(info.range_nm)}<span className="specs__unit"> nm</span></> : "—"}</dd></div>
          <div><dt>Cruise</dt><dd>{info ? <>{info.cruise_kt}<span className="specs__unit"> kt</span></> : "—"}</dd></div>
          <div><dt>Routes</dt><dd>{routes}</dd></div>
        </dl>
        <p className="fleet-card__row">
          <span className={`tag tag--base tag--${base.toLowerCase()}`}>Base {base}</span>
          {type.registrations.map((r) => <span key={r} className="reg">{r}</span>)}
        </p>
        {sim ? <p className="sim-aircraft"><span>Fly it in MSFS 2024</span>{sim}</p> : null}
        <p className="fleet-card__links">
          {/* Label, hidden words and arrow share one inner span, so the flex link sets one ordinary space before the arrow. */}
          <a className="text-link" href={typeHref(type.code)}><span>Specs and routes<span className="visually-hidden"> for the {type.name}</span> <span aria-hidden="true">→</span></span></a>
          <a className="text-link" href={`#/routes?type=${encodeURIComponent(type.code)}`}><span>On the map<span className="visually-hidden">: {type.name} routes</span> <span aria-hidden="true">→</span></span></a>
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
      <PageHeader eyebrow="Fleet" title="From Mustang to 777F" lede={`${snapshot.fleet.length} aircraft types and ${formatNumber(total)} airframes, every one registered N…CR. Light and mid-size aircraft live at Indianapolis Executive, everything larger at Indianapolis International.`}>
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
  const based = snapshot.routes.filter((r) => routeBase(r, baseList) !== "").length;
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

  const chooseDivision = (name: string) => {
    setDivisionName(name);
    if (type && !snapshot.routes.some((r) => r.types.includes(type) && routeInDivision(r, divisions.find((d) => d.name === name)))) setType("");
    const hash = name ? `#/routes?division=${encodeURIComponent(name)}` : "#/routes";
    window.history.replaceState(null, "", hash);
  };

  return (
    <>
      <PageHeader eyebrow="Route explorer" title={`${snapshot.routes.length} routes, ${based} of them to or from Indianapolis`} lede="Choose any airport on the map or in the list to see its routes as great circles, then pick a route for distance, block time, the aircraft that fly it and a booking link. Every route can be booked in the vAMSYS pilot portal and has a Crew Tools briefing." />
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
              <option value="">{`${baseList.length === 2 ? "Both bases" : "All bases"} and point-to-point`}</option>
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
        {/* The list sits below the map: the button jumps there and moves focus to its heading. */}
        <button type="button" className="text-link text-link--button" onClick={() => jumpTo(document.getElementById("route-list"))}>{`Jump to the ${listCount}`}</button>
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
            <p className="fineprint kbd-hint" id="explorer-keys">Keyboard: Tab to an airport on the map, arrow keys to move between airports, Enter or Space to select, Escape to clear.</p>
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

/**
 * The steps from sign-up to accepted PIREP, as the vAMSYS pilot docs give them (How to Register,
 * Pegasus ACARS, How to Book a Flight, SimBrief Integration; read 2026-11-12) and the Crossroads rules
 * on vAMSYS say. `join` marks the step that carries the registration status.
 */
const WALKTHROUGH: { title: string; tool: string; body: string; tips: string[]; link?: { href: string; label: string }; join?: boolean }[] = [
  {
    title: "Create your pilot account",
    tool: "vAMSYS",
    body: "Crossroads runs on vAMSYS, which holds our schedule, bookings and logbooks. New to vAMSYS? On the Crossroads sign-up page, create an account with your name, email address and a password, then confirm your email and finish the Crossroads registration. Already fly for another airline on vAMSYS? Sign in on the same page with that account instead of making a new one: vAMSYS allows one account per person.",
    tips: [
      "The form asks you to accept the Crossroads rules, which you can read first (link below)",
      "vAMSYS gives you your pilot username, CRX and a number, so there's nothing to choose",
      "From then on you sign in to Phoenix, the vAMSYS pilot portal",
    ],
    link: { href: RULES_URL, label: "Crossroads rules on vAMSYS" },
    join: true,
  },
  {
    title: "Install Pegasus",
    tool: "Pegasus ACARS",
    body: "Pegasus is vAMSYS's flight tracker. It runs next to your simulator, records the flight from the gate to the gate, and files your PIREP when you're done.",
    tips: [
      "In Phoenix, open Resources → Pegasus ACARS to download it, and sign in with your vAMSYS account",
      "On MSFS 2020 and 2024 Pegasus reads the simulator through FSUIPC, so install FSUIPC as well and keep it up to date",
      "Pegasus lists Crossroads only once you hold a booking, so book first, then open it",
    ],
    link: { href: PEGASUS_URL, label: "Pegasus ACARS guide (vAMSYS docs)" },
  },
  {
    title: "Book a route",
    tool: "vAMSYS Phoenix",
    body: "In Phoenix, book a route that departs from your current airport and lists your aircraft. Light and mid-size aircraft fly from KTYQ, everything larger from KIND. To start somewhere else, use Jumpseat in Phoenix first. Never reposition the aircraft in the simulator.",
    tips: [
      "Book before you fly: without a booking, a flight can't be added to your logbook afterwards",
      "A booking stays valid for 24 hours",
      "Use the Network page here to plan by division, base or aircraft",
    ],
  },
  {
    title: "Dispatch with SimBrief",
    tool: "SimBrief",
    body: "Generate your OFP from the booking. SimBrief gives you the route, fuel and weights. Load the plan into your aircraft's FMS and check it against the Crew Tools briefing for weather and runway winds.",
    tips: [
      "Once: link your Navigraph account, which is your SimBrief login, under My vAMSYS Account → Social, Online & 3rd Party",
      "Fuel policy: 45 minutes final reserve, always",
      "Use cost index guidance from the handbook",
    ],
  },
  {
    title: "Fly it",
    tool: "MSFS + Pegasus",
    body: "Start cold and dark at a parking spot at the departure airport, load the flight plan, and start Pegasus before engine start. Online on VATSIM or offline, it's up to you.",
    tips: ["Stabilised by 1,000 ft in cloud and 500 ft visual, or go around", "No slew, time acceleration or in-flight refuelling"],
  },
  {
    title: "File the PIREP",
    tool: "Pegasus → vAMSYS",
    body: "Pegasus files the PIREP when you shut down at the gate. Add comments for anything unusual. Staff review it, and accepted flights count toward your hours, your rank and the airline's statistics on this site.",
    tips: ["Target a 60–250 fpm touchdown", "Diversions and go-arounds belong in the comments"],
  },
];

/** The honest note for visitors: a new airline. No pilot counts, and nothing that implies other pilots. */
export const NEW_AIRLINE =
  "Crossroads opened on vAMSYS in November 2026 and is just getting started. Founding pilots welcome; you could be one of the first.";

/** Shown until registration opens (registrationOpen). */
export const REGISTRATION_CLOSED =
  `Crossroads is brand new, and its sign-up page on vAMSYS isn't taking new pilots yet. When it opens, the ${REGISTER_LABEL} buttons on this site will go straight to it.`;

/**
 * FAQ answer: the types in every edition of MSFS 2024 (defaultSimTypes, the Standard edition's) and
 * how many routes they fly, counted from the schedule.
 */
export function addOnAnswer(snapshot: Snapshot, defaults: FleetType[]): string {
  const names = listJoin(defaults.map((f) => shortName(f.name)));
  const routes = routesForTypes(snapshot, defaults).length;
  const one = defaults.length === 1;
  return `Not to start. The ${names} ${one ? "comes" : "come"} with every edition of MSFS 2024 and ${one ? "flies" : "between them fly"} ${routes} of our ${snapshot.routes.length} routes. For every other type, the fleet page names the model we use, and any model of the same type works.`;
}

/** The suggested first flight (explore.ts firstFlight): the starter tour's first leg, from the schedule. */
export function FirstFlightCard({ first, snapshot }: { first: FirstFlight; snapshot: Snapshot }) {
  const { route, tour, defaults } = first;
  const key = routeKey(route);
  const one = defaults.length === 1;
  return (
    <div className="mini-card">
      <h2 className="h3">Your first flight</h2>
      <p><strong>{key}</strong> <Leg from={route.from} to={route.to} snapshot={snapshot} /> · {formatNumber(route.distance_nm)} nm · {formatDuration(route.duration_min)}</p>
      <ul className="ticks">
        {defaults.length ? <li>{`No add-on needed: the ${listJoin(defaults.map((f) => shortName(f.name)))} ${one ? "comes" : "come"} with MSFS 2024 and ${one ? "flies" : "fly"} this route.`}</li> : null}
        <li>{`It's leg 1 of the ${tour.name} tour. Register for the tour under Events in Phoenix first, then book the leg from the tour page.`}</li>
        <li>{`It departs from ${route.from}. If Phoenix shows you somewhere else, use Jumpseat first.`}</li>
      </ul>
      <a className="text-link" href={routeHref(route)}><span>Route details and SimBrief link<span className="visually-hidden">: {key}</span> <span aria-hidden="true">→</span></span></a>
    </div>
  );
}

export function PilotsPage({ snapshot }: PageProps) {
  const { airline } = snapshot;
  const facts = networkFacts(snapshot);
  const open = registrationOpen(snapshot);
  const first = firstFlight(snapshot);
  const defaults = defaultSimTypes(snapshot);
  const faqs: { q: string; a: string }[] = [
    { q: "Do I need real-world flying experience?", a: "No. Bring your simulator and a willingness to fly by the book. The career ladder starts you in light jets and you work up from there." },
    ...(defaults.length ? [{ q: "Do I need add-on aircraft?", a: addOnAnswer(snapshot, defaults) }] : []),
    { q: "Which simulators and aircraft can I use?", a: "Flights are tracked with vAMSYS's Pegasus ACARS, which works with MSFS 2020 and 2024, X-Plane 10, 11 and 12, Prepar3D, FSX and FS2004 (the vAMSYS Pegasus guide keeps the current list). The fleet page lists the MSFS 2024 model we use for each type. Use any model of the same type you own." },
    { q: "Can I fly the big jets straight away?", a: "Yes. Every route is open to every pilot. Ranks recognise experience by hours and accepted PIREPs. They don't lock you out of aircraft." },
    { q: "Where does each flight start?", a: "Light and mid-size aircraft (Piper M600, Mustang, Premier IA, CJ4, Learjet 35A, Phenom 300E, Hawker 800XP, Citation X) work from Indianapolis Executive, KTYQ. Everything larger works from Indianapolis International, KIND." },
    { q: "Do I have to fly on VATSIM?", a: `Online or offline, your choice. If you fly online, use your CRX callsign, put ${VATSIM_REMARKS} in your flight plan remarks and follow the VATSIM Code of Conduct. Among other things it says “Pilots shall monitor their flights at all times” (B3(a)) and “Only unaltered speech is permitted to be transmitted” (A14(d)).` },
    { q: "Is this a real airline?", a: "No. Crossroads Executive & Charter is a fictional virtual airline for flight simulation. It doesn't sell flights and isn't connected to any real operator." },
  ];

  return (
    <>
      <PageHeader eyebrow="Fly with us" title="How to join and fly" lede={`${capital(numberWord(WALKTHROUGH.length))} steps from vAMSYS sign-up to your first accepted PIREP. Fly our ${facts.routes}-route schedule from home and build your logbook from Cadet to Chief Pilot.`}>
        <div className="hero__actions">
          {open ? <JoinButton snapshot={snapshot} /> : null}
          {airline.pilot_login_url ? <a className="button button--ghost" href={airline.pilot_login_url} rel="noopener">Existing pilots: log in</a> : null}
          {airline.discord_url ? <a className="button button--ghost" href={airline.discord_url} rel="noopener">{DISCORD_LABEL}</a> : null}
        </div>
      </PageHeader>

      <section className="page">
        {open ? null : (
          <p className="callout">
            <strong>Registration isn't open yet.</strong> {REGISTRATION_CLOSED} Until then, <a href="#/routes">explore the network</a>, plan your first flight and read the <a href="#/handbook">pilot handbook</a>.
          </p>
        )}
        <div className="two-up">
          <div className="mini-card">
            <h2 className="h3">A new airline</h2>
            <p>{NEW_AIRLINE}</p>
            <p><strong>{JOIN_TERMS}</strong></p>
          </div>
          {first ? <FirstFlightCard first={first} snapshot={snapshot} /> : null}
        </div>
        <ol className="walkthrough">
          {WALKTHROUGH.map((step, i) => (
            <li key={step.title} className="walkthrough__step">
              <span className="walkthrough__num" aria-hidden="true">{String(i + 1).padStart(2, "0")}</span>
              <div>
                <p className="eyebrow">{step.tool}</p>
                <h2>{step.title}</h2>
                <p>{step.body}</p>
                <ul className="ticks">{step.tips.map((t) => <li key={t}>{t}</li>)}</ul>
                {step.join ? (
                  open && airline.join_url
                    ? <p><a className="text-link" href={airline.join_url} rel="noopener">Crossroads sign-up page on vAMSYS&nbsp;↗</a></p>
                    : <p className="fineprint">Not open yet: see the note at the top of this page.</p>
                ) : null}
                {step.link ? <a className="text-link" href={step.link.href} rel="noopener" target="_blank">{step.link.label}&nbsp;↗<span className="visually-hidden"> (opens in a new tab)</span></a> : null}
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
          <SectionHead eyebrow="Home base" title={`Indianapolis, ${countWords(bases(snapshot).length, "airport", "airports")}`} />
          <ul className="hub-list">
            {bases(snapshot).map((icao) => {
              const airport = snapshot.airports[icao];
              const here = snapshot.fleet.filter((f) => baseFor(f.code) === icao);
              return (
                <li key={icao} className="hub">
                  <h3>{icao}{airport ? <span className="hub__name">{airport.name}</span> : null}</h3>
                  <p className="hub__airports">{icao === "KTYQ" ? "Light and mid-size aircraft" : "Large-cabin jets, airliners and freighters"}</p>
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

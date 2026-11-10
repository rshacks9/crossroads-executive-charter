import { useCallback, useMemo, useState } from "react";
import type { AirlineEvent, LiveFlight, Snapshot } from "./data";
import {
  filterRoutes,
  formatCompact,
  formatDate,
  formatDuration,
  formatFeet,
  formatNumber,
  progressPercent,
  relativeAge,
} from "./data";
import { LiveMap } from "./LiveMap";

interface PageProps {
  snapshot: Snapshot;
}

// ------------------------------------------------------------------ shared bits

function SectionHead({ eyebrow, title, action }: { eyebrow: string; title: string; action?: { href: string; label: string } }) {
  return (
    <div className="section-head">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h2>{title}</h2>
      </div>
      {action ? <a className="text-link" href={action.href}>{action.label} →</a> : null}
    </div>
  );
}

function Leg({ from, to, snapshot }: { from: string; to: string; snapshot: Snapshot }) {
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

function bases(snapshot: Snapshot): string[] {
  return [...new Set(snapshot.hubs.flatMap((hub) => hub.airports))];
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

function EventItem({ event }: { event: AirlineEvent }) {
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

// ------------------------------------------------------------------ home

export function HomePage({ snapshot }: PageProps) {
  const { airline, stats, live, hubs, events, recent_flights: recent } = snapshot;
  const all = stats.all_time;
  const month = stats.last_30_days;
  const home = hubs.find((h) => h.default) ?? hubs[0];

  return (
    <>
      <section className="hero">
        <div className="hero__inner">
          <p className="eyebrow eyebrow--on-ink">Virtual airline{home ? ` · Based in ${home.name}` : ""}</p>
          <h1>{airline.name}</h1>
          {airline.tagline ? <p className="hero__lede">{airline.tagline}</p> : null}
          <div className="hero__actions">
            {airline.join_url ? (
              <a className="button" href={airline.join_url} rel="noopener">Apply to fly with us</a>
            ) : (
              <a className="button" href="#/pilots">How to join</a>
            )}
            <a className="button button--ghost" href="#/live">
              {live.length ? `${live.length} ${live.length === 1 ? "flight" : "flights"} in the air` : "Live flights"}
            </a>
          </div>
        </div>
      </section>

      {all ? (
        <section className="stats" aria-label="Airline statistics">
          <div className="stats__inner">
            <div className="stat"><span className="stat__value">{formatCompact(all.flights)}</span><span className="stat__label">Flights flown</span></div>
            <div className="stat"><span className="stat__value">{formatCompact(all.flight_hours)}</span><span className="stat__label">Flight hours</span></div>
            <div className="stat"><span className="stat__value">{formatCompact(all.passengers)}</span><span className="stat__label">Passengers carried</span></div>
            <div className="stat">
              <span className="stat__value">{month?.flights != null ? formatNumber(month.flights) : formatNumber(all.average_landing_rate)}</span>
              <span className="stat__label">{month?.flights != null ? "Flights, last 30 days" : "Avg landing rate (fpm)"}</span>
            </div>
          </div>
        </section>
      ) : null}

      <section className="page">
        <SectionHead eyebrow="Right now" title="On the map" action={{ href: "#/live", label: "Full live board" }} />
        <LiveUnavailable snapshot={snapshot} />
        <div className="live-grid">
          <LiveMap flights={live} airports={snapshot.airports} bases={bases(snapshot)} height={380} />
          {live.length ? (
            <ul className="flight-list">
              {live.slice(0, 4).map((flight, i) => <FlightCard key={`${flight.callsign}-${i}`} flight={flight} snapshot={snapshot} />)}
            </ul>
          ) : (
            <div className="empty">
              <h3>Quiet skies</h3>
              <p>No Crossroads flights are airborne at the moment. Check back soon, or see where we fly.</p>
              <a className="text-link" href="#/routes">Browse routes →</a>
            </div>
          )}
        </div>
      </section>

      <section className="page page--split">
        <div>
          <SectionHead eyebrow="Coming up" title="Events" action={events.length ? { href: "#/events", label: "All events" } : undefined} />
          {events.length ? (
            <ul className="event-list">{events.slice(0, 2).map((e) => <EventItem key={e.name + e.start} event={e} />)}</ul>
          ) : (
            <p className="muted">No events are scheduled right now.</p>
          )}
        </div>
        <div>
          <SectionHead eyebrow="Just landed" title="Recent flights" />
          {recent.length ? (
            <table className="table table--compact">
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
            <p className="muted">No completed flights to show yet.</p>
          )}
        </div>
      </section>

      {hubs.length ? (
        <section className="page">
          <SectionHead eyebrow="Where we're based" title="Hubs" action={{ href: "#/pilots", label: "Pilot ranks and hubs" }} />
          <ul className="hub-list">
            {hubs.map((hub) => (
              <li key={hub.name} className="hub">
                <h3>{hub.name}{hub.default ? <span className="tag tag--accent">Home hub</span> : null}</h3>
                <p className="hub__airports">{hub.airports.map((icao) => snapshot.airports[icao]?.name ? `${icao} · ${snapshot.airports[icao]!.name}` : icao).join(" / ") || "—"}</p>
                {hub.pilots != null ? <p className="muted">{formatNumber(hub.pilots)} pilots</p> : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  );
}

// ------------------------------------------------------------------ live

export function LivePage({ snapshot }: PageProps) {
  const [selected, setSelected] = useState<number | null>(null);
  const select = useCallback((index: number) => setSelected(index), []);
  const { live } = snapshot;
  return (
    <section className="page">
      <h1 className="page-title">Live flights</h1>
      <p className="lede">
        {live.length ? `${live.length} ${live.length === 1 ? "flight is" : "flights are"} in progress.` : "No flights are in progress right now."}{" "}
        Positions as of <time dateTime={snapshot.generated_at}>{relativeAge(snapshot.generated_at)}</time>; this page refreshes every minute.
      </p>
      <LiveUnavailable snapshot={snapshot} />
      <LiveMap flights={live} airports={snapshot.airports} bases={bases(snapshot)} height={520} onSelect={select} />
      {live.length ? (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th scope="col">Flight</th><th scope="col">Route</th><th scope="col">Aircraft</th><th scope="col">Phase</th>
                <th scope="col" className="num">Altitude</th><th scope="col" className="num">Speed</th><th scope="col">Progress</th><th scope="col">ETA</th>
              </tr>
            </thead>
            <tbody>
              {live.map((f, i) => (
                <tr key={`${f.callsign}-${i}`} className={selected === i ? "is-selected" : undefined}>
                  <td data-label="Flight"><strong>{f.callsign ?? f.flight_number ?? "—"}</strong>{f.pilot ? <span className="sub">{f.rank ? `${f.rank} ` : ""}{f.pilot}</span> : null}</td>
                  <td data-label="Route"><Leg from={f.from} to={f.to} snapshot={snapshot} /></td>
                  <td data-label="Aircraft">{f.aircraft ?? "—"}{f.registration ? <span className="sub">{f.registration}</span> : null}</td>
                  <td data-label="Phase">{f.phase ?? "—"}</td>
                  <td data-label="Altitude" className="num">{formatFeet(f.altitude_ft)}</td>
                  <td data-label="Speed" className="num">{f.groundspeed_kt != null ? `${f.groundspeed_kt} kt` : "—"}</td>
                  <td data-label="Progress"><Progress flight={f} />{f.remaining_nm != null ? <span className="sub">{formatNumber(f.remaining_nm)} nm to go</span> : null}</td>
                  <td data-label="ETA">{f.eta ? formatDate(f.eta, true) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}

// ------------------------------------------------------------------ fleet

const KIND: Record<string, string> = {
  pax: "Passenger",
  cargo: "Cargo",
  "pax-cargo": "Passenger & cargo",
  "pax-containers": "Passenger",
  "cargo-containers": "Cargo",
};

export function FleetPage({ snapshot }: PageProps) {
  const total = snapshot.fleet.reduce((sum, f) => sum + f.aircraft_count, 0);
  return (
    <section className="page">
      <h1 className="page-title">Fleet</h1>
      <p className="lede">{snapshot.fleet.length} aircraft types, {formatNumber(total)} airframes on the line.</p>
      {snapshot.unavailable.includes("aircraft") ? <p className="callout">Airframe counts could not be refreshed this time.</p> : null}
      <ul className="fleet-grid">
        {snapshot.fleet.map((type) => (
          <li key={type.code} className="fleet-card">
            <div className="fleet-card__media">
              {type.image ? (
                <img src={type.image} alt={type.name} loading="lazy" referrerPolicy="no-referrer" />
              ) : (
                <span className="fleet-card__code" aria-hidden="true">{type.code}</span>
              )}
            </div>
            <div className="fleet-card__body">
              <p className="eyebrow">{type.code}{type.type ? ` · ${KIND[type.type] ?? type.type}` : ""}</p>
              <h2>{type.name}</h2>
              <dl className="specs">
                <div><dt>In fleet</dt><dd>{type.aircraft_count}</dd></div>
                <div><dt>Seats</dt><dd>{formatNumber(type.max_pax)}</dd></div>
                <div><dt>Cargo</dt><dd>{type.max_cargo != null ? `${formatNumber(type.max_cargo)} ${type.weight_unit ?? ""}` : "—"}</dd></div>
              </dl>
              {type.registrations.length ? (
                <p className="regs" aria-label="Registrations">{type.registrations.map((r) => <span key={r} className="reg">{r}</span>)}</p>
              ) : null}
              {type.image && type.image_attribution ? (
                <p className="credit">
                  Photo: {type.image_link ? <a href={type.image_link} rel="noopener">{type.image_attribution}</a> : type.image_attribution}
                </p>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ------------------------------------------------------------------ routes

export function RoutesPage({ snapshot }: PageProps) {
  const [query, setQuery] = useState("");
  const [type, setType] = useState("");
  const types = useMemo(() => [...new Set(snapshot.routes.flatMap((r) => r.types))].sort(), [snapshot.routes]);
  const shown = useMemo(() => filterRoutes(snapshot.routes, query, type), [snapshot.routes, query, type]);
  const names = Object.fromEntries(snapshot.fleet.map((f) => [f.code, f.name]));

  return (
    <section className="page">
      <h1 className="page-title">Route network</h1>
      <p className="lede">{snapshot.routes.length} scheduled routes. Book any of them through the pilot portal.</p>
      <form className="filters" role="search" onSubmit={(e) => e.preventDefault()}>
        <label>
          <span>Search</span>
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="ICAO or flight number" autoComplete="off" />
        </label>
        <label>
          <span>Aircraft</span>
          <select value={type} onChange={(e) => setType(e.target.value)}>
            <option value="">All types</option>
            {types.map((t) => <option key={t} value={t}>{names[t] ? `${names[t]} (${t})` : t}</option>)}
          </select>
        </label>
        <p className="filters__count" aria-live="polite">{shown.length} shown</p>
      </form>
      {shown.length ? (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr><th scope="col">Flight</th><th scope="col">From</th><th scope="col">To</th><th scope="col" className="num">Distance</th><th scope="col" className="num">Time</th><th scope="col">Aircraft</th><th scope="col">Days</th></tr>
            </thead>
            <tbody>
              {shown.slice(0, 400).map((r, i) => (
                <tr key={`${r.flight_number}-${r.from}-${r.to}-${i}`}>
                  <td data-label="Flight"><strong>{r.callsign ?? r.flight_number ?? "—"}</strong>{r.departure_time ? <span className="sub">dep {r.departure_time}</span> : null}</td>
                  <td data-label="From"><strong>{r.from}</strong><span className="sub">{snapshot.airports[r.from]?.name}</span></td>
                  <td data-label="To"><strong>{r.to}</strong><span className="sub">{snapshot.airports[r.to]?.name}</span></td>
                  <td data-label="Distance" className="num">{r.distance_nm != null ? `${formatNumber(r.distance_nm)} nm` : "—"}</td>
                  <td data-label="Time" className="num">{formatDuration(r.duration_min)}</td>
                  <td data-label="Aircraft">{r.types.join(", ") || "Any"}</td>
                  <td data-label="Days">{r.days.join(" ") || "Daily"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {shown.length > 400 ? <p className="muted">Showing the first 400 matches. Narrow your search to see more.</p> : null}
        </div>
      ) : (
        <p className="empty">No routes match that search.</p>
      )}
    </section>
  );
}

// ------------------------------------------------------------------ pilots

export function PilotsPage({ snapshot }: PageProps) {
  const { airline } = snapshot;
  const ladder = snapshot.ranks.filter((r) => !r.honorary);
  return (
    <section className="page">
      <h1 className="page-title">Fly for Crossroads</h1>
      <p className="lede">Pilots fly our schedule from home in their simulator, log flights automatically, and work up the rank ladder.</p>

      <ol className="steps">
        <li><h2>Apply</h2><p>Create your pilot account through our vAMSYS application{airline.join_url ? "" : " (link coming soon)"}.</p></li>
        <li><h2>Get approved</h2><p>Staff review applications and confirm your starting hub.</p></li>
        <li><h2>Book and fly</h2><p>Pick a route, fly it with tracking running, and your flight is filed for review.</p></li>
      </ol>
      <div className="hero__actions">
        {airline.join_url ? <a className="button" href={airline.join_url} rel="noopener">Start your application</a> : null}
        {airline.pilot_login_url ? <a className="button button--quiet" href={airline.pilot_login_url} rel="noopener">Existing pilots: log in</a> : null}
        {airline.discord_url ? <a className="button button--quiet" href={airline.discord_url} rel="noopener">Join our Discord</a> : null}
      </div>

      {ladder.length ? (
        <>
          <SectionHead eyebrow="Career path" title="Ranks" />
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th scope="col">Rank</th><th scope="col" className="num">Hours</th><th scope="col" className="num">Flights</th><th scope="col">What it unlocks</th><th scope="col" className="num">Pilots</th></tr></thead>
              <tbody>
                {ladder.map((rank) => (
                  <tr key={rank.name}>
                    <td data-label="Rank"><strong>{rank.name}</strong>{rank.abbreviation ? <span className="sub">{rank.abbreviation}</span> : null}</td>
                    <td data-label="Hours" className="num">{formatNumber(rank.hours)}</td>
                    <td data-label="Flights" className="num">{formatNumber(rank.flights)}</td>
                    <td data-label="Unlocks">{rank.description ?? "—"}</td>
                    <td data-label="Pilots" className="num">{formatNumber(rank.pilots)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : null}

      {snapshot.hubs.length ? (
        <>
          <SectionHead eyebrow="Bases" title="Hubs" />
          <ul className="hub-list">
            {snapshot.hubs.map((hub) => (
              <li key={hub.name} className="hub">
                <h3>{hub.name}{hub.default ? <span className="tag tag--accent">Home hub</span> : null}</h3>
                <p className="hub__airports">{hub.airports.join(" / ") || "—"}</p>
                {hub.pilots != null ? <p className="muted">{formatNumber(hub.pilots)} pilots</p> : null}
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </section>
  );
}

// ------------------------------------------------------------------ events

export function EventsPage({ snapshot }: PageProps) {
  return (
    <section className="page page--narrow">
      <h1 className="page-title">Events</h1>
      <p className="lede">Group flights, tours and challenges. Register and fly them from the pilot portal.</p>
      {snapshot.unavailable.includes("events") ? <p className="callout">Events could not be refreshed this time.</p> : null}
      {snapshot.events.length ? (
        <ul className="event-list">{snapshot.events.map((e) => <EventItem key={e.name + e.start} event={e} />)}</ul>
      ) : (
        <p className="empty">Nothing is scheduled right now. New events are announced on our Discord.</p>
      )}
    </section>
  );
}

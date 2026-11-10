import { useCallback, useMemo, useState } from "react";
import type { AirlineEvent, Division, LiveFlight, Snapshot } from "./data";
import {
  filterRoutes,
  formatCompact,
  formatDate,
  formatDuration,
  formatFeet,
  formatNumber,
  formatWeight,
  hashParam,
  networkFacts,
  progressPercent,
  relativeAge,
  routeInDivision,
} from "./data";
import { DIVISION_COLORS, LiveMap } from "./LiveMap";

interface PageProps {
  snapshot: Snapshot;
}

// ------------------------------------------------------------------ shared bits

function SectionHead({ eyebrow, title, action, intro }: { eyebrow: string; title: string; action?: { href: string; label: string }; intro?: string }) {
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

function joinHref(snapshot: Snapshot): { href: string; external: boolean } {
  return snapshot.airline.join_url ? { href: snapshot.airline.join_url, external: true } : { href: "#/pilots", external: false };
}

function JoinButton({ snapshot, label = "Apply to fly with us", quiet = false }: { snapshot: Snapshot; label?: string; quiet?: boolean }) {
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

function DivisionDot({ index }: { index: number }) {
  return <span className="division-dot" style={{ background: DIVISION_COLORS[index % DIVISION_COLORS.length] }} aria-hidden="true" />;
}

function MapLegend({ snapshot }: PageProps) {
  if (!snapshot.airline.divisions.length) return null;
  return (
    <ul className="legend" aria-label="Map legend">
      {snapshot.airline.divisions.map((d, i) => (
        <li key={d.name}><DivisionDot index={i} />{d.name}</li>
      ))}
      <li><span className="legend__dash" aria-hidden="true" />Cargo routes dashed</li>
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

function CareerLadder({ snapshot }: PageProps) {
  const ladder = snapshot.ranks.filter((r) => !r.honorary);
  if (!ladder.length) return null;
  return (
    <ol className="ladder">
      {ladder.map((rank, i) => (
        <li key={rank.name} className="ladder__step" style={{ ["--step" as string]: i }}>
          <span className="ladder__level" aria-hidden="true">{String(i + 1).padStart(2, "0")}</span>
          <strong>{rank.name}</strong>
          <span className="ladder__req">
            {rank.hours ? `${formatNumber(rank.hours)} h` : "Day one"}
            {rank.flights ? ` · ${formatNumber(rank.flights)} flights` : ""}
          </span>
          {rank.description ? <span className="ladder__desc">{rank.description}</span> : null}
        </li>
      ))}
    </ol>
  );
}

// ------------------------------------------------------------------ home

export function HomePage({ snapshot }: PageProps) {
  const { airline, stats, live, events, recent_flights: recent, fleet } = snapshot;
  const facts = networkFacts(snapshot);
  const all = stats.all_time;
  const month = stats.last_30_days;
  const heaviest = fleet.find((f) => f.code === "A388") ?? fleet.find((f) => f.code === "MD11") ?? fleet.find((f) => f.type === "cargo");
  const smallest = fleet.find((f) => f.code === "C510") ?? fleet[0];

  return (
    <>
      <section className="hero">
        <div className="hero__inner">
          <p className="eyebrow eyebrow--on-ink">Virtual airline · Indianapolis, Indiana</p>
          <h1>{airline.name}</h1>
          {airline.tagline ? <p className="hero__lede">{airline.tagline}</p> : null}
          <p className="hero__pitch">
            {smallest && heaviest
              ? `From the ${smallest.name.replace(/^Cessna /, "")} to the ${heaviest.name.replace(/^(McDonnell Douglas|Airbus) /, "").replace(/-800 Executive$/, "")}: ${facts.aircraftTypes} aircraft types, ${facts.routes} routes and one career path.`
              : `${facts.aircraftTypes} aircraft types, ${facts.routes} routes and one career path.`}
          </p>
          <div className="hero__actions">
            <JoinButton snapshot={snapshot} />
            <a className="button button--ghost" href={live.length ? "#/live" : "#/routes"}>
              {live.length ? `${live.length} ${live.length === 1 ? "flight" : "flights"} in the air` : "Explore the network"}
            </a>
          </div>
        </div>
      </section>

      <section className="stats" aria-label={all ? "Airline statistics" : "Network at a glance"}>
        <div className="stats__inner">
          {all ? (
            <>
              <div className="stat"><span className="stat__value">{formatCompact(all.flights)}</span><span className="stat__label">Flights flown</span></div>
              <div className="stat"><span className="stat__value">{formatCompact(all.flight_hours)}</span><span className="stat__label">Flight hours</span></div>
              <div className="stat"><span className="stat__value">{formatCompact(all.passengers)}</span><span className="stat__label">Passengers carried</span></div>
              <div className="stat"><span className="stat__value">{formatNumber(month?.flights ?? null)}</span><span className="stat__label">Flights, last 30 days</span></div>
            </>
          ) : (
            <>
              <div className="stat"><span className="stat__value">{facts.aircraftTypes}</span><span className="stat__label">Aircraft types</span></div>
              <div className="stat"><span className="stat__value">{facts.routes}</span><span className="stat__label">Scheduled routes</span></div>
              <div className="stat"><span className="stat__value">{facts.destinations}</span><span className="stat__label">Destinations</span></div>
              <div className="stat"><span className="stat__value">{airline.divisions.length || facts.countries}</span><span className="stat__label">{airline.divisions.length ? "Divisions" : "Countries"}</span></div>
            </>
          )}
        </div>
      </section>

      {airline.divisions.length ? (
        <section className="page">
          <SectionHead eyebrow="Four ways to fly" title="Pick your flying" intro="Every pilot can fly every division. Switch between a 40-minute light-jet hop and a transatlantic freighter run whenever you like." />
          <ul className="division-grid">
            {airline.divisions.map((division, i) => {
              const types = fleet.filter((f) => division.fleets.includes(f.code));
              const routeCount = snapshot.routes.filter((r) => routeInDivision(r, division)).length;
              const base = division.base ? snapshot.airports[division.base] : undefined;
              return (
                <li key={division.name} className="division" style={{ ["--accent" as string]: DIVISION_COLORS[i % DIVISION_COLORS.length] }}>
                  <p className="division__base">{division.base ? `${division.base}${base ? ` · ${base.name}` : ""}` : "Network-wide"}</p>
                  <h3>{division.name}</h3>
                  {division.summary ? <p className="division__summary">{division.summary}</p> : null}
                  <p className="division__types">{types.map((t) => <span key={t.code} className="chip">{t.name.replace(/^(Cessna|Airbus|Embraer|Boeing|Gulfstream|McDonnell Douglas) /, "")}</span>)}</p>
                  <a className="text-link" href={`#/routes?division=${encodeURIComponent(division.name)}`}>{routeCount} routes →</a>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      <section className="page">
        <SectionHead
          eyebrow={live.length ? "Right now" : "Where we fly"}
          title={live.length ? "On the map" : "The network"}
          action={{ href: live.length ? "#/live" : "#/routes", label: live.length ? "Full live board" : "All routes" }}
        />
        <LiveUnavailable snapshot={snapshot} />
        <div className={live.length ? "live-grid" : ""}>
          <div>
            <LiveMap flights={live} airports={snapshot.airports} bases={bases(snapshot)} routes={live.length ? [] : snapshot.routes} divisions={airline.divisions} height={live.length ? 380 : 460} label={live.length ? "Live flights" : "Route network"} />
            {!live.length ? <MapLegend snapshot={snapshot} /> : null}
          </div>
          {live.length ? (
            <ul className="flight-list">
              {live.slice(0, 4).map((flight, i) => <FlightCard key={`${flight.callsign}-${i}`} flight={flight} snapshot={snapshot} />)}
            </ul>
          ) : null}
        </div>
      </section>

      <section className="page">
        <SectionHead eyebrow="Why Crossroads" title="Built for pilots who like variety" />
        <ul className="reasons">
          <li>
            <h3>Two bases, real-world logic</h3>
            <p>Light jets work out of Indianapolis Executive. Everything from the Longitude up flies from Indianapolis International, the way a real operator would split it.</p>
          </li>
          <li>
            <h3>Executive to freighter</h3>
            <p>{facts.aircraftTypes} types across {airline.divisions.length || "four"} divisions, from four-seat light jets to an MD-11F, all on one schedule.</p>
          </li>
          <li>
            <h3>A career you can see</h3>
            <p>Six ranks from Cadet to Chief Pilot, earned by hours and completed flights. Your logbook follows you across every aircraft.</p>
          </li>
          <li>
            <h3>Modern tools, no busywork</h3>
            <p>Book in the vAMSYS pilot portal, plan with SimBrief, and let Pegasus ACARS track and file your flight automatically.</p>
          </li>
        </ul>
      </section>

      {events.length || recent.length ? (
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
              <p className="muted">The first logbook entries will appear here.</p>
            )}
          </div>
        </section>
      ) : null}

      <section className="cta-band">
        <div className="cta-band__inner">
          <div>
            <h2>Your first flight is one application away.</h2>
            <p>Start as a Cadet in the Citation Mustang. Where you take it from there is up to you.</p>
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

// ------------------------------------------------------------------ live

export function LivePage({ snapshot }: PageProps) {
  const [selected, setSelected] = useState<number | null>(null);
  const select = useCallback((index: number) => setSelected(index), []);
  const { live } = snapshot;
  const prelaunch = snapshot.source !== "vamsys";
  return (
    <section className="page">
      <h1 className="page-title">Live flights</h1>
      <p className="lede">
        {live.length
          ? `${live.length} ${live.length === 1 ? "flight is" : "flights are"} in progress. Positions as of ${relativeAge(snapshot.generated_at)}; this page refreshes every minute.`
          : prelaunch
            ? "Live tracking switches on when our pilots start flying. Until then, here's the network they'll be flying."
            : "No flights are in progress right now. Here's where we fly."}
      </p>
      <LiveUnavailable snapshot={snapshot} />
      <LiveMap flights={live} airports={snapshot.airports} bases={bases(snapshot)} routes={live.length ? [] : snapshot.routes} divisions={snapshot.airline.divisions} height={520} onSelect={select} />
      {!live.length ? <MapLegend snapshot={snapshot} /> : null}
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
  cargo: "Freighter",
  "pax-cargo": "Passenger & cargo",
  "pax-containers": "Passenger",
  "cargo-containers": "Freighter",
};

export function FleetPage({ snapshot }: PageProps) {
  const total = snapshot.fleet.reduce((sum, f) => sum + f.aircraft_count, 0);
  const divisions = snapshot.airline.divisions;
  const groups: { title: string; base: string | null; summary: string | null; index: number; types: typeof snapshot.fleet }[] = divisions.length
    ? divisions.map((d, index) => ({
        title: d.name, base: d.base, summary: d.summary, index,
        // Keep the order the division lists its aircraft in (smallest to largest), not alphabetical.
        types: snapshot.fleet.filter((f) => d.fleets.includes(f.code)).sort((a, b) => d.fleets.indexOf(a.code) - d.fleets.indexOf(b.code)),
      }))
    : [{ title: "Fleet", base: null, summary: null, index: 0, types: snapshot.fleet }];
  const unassigned = divisions.length ? snapshot.fleet.filter((f) => !divisionFor(snapshot, f.code)) : [];
  if (unassigned.length) groups.push({ title: "Other aircraft", base: null, summary: null, index: groups.length, types: unassigned });
  const routesFor = (code: string) => snapshot.routes.filter((r) => r.types.includes(code)).length;

  return (
    <section className="page">
      <h1 className="page-title">Fleet</h1>
      <p className="lede">{snapshot.fleet.length} aircraft types, {formatNumber(total)} airframes on the line, across {groups.length} {groups.length === 1 ? "division" : "divisions"}.</p>
      {snapshot.unavailable.includes("aircraft") ? <p className="callout">Airframe counts could not be refreshed this time.</p> : null}
      {groups.filter((g) => g.types.length).map((group) => (
        <div key={group.title} className="fleet-group">
          <div className="fleet-group__head">
            <h2><DivisionDot index={group.index} />{group.title}</h2>
            {group.base ? <span className="tag">Based at {group.base}</span> : null}
          </div>
          {group.summary ? <p className="muted fleet-group__summary">{group.summary}</p> : null}
          <ul className="fleet-grid">
            {group.types.map((type) => (
              <li key={type.code} className="fleet-card">
                <div className="fleet-card__media" style={{ ["--accent" as string]: DIVISION_COLORS[group.index % DIVISION_COLORS.length] }}>
                  {type.image ? <img src={type.image} alt={type.name} loading="lazy" referrerPolicy="no-referrer" /> : <span className="fleet-card__code" aria-hidden="true">{type.code}</span>}
                </div>
                <div className="fleet-card__body">
                  <p className="eyebrow">{type.code}{type.type ? ` · ${KIND[type.type] ?? type.type}` : ""}</p>
                  <h3>{type.name}</h3>
                  {snapshot.airline.sim_aircraft?.[type.code] ? (
                    <p className="sim-aircraft"><span>Fly it in MSFS 2024</span>{snapshot.airline.sim_aircraft[type.code]}</p>
                  ) : null}
                  <dl className="specs">
                    <div><dt>In fleet</dt><dd>{type.aircraft_count}</dd></div>
                    {type.type === "cargo" || type.type === "cargo-containers"
                      ? <div><dt>Freight</dt><dd>{formatWeight(type.max_cargo, type.weight_unit)}</dd></div>
                      : <div><dt>Seats</dt><dd>{formatNumber(type.max_pax)}</dd></div>}
                    <div><dt>Routes</dt><dd>{routesFor(type.code)}</dd></div>
                  </dl>
                  {type.registrations.length ? <p className="regs" aria-label="Registrations">{type.registrations.map((r) => <span key={r} className="reg">{r}</span>)}</p> : null}
                  {type.image && type.image_attribution ? (
                    <p className="credit">Photo: {type.image_link ? <a href={type.image_link} rel="noopener">{type.image_attribution}</a> : type.image_attribution}</p>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}

// ------------------------------------------------------------------ routes

export function RoutesPage({ snapshot }: PageProps) {
  const divisions = snapshot.airline.divisions;
  const [query, setQuery] = useState("");
  const [type, setType] = useState("");
  const [divisionName, setDivisionName] = useState(() => {
    const wanted = hashParam("division");
    return divisions.some((d) => d.name === wanted) ? wanted : "";
  });
  const division = divisions.find((d) => d.name === divisionName);
  const types = useMemo(
    () => [...new Set(snapshot.routes.filter((r) => routeInDivision(r, division)).flatMap((r) => r.types))].sort(),
    [snapshot.routes, division],
  );
  const shown = useMemo(() => filterRoutes(snapshot.routes, query, type, division), [snapshot.routes, query, type, division]);
  const names = Object.fromEntries(snapshot.fleet.map((f) => [f.code, f.name]));

  const chooseDivision = (name: string) => {
    setDivisionName(name);
    setType("");
    const hash = name ? `#/routes?division=${encodeURIComponent(name)}` : "#/routes";
    window.history.replaceState(null, "", hash);
  };

  return (
    <section className="page">
      <h1 className="page-title">Route network</h1>
      <p className="lede">{snapshot.routes.length} scheduled routes from our two Indianapolis bases. Book any of them through the pilot portal.</p>
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
      <LiveMap flights={[]} airports={snapshot.airports} bases={bases(snapshot)} routes={shown} divisions={divisions} height={380} label="Map of the routes shown" />
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
              <tr><th scope="col">Flight</th><th scope="col">From</th><th scope="col">To</th><th scope="col" className="num">Distance</th><th scope="col" className="num">Time</th><th scope="col">Aircraft</th></tr>
            </thead>
            <tbody>
              {shown.slice(0, 400).map((r, i) => (
                <tr key={`${r.flight_number}-${r.from}-${r.to}-${i}`}>
                  <td data-label="Flight"><strong>{r.callsign ?? r.flight_number ?? "—"}</strong>{r.kind === "cargo" ? <span className="tag tag--cargo">Cargo</span> : null}</td>
                  <td data-label="From"><strong>{r.from}</strong><span className="sub">{snapshot.airports[r.from]?.name}</span></td>
                  <td data-label="To"><strong>{r.to}</strong><span className="sub">{snapshot.airports[r.to]?.name}</span></td>
                  <td data-label="Distance" className="num">{r.distance_nm != null ? `${formatNumber(r.distance_nm)} nm` : "—"}</td>
                  <td data-label="Time" className="num">{formatDuration(r.duration_min)}</td>
                  <td data-label="Aircraft">{r.types.join(", ") || "Any"}</td>
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

// ------------------------------------------------------------------ pilots / join

export function PilotsPage({ snapshot }: PageProps) {
  const { airline } = snapshot;
  const facts = networkFacts(snapshot);
  const faqs: { q: string; a: string }[] = [
    { q: "Do I need real-world flying experience?", a: "No. Bring your simulator and a willingness to fly by the book. The career ladder starts you in light jets and you work up from there." },
    { q: "Which simulators can I use?", a: "Flights are tracked with vAMSYS's Pegasus ACARS, so any simulator Pegasus supports works. Check Pegasus's current list before you apply." },
    { q: "Can I fly the big jets straight away?", a: "Every route is open to every pilot. Ranks mark your experience by hours and completed flights; they don't lock you out of aircraft." },
    { q: "Where do I start each flight?", a: "Light jets (Mustang, CJ4, Learjet 35A) operate from Indianapolis Executive, KTYQ. Everything larger operates from Indianapolis International, KIND." },
    { q: "Do I have to fly on VATSIM?", a: "Online or offline, your choice. If you do fly online, use our callsign and follow the network's rules." },
  ];

  return (
    <>
      <section className="page">
        <h1 className="page-title">Fly for Crossroads</h1>
        <p className="lede">Pilots fly our {facts.routes}-route schedule from home in their simulator, log flights automatically, and work their way up from Cadet to Chief Pilot.</p>

        <ol className="steps">
          <li><h2>Apply</h2><p>Create your pilot account through our vAMSYS application{airline.join_url ? "" : " (opening soon)"}.</p></li>
          <li><h2>Get approved</h2><p>Staff review applications and you join the Indianapolis hub.</p></li>
          <li><h2>Book and fly</h2><p>Pick a route, dispatch with SimBrief, fly with Pegasus running, and your flight files itself.</p></li>
        </ol>
        <div className="hero__actions">
          <JoinButton snapshot={snapshot} label={airline.join_url ? "Start your application" : "Applications open soon"} />
          {airline.pilot_login_url ? <a className="button button--quiet" href={airline.pilot_login_url} rel="noopener">Existing pilots: log in</a> : null}
          {airline.discord_url ? <a className="button button--quiet" href={airline.discord_url} rel="noopener">Join our Discord</a> : null}
        </div>
      </section>

      <section className="page">
        <SectionHead eyebrow="Career path" title="From Cadet to Chief Pilot" intro="Promotions come automatically as your hours and completed flights add up." />
        <CareerLadder snapshot={snapshot} />
      </section>

      {snapshot.hubs.length ? (
        <section className="page">
          <SectionHead eyebrow="Home base" title="Indianapolis, two airports" />
          <ul className="hub-list">
            {bases(snapshot).map((icao) => {
              const airport = snapshot.airports[icao];
              const here = airline.divisions.filter((d) => d.base === icao);
              return (
                <li key={icao} className="hub">
                  <h3>{icao}{airport ? <span className="hub__name">{airport.name}</span> : null}</h3>
                  <p className="hub__airports">{here.length ? here.map((d) => d.name).join(" · ") : "All operations"}</p>
                  <p className="muted">{here.flatMap((d) => d.fleets).length ? `${here.flatMap((d) => d.fleets).length} aircraft types` : ""}</p>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      <section className="page page--narrow">
        <SectionHead eyebrow="Questions" title="Before you apply" />
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
        <p className="empty">Nothing is scheduled yet. Our first group flights will be announced here.</p>
      )}
    </section>
  );
}

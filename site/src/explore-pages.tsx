import { useEffect, useMemo, useRef, useState } from "react";
import type { Crew, CrewRunway, Route, Snapshot } from "./data";
import { formatDuration, formatNumber, formatWeight, loadCrew, routeDivision } from "./data";
import { FLEET_INFO, PEGASUS_URL, baseFor } from "./content";
import { ExploreMap } from "./ExploreMap";
import { divisionColor } from "./LiveMap";
import type { Bar, FitStatus, RouteSortKey, SearchEntry } from "./explore";
import {
  SEARCH_EVENT,
  airportHref,
  airportSummary,
  briefingCard,
  buildSearchIndex,
  destinationBlurb,
  distanceNm,
  download,
  initialCourse,
  isFreighterType,
  moveSearchActive,
  networkStats,
  onwardLegs,
  routeHref,
  routeKey,
  routeOtherEnd,
  routesForType,
  runwayStrips,
  scheduleCsv,
  search,
  searchStatus,
  servedAirports,
  setMeta,
  simbriefUrl,
  sortRoutes,
  sortRoutesBy,
  suggestFleet,
  typeHref,
} from "./explore";
import { DivisionDot, JoinButton, Leg, MapLegend, PageHeader, SectionHead, bases, shortName } from "./pages";
import type { PageProps } from "./pages";

const SITE = "Crossroads Executive & Charter";

// ------------------------------------------------------------------ shared

let crewPromise: Promise<Crew> | null = null;

/** crew.json (runways + weather) loads once, only on pages that need it. */
export function useCrew(): Crew | null {
  const [crew, setCrew] = useState<Crew | null>(null);
  useEffect(() => {
    let alive = true;
    crewPromise ??= loadCrew().catch((e) => {
      crewPromise = null;
      throw e;
    });
    crewPromise.then((c) => alive && setCrew(c)).catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);
  return crew;
}

/**
 * Whether a media query matches, kept up to date. The first render already has the answer, so a
 * phone gets its layout without a flash; with no window (the server-rendered page tests) it is false.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia(query).matches);
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const list = window.matchMedia(query);
    const update = () => setMatches(list.matches);
    update();
    list.addEventListener("change", update);
    return () => list.removeEventListener("change", update);
  }, [query]);
  return matches;
}

function bookUrl(snapshot: Snapshot): string {
  return snapshot.airline.pilot_login_url ?? snapshot.airline.join_url ?? "https://vamsys.io/login/crossroads";
}

function typeNames(snapshot: Snapshot): Record<string, string> {
  return Object.fromEntries(snapshot.fleet.map((f) => [f.code, f.name]));
}

function TypeLinks({ codes, snapshot }: { codes: string[]; snapshot: Snapshot }) {
  const names = typeNames(snapshot);
  return (
    <span className="type-list">
      {codes.map((t) => <a key={t} href={typeHref(t)} title={names[t] ?? t}>{t}</a>)}
    </span>
  );
}

/** The phone view of a route list: one two-line link per route; its page has booking, briefing and SimBrief. */
export function RouteRows({ routes, snapshot, focus }: { routes: Route[]; snapshot: Snapshot; focus?: string }) {
  const divisions = snapshot.airline.divisions;
  const baseList = bases(snapshot);
  return (
    <ol className="route-rows">
      {routes.map((r) => {
        const d = routeDivision(r, divisions);
        const key = routeKey(r);
        const other = routeOtherEnd(r, focus, baseList);
        return (
          <li key={key}>
            <a className="route-row" href={routeHref(r)} data-row-link="">
              <span>{d >= 0 ? <DivisionDot index={d} /> : null}<strong>{key}</strong> {r.from} <span aria-hidden="true">→</span> <span className="visually-hidden">to </span>{r.to}</span>
              <span className="route-row__facts">{r.distance_nm != null ? `${formatNumber(r.distance_nm)} nm` : "—"} · {formatDuration(r.duration_min)}</span>
              <span className="route-row__name">{snapshot.airports[other]?.name ?? other}</span>
              <span className="route-row__division">{d >= 0 ? divisions[d]!.name : ""}</span>
            </a>
          </li>
        );
      })}
    </ol>
  );
}

const ROUTE_PAGE = 25;

const SORT_COLUMNS: { key: RouteSortKey; label: string; num?: boolean }[] = [
  { key: "flight", label: "Flight" },
  { key: "from", label: "From" },
  { key: "to", label: "To" },
  { key: "distance", label: "Distance", num: true },
  { key: "block", label: "Block", num: true },
];

/**
 * A route list in one default order (departures from the page's airport, or from the bases, first;
 * then shortest first), 25 at a time. Phones get two-line rows, wider screens a table whose columns
 * sort. The count starts again at 25 whenever the set of routes changes.
 */
export function RouteTable({ routes, snapshot, caption, focus, omitType }: { routes: Route[]; snapshot: Snapshot; caption: string; focus?: string; omitType?: string }) {
  const divisions = snapshot.airline.divisions;
  const narrow = useMediaQuery("(max-width: 700px)");
  const [sort, setSort] = useState<{ key: RouteSortKey | "default"; dir: "asc" | "desc" }>({ key: "default", dir: "asc" });
  // Keyed on the routes themselves, not the array: callers filter afresh on every render.
  const setKey = routes.map(routeKey).join();
  const [paging, setPaging] = useState({ key: setKey, count: ROUTE_PAGE });
  const wrap = useRef<HTMLDivElement>(null);
  const focusRow = useRef<number | null>(null);
  const ordered = useMemo(() => {
    const byDefault = sortRoutes(routes, focus ? [focus] : bases(snapshot));
    return sort.key === "default" ? byDefault : sortRoutesBy(byDefault, sort.key, sort.dir);
  }, [routes, focus, snapshot, sort]);
  const total = ordered.length;
  const shown = Math.min(total, paging.key === setKey ? paging.count : ROUTE_PAGE);
  // After "Show more" or "Show all", focus moves to the first row that was added.
  useEffect(() => {
    const index = focusRow.current;
    if (index === null) return;
    focusRow.current = null;
    wrap.current?.querySelectorAll<HTMLElement>("[data-row-link]")[index]?.focus();
  }, [shown]);
  if (!total) return <p className="empty">No routes match.</p>;
  const showUpTo = (count: number) => {
    focusRow.current = shown;
    setPaging({ key: setKey, count });
  };
  const sortBy = (key: RouteSortKey) => setSort((cur) => ({ key, dir: cur.key === key && cur.dir === "asc" ? "desc" : "asc" }));
  const visible = ordered.slice(0, shown);
  const aircraftLabel = omitType ? "Other aircraft" : "Aircraft";
  return (
    <div ref={wrap}>
      {narrow ? <RouteRows routes={visible} snapshot={snapshot} focus={focus} /> : (
        <div className="table-wrap table-wrap--routes">
          <table className="table table--routes">
            <caption className="visually-hidden">{caption}</caption>
            <thead>
              <tr>
                {SORT_COLUMNS.map((c) => {
                  const active = sort.key === c.key;
                  return (
                    <th key={c.key} scope="col" className={c.num ? "num" : undefined} aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : undefined}>
                      <button type="button" className="th-sort" onClick={() => sortBy(c.key)}>{c.label}{active ? <span aria-hidden="true">{sort.dir === "asc" ? " ↑" : " ↓"}</span> : null}</button>
                    </th>
                  );
                })}
                <th scope="col">{aircraftLabel}</th>
                <th scope="col"><span className="visually-hidden">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {visible.map((r) => {
                const d = routeDivision(r, divisions);
                const key = routeKey(r);
                const types = omitType ? r.types.filter((t) => t !== omitType) : r.types;
                return (
                  <tr key={key}>
                    <td data-label="Flight">
                      <a className="row-link" href={routeHref(r)} data-row-link="">{d >= 0 ? <DivisionDot index={d} /> : null}{key}</a>
                      <span className="sub">{d >= 0 ? divisions[d]!.name : ""}</span>
                      {r.kind === "cargo" ? <span className="tag tag--cargo">Cargo</span> : null}
                    </td>
                    {[r.from, r.to].map((icao, i) => {
                      const name = snapshot.airports[icao]?.name;
                      return (
                        <td key={i} data-label={i ? "To" : "From"}>
                          {icao === focus ? <strong>{icao}</strong> : <a href={airportHref(icao)}><strong>{icao}</strong></a>}
                          <span className="sub" title={name}>{name}</span>
                        </td>
                      );
                    })}
                    <td data-label="Distance" className="num">{r.distance_nm != null ? `${formatNumber(r.distance_nm)} nm` : "—"}</td>
                    <td data-label="Block" className="num">{formatDuration(r.duration_min)}</td>
                    <td data-label={aircraftLabel}>{types.length ? <TypeLinks codes={types} snapshot={snapshot} /> : "—"}</td>
                    <td data-label="Actions" className="row-actions">
                      <span>
                        <a className="text-link" href={routeHref(r)}>Details<span className="visually-hidden"> for {key}</span></a>
                        {r.callsign ? <a className="text-link" href={`#/crew?route=${encodeURIComponent(r.callsign)}`}>Brief<span className="visually-hidden"> {r.callsign}</span></a> : null}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <div className="route-more">
        <p>{`Showing ${shown} of ${total}`}</p>
        {shown < total ? (
          <>
            <button type="button" className="button button--quiet" onClick={() => showUpTo(shown + ROUTE_PAGE)}>{`Show ${Math.min(ROUTE_PAGE, total - shown)} more`}</button>
            <button type="button" className="button button--quiet" onClick={() => showUpTo(total)}>{`Show all ${total}`}</button>
          </>
        ) : null}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ explorer panel (used on the Network page)

export function ExplorerPanel({ snapshot, routes, selected, onSelect, selectedRoute, onRoute }: {
  snapshot: Snapshot;
  routes: Route[];
  selected: string | null;
  onSelect: (icao: string | null) => void;
  selectedRoute: string | null;
  onRoute: (key: string | null) => void;
}) {
  const airports = useMemo(() => servedAirports({ routes, airports: snapshot.airports }), [routes, snapshot.airports]);
  const summary = selected ? airportSummary({ ...snapshot, routes }, selected) : null;
  const route = selectedRoute ? routes.find((r) => routeKey(r) === selectedRoute) : undefined;
  const names = typeNames(snapshot);
  return (
    <aside className="explorer__panel" aria-label="Route explorer">
      <label className="explorer__pick">
        <span>Airport</span>
        <select value={selected ?? ""} onChange={(e) => { onSelect(e.target.value || null); onRoute(null); }}>
          <option value="">Choose an airport</option>
          {airports.map((a) => <option key={a.icao} value={a.icao}>{a.icao} · {a.airport?.name ?? a.icao} ({a.routes})</option>)}
        </select>
      </label>
      {route ? (
        <div className="explorer__route">
          <p className="eyebrow">Selected route</p>
          <h3>{routeKey(route)} <Leg from={route.from} to={route.to} snapshot={snapshot} /></h3>
          <dl className="mini-facts">
            <div><dt>Distance</dt><dd>{formatNumber(route.distance_nm)} nm</dd></div>
            <div><dt>Block</dt><dd>{formatDuration(route.duration_min)}</dd></div>
            <div><dt>Types</dt><dd>{route.types.length}</dd></div>
          </dl>
          <p className="explorer__types">{route.types.map((t) => <a key={t} className="chip" href={typeHref(t)}>{shortName(names[t] ?? t)}</a>)}</p>
          <p className="explorer__actions">
            <a className="button button--small" href={routeHref(route)}>Route details</a>
            <a className="button button--small button--quiet" href={bookUrl(snapshot)} rel="noopener">Book on vAMSYS</a>
          </p>
        </div>
      ) : null}
      {summary ? (
        <div className="explorer__airport">
          <p className="eyebrow">{summary.isBase ? "Crossroads base" : summary.airport?.country ?? "Destination"}</p>
          <h3>{summary.icao} <span className="muted">{summary.airport?.name}</span></h3>
          <p className="muted" role="status">{summary.routes.length} {summary.routes.length === 1 ? "route" : "routes"} in this view{summary.fromBase ? ` · ${formatNumber(summary.fromBase.nm)} nm from ${summary.fromBase.base}` : ""}</p>
          <ul className="explorer__list">
            {summary.routes.sort((a, b) => (a.distance_nm ?? 0) - (b.distance_nm ?? 0)).map((r) => {
              const key = routeKey(r);
              return (
                <li key={key}>
                  <button type="button" className="explorer__item" aria-pressed={key === selectedRoute} onClick={() => onRoute(key === selectedRoute ? null : key)}>
                    <strong>{key}</strong>
                    <span>{r.from} → {r.to}</span>
                    <span className="muted">{formatNumber(r.distance_nm)} nm · {formatDuration(r.duration_min)}</span>
                  </button>
                </li>
              );
            })}
          </ul>
          <a className="text-link" href={airportHref(summary.icao)}>{summary.icao} destination page →</a>
        </div>
      ) : (
        <p className="explorer__hint">Pick an airport here or on the map to see every route from it, drawn as great circles. Choose a route for distance, block time, the types that fly it and a booking link.</p>
      )}
    </aside>
  );
}

// ------------------------------------------------------------------ destinations index

export function DestinationsPage({ snapshot }: PageProps) {
  const [query, setQuery] = useState("");
  const list = useMemo(() => servedAirports(snapshot), [snapshot]);
  const q = query.trim().toLowerCase();
  const shown = list.filter(({ icao, airport }) => !q || [icao, airport?.iata, airport?.name, airport?.country].some((v) => v?.toLowerCase().includes(q)));
  const byCountry = new Map<string, typeof shown>();
  for (const item of shown) {
    const country = item.airport?.country ?? "Other";
    byCountry.set(country, [...(byCountry.get(country) ?? []), item]);
  }
  const countries = [...byCountry.keys()].sort((a, b) => (a === "United States" ? -1 : b === "United States" ? 1 : a.localeCompare(b)));
  useEffect(() => setMeta(`Destinations · ${SITE}`, `All ${list.length} airports on the Crossroads schedule, with runways, routes and the aircraft that fly them.`), [list.length]);
  return (
    <>
      <PageHeader eyebrow="Destinations" title={`${list.length} airports on the schedule`} lede="Every airport Crossroads flies to, built from the published schedule. Each one has a page with its runways, every route that serves it and the aircraft you can book." />
      <section className="page">
        <form className="filters filters--top" role="search" onSubmit={(e) => e.preventDefault()}>
          <label>
            <span>Find an airport</span>
            <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="ICAO, IATA, name or country" autoComplete="off" />
          </label>
        </form>
        <ExploreMap routes={snapshot.routes} airports={snapshot.airports} bases={bases(snapshot)} divisions={snapshot.airline.divisions} onAirportClick={(icao) => { window.location.hash = airportHref(icao); }} height={380} label="Map of destinations; select an airport to open its page" />
        <MapLegend snapshot={snapshot} routes={snapshot.routes} />
        {countries.length ? countries.map((country) => (
          <div key={country} className="dest-group">
            <h2>{country} <span className="tag">{byCountry.get(country)!.length}</span></h2>
            <ul className="dest-grid">
              {byCountry.get(country)!.map(({ icao, airport, routes }) => (
                <li key={icao}>
                  <a className="dest-card" href={airportHref(icao)}>
                    <strong>{icao}{airport?.iata ? <span className="muted"> / {airport.iata}</span> : null}</strong>
                    <span>{airport?.name ?? icao}</span>
                    <span className="dest-card__meta">{routes} {routes === 1 ? "route" : "routes"}{airport?.base ? " · base" : ""}</span>
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )) : <p className="empty">No airports match “{query}”.</p>}
      </section>
    </>
  );
}

// ------------------------------------------------------------------ one airport

export function AirportPage({ snapshot, icao }: PageProps & { icao: string }) {
  const crew = useCrew();
  const summary = airportSummary(snapshot, icao);
  const [selectedRoute, setSelectedRoute] = useState<string | null>(null);
  const names = typeNames(snapshot);
  const divisionNames = snapshot.airline.divisions.map((d) => d.name);
  const blurb = summary.routes.length ? destinationBlurb(summary, divisionNames, (c) => shortName(names[c] ?? c)) : "";
  const a = summary.airport;
  useEffect(() => {
    if (summary.routes.length) setMeta(`${icao} ${a?.name ?? ""} · Destinations · ${SITE}`, blurb);
  }, [icao, a?.name, blurb, summary.routes.length]);
  if (!summary.routes.length) return <NotFoundPage snapshot={snapshot} what={`airport ${icao}`} />;
  const wx = crew?.airports[icao];
  const runways = wx?.runways ?? [];
  return (
    <>
      <PageHeader eyebrow={summary.isBase ? "Crossroads base" : `Destination · ${a?.country ?? ""}`} title={`${icao} · ${a?.name ?? icao}`} lede={blurb}>
        <dl className="header-facts">
          <div><dt>Routes</dt><dd>{summary.routes.length}</dd></div>
          <div><dt>Connects to</dt><dd>{summary.partners.length}</dd></div>
          <div><dt>Aircraft types</dt><dd>{summary.types.length}</dd></div>
          <div><dt>{summary.fromBase ? `From ${summary.fromBase.base}` : "IATA"}</dt><dd>{summary.fromBase ? `${formatNumber(summary.fromBase.nm)} nm` : a?.iata ?? "—"}</dd></div>
        </dl>
      </PageHeader>
      <section className="page page--split page--split-wide">
        <div className="split__aside">
          <ExploreMap routes={summary.routes} airports={snapshot.airports} bases={bases(snapshot)} divisions={snapshot.airline.divisions} selectedAirport={icao} selectedRoute={selectedRoute} onRouteClick={setSelectedRoute} onClearSelection={() => setSelectedRoute(null)} onAirportClick={(other) => { if (other !== icao) window.location.hash = airportHref(other); }} height={420} label={`Routes serving ${icao}`} />
          <p className="fineprint">Select a route line to highlight it, or another airport to open its page.</p>
          <MapLegend snapshot={snapshot} routes={summary.routes} />
        </div>
        <div>
          <SectionHead eyebrow="Airfield" title="Runways" />
          {runways.length ? <RunwayTable icao={icao} runways={runways} /> : <p className="muted">{crew ? "No runway data on file for this airport." : "Loading runway data…"}</p>}
          {runways[0]?.elevation_ft != null ? <p className="fineprint">Field elevation about {formatNumber(Math.round(runways[0].elevation_ft))} ft. Runway data from OurAirports (public domain); always use current charts in the simulator.</p> : null}
          {wx?.metar ? (
            <>
              <SectionHead eyebrow="Weather" title="Latest METAR" />
              <code className="metar">{wx.metar.raw}</code>
              <p className="fineprint">As of the last data refresh. Full weather, runway winds and approach cards are in <a href={`#/crew`}>Crew Tools</a>.</p>
            </>
          ) : null}
          <SectionHead eyebrow="Fleet" title="Aircraft you can book here" />
          <p className="explorer__types">{summary.types.map((t) => <a key={t} className="chip" href={typeHref(t)}>{shortName(names[t] ?? t)}</a>)}</p>
        </div>
      </section>
      <section className="page">
        <SectionHead eyebrow="Schedule" title={`Routes serving ${icao}`} action={{ href: `#/routes`, label: "Whole network" }} />
        <RouteTable routes={summary.routes} snapshot={snapshot} focus={icao} caption={`Routes serving ${icao}`} />
      </section>
    </>
  );
}

/** An airport's runways: one row per strip ("05R/23L"), each end's true heading under the name. */
export function RunwayTable({ icao, runways }: { icao: string; runways: CrewRunway[] }) {
  return (
    <div className="table-scroll"><table className="table table--compact">
      <caption className="visually-hidden">{`Runways at ${icao}`}</caption>
      <thead><tr><th scope="col">Runway</th><th scope="col" className="num">Length</th><th scope="col" className="num">Width</th><th scope="col">Surface</th></tr></thead>
      <tbody>
        {runwayStrips(runways).map((s) => (
          <tr key={s.key}>
            <td><strong>{s.label}</strong>{s.headings ? <span className="sub">{s.headings}</span> : null}</td>
            <td className="num">{s.length_ft ? `${formatNumber(Math.round(s.length_ft))} ft` : "—"}</td>
            <td className="num">{s.width_ft ? `${formatNumber(Math.round(s.width_ft))} ft` : "—"}</td>
            <td>{surfaceName(s.surface)}</td>
          </tr>
        ))}
      </tbody>
    </table></div>
  );
}

function surfaceName(code: string | null): string {
  if (!code) return "—";
  const c = code.toUpperCase();
  if (c.startsWith("ASP") || c.includes("ASPH")) return "Asphalt";
  if (c.startsWith("CON")) return "Concrete";
  if (c.startsWith("GRV") || c.startsWith("GRAV")) return "Gravel";
  if (c.startsWith("TURF") || c.startsWith("GRS")) return "Grass";
  return code;
}

// ------------------------------------------------------------------ one aircraft type

export function TypePage({ snapshot, code }: PageProps & { code: string }) {
  const type = snapshot.fleet.find((f) => f.code === code);
  const info = FLEET_INFO[code];
  const routes = useMemo(() => routesForType(snapshot, code), [snapshot, code]);
  const [selectedRoute, setSelectedRoute] = useState<string | null>(null);
  const base = baseFor(code);
  const desc = type ? `${type.name} (${code}) at Crossroads: ${info?.role ?? "fleet type"}, based ${base}, ${routes.length} routes${info ? `, ${info.range_nm} nm planning range` : ""}.` : "";
  useEffect(() => {
    if (type) setMeta(`${type.name} · Fleet · ${SITE}`, desc);
  }, [type, desc]);
  if (!type) return <NotFoundPage snapshot={snapshot} what={`aircraft type ${code}`} />;
  const divisionIndex = snapshot.airline.divisions.findIndex((d) => d.fleets.includes(code));
  const freighter = isFreighterType(type);
  const sim = snapshot.airline.sim_aircraft?.[code];
  const destinations = new Set(routes.flatMap((r) => [r.from, r.to]));
  const longest = routes[0];
  const accent = divisionColor(Math.max(0, divisionIndex));
  const fleetOrder = snapshot.fleet.map((f) => f.code);
  const idx = fleetOrder.indexOf(code);
  const prev = snapshot.fleet[(idx - 1 + fleetOrder.length) % fleetOrder.length]!;
  const next = snapshot.fleet[(idx + 1) % fleetOrder.length]!;
  return (
    <>
      <PageHeader eyebrow={`Fleet · ${code}${divisionIndex >= 0 ? ` · ${snapshot.airline.divisions[divisionIndex]!.name}` : ""}`} title={type.name} lede={info?.blurb}>
        <dl className="header-facts">
          <div><dt>{freighter ? "Payload" : "Seats"}</dt><dd>{freighter ? formatWeight(type.max_cargo, type.weight_unit) : formatNumber(type.max_pax)}</dd></div>
          <div><dt>Planning range</dt><dd>{info ? `${formatNumber(info.range_nm)} nm` : "—"}</dd></div>
          <div><dt>Routes</dt><dd>{routes.length}</dd></div>
          <div><dt>Base</dt><dd>{base}</dd></div>
        </dl>
      </PageHeader>
      {info?.livery ? (
        <section className="page">
          <figure className="type-livery" style={{ ["--accent" as string]: accent }}>
            <img src={info.livery.src} alt={info.livery.alt} width={1100} height={280} />
            <figcaption>Crossroads livery preview render</figcaption>
          </figure>
        </section>
      ) : null}
      <section className="page page--split page--split-wide">
        <div className="split__aside">
          <SectionHead eyebrow="Reach" title={info ? `${formatNumber(info.range_nm)} nm from ${base}` : "Routes flown"} />
          <ExploreMap routes={routes} airports={snapshot.airports} bases={bases(snapshot)} divisions={snapshot.airline.divisions} ring={info ? { icao: base, nm: info.range_nm, label: `${shortName(type.name)} planning range from ${base}: ${formatNumber(info.range_nm)} nm` } : null} selectedRoute={selectedRoute} onRouteClick={setSelectedRoute} onAirportClick={(icao) => { window.location.hash = airportHref(icao); }} height={440} label={`Planning range ring and routes for the ${type.name}`} />
          <MapLegend snapshot={snapshot} routes={routes} />
          <p className="fineprint">The dashed ring is the rounded Crossroads planning range from {base}, still air, for simulation planning only. Winds, weights and reserves change it on the day.</p>
        </div>
        <div>
          <SectionHead eyebrow="Specifications" title="At a glance" />
          <table className="table table--compact spec-table">
            <tbody>
              <tr><th scope="row">ICAO type</th><td>{code}</td></tr>
              <tr><th scope="row">Role</th><td>{info?.role ?? "—"}</td></tr>
              <tr><th scope="row">Division</th><td>{divisionIndex >= 0 ? <a href={`#/routes?division=${encodeURIComponent(snapshot.airline.divisions[divisionIndex]!.name)}`}><DivisionDot index={divisionIndex} />{snapshot.airline.divisions[divisionIndex]!.name}</a> : "—"}</td></tr>
              <tr><th scope="row">Base</th><td><a href={airportHref(base)}>{base} · {snapshot.airports[base]?.name ?? base}</a></td></tr>
              <tr><th scope="row">{freighter ? "Max payload" : "Seats"}</th><td>{freighter ? formatWeight(type.max_cargo, type.weight_unit) : formatNumber(type.max_pax)}</td></tr>
              <tr><th scope="row">Planning range</th><td>{info ? `${formatNumber(info.range_nm)} nm` : "—"}</td></tr>
              <tr><th scope="row">Planning cruise</th><td>{info ? `${info.cruise_kt} kt` : "—"}</td></tr>
              <tr><th scope="row">Airframes</th><td>{type.aircraft_count} · {type.registrations.join(", ") || "—"}</td></tr>
              <tr><th scope="row">Simulator model</th><td>{sim ?? "—"}</td></tr>
              <tr><th scope="row">Destinations</th><td>{destinations.size} airports</td></tr>
              <tr><th scope="row">Longest route</th><td>{longest ? <a href={routeHref(longest)}>{routeKey(longest)} {longest.from}–{longest.to}, {formatNumber(longest.distance_nm)} nm</a> : "—"}</td></tr>
            </tbody>
          </table>
          <p className="fineprint">Range and cruise are rounded Crossroads planning figures, not manufacturer data. Aircraft names identify the simulator models we fly.</p>
        </div>
      </section>
      <section className="page">
        <SectionHead eyebrow="Schedule" title={`Routes for the ${shortName(type.name)}`} action={{ href: `#/routes?type=${encodeURIComponent(code)}`, label: "Filter on the network map" }} />
        <RouteTable routes={routes} snapshot={snapshot} caption={`Routes for the ${shortName(type.name)}`} omitType={code} />
        <nav className="pager" aria-label="Other aircraft">
          <a href={typeHref(prev.code)}>← {prev.name}</a>
          <a href="#/fleet">All fleet</a>
          <a href={typeHref(next.code)}>{next.name} →</a>
        </nav>
      </section>
    </>
  );
}

// ------------------------------------------------------------------ one route

export function RoutePage({ snapshot, route }: PageProps & { route: Route | undefined }) {
  const crew = useCrew();
  const key = route ? routeKey(route) : "";
  const a = route ? snapshot.airports[route.from] : undefined;
  const b = route ? snapshot.airports[route.to] : undefined;
  const desc = route ? `${key}: ${a?.name ?? route.from} to ${b?.name ?? route.to}, ${route.distance_nm} nm, about ${formatDuration(route.duration_min)} block. Bookable on vAMSYS in ${route.types.length} aircraft types.` : "";
  useEffect(() => {
    if (route) setMeta(`${key} ${route.from}–${route.to} · ${SITE}`, desc);
  }, [route, key, desc]);
  if (!route) return <NotFoundPage snapshot={snapshot} what="that route" />;
  const divisions = snapshot.airline.divisions;
  const d = routeDivision(route, divisions);
  const names = typeNames(snapshot);
  const course = a && b ? initialCourse(a, b) : null;
  const reverse = snapshot.routes.find((r) => r.from === route.to && r.to === route.from);
  const onward = onwardLegs(snapshot.routes, route, reverse);
  const runwaysFor = (icao: string) => crew?.airports[icao]?.runways ?? [];
  const longestRunway = (icao: string) => runwaysFor(icao).reduce((m, r) => Math.max(m, r.length_ft ?? 0), 0);
  const cardRunways = crew ? Object.fromEntries([route.from, route.to].map((i) => [i, runwaysFor(i).map((r) => ({ id: r.reciprocal ? `${r.id}/${r.reciprocal}` : r.id, length_ft: r.length_ft }))])) : undefined;
  return (
    <>
      <PageHeader eyebrow={`Route · ${d >= 0 ? divisions[d]!.name : "Schedule"}${route.kind === "cargo" ? " · cargo" : ""}`} title={`${key} · ${route.from} to ${route.to}`} lede={`${a?.name ?? route.from} to ${b?.name ?? route.to}. ${formatNumber(route.distance_nm)} nm great-circle, about ${formatDuration(route.duration_min)} block.`}>
        <div className="hero__actions">
          <a className="button" href={bookUrl(snapshot)} rel="noopener">Book on vAMSYS</a>
          {route.callsign ? <a className="button button--ghost" href={`#/crew?route=${encodeURIComponent(route.callsign)}`}>Crew Tools briefing</a> : null}
          <button type="button" className="button button--ghost" onClick={() => download(`${key}-briefing-card.txt`, briefingCard(snapshot, route, cardRunways))}>Download briefing card</button>
        </div>
      </PageHeader>
      <section className="page page--split page--split-wide">
        <div className="split__aside">
          <ExploreMap routes={[route]} airports={snapshot.airports} bases={bases(snapshot)} divisions={divisions} selectedRoute={key} onAirportClick={(icao) => { window.location.hash = airportHref(icao); }} height={400} label={`Great-circle track for ${key}`} />
        </div>
        <div>
          <SectionHead eyebrow="Flight facts" title="The leg" />
          <table className="table table--compact spec-table">
            <tbody>
              <tr><th scope="row">Callsign</th><td>{route.callsign ?? "—"} <span className="muted">(flight {route.flight_number ?? "—"})</span></td></tr>
              <tr><th scope="row">Departure</th><td><a href={airportHref(route.from)}>{route.from} · {a?.name}</a>{longestRunway(route.from) ? <span className="sub">Longest runway {formatNumber(Math.round(longestRunway(route.from)))} ft</span> : null}</td></tr>
              <tr><th scope="row">Arrival</th><td><a href={airportHref(route.to)}>{route.to} · {b?.name}</a>{longestRunway(route.to) ? <span className="sub">Longest runway {formatNumber(Math.round(longestRunway(route.to)))} ft</span> : null}</td></tr>
              <tr><th scope="row">Distance</th><td>{formatNumber(route.distance_nm)} nm{course != null ? ` · initial course ${String(course).padStart(3, "0")}° true` : ""}</td></tr>
              <tr><th scope="row">Block estimate</th><td>{formatDuration(route.duration_min)}</td></tr>
              <tr><th scope="row">Tags</th><td>{route.tags.length ? route.tags.map((t) => <span key={t} className="tag">{t.replace(/-/g, " ")}</span>) : "—"}</td></tr>
            </tbody>
          </table>
          <SectionHead eyebrow="Fleet" title="Aircraft you can book" />
          <ul className="route-types">
            {route.types.map((t) => {
              const info = FLEET_INFO[t];
              const margin = info && route.distance_nm ? Math.round((route.distance_nm / info.range_nm) * 100) : null;
              return (
                <li key={t}>
                  <a href={typeHref(t)}><strong>{shortName(names[t] ?? t)}</strong> <span className="muted">{t}</span></a>
                  <span className="sub">{margin != null ? `Uses ${margin}% of planning range` : ""}</span>
                  <a className="text-link" href={simbriefUrl(route, t)} rel="noopener" target="_blank">Plan in SimBrief<span className="visually-hidden"> (opens in a new tab)</span></a>
                </li>
              );
            })}
          </ul>
        </div>
      </section>
      <section className="page">
        <SectionHead eyebrow="Keep going" title="Onward from here" />
        <ul className="onward">
          {reverse ? <li><a href={routeHref(reverse)}><strong>{routeKey(reverse)}</strong> return leg {reverse.from} → {reverse.to}</a></li> : null}
          {onward.map(({ route: r, shared }) => {
            // The types this leg shares with the route just flown; a leg that shares none lists its own.
            const types = shared.length ? shared : r.types;
            const name = snapshot.airports[r.to]?.name;
            return <li key={routeKey(r)}><a href={routeHref(r)}><strong>{routeKey(r)}</strong> {r.from} → {r.to}{name ? ` ${name}` : ""} · {formatNumber(r.distance_nm)} nm{types.length ? ` · ${types.join(", ")}` : ""}</a></li>;
          })}
        </ul>
        <p className="fineprint">Distances are great-circle; block times are schedule estimates. Your SimBrief OFP has the real figures for the day's winds. Simulation use only.</p>
      </section>
    </>
  );
}

// ------------------------------------------------------------------ plan a charter

const STATUS_LABEL: Record<FitStatus, string> = { fits: "Good fit", tight: "Tight", "short-range": "Out of range", "too-small": "Too small", "wrong-role": "Wrong role" };

export function PlanPage({ snapshot }: PageProps) {
  const airports = useMemo(() => servedAirports(snapshot).sort((x, y) => x.icao.localeCompare(y.icao)), [snapshot]);
  const [from, setFrom] = useState("KIND");
  const [to, setTo] = useState("KLAS");
  const [cargo, setCargo] = useState(false);
  const [load, setLoad] = useState(12);
  useEffect(() => setMeta(`Plan a charter · ${SITE}`, "A flight-simulation planning tool: pick two airports and a load and see which Crossroads aircraft suit the trip and which scheduled routes to book."), []);
  const { distance, suggestions } = useMemo(() => suggestFleet(snapshot, { from, to, load, cargo }), [snapshot, from, to, load, cargo]);
  const relevant = suggestions.filter((s) => s.status !== "wrong-role");
  const anyScheduled = relevant.some((s) => s.scheduled.length);
  const pair = snapshot.routes.filter((r) => (r.from === from && r.to === to) || (r.from === to && r.to === from));
  const same = from === to;
  const block = (kt: number) => (distance ? formatDuration(Math.round((distance / kt) * 60 + 25)) : "—");
  return (
    <>
      <PageHeader eyebrow="Simulation planning tool" title="Plan a charter" lede="Pick two airports and your load. We'll match it against the Crossroads fleet by planning range and capacity and point you at the routes you can book. This is a flight-sim planning aid: Crossroads is a virtual airline and doesn't sell real flights." />
      <section className="page">
        <form className="filters filters--top planner" onSubmit={(e) => e.preventDefault()}>
          <label>
            <span>From</span>
            <select value={from} onChange={(e) => setFrom(e.target.value)}>
              {airports.map((a) => <option key={a.icao} value={a.icao}>{a.icao} · {a.airport?.name}</option>)}
            </select>
          </label>
          <button type="button" className="button button--small button--quiet planner__swap" onClick={() => { setFrom(to); setTo(from); }} aria-label="Swap departure and arrival">⇄</button>
          <label>
            <span>To</span>
            <select value={to} onChange={(e) => setTo(e.target.value)}>
              {airports.map((a) => <option key={a.icao} value={a.icao}>{a.icao} · {a.airport?.name}</option>)}
            </select>
          </label>
          <fieldset className="planner__mode">
            <legend>Load</legend>
            <label><input type="radio" name="mode" checked={!cargo} onChange={() => { setCargo(false); setLoad(12); }} /> Passengers</label>
            <label><input type="radio" name="mode" checked={cargo} onChange={() => { setCargo(true); setLoad(30000); }} /> Cargo (kg)</label>
          </fieldset>
          <label>
            <span>{cargo ? "Cargo, kg" : "Passengers"}</span>
            <input type="number" min={cargo ? 100 : 1} max={cargo ? 200000 : 400} step={cargo ? 500 : 1} value={load} onChange={(e) => setLoad(Math.max(0, Number(e.target.value) || 0))} />
          </label>
        </form>
        {same ? <p className="callout">Pick two different airports.</p> : (
          <>
            <dl className="route-summary" aria-live="polite">
              <div><dt>Great-circle</dt><dd>{distance != null ? `${formatNumber(distance)} nm` : "—"}</dd></div>
              <div><dt>Suitable types</dt><dd>{relevant.filter((s) => s.status === "fits" || s.status === "tight").length}</dd></div>
              <div><dt>Scheduled routes</dt><dd>{pair.length}</dd></div>
            </dl>
            <div className="page--split page--split-wide planner__grid">
              <div className="split__aside">
                <ExploreMap routes={pair} airports={snapshot.airports} bases={bases(snapshot)} divisions={snapshot.airline.divisions} extraLeg={[from, to]} height={360} label={`Great circle from ${from} to ${to}`} />
                {pair.length ? (
                  <div className="planner__routes">
                    <h2 className="h3">Book these scheduled routes</h2>
                    <ul className="onward">
                      {pair.map((r) => <li key={routeKey(r)}><a href={routeHref(r)}><strong>{routeKey(r)}</strong> {r.from} → {r.to} · {formatDuration(r.duration_min)} · {r.types.join(", ")}</a></li>)}
                    </ul>
                  </div>
                ) : (
                  <p className="callout">There's no scheduled Crossroads route between {from} and {to} yet, so it can't be booked on vAMSYS. The routes from <a href={airportHref(from)}>{from}</a> and <a href={airportHref(to)}>{to}</a> may get you there in legs.</p>
                )}
              </div>
              <div>
                <h2 className="h3">Fleet match</h2>
                <ol className="suggestions">
                  {relevant.map((s) => (
                    <li key={s.type.code} className={`suggestion suggestion--${s.status}`}>
                      <div className="suggestion__head">
                        <a href={typeHref(s.type.code)}><strong>{shortName(s.type.name)}</strong> <span className="muted">{s.type.code}</span></a>
                        <span className={`fit fit--${s.status}`}>{STATUS_LABEL[s.status]}</span>
                      </div>
                      <p className="sub">{s.reason}. {cargo ? formatWeight(s.capacity, s.type.weight_unit) : `${s.capacity ?? "—"} seats`} · base {baseFor(s.type.code)}{FLEET_INFO[s.type.code] && (s.status === "fits" || s.status === "tight") ? ` · about ${block(FLEET_INFO[s.type.code]!.cruise_kt)} block` : ""}</p>
                      {s.scheduled.length ? <p className="suggestion__routes">Scheduled: {s.scheduled.map((r) => <a key={routeKey(r)} href={routeHref(r)}>{routeKey(r)}</a>)}</p> : null}
                    </li>
                  ))}
                </ol>
                {!anyScheduled && pair.length ? <p className="fineprint">The scheduled routes above are flown by other types than the best match.</p> : null}
              </div>
            </div>
            <p className="fineprint">Matches use rounded Crossroads planning ranges and the seat or payload figures in vAMSYS. Block estimates are still-air (cruise speed plus 25 minutes). Base rules still apply when booking: light and mid jets from KTYQ, larger aircraft from KIND. Always dispatch with SimBrief.</p>
          </>
        )}
      </section>
    </>
  );
}

// ------------------------------------------------------------------ pilot resources

const LINKS: { title: string; href: string; body: string }[] = [
  { title: "vAMSYS pilot hub", href: "https://vamsys.io/login/crossroads", body: "The Crossroads sign-in page on vAMSYS: book routes, see your logbook and rank, and download Pegasus. New pilots use its Register link." },
  { title: "SimBrief", href: "https://www.simbrief.com/", body: "Free flight planning. Link it in your vAMSYS profile so bookings carry over. Every route page here has a pre-filled SimBrief link." },
  { title: "Pegasus ACARS", href: PEGASUS_URL, body: "vAMSYS's flight tracker. The official guide covers simulator setup, signing in, tracking your booking and filing the PIREP. Download it from the ACARS page in the pilot portal." },
];

const GENERIC_CHECKLIST = `CROSSROADS EXECUTIVE & CHARTER - GENERIC FLOW CARD
Fictional virtual airline. For flight simulation only. Always use the checklist for your aircraft model.
------------------------------------------------------------
PRE-FLIGHT
[ ] Route booked in vAMSYS, SimBrief OFP generated
[ ] Weather and runway winds checked (Crew Tools)
[ ] Fuel = taxi + trip + contingency + alternate + 45 min reserve
[ ] Weights entered in the FMS from the OFP
[ ] Pegasus running and tracking BEFORE engine start

BEFORE TAKEOFF
[ ] Flight controls free and correct
[ ] Flaps / trim set for takeoff
[ ] V-speeds and FMS route checked
[ ] Transponder and lights on

CLIMB / CRUISE
[ ] 250 kt below 10,000 ft (US) unless ATC says otherwise
[ ] Cruise at the OFP level and cost index (see handbook)
[ ] Fuel checks against the OFP

DESCENT / APPROACH
[ ] Arrival and approach briefed, minimums set
[ ] Stabilised by 1,000 ft in cloud / 500 ft visual, or GO AROUND

AFTER LANDING
[ ] Target touchdown 60-250 fpm
[ ] Taxi to a parking spot, park brake set
[ ] Engines off, then let Pegasus file the PIREP
[ ] Note diversions, go-arounds or firm landings in comments
`;

export function ResourcesPage({ snapshot }: PageProps) {
  const crew = useCrew();
  const [pick, setPick] = useState(() => snapshot.routes[0] ? routeKey(snapshot.routes[0]) : "");
  useEffect(() => setMeta(`Pilot resources · ${SITE}`, "Downloads for Crossroads pilots: route briefing cards, a generic flow card, the full schedule as CSV and links to vAMSYS, Pegasus and SimBrief."), []);
  const route = snapshot.routes.find((r) => routeKey(r) === pick);
  const sorted = useMemo(() => [...snapshot.routes].sort((a, b) => routeKey(a).localeCompare(routeKey(b), "en", { numeric: true })), [snapshot.routes]);
  const cardRunways = crew && route ? Object.fromEntries([route.from, route.to].map((i) => [i, (crew.airports[i]?.runways ?? []).map((r) => ({ id: r.reciprocal ? `${r.id}/${r.reciprocal}` : r.id, length_ft: r.length_ft }))])) : undefined;
  return (
    <>
      <PageHeader eyebrow="Pilot resources" title="Everything for the flight deck" lede="Briefing cards built from the schedule, a generic flow card, the schedule as a spreadsheet and the tools we fly with. All of it is for flight simulation only." />
      <section className="page">
        <ul className="resource-grid">
          <li className="resource">
            <p className="eyebrow">Download</p>
            <h2 className="h3">Route briefing card</h2>
            <p>Flight, distance, initial course, block estimate, runways at both ends and the Crossroads checklist, as a printable text file.</p>
            <label className="resource__pick">
              <span>Route</span>
              <select value={pick} onChange={(e) => setPick(e.target.value)}>
                {sorted.map((r) => <option key={routeKey(r)} value={routeKey(r)}>{routeKey(r)} · {r.from} → {r.to}</option>)}
              </select>
            </label>
            <button type="button" className="button button--small" disabled={!route} onClick={() => route && download(`${routeKey(route)}-briefing-card.txt`, briefingCard(snapshot, route, cardRunways))}>Download card</button>
          </li>
          <li className="resource">
            <p className="eyebrow">Download</p>
            <h2 className="h3">Generic flow card</h2>
            <p>The Crossroads flow from booking to PIREP on one page. Use it alongside the checklist for your aircraft, never instead of it.</p>
            <button type="button" className="button button--small" onClick={() => download("crossroads-flow-card.txt", GENERIC_CHECKLIST)}>Download flow card</button>
          </li>
          <li className="resource">
            <p className="eyebrow">Download</p>
            <h2 className="h3">Full schedule (CSV)</h2>
            <p>All {snapshot.routes.length} routes with distance, block estimate, division and bookable aircraft, ready for a spreadsheet.</p>
            <button type="button" className="button button--small" onClick={() => download("crossroads-schedule.csv", scheduleCsv(snapshot), "text/csv")}>Download CSV</button>
          </li>
        </ul>
      </section>
      <section className="page">
        <SectionHead eyebrow="Tools" title="What we fly with" />
        <ul className="resource-grid">
          {LINKS.map((l) => (
            <li key={l.title} className="resource">
              <h2 className="h3"><a href={l.href} rel="noopener" target="_blank">{l.title}<span className="visually-hidden"> (opens in a new tab)</span> ↗</a></h2>
              <p>{l.body}</p>
            </li>
          ))}
        </ul>
      </section>
      <section className="page">
        <SectionHead eyebrow="SOPs in brief" title="The six rules" action={{ href: "#/handbook", label: "Full handbook" }} />
        <ol className="sop-brief">
          <li><strong>Right base, right aircraft.</strong> Light and mid jets at KTYQ, everything larger at KIND.</li>
          <li><strong>Gate to gate with <a href={PEGASUS_URL} rel="noopener">Pegasus</a>.</strong> No slew, time acceleration or in-flight refuelling.</li>
          <li><strong>45 minutes final reserve</strong> on every flight. Dispatch with SimBrief.</li>
          <li><strong>Stabilised or go around:</strong> 1,000 ft in cloud, 500 ft visual.</li>
          <li><strong>250 kt below 10,000 ft</strong> in the US unless ATC says otherwise.</li>
          <li><strong>Write it up.</strong> Diversions, go-arounds and firm landings go in the PIREP comments.</li>
        </ol>
        <p className="callout">New here? Start with <a href="#/pilots">how a Crossroads flight works</a>, then the <a href="#/careers">career ladder</a>. <JoinButton snapshot={snapshot} quiet /></p>
      </section>
    </>
  );
}

// ------------------------------------------------------------------ network stats

function BarList({ bars, label, colorFor }: { bars: Bar[]; label: string; colorFor?: (bar: Bar) => string }) {
  const max = Math.max(1, ...bars.map((b) => b.value));
  return (
    <table className="bars" aria-label={label}>
      <tbody>
        {bars.map((bar) => (
          <tr key={bar.label} title={`${bar.label}: ${bar.value}`}>
            <th scope="row">{bar.href ? <a href={bar.href}>{bar.label}</a> : bar.label}</th>
            <td className="bars__cell">
              <span className="bars__bar" style={{ width: `${(bar.value / max) * 100}%`, background: colorFor?.(bar) }} />
            </td>
            <td className="num bars__value">{bar.value}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function StatsPage({ snapshot }: PageProps) {
  const stats = useMemo(() => networkStats(snapshot), [snapshot]);
  useEffect(() => setMeta(`Network stats · ${SITE}`, `The Crossroads schedule in numbers: ${stats.routes} routes, routes by division and aircraft, busiest destinations and the longest legs.`), [stats.routes]);
  const live = snapshot.stats.all_time;
  return (
    <>
      <PageHeader eyebrow="Network stats" title="The schedule in numbers" lede="Counted straight from the published schedule every time the site syncs. Flight activity figures appear here once live vAMSYS data is connected; nothing on this page is estimated.">
        <dl className="header-facts">
          <div><dt>Routes</dt><dd>{stats.routes}</dd></div>
          <div><dt>Average leg</dt><dd>{formatNumber(stats.averageNm)} nm</dd></div>
          <div><dt>International</dt><dd>{stats.international}</dd></div>
          <div><dt>Countries</dt><dd>{stats.countries}</dd></div>
        </dl>
      </PageHeader>
      <section className="page">
        <ul className="stat-tiles">
          {stats.longest ? <li><span className="stat-tiles__label">Longest route</span><a className="stat-tiles__value" href={routeHref(stats.longest)}>{formatNumber(stats.longest.distance_nm)} nm</a><span className="sub">{routeKey(stats.longest)} {stats.longest.from}–{stats.longest.to}</span></li> : null}
          {stats.shortest ? <li><span className="stat-tiles__label">Shortest route</span><a className="stat-tiles__value" href={routeHref(stats.shortest)}>{formatNumber(stats.shortest.distance_nm)} nm</a><span className="sub">{routeKey(stats.shortest)} {stats.shortest.from}–{stats.shortest.to}</span></li> : null}
          <li><span className="stat-tiles__label">Whole schedule, end to end</span><span className="stat-tiles__value">{formatNumber(stats.totalScheduledNm)} nm</span><span className="sub">Every route flown once</span></li>
          {live ? <li><span className="stat-tiles__label">Flights flown (vAMSYS)</span><span className="stat-tiles__value">{formatNumber(live.flights)}</span><span className="sub">All accepted PIREPs</span></li> : null}
        </ul>
      </section>
      <section className="page stats-grid">
        <div className="stats-card">
          <h2 className="h3">Routes by division</h2>
          <BarList bars={stats.byDivision} label="Routes by division" colorFor={(b) => divisionColor(b.index ?? 0)} />
        </div>
        <div className="stats-card">
          <h2 className="h3">Routes by distance</h2>
          <BarList bars={stats.distanceBands} label="Routes by distance band" />
        </div>
        <div className="stats-card">
          <h2 className="h3">Busiest destinations</h2>
          <BarList bars={stats.topAirports} label="Destinations by number of routes" />
        </div>
        <div className="stats-card">
          <h2 className="h3">Routes each aircraft can fly</h2>
          <BarList bars={stats.byType} label="Routes bookable per aircraft type" />
        </div>
      </section>
      <section className="page">
        <p className="fineprint">A route counts once per direction, and for every division whose aircraft can fly it, so the division bars add up to more than {stats.routes} routes. International means at least one end outside the United States.</p>
      </section>
    </>
  );
}

// ------------------------------------------------------------------ 404

export function NotFoundPage({ snapshot, what }: PageProps & { what?: string }) {
  useEffect(() => setMeta(`Page not found · ${SITE}`, "That page isn't on the Crossroads site."), []);
  return (
    <section className="page page--narrow notfound">
      <p className="eyebrow">Error 404 · off the chart</p>
      <h1 className="page-title">We can't find {what ?? "that page"}</h1>
      <p className="lede">It may have moved, or the link has a typo. Try searching, or head to one of these:</p>
      <p className="hero__actions">
        <a className="button" href="#/">Home</a>
        <a className="button button--quiet" href="#/routes">Route network</a>
        <a className="button button--quiet" href="#/destinations">Destinations</a>
        <a className="button button--quiet" href="#/fleet">Fleet</a>
      </p>
      <p className="fineprint">{snapshot.routes.length} routes and {snapshot.fleet.length} aircraft types are on the schedule.</p>
      <p className="hero__actions">
        {/* An event, not a prop: the airport, type and route pages render this page for unknown ids too. */}
        <button type="button" className="button button--quiet" onClick={() => window.dispatchEvent(new Event(SEARCH_EVENT))}>Search the site</button>
      </p>
    </section>
  );
}

// ------------------------------------------------------------------ site search dialog

export function SearchDialog({ snapshot, open, onClose }: { snapshot: Snapshot; open: boolean; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  // No result is active until an arrow key picks one; Enter then opens the first result.
  const [active, setActive] = useState(-1);
  const index = useMemo(() => buildSearchIndex(snapshot), [snapshot]);
  const results: SearchEntry[] = useMemo(() => search(index, query, 12), [index, query]);

  useEffect(() => {
    const el = dialog.current;
    if (!el) return;
    if (open && !el.open) {
      el.showModal();
      setQuery("");
      setActive(-1);
      window.setTimeout(() => input.current?.focus(), 0);
    } else if (!open && el.open) el.close();
  }, [open]);

  // Keep the highlighted result in view when the arrow keys move past the rows on screen.
  useEffect(() => {
    if (active >= 0) document.getElementById(`sr-${active}`)?.scrollIntoView({ block: "nearest" });
  }, [active, results]);

  const go = (entry: SearchEntry | undefined) => {
    if (!entry) return;
    onClose();
    window.location.hash = entry.href;
  };

  return (
    <dialog ref={dialog} className="search-dialog" aria-label="Search the site" onClose={onClose} onClick={(e) => { if (e.target === dialog.current) onClose(); }}>
      <div className="search-dialog__box">
        <div className="search-dialog__bar">
          <label htmlFor="site-search" className="visually-hidden">Search routes, airports and aircraft</label>
          <input
            id="site-search"
            ref={input}
            type="search"
            value={query}
            placeholder="Search routes, airports, aircraft… (e.g. KASE, G650, CRX511)"
            autoComplete="off"
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={results.length > 0}
            aria-controls="site-search-results"
            aria-activedescendant={active >= 0 && results[active] ? `sr-${active}` : undefined}
            onChange={(e) => { setQuery(e.target.value); setActive(-1); }}
            onKeyDown={(e) => {
              const key = e.key;
              if (key === "ArrowDown" || key === "ArrowUp") { e.preventDefault(); setActive((i) => moveSearchActive(i, results.length, key)); }
              else if (key === "Enter") { e.preventDefault(); go(results[active] ?? results[0]); }
            }}
          />
          <button type="button" className="button button--small button--quiet" onClick={onClose}>Close</button>
        </div>
        <p className="search-dialog__status" role="status">{searchStatus(query, results.length)}</p>
        <ul id="site-search-results" role="listbox" className="search-results" aria-label="Results">
          {results.map((r, i) => (
            <li key={`${r.kind}-${r.href}`} id={`sr-${i}`} role="option" aria-selected={i === active} className={i === active ? "is-active" : undefined} onMouseEnter={() => setActive(i)} onClick={() => go(r)}>
              <span className={`search-kind search-kind--${r.kind.toLowerCase()}`}>{r.kind}</span>
              <span className="search-results__text"><strong>{r.title}</strong><span className="sub">{r.subtitle}</span></span>
            </li>
          ))}
        </ul>
      </div>
    </dialog>
  );
}

export function distanceBetween(snapshot: Snapshot, a: string, b: string): number | null {
  const x = snapshot.airports[a];
  const y = snapshot.airports[b];
  return x && y ? distanceNm(x, y) : null;
}

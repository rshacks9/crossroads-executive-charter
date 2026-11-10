import { useEffect, useMemo, useState } from "react";
import type { ApproachCard, Crew, CrewAirport, FuelPlan, Route, Snapshot } from "./data";
import { componentText, formatDuration, formatNumber, hashParam, kgToLb, loadCrew, primaryDivision, relativeAge, windText } from "./data";

const CATEGORY_LABEL: Record<string, string> = {
  VFR: "VFR",
  MVFR: "Marginal VFR",
  IFR: "IFR",
  LIFR: "Low IFR",
};

const PHASE_LABEL: Record<string, string> = { taxi: "Taxi", climb: "Climb", cruise: "Cruise", descent: "Descent", holding: "Holding" };

function routeKey(route: Route): string {
  return route.callsign ?? route.flight_number ?? `${route.from}-${route.to}`;
}

function Category({ value }: { value: CrewAirport["flight_category"] }) {
  if (!value) return <span className="cat cat--none">No report</span>;
  return <span className={`cat cat--${value.toLowerCase()}`}>{CATEGORY_LABEL[value] ?? value}</span>;
}

function AirportWeather({ icao, airport, snapshot, role, runwayHighlight }: { icao: string; airport: CrewAirport | undefined; snapshot: Snapshot; role: string; runwayHighlight?: string | null }) {
  const name = snapshot.airports[icao]?.name ?? icao;
  if (!airport) return null;
  const m = airport.metar;
  return (
    <section className="wx-panel">
      <header className="wx-panel__head">
        <div>
          <p className="eyebrow">{role}</p>
          <h3>{icao} <span className="wx-panel__name">{name}</span></h3>
        </div>
        <Category value={airport.flight_category} />
      </header>
      {m ? (
        <>
          <code className="metar">{m.raw}</code>
          <dl className="wx-facts">
            <div><dt>Wind</dt><dd>{windText(m.wind)}</dd></div>
            <div><dt>Visibility</dt><dd>{m.visibility ? `${m.visibility.value}${m.visibility.unit === "SM" ? " SM" : " m"}` : "—"}</dd></div>
            <div><dt>Temp / dew</dt><dd>{m.temperature_c != null ? `${m.temperature_c}° / ${m.dewpoint_c}° C` : "—"}</dd></div>
            <div><dt>Altimeter</dt><dd>{m.altimeter ? `${m.altimeter.value} ${m.altimeter.unit}` : "—"}</dd></div>
            <div><dt>Clouds</dt><dd>{airport.clouds.length ? airport.clouds.map((c) => `${c.cover}${c.base_ft != null ? ` ${formatNumber(c.base_ft)}` : ""}`).join(", ") : "Clear"}</dd></div>
            <div><dt>Observed</dt><dd>{m.observed_at ? relativeAge(m.observed_at) : "—"}{m.stale ? " (stale)" : ""}</dd></div>
          </dl>
        </>
      ) : (
        <p className="muted">No current METAR for this airport. Check your simulator's weather or another source.</p>
      )}
      {airport.runways.length ? (
        <div className="table-scroll"><table className="table table--compact rwy-table">
          <thead><tr><th scope="col">Runway</th><th scope="col" className="num">Length</th><th scope="col">Wind component</th></tr></thead>
          <tbody>
            {airport.runways.map((r) => (
              <tr key={r.id} className={r.id === (runwayHighlight ?? airport.preferred_runway) ? "is-preferred" : undefined}>
                <td><strong>{r.id}</strong>{r.id === airport.preferred_runway ? <span className="tag tag--accent">Favoured</span> : null}</td>
                <td className="num">{r.length_ft ? `${formatNumber(r.length_ft)} ft` : "—"}</td>
                <td className={r.wind && r.wind.tailwind_kt > 0 ? "tailwind" : undefined}>{componentText(r.wind)}</td>
              </tr>
            ))}
          </tbody>
        </table></div>
      ) : null}
      {airport.taf ? (
        <details className="taf">
          <summary>Forecast (TAF)</summary>
          <code className="metar">{airport.taf}</code>
        </details>
      ) : null}
    </section>
  );
}

function FuelTable({ plan }: { plan: FuelPlan }) {
  const rows = Object.entries(plan.phases);
  return (
    <div className="table-scroll"><table className="table table--compact fuel-table">
      <thead><tr><th scope="col">Phase</th><th scope="col" className="num">Time</th><th scope="col" className="num">Fuel (kg)</th><th scope="col" className="num">Fuel (lb)</th></tr></thead>
      <tbody>
        {rows.map(([name, p]) => (
          <tr key={name}><td>{PHASE_LABEL[name] ?? name}</td><td className="num">{formatDuration(Math.round(p.minutes))}</td><td className="num">{formatNumber(p.fuel_kg)}</td><td className="num">{formatNumber(kgToLb(p.fuel_kg))}</td></tr>
        ))}
        <tr className="sum"><td>Trip</td><td /><td className="num">{formatNumber(plan.trip_kg)}</td><td className="num">{formatNumber(kgToLb(plan.trip_kg))}</td></tr>
        <tr><td>Contingency (5%)</td><td /><td className="num">{formatNumber(plan.contingency_kg)}</td><td className="num">{formatNumber(kgToLb(plan.contingency_kg))}</td></tr>
        <tr><td>Reserve</td><td className="num">{formatDuration(Math.round(plan.reserve_minutes))}</td><td className="num">{formatNumber(plan.reserve_kg)}</td><td className="num">{formatNumber(kgToLb(plan.reserve_kg))}</td></tr>
        <tr className="total"><td>Total fuel</td><td /><td className="num">{formatNumber(plan.total_kg)}</td><td className="num">{formatNumber(kgToLb(plan.total_kg))}</td></tr>
      </tbody>
    </table></div>
  );
}

function Approach({ card, icao }: { card: ApproachCard; icao: string }) {
  const rw = card.runway;
  return (
    <section className="approach">
      <div className="approach__head">
        <h3>Approach: {icao} runway {rw.identifier ?? "—"}</h3>
        <p className="muted">
          {rw.orientation?.heading_true_deg != null ? `${Math.round(rw.orientation.heading_true_deg)}° true` : ""}
          {rw.length_ft ? ` · ${formatNumber(rw.length_ft)} ft` : ""}
          {rw.threshold_elevation_ft != null ? ` · threshold ${formatNumber(rw.threshold_elevation_ft)} ft` : ""}
          {rw.glide_path_deg ? ` · ${rw.glide_path_deg}° glide path` : ""}
        </p>
      </div>
      <dl className="wx-facts">
        <div><dt>Approach speed</dt><dd>{card.aircraft.approach_speed_kt ? `${card.aircraft.approach_speed_kt} kt` : "—"}</dd></div>
        <div><dt>Wind on runway</dt><dd>{card.wind ? componentText(card.wind.components) : "No wind data"}</dd></div>
        <div><dt>Descent rate</dt><dd>{card.aircraft.approach_speed_kt ? `≈${formatNumber(Math.round(card.aircraft.approach_speed_kt * 5.3 / 10) * 10)} fpm (no wind)` : "—"}</dd></div>
      </dl>
      {card.target_gates.length ? (
        <div className="table-scroll"><table className="table table--compact">
          <thead><tr><th scope="col">From threshold</th><th scope="col" className="num">Height</th><th scope="col" className="num">Altitude</th><th scope="col" className="num">Speed</th></tr></thead>
          <tbody>
            {card.target_gates.map((g) => (
              <tr key={g.distance_to_threshold_nm}>
                <td>{g.distance_to_threshold_nm} nm</td>
                <td className="num">{g.height_above_threshold_ft != null ? `${formatNumber(Math.round(g.height_above_threshold_ft))} ft` : "—"}</td>
                <td className="num">{g.altitude_ft_msl != null ? `${formatNumber(Math.round(g.altitude_ft_msl))} ft` : "—"}</td>
                <td className="num">{g.target_speed_kt ? `${g.target_speed_kt} kt` : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table></div>
      ) : null}
    </section>
  );
}

export function CrewPage({ snapshot }: { snapshot: Snapshot }) {
  const [crew, setCrew] = useState<Crew | null>(null);
  const [error, setError] = useState<string | null>(null);
  const divisions = snapshot.airline.divisions;
  const routes = useMemo(() => [...snapshot.routes].sort((a, b) => routeKey(a).localeCompare(routeKey(b), undefined, { numeric: true })), [snapshot.routes]);
  const [selected, setSelected] = useState(() => {
    const wanted = hashParam("route");
    return routes.some((r) => routeKey(r) === wanted) ? wanted : routes[0] ? routeKey(routes[0]) : "";
  });
  const route = routes.find((r) => routeKey(r) === selected);
  const [aircraft, setAircraft] = useState(() => hashParam("aircraft"));
  const type = route && route.types.includes(aircraft) ? aircraft : route?.types[0] ?? "";

  useEffect(() => {
    let alive = true;
    loadCrew().then((c) => alive && setCrew(c)).catch((e) => alive && setError(e instanceof Error ? e.message : "unavailable"));
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (!route) return;
    window.history.replaceState(null, "", `#/crew?route=${encodeURIComponent(routeKey(route))}&aircraft=${encodeURIComponent(type)}`);
  }, [route, type]);

  const grouped = useMemo(() => {
    const groups = new Map<string, Route[]>();
    for (const r of routes) {
      const index = primaryDivision(r, divisions);
      const label = index >= 0 ? divisions[index]!.name : "Other";
      groups.set(label, [...(groups.get(label) ?? []), r]);
    }
    return [...groups.entries()];
  }, [routes, divisions]);

  const names = Object.fromEntries(snapshot.fleet.map((f) => [f.code, f.name]));
  const plan = route && crew ? crew.plans[routeKey(route)]?.[type] : undefined;
  const approach = route && crew ? crew.approaches[route.to]?.[type] : undefined;
  const sim = snapshot.airline.sim_aircraft?.[type];

  return (
    <section className="page crew">
      <div className="crew__intro">
        <h1 className="page-title">Crew Tools</h1>
        <p className="lede">Pick a flight and an aircraft for a ready-made briefing: fuel by phase, live weather and runway winds at both ends, and an approach card. Briefings refresh with the latest weather every 20 minutes.</p>
      </div>

      <form className="filters crew__pick" onSubmit={(e) => e.preventDefault()}>
        <label>
          <span>Flight</span>
          <select value={selected} onChange={(e) => setSelected(e.target.value)}>
            {grouped.map(([label, list]) => (
              <optgroup key={label} label={label}>
                {list.map((r) => <option key={routeKey(r)} value={routeKey(r)}>{routeKey(r)} · {r.from} → {r.to}</option>)}
              </optgroup>
            ))}
          </select>
        </label>
        <label>
          <span>Aircraft</span>
          <select value={type} onChange={(e) => setAircraft(e.target.value)}>
            {(route?.types ?? []).map((t) => <option key={t} value={t}>{names[t] ?? t}</option>)}
          </select>
        </label>
        <button type="button" className="button button--quiet crew__print" onClick={() => window.print()}>Print briefing</button>
      </form>

      {error && !crew ? <p className="callout">Briefings are temporarily unavailable ({error}). The route and fleet pages still work.</p> : null}
      {!crew && !error ? <p className="lede" aria-busy="true">Loading briefings…</p> : null}

      {route && crew ? (
        <article className="briefing" aria-label={`Briefing for ${routeKey(route)}`}>
          <header className="briefing__head">
            <div>
              <p className="eyebrow">Crossroads {routeKey(route)}{route.kind === "cargo" ? " · Cargo" : ""}</p>
              <h2>{route.from} → {route.to}</h2>
              <p className="muted">{snapshot.airports[route.from]?.name} to {snapshot.airports[route.to]?.name}</p>
            </div>
            <dl className="briefing__facts">
              <div><dt>Distance</dt><dd>{route.distance_nm != null ? `${formatNumber(route.distance_nm)} nm` : "—"}</dd></div>
              <div><dt>Block</dt><dd>{formatDuration(route.duration_min)}</dd></div>
              <div><dt>Aircraft</dt><dd>{names[type] ?? type}</dd></div>
              {sim ? <div><dt>MSFS 2024</dt><dd>{sim}</dd></div> : null}
            </dl>
          </header>

          <div className="briefing__grid">
            <section>
              <h3>Fuel estimate</h3>
              {plan ? <FuelTable plan={plan} /> : <p className="muted">No fuel profile for this aircraft.</p>}
              <p className="fineprint">{crew.notes.fuel}</p>
            </section>
            <section>
              {approach ? <Approach card={approach} icao={route.to} /> : <p className="muted">No approach card for this arrival.</p>}
              <p className="fineprint">{crew.notes.approach}</p>
            </section>
          </div>

          <div className="briefing__grid">
            <AirportWeather icao={route.from} airport={crew.airports[route.from]} snapshot={snapshot} role="Departure" />
            <AirportWeather icao={route.to} airport={crew.airports[route.to]} snapshot={snapshot} role="Arrival" runwayHighlight={approach?.runway.identifier ?? null} />
          </div>

          <footer className="briefing__foot">
            <p className="fineprint">
              Briefing built {relativeAge(crew.generated_at)}{crew.weather_source ? ` with weather from ${crew.weather_source}` : " without live weather"}. {crew.notes.runways} For flight simulation only, never for real-world navigation.
            </p>
            <div className="hero__actions">
              {snapshot.airline.pilot_login_url ? <a className="button" href={snapshot.airline.pilot_login_url} rel="noopener">Book this flight in Phoenix</a> : null}
            </div>
          </footer>
        </article>
      ) : null}

      {crew ? (
        <section className="wx-board">
          <h2>Network weather</h2>
          <ul className="wx-tiles">
            {Object.entries(crew.airports).map(([icao, a]) => (
              <li key={icao} className={`wx-tile wx-tile--${(a.flight_category ?? "none").toLowerCase()}`}>
                <strong>{icao}</strong>
                <Category value={a.flight_category} />
                <span>{windText(a.metar?.wind)}</span>
                <span className="muted">{a.preferred_runway ? `Runway ${a.preferred_runway}` : ""}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <p className="fineprint crew__credit">Calculations by the Jumpseat crew modules (weather briefing, fuel planner and approach briefing) running in our update job.</p>
    </section>
  );
}

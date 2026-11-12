import { useEffect } from "react";
import type { Rank, Snapshot } from "./data";
import { formatDuration, formatNumber, hashParam, routeInDivision } from "./data";
import { COST_INDEX, FLEET_INFO, FLIGHT_NUMBER_BLOCKS, FUEL_POLICY, LANDING_RATES, NEWS, PEGASUS_URL, SERVICES, SOP_RULES, TOURS, baseFor } from "./content";
import { divisionBaseLabel, jumpTo, routeHref, typeHref } from "./explore";
import { capital, countWords, numberWord } from "./html-facts";
import { divisionColor } from "./LiveMap";
import { DivisionDot, EventItem, HOW_TO_JOIN, JoinButton, Leg, NewsCard, PageHeader, SectionHead, registrationOpen, shortName } from "./pages";
import type { PageProps } from "./pages";

/** Jump to the section named in the hash query (e.g. #/services?d=cargo) once the page renders. */
function useScrollToParam(param: string, prefix: string) {
  useEffect(() => {
    const wanted = hashParam(param);
    if (!wanted) return;
    const el = document.getElementById(`${prefix}${wanted}`);
    if (el) window.setTimeout(() => jumpTo(el), 50);
  }, [param, prefix]);
}

// ------------------------------------------------------------------ services

function Itinerary({ snapshot, legs }: { snapshot: Snapshot; legs: (typeof SERVICES)[number]["itinerary"]["legs"] }) {
  const names = Object.fromEntries(snapshot.fleet.map((f) => [f.code, f.name]));
  const found = legs
    .map((leg) => ({ leg, route: snapshot.routes.find((r) => r.callsign === leg.callsign) }))
    .filter((x) => x.route && x.route.types.includes(x.leg.aircraft));
  if (!found.length) return <p className="muted">These routes are being loaded into the schedule.</p>;
  const totalNm = found.reduce((s, x) => s + (x.route!.distance_nm ?? 0), 0);
  const totalMin = found.reduce((s, x) => s + (x.route!.duration_min ?? 0), 0);
  return (
    <>
      <ol className="itinerary">
        {found.map(({ leg, route }) => (
          <li key={leg.callsign} className="itinerary__leg">
            <div className="itinerary__head">
              <strong className="callsign">{leg.callsign}</strong>
              <Leg from={route!.from} to={route!.to} snapshot={snapshot} />
              <span className="itinerary__facts">{shortName(names[leg.aircraft] ?? leg.aircraft)} · {formatNumber(route!.distance_nm)} nm · {formatDuration(route!.duration_min)}</span>
            </div>
            <p>{leg.note}</p>
            {/* One inner span, so the flex link sets one ordinary space before the arrow. */}
            <a className="text-link" href={`#/crew?route=${encodeURIComponent(leg.callsign)}&aircraft=${encodeURIComponent(leg.aircraft)}`}><span>Open the briefing<span className="visually-hidden"> for {leg.callsign}</span> <span aria-hidden="true">→</span></span></a>
          </li>
        ))}
      </ol>
      <p className="fineprint">Trip total: {formatNumber(totalNm)} nm, about {formatDuration(totalMin)} block. Fictional scenario on real Crossroads routes.</p>
    </>
  );
}

export function ServicesPage({ snapshot }: PageProps) {
  useScrollToParam("d", "service-");
  const divisions = snapshot.airline.divisions;
  // One section per division that has a service; the title counts them.
  const kinds = SERVICES.filter((s) => divisions.some((d) => d.name === s.division)).length;
  return (
    <>
      <PageHeader eyebrow="Divisions & services" title={kinds ? `${capital(countWords(kinds, "kind", "kinds"))} of flying, one airline` : "Divisions and services"} lede="Each division has its own aircraft, routes and character. They share a logbook, a career ladder and an Indianapolis home. The itineraries below are fictional trips built from routes on our real schedule." />
      <nav className="page subnav" aria-label="Divisions">
        {SERVICES.map((s) => {
          const index = divisions.findIndex((d) => d.name === s.division);
          return <a key={s.slug} href={`#/services?d=${s.slug}`} className="chip-button" onClick={(e) => {
            // Same page: scroll instead of re-routing (the hash change alone would not re-run the effect).
            e.preventDefault();
            jumpTo(document.getElementById(`service-${s.slug}`));
            window.history.replaceState(null, "", `#/services?d=${s.slug}`);
          }}>{index >= 0 ? <DivisionDot index={index} /> : null}{s.division}</a>;
        })}
      </nav>
      {SERVICES.map((service) => {
        const index = divisions.findIndex((d) => d.name === service.division);
        const division = divisions[index];
        if (!division) return null;
        const types = snapshot.fleet.filter((f) => division.fleets.includes(f.code)).sort((a, b) => division.fleets.indexOf(a.code) - division.fleets.indexOf(b.code));
        const routes = snapshot.routes.filter((r) => routeInDivision(r, division));
        const destinations = new Set(routes.flatMap((r) => [r.from, r.to]).filter((icao) => icao !== "KTYQ" && icao !== "KIND"));
        return (
          <section key={service.slug} id={`service-${service.slug}`} className="page service" tabIndex={-1} style={{ ["--accent" as string]: divisionColor(index) }}>
            <div className="service__grid">
              <div>
                <p className="eyebrow">{divisionBaseLabel(division, snapshot.fleet)}</p>
                <h2 className="service__title">{service.headline}</h2>
                <p className="service__pitch">{service.pitch}</p>
                <ul className="ticks">{service.points.map((p) => <li key={p}>{p}</li>)}</ul>
                <dl className="specs specs--3 service__facts">
                  <div><dt>Aircraft types</dt><dd>{types.length}</dd></div>
                  <div><dt>Routes</dt><dd>{routes.length}</dd></div>
                  <div><dt>Destinations</dt><dd>{destinations.size}</dd></div>
                </dl>
                <p className="division__types">
                  {types.map((t) => <a key={t.code} className="chip chip--link" href={typeHref(t.code)}>{shortName(t.name)}{FLEET_INFO[t.code] ? ` · ${baseFor(t.code)}` : ""}</a>)}
                </p>
                <a className="text-link" href={`#/routes?division=${encodeURIComponent(division.name)}`}>All {routes.length} {division.name} routes →</a>
              </div>
              <div className="service__itinerary">
                <h3>{service.itinerary.title}</h3>
                <Itinerary snapshot={snapshot} legs={service.itinerary.legs} />
              </div>
            </div>
          </section>
        );
      })}
    </>
  );
}

// ------------------------------------------------------------------ careers

const RANK_ICON: Record<string, string> = {
  "First Officer": "img/ranks/rank-1-first-officer.png",
  Captain: "img/ranks/rank-2-captain.png",
  "Senior Captain": "img/ranks/rank-3-senior-captain.png",
  "Charter Captain": "img/ranks/rank-4-charter-captain.png",
  "Chief Pilot": "img/ranks/rank-5-chief-pilot.png",
};

const RANK_NOTES: Record<string, string> = {
  Cadet: "Day one. Learn the KTYQ routine on short hops in the Mustang and Premier, and get your first PIREPs accepted.",
  "First Officer": "Comfortable with the light jets. Time to try the CJ4 and Learjet to Aspen, Scottsdale and Las Vegas.",
  Captain: "A steady logbook. Step up to the Hawker and Citation X, or cross to KIND for your first E-Jet charter.",
  "Senior Captain": "Experienced across divisions. The Gulfstreams, the 757 and the freighters suit you.",
  "Charter Captain": "The airline's backbone: long-range executive trips, A380 charters and transatlantic cargo.",
  "Chief Pilot": "The top of the ladder. Every type and every route, flown to the standard the handbook sets.",
};

function RankBadge({ rank, index }: { rank: Rank; index: number }) {
  const icon = RANK_ICON[rank.name];
  return icon ? (
    <img className="rank-badge" src={icon} alt="" width={96} height={36} loading="lazy" />
  ) : (
    <span className="rank-badge rank-badge--plain" aria-hidden="true">{rank.abbreviation ?? String(index + 1)}</span>
  );
}

export function CareersPage({ snapshot }: PageProps) {
  const ladder = snapshot.ranks.filter((r) => !r.honorary);
  const honorary = snapshot.ranks.filter((r) => r.honorary);
  const top = ladder[ladder.length - 1];
  return (
    <>
      <PageHeader eyebrow="Pilot career" title="From Cadet to Chief Pilot" lede={`${ladder.length ? capital(countWords(ladder.length, "rank", "ranks")) : "Ranks"}, earned with flight hours and accepted PIREPs. Promotions happen automatically in vAMSYS as your logbook grows. Ranks recognise experience and never lock you out of an aircraft.`} />
      <section className="page">
        {ladder.length ? (
          <ol className="rank-list">
            {ladder.map((rank, i) => {
              const pct = top?.hours ? Math.round(((rank.hours ?? 0) / top.hours) * 100) : 0;
              return (
                <li key={rank.name} className="rank">
                  <span className="rank__level" aria-hidden="true">{String(i + 1).padStart(2, "0")}</span>
                  <RankBadge rank={rank} index={i} />
                  <div className="rank__body">
                    <h2>{rank.name}{rank.abbreviation ? <span className="rank__abbr">{rank.abbreviation}</span> : null}</h2>
                    <p className="rank__req">{rank.hours ? `${formatNumber(rank.hours)} hours` : "On joining"}{rank.flights ? ` · ${formatNumber(rank.flights)} accepted PIREPs` : ""}</p>
                    <p className="muted">{rank.description ?? RANK_NOTES[rank.name] ?? ""}</p>
                  </div>
                  <span className="rank__bar" role="img" aria-label={`${pct}% of the hours needed for ${top?.name ?? "the top rank"}`}>
                    <span style={{ width: `${Math.max(pct, 2)}%` }} />
                  </span>
                  {rank.pilots != null ? <span className="rank__pilots">{formatNumber(rank.pilots)} pilots</span> : null}
                </li>
              );
            })}
          </ol>
        ) : <p className="empty">The career ladder will appear here.</p>}
        {honorary.length ? (
          <>
            <SectionHead eyebrow="Honorary" title="Honorary ranks" />
            <ul className="chips">{honorary.map((r) => <li key={r.name} className="chip">{r.name}</li>)}</ul>
          </>
        ) : null}
        <div className="page--split career-notes">
          <div>
            <SectionHead eyebrow="How it counts" title="What moves you up" />
            <ul className="ticks">
              <li>Hours and PIREPs come from accepted flights only, filed through <a href={PEGASUS_URL} rel="noopener">Pegasus</a>.</li>
              <li>Every division counts the same. A Mustang hop and a 777F crossing both add to your logbook.</li>
              <li>Staff review every PIREP. Rejected flights don't count toward a promotion.</li>
            </ul>
          </div>
          <div>
            <SectionHead eyebrow="Suggested path" title="A natural progression" />
            <ol className="path">
              <li><strong>Mustang & Premier</strong> short KTYQ hops: Midway, Nashville, Louisville</li>
              <li><strong>CJ4, Learjet & Phenom 300E</strong> longer legs: Aspen, Scottsdale, Van Nuys</li>
              <li><strong>Hawker & Citation X</strong> coast-to-coast executive from KTYQ</li>
              <li><strong>E-Jets & 757</strong> group and sports charters from KIND</li>
              <li><strong>Gulfstreams, A340, A380</strong> long-range executive and VIP</li>
              <li><strong>Freighters</strong> A300F, MD-11F and 777F cargo charter</li>
            </ol>
          </div>
        </div>
        <SectionHead eyebrow="Tours" title={`${capital(numberWord(TOURS.length))} ${TOURS.length === 1 ? "tour" : "tours"} to fly`} intro="Register for a tour under Events in Phoenix, the vAMSYS pilot portal, then book and fly the legs in order. Finishing a tour earns its bonus points." />
        <ul className="tour-list">
          {TOURS.map((tour) => (
            <li key={tour.name} className="tour">
              <h3>{tour.name}</h3>
              <p className="muted">{tour.legs.length} legs · {tour.points} points · {tour.window}</p>
              <p>{tour.summary}</p>
              <ol className="tour__legs">
                {tour.legs.map(([from, to], i) => {
                  const route = snapshot.routes.find((r) => r.from === from && r.to === to);
                  return (
                    <li key={i}>
                      {route ? <a href={routeHref(route)}><strong>{route.callsign}</strong> {from} → {to}</a> : <span>{from} → {to}</span>}
                    </li>
                  );
                })}
              </ol>
            </li>
          ))}
        </ul>
        {snapshot.airline.pilot_login_url ? <p className="fineprint">Tours are under Events in Phoenix, the <a href={snapshot.airline.pilot_login_url} rel="noopener">vAMSYS pilot portal</a>. Tour dates and points are set in vAMSYS and may change there.</p> : null}
        <div className="hero__actions">
          <JoinButton snapshot={snapshot} />
          {registrationOpen(snapshot) ? <a className="button button--quiet" href="#/pilots">{HOW_TO_JOIN}</a> : null}
        </div>
      </section>
    </>
  );
}

// ------------------------------------------------------------------ handbook

/** The handbook's sections in order: Contents links to #/handbook?s={id}, and the section is hb-{id}. */
const HANDBOOK_CONTENTS: [id: string, label: string][] = [
  ["callsigns", "Callsigns"],
  ["blocks", "Flight-number blocks"],
  ["bases", "Bases"],
  ["fuel", "Fuel policy"],
  ["ci", "Cost index"],
  ["landing", "Landing rates"],
  ["sops", "Rules of the road"],
];

export function HandbookPage({ snapshot }: PageProps) {
  useScrollToParam("s", "hb-");
  const ktyq = snapshot.fleet.filter((f) => baseFor(f.code) === "KTYQ").map((f) => shortName(f.name));
  return (
    <>
      <PageHeader eyebrow="Pilot handbook" title="Standard operating procedures" lede="How we fly at Crossroads. It's short on purpose: the aircraft manuals and SimBrief cover the rest. A shorter version is in the vAMSYS pilot portal under Documents." />
      <div className="page handbook">
        <nav className="toc" aria-label="Handbook contents">
          <p className="eyebrow">Contents</p>
          <ol>
            {HANDBOOK_CONTENTS.map(([id, label]) => {
              const href = `#/handbook?s=${id}`;
              return (
                <li key={id}>
                  <a href={href} onClick={(e) => {
                    // Same page: jump to the section and give the page its address.
                    e.preventDefault();
                    jumpTo(document.getElementById(`hb-${id}`));
                    window.history.replaceState(null, "", href);
                  }}>{label}</a>
                </li>
              );
            })}
          </ol>
        </nav>
        <div className="handbook__body">
          <section id="hb-callsigns" className="hb-section" tabIndex={-1}>
            <h2>1. Callsigns</h2>
            <p>Every Crossroads flight has two identifiers. The <strong>flight number</strong> (CX101) is what you see in the schedule. The <strong>ATC callsign</strong> (CRX101) goes in your flight plan and on the radio.</p>
            <dl className="callsign-card">
              <div><dt>ICAO prefix</dt><dd>CRX</dd></div>
              <div><dt>Flight number</dt><dd>CX + 3 digits</dd></div>
              <div><dt>Radio</dt><dd>“Crossroads one-zero-one”</dd></div>
              {/* <wbr> lets the value break after the slash and adds nothing when a pilot copies it. */}
              <div><dt>VATSIM remarks</dt><dd>CALLSIGN/<wbr />CROSSROADS</dd></div>
            </dl>
            <p className="fineprint">CRX and “Crossroads” are used inside this virtual airline for simulation only.</p>
          </section>

          <section id="hb-blocks" className="hb-section" tabIndex={-1}>
            <h2>2. Flight-number blocks</h2>
            <p>The first digit tells you what kind of flight it is. As a rule, odd numbers are outbound and even numbers are the return.</p>
            <div className="table-wrap">
              {/* Stacked into cards on phones: the explicit roles keep it a table for assistive technology. */}
              <table className="table" role="table">
                <caption className="visually-hidden">Flight-number blocks</caption>
                <thead role="rowgroup"><tr role="row"><th scope="col" role="columnheader">Block</th><th scope="col" role="columnheader">Used for</th><th scope="col" role="columnheader">Base</th><th scope="col" className="num" role="columnheader">Routes now</th></tr></thead>
                <tbody role="rowgroup">
                  {FLIGHT_NUMBER_BLOCKS.map((b) => {
                    const lo = Number(b.block.slice(3, 6));
                    const count = snapshot.routes.filter((r) => {
                      const n = Number((r.callsign ?? "").replace(/^CRX/, ""));
                      return n >= lo && n <= lo + 98;
                    }).length;
                    return (
                      <tr key={b.block} role="row">
                        <td data-label="Block" role="cell"><strong>{b.block}</strong></td>
                        <td data-label="Used for" role="cell">{b.use}</td>
                        <td data-label="Base" role="cell">{b.base}</td>
                        <td data-label="Routes now" className="num" role="cell">{count}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          <section id="hb-bases" className="hb-section" tabIndex={-1}>
            <h2>3. Bases</h2>
            <div className="two-up">
              <div className="mini-card">
                <h3>KTYQ · Indianapolis Executive</h3>
                <p>Light and mid-size aircraft up to Citation X size: {ktyq.join(", ")}.</p>
              </div>
              <div className="mini-card">
                <h3>KIND · Indianapolis International</h3>
                <p>Everything bigger: the Longitude, Gulfstreams, E-Jets, 757, Airbus VIP jets and all freighters.</p>
              </div>
            </div>
            <p>A few executive legs run point-to-point away from base (Teterboro–Boca Raton, Hanscom–Nantucket, Dallas–Van Nuys, Teterboro–Luton, Teterboro–Zurich, Shannon–London City, Van Nuys–Honolulu, and CRX701-series light-jet legs such as Teterboro–Miami Executive, Morristown–Nantucket and Santa Monica–Las Vegas). Fly them as positioning or one-way trips.</p>
          </section>

          <section id="hb-fuel" className="hb-section" tabIndex={-1}>
            <h2>4. Fuel policy</h2>
            <ul className="ticks">{FUEL_POLICY.map((f) => <li key={f}>{f}</li>)}</ul>
          </section>

          <section id="hb-ci" className="hb-section" tabIndex={-1}>
            <h2>5. Cost index and cruise</h2>
            <div className="table-wrap">
              <table className="table" role="table">
                <caption className="visually-hidden">Cost index guidance</caption>
                <thead role="rowgroup"><tr role="row"><th scope="col" role="columnheader">Group</th><th scope="col" role="columnheader">Types</th><th scope="col" role="columnheader">Guidance</th></tr></thead>
                <tbody role="rowgroup">
                  {COST_INDEX.map((c) => (
                    <tr key={c.group} role="row"><td data-label="Group" role="cell"><strong>{c.group}</strong></td><td data-label="Types" role="cell">{c.types}</td><td data-label="Guidance" role="cell">{c.guidance}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section id="hb-landing" className="hb-section" tabIndex={-1}>
            <h2>6. Landing-rate expectations</h2>
            <p>We care more about a stabilised approach and touching down in the zone than about a number. Still, here is what we expect:</p>
            <ul className="rate-scale">
              {LANDING_RATES.map((r) => (
                <li key={r.band} className={`rate rate--${r.tone}`}><strong>{r.band}</strong><span>{r.label}</span></li>
              ))}
            </ul>
            <p className="fineprint">A smooth landing beyond the touchdown zone is worse than a firm one on the aim point. On short runways at KTYQ and the ski fields, put it down firmly.</p>
          </section>

          <section id="hb-sops" className="hb-section" tabIndex={-1}>
            <h2>7. Rules of the road</h2>
            <div className="sop-grid">
              {SOP_RULES.map((s) => (
                <div key={s.title} className="mini-card"><h3>{s.title}</h3><p>{s.body}</p>{s.link ? <p><a className="text-link" href={s.link.href} rel="noopener" target="_blank">{s.link.label}&nbsp;↗<span className="visually-hidden"> (opens in a new tab)</span></a></p> : null}</div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </>
  );
}

// ------------------------------------------------------------------ about

export function AboutPage({ snapshot }: PageProps) {
  const countries = new Set(snapshot.routes.flatMap((r) => [r.from, r.to]).map((icao) => snapshot.airports[icao]?.country).filter(Boolean)).size;
  return (
    <>
      <PageHeader eyebrow="About" title="Built at the Crossroads of America" lede="“The Crossroads of America” has been Indiana's state motto since 1937. Interstates, railroads and air routes meet in Indianapolis, so it was the natural home for an airline about getting people and cargo where they need to go." />
      <section className="page about">
        <div className="about__grid">
          <div className="prose">
            <h2>The idea</h2>
            <p>Most virtual airlines copy a real carrier's schedule. We wanted something sim pilots rarely get: the variety of a charter operator. One week you're in a Citation Mustang taking a client to Teterboro. The next you're in a 757 with a team bound for a playoff game, or in a 777F heading for Leipzig overnight.</p>
            <h2>Why Indianapolis</h2>
            <p>Indianapolis suits both halves of the operation. Indianapolis Executive (KTYQ), north of the city, is a business-aviation field sized for light and mid-size aircraft. Indianapolis International (KIND), south-west of downtown, has the long runways and the air-cargo heritage for widebodies and freighters. Splitting the fleet between them is how a real operator would do it, and it makes every flight start somewhere sensible.</p>
            <h2>What we are, and aren't</h2>
            <p>Crossroads Executive & Charter is a <strong>fictional virtual airline</strong> for flight simulation. It opened on vAMSYS in November 2026. We don't sell flights, we aren't an air carrier or charter operator, and we have no connection to any real company. The aircraft types are named only so pilots know which simulator model to fly.</p>
            <h2>How the site works</h2>
            <p>This site reads a public, privacy-filtered snapshot of our vAMSYS data every 20 minutes: schedule, fleet, ranks and (once connected) live flights and statistics. Pilot names are never shown unless pilots agree. Booking, PIREPs and your logbook stay in vAMSYS.</p>
          </div>
          <aside className="about__facts">
            <div className="fact-card">
              <p className="eyebrow">At a glance</p>
              <dl>
                <div><dt>Hub</dt><dd>Indianapolis (KTYQ + KIND)</dd></div>
                <div><dt>Opened</dt><dd>November 2026, on vAMSYS</dd></div>
                <div><dt>Divisions</dt><dd>{snapshot.airline.divisions.length}</dd></div>
                <div><dt>Aircraft types</dt><dd>{snapshot.fleet.length}</dd></div>
                <div><dt>Routes</dt><dd>{snapshot.routes.length}</dd></div>
                <div><dt>Countries and territories</dt><dd>{countries}</dd></div>
                <div><dt>Callsign</dt><dd>CRX · “Crossroads”</dd></div>
              </dl>
            </div>
            <div className="fact-card fact-card--mark">
              <svg viewBox="0 0 44 44" width="72" height="72" aria-hidden="true">
                <line x1="22" y1="5" x2="22" y2="39" stroke="currentColor" strokeWidth="4.2" strokeLinecap="round" />
                <line x1="5" y1="22" x2="39" y2="22" stroke="#e8703a" strokeWidth="4.2" strokeLinecap="round" />
                <circle cx="22" cy="5" r="3.4" fill="currentColor" /><circle cx="22" cy="39" r="3.4" fill="currentColor" />
                <circle cx="5" cy="22" r="3.4" fill="#e8703a" /><circle cx="39" cy="22" r="3.4" fill="#e8703a" />
                <rect x="16.5" y="16.5" width="11" height="11" rx="1.5" transform="rotate(45 22 22)" fill="#e8703a" />
              </svg>
              <p><strong>The mark</strong> is two straight routes meeting at a junction, Indianapolis. The orange diamond is the crossroads.</p>
            </div>
          </aside>
        </div>
      </section>
    </>
  );
}

// ------------------------------------------------------------------ news

export function NewsPage({ snapshot }: PageProps) {
  const notams = NEWS.filter((n) => n.kind === "NOTAM");
  const news = NEWS.filter((n) => n.kind !== "NOTAM");
  return (
    <>
      <PageHeader eyebrow="News & NOTAMs" title="From the ops desk" lede="Launch news, fleet and network changes, and the standing notices every Crossroads pilot should know." />
      <section className="page page--split page--split-wide news-page">
        <div>
          <SectionHead eyebrow="Latest" title="News" />
          <ul className="news-list">{news.map((item) => <NewsCard key={item.title} item={item} />)}</ul>
        </div>
        <div>
          <SectionHead eyebrow="Standing notices" title="NOTAMs" />
          <ul className="news-list news-list--notam">{notams.map((item) => <NewsCard key={item.title} item={item} />)}</ul>
          <SectionHead eyebrow="From vAMSYS" title="Events" />
          {snapshot.unavailable.includes("events") ? <p className="callout">Events could not be refreshed this time.</p> : null}
          {snapshot.events.length ? (
            <ul className="event-list">{snapshot.events.map((e) => <EventItem key={e.name + e.start} event={e} />)}</ul>
          ) : (
            <p className="empty">No group flights are scheduled yet. Open tours are on the <a href="#/careers">Careers page</a>.</p>
          )}
        </div>
      </section>
    </>
  );
}

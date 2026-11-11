import { useCallback, useEffect, useState } from "react";
import type { Snapshot } from "./data";
import { isStale, loadSnapshot, relativeAge } from "./data";
import { CrewPage } from "./crew";
import { AboutPage, CareersPage, HandbookPage, NewsPage, ServicesPage } from "./info";
import { FleetPage, HomePage, LivePage, PilotsPage, RoutesPage } from "./pages";
import { AirportPage, DestinationsPage, NotFoundPage, PlanPage, ResourcesPage, RoutePage, SearchDialog, StatsPage, TypePage } from "./explore-pages";
import type { Location } from "./explore";
import { findRoute, parseLocation, setMeta } from "./explore";

export const ROUTES = [
  { path: "", label: "Home", nav: false, description: "" },
  { path: "fleet", label: "Fleet", nav: true, description: "Eighteen aircraft types from the Citation Mustang to the A380 and 777F, with planning range, seats, base and the simulator model we fly." },
  { path: "routes", label: "Network", nav: true, description: "Interactive route explorer: click an airport to see its routes as great circles, with distance, block time and the aircraft that fly them." },
  { path: "destinations", label: "Destinations", nav: true, description: "Every airport on the Crossroads schedule." },
  { path: "services", label: "Services", nav: true, description: "Executive, Executive Charter, Group & Sports Charter and Cargo Charter divisions, with sample itineraries on real Crossroads routes." },
  { path: "plan", label: "Plan a charter", nav: true, description: "Flight-sim charter planning tool." },
  { path: "live", label: "Live", nav: true, description: "Crossroads flights in progress on the map." },
  { path: "careers", label: "Careers", nav: false, description: "Six ranks from Cadet to Chief Pilot, earned with hours and accepted PIREPs." },
  { path: "handbook", label: "Handbook", nav: false, description: "Crossroads SOPs: callsigns, flight-number blocks, fuel policy, cost index and landing rates." },
  { path: "resources", label: "Resources", nav: true, description: "Pilot downloads and links." },
  { path: "stats", label: "Stats", nav: false, description: "Network statistics." },
  { path: "crew", label: "Crew Tools", nav: true, description: "Route briefings with live METAR and TAF, runway winds, a fuel estimate and an approach card. For simulation only." },
  { path: "news", label: "News", nav: true, description: "Launch news, fleet and network changes and standing NOTAMs." },
  { path: "about", label: "About", nav: false, description: "Crossroads Executive & Charter, a fictional virtual airline built at the Crossroads of America, Indianapolis." },
  { path: "pilots", label: "Fly with us", nav: true, description: "How a Crossroads flight works, from vAMSYS application to accepted PIREP." },
] as const;

export const DISCLAIMER =
  "Crossroads Executive & Charter is a fictional virtual airline for flight simulation. It is not a real air carrier or charter operator and is not affiliated with any real company.";

export function Mark({ className = "wordmark__mark" }: { className?: string }) {
  // Two straight routes crossing at an orange junction (matches the vAMSYS logo files in brand/).
  return (
    <svg className={className} viewBox="0 0 44 44" aria-hidden="true">
      <line x1="22" y1="5" x2="22" y2="39" stroke="#f2f5f6" strokeWidth="4.2" strokeLinecap="round" />
      <line x1="5" y1="22" x2="39" y2="22" stroke="#e8703a" strokeWidth="4.2" strokeLinecap="round" />
      <circle cx="22" cy="5" r="3.4" fill="#f2f5f6" />
      <circle cx="22" cy="39" r="3.4" fill="#f2f5f6" />
      <circle cx="5" cy="22" r="3.4" fill="#e8703a" />
      <circle cx="39" cy="22" r="3.4" fill="#e8703a" />
      <rect x="16.5" y="16.5" width="11" height="11" rx="1.5" transform="rotate(45 22 22)" fill="#e8703a" />
    </svg>
  );
}

export type RoutePath = (typeof ROUTES)[number]["path"];

function currentLocation(): Location {
  return parseLocation(window.location.hash);
}

/** The nav item a location belongs to, for aria-current. */
function navSection(loc: Location): string {
  if (loc.page === "airport") return "destinations";
  if (loc.page === "type") return "fleet";
  if (loc.page === "route") return "routes";
  return loc.page;
}

const sameLocation = (a: Location, b: Location) => JSON.stringify(a) === JSON.stringify(b);

type Theme = "light" | "dark";

function storedTheme(): Theme | null {
  try {
    const value = window.localStorage.getItem("crossroads-theme");
    return value === "light" || value === "dark" ? value : null;
  } catch {
    return null;
  }
}

function systemTheme(): Theme {
  return typeof window.matchMedia === "function" && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(() => storedTheme() ?? systemTheme());
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);
  const next: Theme = theme === "dark" ? "light" : "dark";
  return (
    <button
      type="button"
      className="theme-toggle"
      aria-label={`Switch to ${next} theme`}
      title={`Switch to ${next} theme`}
      onClick={() => {
        setTheme(next);
        try {
          window.localStorage.setItem("crossroads-theme", next);
        } catch {
          /* private mode: the choice lasts for this visit only */
        }
      }}
    >
      {theme === "dark" ? (
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><circle cx="12" cy="12" r="4.5" fill="currentColor" /><g stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="12" y1="1.5" x2="12" y2="4" /><line x1="12" y1="20" x2="12" y2="22.5" /><line x1="1.5" y1="12" x2="4" y2="12" /><line x1="20" y1="12" x2="22.5" y2="12" /><line x1="4.6" y1="4.6" x2="6.3" y2="6.3" /><line x1="17.7" y1="17.7" x2="19.4" y2="19.4" /><line x1="4.6" y1="19.4" x2="6.3" y2="17.7" /><line x1="17.7" y1="6.3" x2="19.4" y2="4.6" /></g></svg>
      ) : (
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M20.5 14.5A8.5 8.5 0 0 1 9.5 3.5a8.5 8.5 0 1 0 11 11z" fill="currentColor" /></svg>
      )}
    </button>
  );
}

const REFRESH_MS = 60_000;

export function App() {
  const [loc, setLoc] = useState<Location>(currentLocation);
  const path = navSection(loc);
  const [searchOpen, setSearchOpen] = useState(false);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setSnapshot(await loadSnapshot());
      setError(null);
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : "could not load data");
    }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [refresh]);

  useEffect(() => {
    const onHash = () => {
      const next = currentLocation();
      setLoc((prev) => {
        if (sameLocation(prev, next)) return prev;
        window.scrollTo({ top: 0 });
        // Move focus to the new page for keyboard and screen-reader users.
        window.setTimeout(() => document.getElementById("main")?.focus({ preventScroll: true }), 0);
        return next;
      });
      setMenuOpen(false);
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  // Detail pages, the 404 and the tool pages set their own title and description.
  useEffect(() => {
    const route = ROUTES.find((r) => r.path === loc.page);
    if (!route || ["destinations", "plan", "resources", "stats"].includes(loc.page)) return;
    const name = snapshot?.airline.name ?? "Crossroads Executive & Charter";
    setMeta(
      route.path ? `${route.label} · ${name}` : `${name} · Virtual airline from Indianapolis`,
      route.description || "A fictional flight-sim virtual airline from Indianapolis: light jets to the A380 and 777F across executive, charter, sports and cargo divisions. Join on vAMSYS.",
    );
  }, [loc, snapshot]);

  // "/" or Ctrl/Cmd+K opens search, unless the user is typing in a field.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing = target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT" || target.isContentEditable);
      if ((e.key === "k" && (e.ctrlKey || e.metaKey)) || (e.key === "/" && !typing)) {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const airline = snapshot?.airline;
  const navRoutes = ROUTES.filter((r) => r.nav);

  return (
    <div className="shell">
      <a className="skip-link" href="#main">Skip to content</a>
      <header className="masthead">
        <div className="masthead__inner">
          <a className="wordmark" href="#/" aria-label={`${airline?.name ?? "Crossroads Executive & Charter"} home`}>
            <Mark />
            <span className="wordmark__text">
              <strong>Crossroads</strong>
              <small>Executive &amp; Charter</small>
            </span>
          </a>
          <div className="masthead__tools">
            <button type="button" className="search-button" onClick={() => setSearchOpen(true)} aria-label="Search routes, airports and aircraft" aria-keyshortcuts="/ Control+K" disabled={!snapshot}>
              <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" fill="none" stroke="currentColor" strokeWidth="2.2" /><line x1="15.5" y1="15.5" x2="21" y2="21" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" /></svg>
              <span className="search-button__label">Search</span>
              <kbd>/</kbd>
            </button>
            <ThemeToggle />
            <button
              type="button"
              className="menu-button"
              aria-expanded={menuOpen}
              aria-controls="primary-nav"
              onClick={() => setMenuOpen((open) => !open)}
            >
              {menuOpen ? "Close" : "Menu"}
            </button>
          </div>
          <nav id="primary-nav" className={`nav ${menuOpen ? "nav--open" : ""}`} aria-label="Primary">
            {navRoutes.map((route) => (
              <a
                key={route.path}
                href={`#/${route.path}`}
                className={route.path === "pilots" ? "nav__cta" : undefined}
                aria-current={route.path === path ? "page" : undefined}
              >
                {route.label}
                {route.path === "live" && snapshot && snapshot.live.length > 0 ? (
                  <span className="nav__count" aria-label={`${snapshot.live.length} in the air`}>{snapshot.live.length}</span>
                ) : null}
              </a>
            ))}
          </nav>
        </div>
      </header>

      {snapshot?.source === "sample" ? (
        <div className="notice notice--sample" role="status">
          Showing fictional sample data. Live vAMSYS data appears once the sync job has credentials.
        </div>
      ) : snapshot?.source === "preview" ? (
        <div className="notice notice--preview" role="status">
          <strong>Now forming.</strong> Fleet and schedule are published. Live tracking and statistics switch on once the vAMSYS data connection is enabled.
        </div>
      ) : snapshot && isStale(snapshot) ? (
        <div className="notice notice--stale" role="status">
          Flight data last refreshed {relativeAge(snapshot.generated_at)}. Live positions may be out of date.
        </div>
      ) : null}

      <main id="main" tabIndex={-1}>
        {error && !snapshot ? (
          <section className="page page--narrow">
            <h1 className="page-title">Flight data is unavailable</h1>
            <p className="lede">We couldn't load the latest airline data ({error}). Please try again shortly.</p>
            <button type="button" className="button" onClick={() => void refresh()}>Try again</button>
          </section>
        ) : !snapshot ? (
          <section className="page page--narrow" aria-busy="true">
            <p className="lede">Loading the board…</p>
          </section>
        ) : loc.page === "notfound" ? (
          <NotFoundPage snapshot={snapshot} />
        ) : loc.page === "airport" ? (
          <AirportPage key={loc.id} snapshot={snapshot} icao={loc.id} />
        ) : loc.page === "type" ? (
          <TypePage key={loc.id} snapshot={snapshot} code={loc.id} />
        ) : loc.page === "route" ? (
          <RoutePage key={loc.id} snapshot={snapshot} route={findRoute(snapshot, loc.id)} />
        ) : path === "destinations" ? (
          <DestinationsPage snapshot={snapshot} />
        ) : path === "plan" ? (
          <PlanPage snapshot={snapshot} />
        ) : path === "resources" ? (
          <ResourcesPage snapshot={snapshot} />
        ) : path === "stats" ? (
          <StatsPage snapshot={snapshot} />
        ) : path === "live" ? (
          <LivePage snapshot={snapshot} />
        ) : path === "fleet" ? (
          <FleetPage snapshot={snapshot} />
        ) : path === "routes" ? (
          <RoutesPage snapshot={snapshot} />
        ) : path === "services" ? (
          <ServicesPage snapshot={snapshot} />
        ) : path === "careers" ? (
          <CareersPage snapshot={snapshot} />
        ) : path === "handbook" ? (
          <HandbookPage snapshot={snapshot} />
        ) : path === "about" ? (
          <AboutPage snapshot={snapshot} />
        ) : path === "news" ? (
          <NewsPage snapshot={snapshot} />
        ) : path === "pilots" ? (
          <PilotsPage snapshot={snapshot} />
        ) : path === "crew" ? (
          <CrewPage snapshot={snapshot} />
        ) : (
          <HomePage snapshot={snapshot} />
        )}
      </main>
      {snapshot ? <SearchDialog snapshot={snapshot} open={searchOpen} onClose={() => setSearchOpen(false)} /> : null}

      <footer className="footer">
        <div className="footer__inner">
          <div className="footer__brand">
            <a className="wordmark" href="#/" aria-label="Home">
              <Mark />
              <span className="wordmark__text">
                <strong>Crossroads</strong>
                <small>Executive &amp; Charter</small>
              </span>
            </a>
            <p>Executive and charter flying from the Crossroads of America. Indianapolis Executive (KTYQ) and Indianapolis International (KIND).</p>
          </div>
          <nav className="footer__cols" aria-label="Footer">
            <div>
              <p className="footer__head">The airline</p>
              <ul>
                <li><a href="#/fleet">Fleet</a></li>
                <li><a href="#/routes">Route network</a></li>
                <li><a href="#/destinations">Destinations</a></li>
                <li><a href="#/stats">Network stats</a></li>
                <li><a href="#/plan">Plan a charter</a></li>
                <li><a href="#/services">Divisions &amp; services</a></li>
                <li><a href="#/about">About</a></li>
                <li><a href="#/news">News &amp; NOTAMs</a></li>
              </ul>
            </div>
            <div>
              <p className="footer__head">Pilots</p>
              <ul>
                <li><a href="#/pilots">How to fly with us</a></li>
                <li><a href="#/careers">Career &amp; ranks</a></li>
                <li><a href="#/handbook">Handbook &amp; SOPs</a></li>
                <li><a href="#/resources">Pilot resources</a></li>
                <li><a href="#/crew">Crew Tools</a></li>
                <li><a href="#/live">Live flights</a></li>
              </ul>
            </div>
            <div>
              <p className="footer__head">Elsewhere</p>
              <ul>
                {airline?.join_url ? <li><a href={airline.join_url} rel="noopener">Apply on vAMSYS</a></li> : null}
                {airline?.pilot_login_url ? <li><a href={airline.pilot_login_url} rel="noopener">Pilot login (vAMSYS)</a></li> : null}
                {airline?.discord_url ? <li><a href={airline.discord_url} rel="noopener">Discord</a></li> : null}
                {airline?.contact_email ? <li><a href={`mailto:${airline.contact_email}`}>Contact</a></li> : null}
              </ul>
            </div>
          </nav>
          <p className="footer__disclaimer">{DISCLAIMER}</p>
          <p className="footer__meta">
            {snapshot ? (
              <>
                {snapshot.source === "vamsys" ? "Live data from vAMSYS" : snapshot.source === "preview" ? "Schedule as published in vAMSYS" : "Sample data only"} · updated{" "}
                <time dateTime={snapshot.generated_at}>{relativeAge(snapshot.generated_at)}</time> ·{" "}
              </>
            ) : null}
            Map data © OpenStreetMap contributors · Weather from aviationweather.gov · For flight simulation only, never for real-world navigation.
          </p>
        </div>
      </footer>
    </div>
  );
}

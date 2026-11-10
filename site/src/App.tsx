import { useCallback, useEffect, useState } from "react";
import type { Snapshot } from "./data";
import { isStale, loadSnapshot, relativeAge } from "./data";
import { CrewPage } from "./crew";
import { EventsPage, FleetPage, HomePage, LivePage, PilotsPage, RoutesPage } from "./pages";

export const ROUTES = [
  { path: "", label: "Home" },
  { path: "live", label: "Live flights" },
  { path: "fleet", label: "Fleet" },
  { path: "routes", label: "Routes" },
  { path: "crew", label: "Crew Tools" },
  { path: "events", label: "Events" },
  { path: "pilots", label: "Fly with us" },
] as const;

function Mark() {
  // Two straight routes crossing at an orange junction (matches the vAMSYS logo files in brand/).
  return (
    <svg className="wordmark__mark" viewBox="0 0 44 44" aria-hidden="true">
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

function currentPath(): RoutePath {
  const raw = window.location.hash.replace(/^#\/?/, "").split(/[?#]/)[0] ?? "";
  return (ROUTES.find((r) => r.path === raw)?.path ?? "") as RoutePath;
}

const REFRESH_MS = 60_000;

export function App() {
  const [path, setPath] = useState<RoutePath>(currentPath);
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
      setPath(currentPath());
      setMenuOpen(false);
      window.scrollTo({ top: 0 });
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  useEffect(() => {
    const label = ROUTES.find((r) => r.path === path)?.label ?? "Home";
    const name = snapshot?.airline.name ?? "Crossroads Executive & Charter";
    document.title = path ? `${label} · ${name}` : name;
  }, [path, snapshot]);

  const airline = snapshot?.airline;

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
          <button
            type="button"
            className="menu-button"
            aria-expanded={menuOpen}
            aria-controls="primary-nav"
            onClick={() => setMenuOpen((open) => !open)}
          >
            {menuOpen ? "Close" : "Menu"}
          </button>
          <nav id="primary-nav" className={`nav ${menuOpen ? "nav--open" : ""}`} aria-label="Primary">
            {ROUTES.map((route) => (
              <a
                key={route.path}
                href={route.path === "pilots" && airline?.join_url ? airline.join_url : `#/${route.path}`}
                className={route.path === "pilots" ? "nav__cta" : undefined}
                rel={route.path === "pilots" && airline?.join_url ? "noopener" : undefined}
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
          <strong>Now forming.</strong> Our fleet and schedule are set; live flight tracking switches on when the first crews fly.
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
        ) : path === "live" ? (
          <LivePage snapshot={snapshot} />
        ) : path === "fleet" ? (
          <FleetPage snapshot={snapshot} />
        ) : path === "routes" ? (
          <RoutesPage snapshot={snapshot} />
        ) : path === "pilots" ? (
          <PilotsPage snapshot={snapshot} />
        ) : path === "crew" ? (
          <CrewPage snapshot={snapshot} />
        ) : path === "events" ? (
          <EventsPage snapshot={snapshot} />
        ) : (
          <HomePage snapshot={snapshot} />
        )}
      </main>

      <footer className="footer">
        <div className="footer__inner">
          <div>
            <strong>{airline?.name ?? "Crossroads Executive & Charter"}</strong>
            <p>A virtual airline for flight simulation. Not affiliated with any real-world airline or operator.</p>
          </div>
          <ul className="footer__links">
            {airline?.pilot_login_url ? <li><a href={airline.pilot_login_url} rel="noopener">Pilot login</a></li> : null}
            {airline?.discord_url ? <li><a href={airline.discord_url} rel="noopener">Discord</a></li> : null}
            {airline?.contact_email ? <li><a href={`mailto:${airline.contact_email}`}>Contact</a></li> : null}
          </ul>
          {snapshot ? (
            <p className="footer__meta">
              {snapshot.source === "vamsys" ? "Live data from vAMSYS" : snapshot.source === "preview" ? "Schedule as published in vAMSYS" : "Sample data only"} · updated{" "}
              <time dateTime={snapshot.generated_at}>{relativeAge(snapshot.generated_at)}</time>
            </p>
          ) : null}
        </div>
      </footer>
    </div>
  );
}

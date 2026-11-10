import { useCallback, useEffect, useState } from "react";
import type { Snapshot } from "./data";
import { isStale, loadSnapshot, relativeAge } from "./data";
import { EventsPage, FleetPage, HomePage, LivePage, PilotsPage, RoutesPage } from "./pages";

export const ROUTES = [
  { path: "", label: "Home" },
  { path: "live", label: "Live flights" },
  { path: "fleet", label: "Fleet" },
  { path: "routes", label: "Routes" },
  { path: "pilots", label: "Pilots" },
  { path: "events", label: "Events" },
] as const;

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
    const name = snapshot?.airline.name ?? "Crossroad Executive & Charter";
    document.title = path ? `${label} · ${name}` : name;
  }, [path, snapshot]);

  const airline = snapshot?.airline;

  return (
    <div className="shell">
      <a className="skip-link" href="#main">Skip to content</a>
      <header className="masthead">
        <div className="masthead__inner">
          <a className="wordmark" href="#/" aria-label={`${airline?.name ?? "Crossroad Executive & Charter"} home`}>
            <span className="wordmark__mark" aria-hidden="true" />
            <span className="wordmark__text">
              <strong>Crossroad</strong>
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
              <a key={route.path} href={`#/${route.path}`} aria-current={route.path === path ? "page" : undefined}>
                {route.label}
                {route.path === "live" && snapshot && snapshot.live.length > 0 ? (
                  <span className="nav__count" aria-label={`${snapshot.live.length} in the air`}>{snapshot.live.length}</span>
                ) : null}
              </a>
            ))}
            {airline?.join_url ? <a className="nav__cta" href={airline.join_url} rel="noopener">Join</a> : null}
          </nav>
        </div>
      </header>

      {snapshot?.source === "sample" ? (
        <div className="notice notice--sample" role="status">
          Showing fictional sample data. Live vAMSYS data appears once the sync job has credentials.
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
        ) : path === "events" ? (
          <EventsPage snapshot={snapshot} />
        ) : (
          <HomePage snapshot={snapshot} />
        )}
      </main>

      <footer className="footer">
        <div className="footer__inner">
          <div>
            <strong>{airline?.name ?? "Crossroad Executive & Charter"}</strong>
            <p>A virtual airline for flight simulation. Not affiliated with any real-world airline or operator.</p>
          </div>
          <ul className="footer__links">
            {airline?.pilot_login_url ? <li><a href={airline.pilot_login_url} rel="noopener">Pilot login</a></li> : null}
            {airline?.discord_url ? <li><a href={airline.discord_url} rel="noopener">Discord</a></li> : null}
            {airline?.contact_email ? <li><a href={`mailto:${airline.contact_email}`}>Contact</a></li> : null}
          </ul>
          {snapshot ? (
            <p className="footer__meta">
              Data {snapshot.source === "vamsys" ? "from vAMSYS" : "is sample only"} · updated{" "}
              <time dateTime={snapshot.generated_at}>{relativeAge(snapshot.generated_at)}</time>
            </p>
          ) : null}
        </div>
      </footer>
    </div>
  );
}

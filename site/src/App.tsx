import { useCallback, useEffect, useState } from "react";
import type { Snapshot } from "./data";
import { isStale, loadSnapshot, relativeAge } from "./data";
import { CrewPage } from "./crew";
import { AboutPage, CareersPage, HandbookPage, NewsPage, ServicesPage } from "./info";
import { FleetPage, HomePage, LivePage, PilotsPage, RoutesPage } from "./pages";

export const ROUTES = [
  { path: "", label: "Home", nav: false },
  { path: "fleet", label: "Fleet", nav: true },
  { path: "routes", label: "Network", nav: true },
  { path: "services", label: "Services", nav: true },
  { path: "live", label: "Live", nav: true },
  { path: "careers", label: "Careers", nav: true },
  { path: "handbook", label: "Handbook", nav: true },
  { path: "crew", label: "Crew Tools", nav: true },
  { path: "news", label: "News", nav: true },
  { path: "about", label: "About", nav: true },
  { path: "pilots", label: "Fly with us", nav: true },
] as const;

/** Old links keep working. */
const ALIASES: Record<string, RoutePath> = { events: "news", divisions: "services", ranks: "careers", join: "pilots" };

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

function currentPath(): RoutePath {
  const raw = window.location.hash.replace(/^#\/?/, "").split(/[?#]/)[0] ?? "";
  if (ALIASES[raw]) return ALIASES[raw];
  return (ROUTES.find((r) => r.path === raw)?.path ?? "") as RoutePath;
}

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
      const next = currentPath();
      setPath((prev) => {
        if (prev !== next) window.scrollTo({ top: 0 });
        return next;
      });
      setMenuOpen(false);
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  useEffect(() => {
    const label = ROUTES.find((r) => r.path === path)?.label ?? "Home";
    const name = snapshot?.airline.name ?? "Crossroads Executive & Charter";
    document.title = path ? `${label} · ${name}` : `${name} · Virtual airline from Indianapolis`;
  }, [path, snapshot]);

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

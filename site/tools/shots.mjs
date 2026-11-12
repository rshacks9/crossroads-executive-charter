// Screenshots and automated page checks for the built site.
// Runs in CI only (.github/workflows/screenshots.yml):  node tools/shots.mjs <baseUrl> <outDir>
// Playwright and axe-core are installed by that workflow with --no-save; they are not site dependencies.
import { createRequire } from "node:module";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright";

const require = createRequire(import.meta.url);
const AXE_PATH = require.resolve("axe-core/axe.min.js");
const [rawBase = "http://127.0.0.1:4180/", OUT = "shots"] = process.argv.slice(2);
const BASE = rawBase.endsWith("/") ? rawBase : `${rawBase}/`;
const MAX_SLICES = 10;
const AXE_NODES = 12; // elements listed for each failed rule in a capture
const JPEG = { type: "jpeg", quality: 64 };

const VIEWPORTS = [
  { key: "phone", width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  { key: "desktop", width: 1366, height: 768, deviceScaleFactor: 1 },
  { key: "wide", width: 2560, height: 1440, deviceScaleFactor: 1 },
];

// name, hash path. The three detail pages are filled in from the snapshot in main().
const PAGES = [
  ["home", ""], ["fleet", "fleet"], ["type", null], ["routes", "routes"], ["route", null],
  ["destinations", "destinations"], ["airport", null], ["services", "services"], ["plan", "plan"],
  ["live", "live"], ["careers", "careers"], ["handbook", "handbook"], ["resources", "resources"],
  ["stats", "stats"], ["crew", "crew"], ["news", "news"], ["about", "about"], ["pilots", "pilots"],
  ["notfound", "no-such-page"],
  // The latest schedule round's new pages (round 13): its new airport, the route to it from KTYQ, the new
  // point-to-point pair, the new type (Piper M600) and its short hop. Swap them for the next round's.
  ["airport-new", "airport/KBAF"], ["route-new", "route/CRX749"], ["route-p2p", "route/CRX445"],
  ["type-new", "fleet/M600"], ["route-short", "route/CRX751"],
];
// The dark theme is checked on the pages with the most distinct components, at phone and desktop widths,
// including News (the NOTAM and news kind chips) and Plan (the fit chips).
const DARK = new Set(["home", "fleet", "type", "routes", "airport", "crew", "handbook", "news", "plan"]);

// The preview has no flights in the air or landed, so the "Flown by automation" label would never be
// seen. Home and Live are captured once more, at phone and desktop widths in both themes, with two
// flights in the air and two landed (one of each labelled) put into the snapshot the page loads.
// Test data for these captures only; nothing here is deployed.
const LABELLED = [["home-labelled", ""], ["live-labelled", "live"]];
const SNAPSHOT_REQUEST = /\/data\/snapshot\.json(\?.*)?$/;

function withLabelledFlights(snapshot) {
  const at = (minutes) => new Date(Date.now() + minutes * 60000).toISOString().replace(/\.\d{3}Z$/, "Z");
  const inAir = (callsign, automation, to, aircraft, lat, lon) => ({
    callsign, flight_number: callsign.slice(3), from: "KTYQ", to, phase: "Cruise", aircraft, aircraft_name: null,
    registration: null, pilot: null, rank: null, network: "OFFLINE", lat, lon, altitude_ft: 24000, groundspeed_kt: 410,
    heading: 300, route_nm: 150, remaining_nm: 60, eta: at(12), automation,
  });
  const landed = (callsign, automation, from, to, aircraft, minutes) => ({
    callsign, flight_number: callsign.slice(3), from, to, aircraft, landing_rate: -97, duration_min: 40, landed: at(-minutes), automation,
  });
  return {
    ...snapshot,
    generated_at: at(0),
    live: [inAir("CRX115", true, "KMDW", "PRM1", 41.3, -87.2), inAir("CRX101", false, "KTEB", "C25C", 40.9, -80.4)],
    recent_flights: [landed("CRX116", true, "KMDW", "KTYQ", "C510", 35), landed("CRX121", false, "KTYQ", "KBDL", "C750", 120)],
  };
}

async function injectLabelledFlights(route) {
  const response = await route.fetch();
  await route.fulfill({ response, json: withLabelledFlights(await response.json()) });
}

/**
 * Runs in the page: layout facts that a screenshot review can miss. Overflow is measured against
 * `expected`, the configured viewport width: a page that is too wide makes a mobile browser zoom out
 * and widen window.innerWidth, which would hide the overflow it causes.
 */
function pageChecks(expected) {
  const vw = expected;
  const doc = document.documentElement;
  const clipped = (el) => {
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      const o = getComputedStyle(p).overflowX;
      if (o === "auto" || o === "scroll" || o === "hidden" || o === "clip") return true;
    }
    return false;
  };
  const label = (el) => {
    const cls = typeof el.className === "string" && el.className.trim() ? "." + el.className.trim().split(/\s+/).join(".") : "";
    return el.tagName.toLowerCase() + cls;
  };
  const wide = [];
  for (const el of document.body.querySelectorAll("*")) {
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) continue;
    if ((r.right > vw + 1 || r.left < -1) && !clipped(el)) {
      wide.push({ el: label(el), left: Math.round(r.left), right: Math.round(r.right) });
      if (wide.length >= 12) break;
    }
  }
  const desc = document.querySelector('meta[name="description"]');
  const resources = performance.getEntriesByType("resource");
  return {
    title: document.title,
    description: desc ? desc.getAttribute("content") : null,
    h1: [...document.querySelectorAll("h1")].map((h) => h.textContent.trim()),
    innerWidth: window.innerWidth,
    widthMismatch: window.innerWidth !== expected,
    overflowX: doc.scrollWidth - vw,
    pageHeight: doc.scrollHeight,
    wide,
    brokenImages: [...document.images].filter((i) => i.complete && i.naturalWidth === 0).map((i) => i.currentSrc || i.src),
    requests: resources.length,
    transferKb: Math.round(resources.reduce((sum, e) => sum + (e.transferSize || 0), 0) / 1024),
  };
}

/** Runs in the page after axe-core is injected. */
async function runAxe(maxNodes) {
  const result = await window.axe.run(document, {
    runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"] },
    resultTypes: ["violations"],
  });
  return result.violations.map((v) => ({
    id: v.id,
    impact: v.impact,
    help: v.help,
    count: v.nodes.length,
    nodes: v.nodes.slice(0, maxNodes).map((n) => ({
      target: n.target.join(" "),
      html: n.html.slice(0, 160),
      summary: (n.failureSummary || "").slice(0, 300),
    })),
  }));
}

async function settle(page, rec) {
  await page.waitForSelector("main h1, main h2", { timeout: 15000 }).catch(() => { rec.noHeading = true; });
  await page.waitForLoadState("networkidle", { timeout: 12000 }).catch(() => { rec.networkBusy = true; });
  await page.waitForTimeout(400);
}

async function capture(context, vp, theme, [name, hash]) {
  const id = `${vp.key}-${theme}-${name}`;
  const rec = { id, viewport: vp.key, theme, page: name, url: `${BASE}#/${hash}`, console: [], failed: [], aborted: [], http: [] };
  const page = await context.newPage();
  page.on("console", (m) => { if (["error", "warning"].includes(m.type())) rec.console.push(`${m.type()}: ${m.text().slice(0, 300)}`); });
  page.on("pageerror", (e) => rec.console.push(`pageerror: ${String(e).slice(0, 300)}`));
  // A request the page itself cancels (a map tile still loading when the view changes or the page closes) is not a failure.
  page.on("requestfailed", (r) => {
    const reason = r.failure()?.errorText ?? "";
    (reason.includes("ERR_ABORTED") ? rec.aborted : rec.failed).push(`${r.url().slice(0, 160)} ${reason}`);
  });
  page.on("response", (r) => { if (r.status() >= 400) rec.http.push(`${r.status()} ${r.url().slice(0, 160)}`); });
  try {
    await page.goto(rec.url, { waitUntil: "load", timeout: 30000 });
    await settle(page, rec);
    Object.assign(rec, await page.evaluate(pageChecks, vp.width));
    await page.addScriptTag({ path: AXE_PATH });
    rec.axe = await page.evaluate(runAxe, AXE_NODES);
    const needed = Math.ceil(rec.pageHeight / vp.height);
    rec.slices = Math.min(MAX_SLICES, needed);
    rec.truncated = needed > MAX_SLICES;
    for (let i = 0; i < rec.slices; i++) {
      await page.evaluate((y) => window.scrollTo({ top: y, behavior: "instant" }), i * vp.height);
      await page.waitForTimeout(250);
      await page.screenshot({ path: path.join(OUT, `${id}-${String(i + 1).padStart(2, "0")}.jpg`), ...JPEG });
    }
  } catch (e) {
    rec.error = String(e).slice(0, 400);
  }
  await page.close();
  return rec;
}

/** The open menu (where the menu button is shown) and the search dialog with a query typed. */
async function interactions(context, vp) {
  const rec = { id: `${vp.key}-light-interactions`, viewport: vp.key, theme: "light", page: "interactions", done: [] };
  const page = await context.newPage();
  try {
    await page.goto(`${BASE}#/`, { waitUntil: "load", timeout: 30000 });
    await settle(page, rec);
    const menu = page.locator(".menu-button").first();
    if (await menu.isVisible()) {
      await menu.click();
      await page.waitForTimeout(300);
      await page.screenshot({ path: path.join(OUT, `${vp.key}-light-x-menu.jpg`), ...JPEG });
      rec.done.push("menu");
      await menu.click();
    }
    const search = page.locator(".search-button").first();
    if (await search.isVisible()) {
      await search.click();
      await page.waitForTimeout(300);
      await page.keyboard.type("aspen");
      await page.waitForTimeout(400);
      await page.screenshot({ path: path.join(OUT, `${vp.key}-light-x-search.jpg`), ...JPEG });
      rec.done.push("search");
    }
  } catch (e) {
    rec.error = String(e).slice(0, 400);
  }
  await page.close();
  return rec;
}

/**
 * The page head as a crawler that runs no JavaScript reads it: every placeholder filled in at build time,
 * the counts equal to the data, and the same title and description that the app sets once it has loaded.
 */
async function headCheck(browser, loadedHome, snapshot) {
  const head = { url: BASE, problems: [], matchesLoaded: null };
  try {
    const raw = await (await fetch(BASE)).text();
    head.placeholdersLeft = [...raw.matchAll(/\{\{\s*[A-Za-z0-9_.-]+\s*\}\}/g)].map((m) => m[0]);
    if (head.placeholdersLeft.length) head.problems.push(`placeholders were not filled in: ${head.placeholdersLeft.join(", ")}`);
    const image = await fetch(new URL("og.png", BASE));
    const bytes = (await image.arrayBuffer()).byteLength;
    head.shareImage = { status: image.status, type: image.headers.get("content-type"), kb: Math.round(bytes / 1024) };
    if (image.status !== 200 || !String(head.shareImage.type).startsWith("image/png")) {
      head.problems.push(`og.png did not load as a PNG image (${image.status}, ${head.shareImage.type})`);
    }
  } catch (e) {
    head.problems.push(`could not fetch the page or its share image: ${String(e).slice(0, 300)}`);
  }
  const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 1366, height: 768 } });
  const page = await context.newPage();
  try {
    await page.goto(BASE, { waitUntil: "load", timeout: 30000 });
    const content = (selector) => page.locator(selector).first().getAttribute("content", { timeout: 2000 }).catch(() => null);
    head.title = await page.title();
    head.description = await content('meta[name="description"]');
    head.ogTitle = await content('meta[property="og:title"]');
    head.ogDescription = await content('meta[property="og:description"]');
    head.ogImage = await content('meta[property="og:image"]');
    await page.screenshot({ path: path.join(OUT, "nojs-home.jpg"), ...JPEG });
  } catch (e) {
    head.problems.push(`could not read the page without JavaScript: ${String(e).slice(0, 300)}`);
  }
  await context.close();

  for (const [name, value] of [["title", head.title], ["description", head.description], ["link-preview description", head.ogDescription]]) {
    if (!value || !value.trim()) head.problems.push(`the ${name} is missing`);
  }
  if ((head.description || "").length > 160) {
    head.problems.push(`the description is ${head.description.length} characters; search results cut it at about 160`);
  }
  // A count in a description must be the count in the data.
  const stated = (text, pattern) => { const m = pattern.exec(text || ""); return m ? Number(m[1].replace(/,/g, "")) : null; };
  for (const [name, text] of [["description", head.description], ["link-preview description", head.ogDescription]]) {
    const types = stated(text, /(\d[\d,]*) aircraft types?/);
    const routes = stated(text, /(\d[\d,]*) routes?/);
    if (types !== null && types !== snapshot.fleet.length) head.problems.push(`the ${name} says ${types} aircraft types; the data has ${snapshot.fleet.length}`);
    if (routes !== null && routes !== snapshot.routes.length) head.problems.push(`the ${name} says ${routes} routes; the data has ${snapshot.routes.length}`);
  }
  if (loadedHome) {
    head.matchesLoaded = loadedHome.title === head.title && loadedHome.description === head.description;
    if (loadedHome.title !== head.title) head.problems.push(`the title changes when the app loads: "${head.title}" becomes "${loadedHome.title}"`);
    if (loadedHome.description !== head.description) head.problems.push(`the description changes when the app loads: "${head.description}" becomes "${loadedHome.description}"`);
  }
  return head;
}

/** Text for one table cell: no pipes or line breaks. */
const cell = (text) => String(text ?? "").replace(/\|/g, "/").replace(/\s+/g, " ").trim();

function summarize(results, head) {
  const pages = results.filter((r) => r.axe || r.error);
  const count = (list) => (list || []).length;
  const by = (r, impact) => (r.axe || []).filter((v) => v.impact === impact).reduce((n, v) => n + v.count, 0);
  const sum = (f) => pages.reduce((n, r) => n + f(r), 0);
  // Sideways overflow, or a window the browser widened to fit the page.
  const sideways = (r) => r.overflowX > 1 || r.widthMismatch;
  const overflowCell = (r) => `+${r.overflowX}px${r.widthMismatch ? `, window ${r.innerWidth}px` : ""}`;
  const rows = pages.map((r) =>
    `| ${r.id} | ${r.error ? "ERROR" : sideways(r) ? overflowCell(r) : "ok"} | ${by(r, "critical")} | ${by(r, "serious")} | ${by(r, "moderate") + by(r, "minor")} | ${count(r.console)} | ${count(r.failed) + count(r.http)} | ${count(r.aborted)} | ${count(r.brokenImages)} | ${r.pageHeight ?? ""} | ${r.transferKb ?? ""} |`);
  const totals = [
    `${pages.length} captures`,
    `${pages.filter((r) => r.error).length} errors`,
    `${pages.filter(sideways).length} with sideways overflow`,
    `${sum((r) => by(r, "critical"))} critical and ${sum((r) => by(r, "serious"))} serious accessibility findings`,
    `${sum((r) => count(r.console))} console messages`,
    `${sum((r) => count(r.failed) + count(r.http))} failed requests`,
    `${sum((r) => count(r.brokenImages))} broken images`,
    `${pages.filter((r) => r.truncated).length} pages longer than ${MAX_SLICES} screens`,
  ].join(", ");
  const rules = new Map();
  for (const r of results) for (const v of r.axe || []) {
    const cur = rules.get(v.id) || { impact: v.impact, help: v.help, nodes: 0, captures: 0 };
    cur.nodes += v.count; cur.captures += 1; rules.set(v.id, cur);
  }
  const ruleRows = [...rules].sort((a, b) => b[1].nodes - a[1].nodes).map(([id, v]) => `| ${id} | ${v.impact} | ${v.nodes} | ${v.captures} | ${v.help} |`);
  const image = head?.shareImage ? `${head.shareImage.status}, ${head.shareImage.type}, ${head.shareImage.kb} KB` : "not fetched";
  const headLines = head ? [
    "## Page head, read without JavaScript", "",
    "| Item | Value |", "| --- | --- |",
    `| Title | ${cell(head.title)} |`,
    `| Description, ${(head.description || "").length} characters | ${cell(head.description)} |`,
    `| Link-preview title | ${cell(head.ogTitle)} |`,
    `| Link-preview description | ${cell(head.ogDescription)} |`,
    `| Link-preview image | ${cell(head.ogImage)} (og.png of this site: ${cell(image)}) |`,
    `| Same title and description once the app has loaded | ${head.matchesLoaded === null ? "not compared" : head.matchesLoaded ? "yes" : "NO"} |`,
    "",
    ...(head.problems.length ? ["Problems:", "", ...head.problems.map((p) => `- ${cell(p)}`), ""] : ["No problems found in the page head.", ""]),
  ] : [];
  return [
    "## Page checks", "", `Totals: ${totals}.`, "",
    "| Capture | Sideways overflow | Critical | Serious | Moderate or minor | Console | Failed requests | Cancelled requests | Broken images | Height px | Transfer KB |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |", ...rows, "",
    "Cancelled requests are ones the page itself dropped (map tiles still loading when the view changed or the page closed); they are not failures.",
    "Transfer KB: the home page is the first page of each group and loads with an empty cache; the pages after it reuse cached files.", "",
    ...headLines,
    "## Accessibility rules that failed", "",
    "| Rule | Impact | Elements | Captures | What it means |", "| --- | --- | --- | --- | --- |", ...ruleRows, "",
  ].join("\n");
}

/** Overview sheets: the slices of one capture side by side, small enough to take in as one image. */
const SHEET = { phone: { cols: 5, rows: 2, scale: 0.6 }, desktop: { cols: 2, rows: 2, scale: 0.55 } };

async function sheets(browser, results) {
  const context = await browser.newContext({ viewport: { width: 1600, height: 1200 } });
  const page = await context.newPage();
  const html = path.resolve(OUT, "_sheet.html");
  for (const r of results) {
    const spec = SHEET[r.viewport];
    if (!spec || !r.slices) continue;
    const vp = VIEWPORTS.find((v) => v.key === r.viewport);
    const w = Math.round(vp.width * spec.scale);
    const h = Math.round(vp.height * spec.scale);
    const per = spec.cols * spec.rows;
    r.sheets = 0;
    for (let s = 0; s * per < r.slices; s++) {
      const imgs = [];
      for (let i = s * per; i < Math.min(r.slices, (s + 1) * per); i++) {
        imgs.push(`<img src="${r.id}-${String(i + 1).padStart(2, "0")}.jpg" width="${w}" height="${h}" alt="">`);
      }
      await writeFile(html, `<!doctype html><body style="margin:0;background:#777"><div id="g" style="display:grid;gap:4px;padding:4px;width:max-content;grid-template-columns:repeat(${spec.cols},${w}px)">${imgs.join("")}</div></body>`);
      await page.goto(pathToFileURL(html).href, { waitUntil: "load" });
      await page.locator("#g").screenshot({ path: path.join(OUT, `sheet-${r.id}-${s + 1}.jpg`), type: "jpeg", quality: 72 });
      r.sheets += 1;
    }
  }
  await rm(html, { force: true });
  await context.close();
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const snapshot = await (await fetch(`${BASE}data/snapshot.json`)).json();
  const pick = { type: `fleet/${snapshot.fleet.some((f) => f.code === "C25C") ? "C25C" : snapshot.fleet[0].code}`, route: `route/${snapshot.routes[0].callsign}`, airport: "airport/KIND" };
  const pages = PAGES.map(([name, hash]) => [name, hash ?? pick[name]]);
  const browser = await chromium.launch();
  const results = [];
  for (const vp of VIEWPORTS) {
    for (const theme of ["light", "dark"]) {
      if (theme === "dark" && vp.key === "wide") continue;
      const options = {
        viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: vp.deviceScaleFactor,
        isMobile: !!vp.isMobile, hasTouch: !!vp.hasTouch, colorScheme: theme, reducedMotion: "reduce",
        locale: "en-US", timezoneId: "America/Indiana/Indianapolis",
      };
      const context = await browser.newContext(options);
      for (const p of pages) {
        if (theme === "dark" && !DARK.has(p[0])) continue;
        const rec = await capture(context, vp, theme, p);
        results.push(rec);
        console.log(`${rec.id}: ${rec.error ? "ERROR " + rec.error : `${rec.slices} slices, overflow ${rec.overflowX}, axe ${rec.axe.length}`}`);
      }
      if (theme === "light") results.push(await interactions(context, vp));
      await context.close();
      if (vp.key === "wide") continue;
      const labelled = await browser.newContext(options);
      await labelled.route(SNAPSHOT_REQUEST, injectLabelledFlights);
      for (const p of LABELLED) {
        const rec = await capture(labelled, vp, theme, p);
        results.push(rec);
        console.log(`${rec.id}: ${rec.error ? "ERROR " + rec.error : `${rec.slices} slices, overflow ${rec.overflowX}, axe ${rec.axe.length}`}`);
      }
      await labelled.close();
    }
  }
  await sheets(browser, results).catch((e) => console.error(`sheets failed: ${e}`));
  const head = await headCheck(browser, results.find((r) => r.page === "home" && r.theme === "light" && !r.error), snapshot);
  await browser.close();
  await writeFile(path.join(OUT, "report.json"), JSON.stringify({ base: BASE, generated: new Date().toISOString(), head, results }, null, 1));
  await writeFile(path.join(OUT, "summary.md"), summarize(results, head));
  const errors = results.filter((r) => r.error);
  if (errors.length) { console.error(`${errors.length} capture(s) failed`); process.exitCode = 1; }
  if (head.problems.length) { console.error(`page head: ${head.problems.join("; ")}`); process.exitCode = 1; }
}

await main();

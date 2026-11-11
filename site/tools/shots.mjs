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
];
// The dark theme is checked on the pages with the most distinct components, at phone and desktop widths.
const DARK = new Set(["home", "fleet", "type", "routes", "airport", "crew", "handbook"]);

/** Runs in the page: layout facts that a screenshot review can miss. */
function pageChecks() {
  const vw = window.innerWidth;
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
    innerWidth: vw,
    overflowX: doc.scrollWidth - vw,
    pageHeight: doc.scrollHeight,
    wide,
    brokenImages: [...document.images].filter((i) => i.complete && i.naturalWidth === 0).map((i) => i.currentSrc || i.src),
    requests: resources.length,
    transferKb: Math.round(resources.reduce((sum, e) => sum + (e.transferSize || 0), 0) / 1024),
  };
}

/** Runs in the page after axe-core is injected. */
async function runAxe() {
  const result = await window.axe.run(document, {
    runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"] },
    resultTypes: ["violations"],
  });
  return result.violations.map((v) => ({
    id: v.id,
    impact: v.impact,
    help: v.help,
    count: v.nodes.length,
    nodes: v.nodes.slice(0, 4).map((n) => ({
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
  const rec = { id, viewport: vp.key, theme, page: name, url: `${BASE}#/${hash}`, console: [], failed: [], http: [] };
  const page = await context.newPage();
  page.on("console", (m) => { if (["error", "warning"].includes(m.type())) rec.console.push(`${m.type()}: ${m.text().slice(0, 300)}`); });
  page.on("pageerror", (e) => rec.console.push(`pageerror: ${String(e).slice(0, 300)}`));
  page.on("requestfailed", (r) => rec.failed.push(`${r.url().slice(0, 160)} ${r.failure()?.errorText ?? ""}`));
  page.on("response", (r) => { if (r.status() >= 400) rec.http.push(`${r.status()} ${r.url().slice(0, 160)}`); });
  try {
    await page.goto(rec.url, { waitUntil: "load", timeout: 30000 });
    await settle(page, rec);
    Object.assign(rec, await page.evaluate(pageChecks));
    await page.addScriptTag({ path: AXE_PATH });
    rec.axe = await page.evaluate(runAxe);
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

function summarize(results) {
  const rows = results.filter((r) => r.axe || r.error).map((r) => {
    const by = (impact) => (r.axe || []).filter((v) => v.impact === impact).reduce((n, v) => n + v.count, 0);
    return `| ${r.id} | ${r.error ? "ERROR" : r.overflowX > 1 ? `+${r.overflowX}px` : "ok"} | ${by("critical")} | ${by("serious")} | ${by("moderate") + by("minor")} | ${r.console.length} | ${r.failed.length + r.http.length} | ${(r.brokenImages || []).length} | ${r.pageHeight ?? ""} | ${r.transferKb ?? ""} |`;
  });
  const rules = new Map();
  for (const r of results) for (const v of r.axe || []) {
    const cur = rules.get(v.id) || { impact: v.impact, help: v.help, nodes: 0, captures: 0 };
    cur.nodes += v.count; cur.captures += 1; rules.set(v.id, cur);
  }
  const ruleRows = [...rules].sort((a, b) => b[1].nodes - a[1].nodes).map(([id, v]) => `| ${id} | ${v.impact} | ${v.nodes} | ${v.captures} | ${v.help} |`);
  return [
    "## Page checks", "",
    "| Capture | Sideways overflow | Critical | Serious | Moderate or minor | Console | Failed requests | Broken images | Height px | Transfer KB |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |", ...rows, "",
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
      const context = await browser.newContext({
        viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: vp.deviceScaleFactor,
        isMobile: !!vp.isMobile, hasTouch: !!vp.hasTouch, colorScheme: theme, reducedMotion: "reduce",
        locale: "en-US", timezoneId: "America/Indiana/Indianapolis",
      });
      for (const p of pages) {
        if (theme === "dark" && !DARK.has(p[0])) continue;
        const rec = await capture(context, vp, theme, p);
        results.push(rec);
        console.log(`${rec.id}: ${rec.error ? "ERROR " + rec.error : `${rec.slices} slices, overflow ${rec.overflowX}, axe ${rec.axe.length}`}`);
      }
      if (theme === "light") results.push(await interactions(context, vp));
      await context.close();
    }
  }
  await sheets(browser, results).catch((e) => console.error(`sheets failed: ${e}`));
  await browser.close();
  await writeFile(path.join(OUT, "report.json"), JSON.stringify({ base: BASE, generated: new Date().toISOString(), results }, null, 1));
  await writeFile(path.join(OUT, "summary.md"), summarize(results));
  const errors = results.filter((r) => r.error);
  if (errors.length) { console.error(`${errors.length} capture(s) failed`); process.exitCode = 1; }
}

await main();

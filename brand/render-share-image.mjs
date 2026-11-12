// Renders the 1200x630 link-preview card (Open Graph: Discord, Reddit, Facebook) kept at site/public/og.png.
// Usage: node render-share-image.mjs <node_modules with playwright> <@fontsource/barlow-condensed/files> [output.png]
//
// The card carries no counts, on purpose. The sites that show link previews keep the image for days or
// weeks, so a number on it goes out of date. The counts are in the page descriptions, which the build
// takes from the data (site/src/html-facts.ts). A test in the site fails if a count is typed in this file.
//
// Browser: the one named by CHROME_PATH, else Chrome in its usual Windows folder, else Playwright's own.
// The workflow "Screenshots and page checks" renders the card on every run (job share-image).
import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const [nodeModules, fontDir, outArg] = process.argv.slice(2)
if (!nodeModules || !fontDir) {
  console.error('usage: node render-share-image.mjs <node_modules with playwright> <@fontsource/barlow-condensed/files> [output.png]')
  process.exit(2)
}
const require = createRequire(path.join(path.resolve(nodeModules), 'noop.js'))
const { chromium } = require('playwright')
const here = path.dirname(fileURLToPath(import.meta.url))
const out = outArg ? path.resolve(outArg) : path.resolve(here, '..', 'site', 'public', 'og.png')
const font = (w) => readFileSync(path.join(fontDir, `barlow-condensed-latin-${w}-normal.woff2`)).toString('base64')

const mark = `<svg width="150" height="150" viewBox="0 0 44 44"><line x1="22" y1="5" x2="22" y2="39" stroke="#f2f5f6" stroke-width="4.2" stroke-linecap="round"/><line x1="5" y1="22" x2="39" y2="22" stroke="#e8703a" stroke-width="4.2" stroke-linecap="round"/><circle cx="22" cy="5" r="3.4" fill="#f2f5f6"/><circle cx="22" cy="39" r="3.4" fill="#f2f5f6"/><circle cx="5" cy="22" r="3.4" fill="#e8703a"/><circle cx="39" cy="22" r="3.4" fill="#e8703a"/><rect x="16.5" y="16.5" width="11" height="11" rx="1.5" transform="rotate(45 22 22)" fill="#e8703a"/></svg>`

const html = `<!doctype html><style>
@font-face{font-family:BC;font-weight:600;src:url(data:font/woff2;base64,${font(600)})}
@font-face{font-family:BC;font-weight:700;src:url(data:font/woff2;base64,${font(700)})}
html,body{margin:0}
.card{width:1200px;height:630px;box-sizing:border-box;padding:70px 80px;background:radial-gradient(120% 120% at 75% 40%,#2a3740,#141b20);color:#f2f5f6;font-family:BC;position:relative;overflow:hidden}
.card::before{content:"";position:absolute;inset:0;background-image:linear-gradient(#ffffff08 1px,transparent 1px),linear-gradient(90deg,#ffffff08 1px,transparent 1px);background-size:60px 60px}
.route{position:absolute;left:793px;top:271px;width:474px;height:5px;background:#e8703a;opacity:.55;transform:rotate(-14deg)}
.route2{position:absolute;right:250px;top:-40px;width:5px;height:720px;background:#f2f5f6;opacity:.10}
.node{position:absolute;left:935px;top:282px;width:25px;height:25px;border-radius:3px;background:#e8703a;transform:rotate(45deg)}
.end{position:absolute;left:790px;top:321px;width:20px;height:20px;border-radius:50%;background:#e8703a}
.row{display:flex;align-items:center;gap:40px;position:relative}
h1{font-weight:700;font-size:118px;line-height:.9;margin:0;letter-spacing:2px}
.sub{font-weight:600;font-size:40px;letter-spacing:10px;color:#a9b6bc;margin-top:14px}
.facts{position:absolute;left:80px;bottom:66px}
.range{font-weight:700;font-size:62px;line-height:1;letter-spacing:1px;color:#e8703a}
.divisions{font-weight:600;font-size:36px;line-height:1.2;letter-spacing:4px;margin-top:12px}
.tag{font-weight:600;font-size:28px;line-height:1.2;letter-spacing:3px;color:#a9b6bc;margin-top:14px}
</style><div class="card"><div class="route2"></div><div class="route"></div><div class="node"></div><div class="end"></div>
<div class="row">${mark}<div><h1>CROSSROADS</h1><div class="sub">EXECUTIVE &amp; CHARTER</div></div></div>
<div class="facts"><div class="range">LIGHT JETS TO THE A380 AND 777F</div>
<div class="divisions">EXECUTIVE · CHARTER · SPORTS · CARGO</div>
<div class="tag">VIRTUAL AIRLINE FOR FLIGHT SIMULATION · INDIANAPOLIS</div></div></div>`

const windowsChrome = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const executablePath = process.env.CHROME_PATH || (existsSync(windowsChrome) ? windowsChrome : undefined)
const browser = await chromium.launch(executablePath ? { executablePath } : {})
const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 })
await page.setContent(html)
await page.evaluate(() => document.fonts.ready)
await page.screenshot({ path: out })
await browser.close()
console.log('wrote', out)

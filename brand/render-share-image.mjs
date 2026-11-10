// Renders the 1200x630 link-preview image (Open Graph / Discord / Reddit) into site/public/og.png.
// Usage: node render-share-image.mjs <node_modules with playwright> <@fontsource/barlow-condensed/files>
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const [nodeModules, fontDir] = process.argv.slice(2)
const require = createRequire(path.join(nodeModules, 'noop.js'))
const { chromium } = require('playwright')
const here = path.dirname(fileURLToPath(import.meta.url))
const out = path.resolve(here, '..', 'site', 'public', 'og.png')
const font = (w) => readFileSync(path.join(fontDir, `barlow-condensed-latin-${w}-normal.woff2`)).toString('base64')

const mark = `<svg width="150" height="150" viewBox="0 0 44 44"><line x1="22" y1="5" x2="22" y2="39" stroke="#f2f5f6" stroke-width="4.2" stroke-linecap="round"/><line x1="5" y1="22" x2="39" y2="22" stroke="#e8703a" stroke-width="4.2" stroke-linecap="round"/><circle cx="22" cy="5" r="3.4" fill="#f2f5f6"/><circle cx="22" cy="39" r="3.4" fill="#f2f5f6"/><circle cx="5" cy="22" r="3.4" fill="#e8703a"/><circle cx="39" cy="22" r="3.4" fill="#e8703a"/><rect x="16.5" y="16.5" width="11" height="11" rx="1.5" transform="rotate(45 22 22)" fill="#e8703a"/></svg>`

const html = `<!doctype html><style>
@font-face{font-family:BC;font-weight:600;src:url(data:font/woff2;base64,${font(600)})}
@font-face{font-family:BC;font-weight:700;src:url(data:font/woff2;base64,${font(700)})}
html,body{margin:0}
.card{width:1200px;height:630px;box-sizing:border-box;padding:70px 80px;background:radial-gradient(120% 120% at 75% 40%,#2a3740,#141b20);color:#f2f5f6;font-family:BC;position:relative;overflow:hidden}
.card::before{content:"";position:absolute;inset:0;background-image:linear-gradient(#ffffff08 1px,transparent 1px),linear-gradient(90deg,#ffffff08 1px,transparent 1px);background-size:60px 60px}
.route{position:absolute;right:-60px;top:330px;width:760px;height:5px;background:#e8703a;opacity:.55;transform:rotate(-14deg)}
.route2{position:absolute;right:250px;top:-40px;width:5px;height:720px;background:#f2f5f6;opacity:.10}
.row{display:flex;align-items:center;gap:40px;position:relative}
h1{font-weight:700;font-size:118px;line-height:.9;margin:0;letter-spacing:2px}
.sub{font-weight:600;font-size:40px;letter-spacing:10px;color:#a9b6bc;margin-top:14px}
.facts{position:absolute;left:80px;bottom:70px;display:flex;gap:48px;font-weight:600;font-size:34px;letter-spacing:1px}
.facts b{display:block;font-weight:700;font-size:64px;color:#e8703a;line-height:1}
.tag{position:absolute;right:80px;bottom:78px;font-weight:600;font-size:30px;letter-spacing:3px;color:#a9b6bc}
</style><div class="card"><div class="route2"></div><div class="route"></div>
<div class="row">${mark}<div><h1>CROSSROADS</h1><div class="sub">EXECUTIVE &amp; CHARTER</div></div></div>
<div class="facts"><div><b>15</b>aircraft types</div><div><b>56</b>routes</div><div><b>4</b>divisions</div></div>
<div class="tag">VIRTUAL AIRLINE · INDIANAPOLIS</div></div>`

const browser = await chromium.launch({ executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' })
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } })
await page.setContent(html)
await page.evaluate(() => document.fonts.ready)
await page.screenshot({ path: out })
await browser.close()
console.log('wrote', out)

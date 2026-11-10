// Renders the vAMSYS login/register background (1706x1600 JPEG) in the Crossroads brand.
// Usage: node render-background.mjs <path-to-node_modules-with-playwright>
import { mkdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(path.join(process.argv[2], 'noop.js'))
const { chromium } = require('playwright')
const here = path.dirname(fileURLToPath(import.meta.url))
mkdirSync(path.join(here, 'png'), { recursive: true })

const W = 1706, H = 1600
// Fixed pseudo-random airports so the image is reproducible.
let seed = 7
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
const dots = Array.from({ length: 70 }, () => [Math.round(rnd() * W), Math.round(rnd() * H), rnd()])
const hub = [W * 0.58, H * 0.46]
const spokes = [[0.12, 0.18], [0.9, 0.12], [0.95, 0.62], [0.78, 0.92], [0.2, 0.86], [0.04, 0.52], [0.4, 0.06]]
  .map(([x, y]) => [x * W, y * H])

const arc = ([x1, y1], [x2, y2], bend) => {
  const mx = (x1 + x2) / 2, my = (y1 + y2) / 2
  const dx = x2 - x1, dy = y2 - y1
  return `M${x1},${y1} Q${mx - dy * bend},${my + dx * bend} ${x2},${y2}`
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow" cx="58%" cy="46%" r="65%">
      <stop offset="0" stop-color="#2a3740"/><stop offset="1" stop-color="#141b20"/>
    </radialGradient>
    <pattern id="grid" width="80" height="80" patternUnits="userSpaceOnUse">
      <path d="M80 0H0V80" fill="none" stroke="#ffffff" stroke-opacity="0.035" stroke-width="1"/>
    </pattern>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#glow)"/>
  <rect width="${W}" height="${H}" fill="url(#grid)"/>
  ${dots.map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${1.5 + r * 2}" fill="#cfd8dc" fill-opacity="${0.12 + r * 0.18}"/>`).join('')}
  ${spokes.map((p, i) => `<path d="${arc(hub, p, i % 2 ? 0.12 : -0.12)}" fill="none" stroke="#e8703a" stroke-opacity="${0.35 + (i % 3) * 0.15}" stroke-width="3" stroke-dasharray="${i % 2 ? '0' : '10 12'}" stroke-linecap="round"/>`).join('')}
  ${spokes.map(([x, y]) => `<circle cx="${x}" cy="${y}" r="7" fill="#1b2328" stroke="#e8703a" stroke-width="3"/>`).join('')}
  <line x1="0" y1="${hub[1]}" x2="${W}" y2="${hub[1]}" stroke="#e8703a" stroke-opacity="0.22" stroke-width="10"/>
  <line x1="${hub[0]}" y1="0" x2="${hub[0]}" y2="${H}" stroke="#f2f5f6" stroke-opacity="0.12" stroke-width="10"/>
  <rect x="${hub[0] - 26}" y="${hub[1] - 26}" width="52" height="52" rx="6" transform="rotate(45 ${hub[0]} ${hub[1]})" fill="#e8703a"/>
</svg>`

const browser = await chromium.launch({ executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' })
const page = await browser.newPage({ viewport: { width: W, height: H } })
await page.setContent(`<!doctype html><style>html,body{margin:0}</style>${svg}`)
const out = path.join(here, 'png', 'crossroads-login-background-1706x1600.jpg')
await page.screenshot({ path: out, type: 'jpeg', quality: 82 })
await browser.close()
console.log('wrote', out)

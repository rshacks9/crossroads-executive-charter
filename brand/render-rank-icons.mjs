// Renders vAMSYS rank icons (170x72, i.e. 2x the recommended 85x36): shoulder boards with stripes.
// Usage: node render-rank-icons.mjs <path-to-node_modules-with-playwright>
import { mkdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(path.join(process.argv[2], 'noop.js'))
const { chromium } = require('playwright')
const here = path.dirname(fileURLToPath(import.meta.url))
const out = path.join(here, 'png', 'ranks')
mkdirSync(out, { recursive: true })

const ranks = [
  { file: 'rank-1-first-officer.png', stripes: 2 },
  { file: 'rank-2-captain.png', stripes: 3 },
  { file: 'rank-3-senior-captain.png', stripes: 4 },
  { file: 'rank-4-charter-captain.png', stripes: 4, diamond: true },
  { file: 'rank-5-chief-pilot.png', stripes: 4, diamond: true, double: true },
]

function board({ stripes, diamond, double }) {
  const W = 170, H = 72
  const bars = Array.from({ length: stripes }, (_, i) => {
    const x = 34 + i * 18
    return `<rect x="${x}" y="12" width="10" height="48" rx="2" fill="#e8703a"/>`
  }).join('')
  const d = diamond
    ? `<rect x="${double ? 118 : 124}" y="27" width="18" height="18" rx="2" transform="rotate(45 ${double ? 127 : 133} 36)" fill="#f2f5f6"/>` +
      (double ? `<rect x="140" y="27" width="18" height="18" rx="2" transform="rotate(45 149 36)" fill="#f2f5f6"/>` : '')
    : ''
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
    <path d="M4 10 Q4 4 10 4 H150 L166 36 L150 68 H10 Q4 68 4 62 Z" fill="#1b2328"/>
    <circle cx="18" cy="36" r="5" fill="#55646c"/>
    ${bars}${d}
  </svg>`
}

const browser = await chromium.launch({ executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' })
for (const r of ranks) {
  const page = await browser.newPage({ viewport: { width: 170, height: 72 } })
  await page.setContent(`<!doctype html><style>html,body{margin:0;background:transparent}</style>${board(r)}`)
  await page.screenshot({ path: path.join(out, r.file), omitBackground: true })
  await page.close()
  console.log('wrote', r.file)
}
await browser.close()

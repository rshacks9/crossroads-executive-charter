// Renders the Crossroads Executive & Charter logo files for vAMSYS branding.
// Usage: node render-logos.mjs <path-to-node_modules-with-playwright> <path-to-fontsource-barlow-condensed-files>
import { readFileSync, mkdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const [nodeModules, fontDir] = process.argv.slice(2)
const require = createRequire(path.join(nodeModules, 'noop.js'))
const { chromium } = require('playwright')

const here = path.dirname(fileURLToPath(import.meta.url))
const out = path.join(here, 'png')
mkdirSync(out, { recursive: true })

const font = (w) => readFileSync(path.join(fontDir, `barlow-condensed-latin-${w}-normal.woff2`)).toString('base64')
const css = `
@font-face { font-family: BC; font-weight: 600; src: url(data:font/woff2;base64,${font(600)}) format('woff2'); }
@font-face { font-family: BC; font-weight: 700; src: url(data:font/woff2;base64,${font(700)}) format('woff2'); }
html, body { margin: 0; background: transparent; }
`
const ORANGE = '#e8703a'

// Two straight routes crossing at a junction. Deliberately no bent arms: a rotationally symmetric
// "interlocking hooks" mark reads as a pinwheel/hooked cross at logo size.
function mark(size, ink) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 44 44" fill="none">
    <line x1="22" y1="5" x2="22" y2="39" stroke="${ink}" stroke-width="4.2" stroke-linecap="round"/>
    <line x1="5" y1="22" x2="39" y2="22" stroke="${ORANGE}" stroke-width="4.2" stroke-linecap="round"/>
    <circle cx="22" cy="5" r="3.4" fill="${ink}"/>
    <circle cx="22" cy="39" r="3.4" fill="${ink}"/>
    <circle cx="5" cy="22" r="3.4" fill="${ORANGE}"/>
    <circle cx="39" cy="22" r="3.4" fill="${ORANGE}"/>
    <rect x="16.5" y="16.5" width="11" height="11" rx="1.5" transform="rotate(45 22 22)" fill="${ORANGE}"/>
  </svg>`
}

function wide(ink, sub) {
  return `<div style="width:1800px;height:400px;display:flex;align-items:center;gap:56px;padding:0 90px;box-sizing:border-box">
    ${mark(300, ink)}
    <div style="display:flex;flex-direction:column;justify-content:center;line-height:1">
      <div style="font:700 196px/0.9 BC;letter-spacing:4px;color:${ink}">CROSSROADS</div>
      <div style="font:600 70px/1 BC;letter-spacing:15px;color:${sub};margin-top:22px;white-space:nowrap">EXECUTIVE &amp; CHARTER</div>
    </div>
  </div>`
}

function square(bg, ink) {
  return `<div style="width:512px;height:512px;background:${bg};border-radius:96px;display:grid;place-items:center">${mark(360, ink)}</div>`
}

const jobs = [
  { file: 'crossroads-logo-light-1800x400.png', html: wide('#1b2328', '#55646c'), w: 1800, h: 400 },
  { file: 'crossroads-logo-dark-1800x400.png', html: wide('#f2f5f6', '#a9b6bc'), w: 1800, h: 400 },
  { file: 'crossroads-icon-512.png', html: square('#1b2328', '#f2f5f6'), w: 512, h: 512 },
  { file: 'crossroads-logo-preview-on-dark.png', html: `<div style="background:#1b2328">${wide('#f2f5f6', '#a9b6bc')}</div>`, w: 1800, h: 400, opaque: true },
]

const executablePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const browser = await chromium.launch({ executablePath })
for (const job of jobs) {
  const page = await browser.newPage({ viewport: { width: job.w, height: job.h }, deviceScaleFactor: 1 })
  await page.setContent(`<!doctype html><style>${css}</style>${job.html}`)
  await page.evaluate(() => document.fonts.ready)
  await page.screenshot({ path: path.join(out, job.file), omitBackground: !job.opaque })
  await page.close()
  console.log('wrote', job.file)
}
await browser.close()

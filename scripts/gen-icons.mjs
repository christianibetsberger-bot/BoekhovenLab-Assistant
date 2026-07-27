// Regenerate the static icon fallbacks from the shared coacervate generator.
// Run with: node scripts/gen-icons.mjs   (needs sharp installed)
import sharp from 'sharp'
import { writeFileSync } from 'node:fs'
import { coacervateSVG } from '../src/utils/coacervateIcon.js'

const ACCENT = '#0E396E'
const out = new URL('../public/', import.meta.url)
const path = (name) => new URL(name, out).pathname

const lightSVG = coacervateSVG({ accent: ACCENT, dark: false })
const darkSVG  = coacervateSVG({ accent: ACCENT, dark: true })

// Static SVG favicon (pre-JS fallback) — dark variant.
writeFileSync(path('favicon.svg'), darkSVG)

const png = (svg, size) => sharp(Buffer.from(svg)).resize(size, size).png().toBuffer()

const jobs = [
  ['icon-light-192.png', lightSVG, 192],
  ['icon-light-512.png', lightSVG, 512],
  ['icon-dark-192.png',  darkSVG,  192],
  ['icon-dark-512.png',  darkSVG,  512],
  ['apple-touch-light.png', lightSVG, 180],
  ['apple-touch-dark.png',  darkSVG,  180],
  ['icon-192.png', darkSVG, 192],
  ['icon-512.png', darkSVG, 512],
]
for (const [name, svg, size] of jobs) {
  writeFileSync(path(name), await png(svg, size))
  console.log('wrote', name, size)
}
console.log('done')

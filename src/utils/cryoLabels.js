// Cryogenic label system — exact geometry from the design handoff
// (design_handoff_cryo_labels). All dimensions in millimetres; black-on-white.
// Two media: DYMO CryoSTUCK LWCS (die-cut, direct thermal) and HERMA 4363 (A4).
import qrcode from './qrcode.mjs'

export const INVENTORY_BASE = 'https://christianibetsberger-bot.github.io/BoekhovenLab-Assistant/?qr='

// DYMO CryoSTUCK LWCS — rect wrap (+ optional cap circle for eppis). Exact mm.
//   rw/rh = wrap rectangle · cd = cap circle Ø · ov = cap/rect overlap
//   qr = QR square · ecc = error correction · f* = start font size (mm), shrink-to-fit
export const LWCS = {
  '506': { label: '0.5 mL Eppendorf', tube: 'eppi', rw: 23.9, rh: 12.7, cd: 9.5, ov: 0.8, qr: 6.8, ecc: 'L', fName: 2.5, fCas: 1.7, fCode: 2.3 },
  '507': { label: '1.5 mL Eppendorf', tube: 'eppi', rw: 28.6, rh: 15.9, cd: 11.1, ov: 0.9, qr: 7.9, ecc: 'L', fName: 3.0, fCas: 1.9, fCode: 2.6 },
  '503': { label: 'Falcon 15 & 50 mL', tube: 'falcon', rw: 38.1, rh: 19.1, cd: 0, ov: 0, qr: 14, ecc: 'M', fName: 3.6, fCas: 2.2, fCode: 3.0 },
}

// HERMA 4363 — A4 sheet, 105 × 48 mm cells. Eppis tile inside a cell (cut apart);
// Falcons wrap the tube (15 mL repeats its block twice across the width).
export const HERMA = {
  cell: { w: 105, h: 48 },
  e05: { kind: 'eppi', label: '0.5 mL Eppendorf', tileW: 33, tileH: 15, cols: 3, rows: 3, gutter: 1.5, qr: 11.5, ecc: 'L', fName: 2.1, fCas: 1.6, fCode: 2.2 },
  e15: { kind: 'eppi', label: '1.5 mL Eppendorf', tileW: 33, tileH: 22, cols: 3, rows: 2, gutter: 1.5, qr: 13.5, ecc: 'L', fName: 2.6, fCas: 1.9, fCode: 2.6 },
  f15: { kind: 'wrap', label: '15 mL Falcon', repeat: 2, qr: 20, ecc: 'M', fName: 4, fCas: 2.6, fCode: 3.6 },
  f50: { kind: 'wrap', label: '50 mL Falcon', repeat: 1, qr: 34, ecc: 'M', fName: 7, fCas: 3.4, fCode: 5 },
}

// The value encoded in the QR. 'full' = the inventory deep link (a phone camera
// opens the item), 'short' = a redirect host, 'code' = the bare compound code.
export function labelPayload(code, mode = 'full', shortHost = 'boek.li') {
  const c = String(code || '')
  if (mode === 'short') return `${shortHost}/${c}`
  if (mode === 'code') return c
  return INVENTORY_BASE + c
}

const _cache = {}
// A crisp-edges SVG data URI of the QR, plus its module count (for scan-size math).
export function qrSvg(url, ecc = 'M') {
  const ck = ecc + '|' + url
  if (_cache[ck]) return _cache[ck]
  const q = qrcode(0, ecc)
  q.addData(url); q.make()
  const n = q.getModuleCount()
  let cells = ''
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c)) cells += `<rect x='${c}' y='${r}' width='1.02' height='1.02'/>`
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 ${n} ${n}' shape-rendering='crispEdges'><rect width='${n}' height='${n}' fill='#fff'/><g fill='#000'>${cells}</g></svg>`
  const res = { uri: 'data:image/svg+xml,' + encodeURIComponent(svg), n }
  _cache[ck] = res
  return res
}

// Printed module size (mm) for a given QR square — the scannability metric.
export function moduleMM(qrMM, url, ecc) {
  const { n } = qrSvg(url, ecc)
  return n ? qrMM / n : null
}
export function scanVerdict(mm) {
  if (mm == null) return { t: '—', c: '#888' }
  if (mm >= 0.33) return { t: 'Scannable', c: '#1c7d54' }
  if (mm >= 0.25) return { t: 'Borderline', c: '#9a6b00' }
  return { t: 'Below spec', c: '#a2361f' }
}

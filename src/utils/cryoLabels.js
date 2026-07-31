// Cryogenic label system — exact geometry from the design handoff
// (design_handoff_cryo_labels). All dimensions in millimetres; black-on-white.
// Two media: DYMO CryoSTUCK LWCS (die-cut, direct thermal) and HERMA 4363 (A4).
import qrcode from './qrcode.mjs'

export const INVENTORY_BASE = 'https://christianibetsberger-bot.github.io/BoekhovenLab-Assistant/?qr='

// DYMO CryoSTUCK LWCS — landscape strip: name/CAS/code left, QR at the right end
// (inscribed in the SnapPEEL cap circle for eppis). Geometry from the real .dymo
// print areas. W/H = print strip (mm) · wrapW/circ = eppi wrap panel + cap Ø ·
// qr = QR square · rect = DYMORect in inches (for the generated .dymo).
// useShort = print record.short (fall back to name); rule = draw the hairline;
// fMin = smallest legible font (mm). 507 origin corrected (the uploaded template's
// X=0.145 pushed content past the die edge → 0.0122, DYMO's own 506 left margin).
export const LWCS = {
  // qrSize = the DYMO QR "Layout" tier so the code fits the cap: Sehr klein / Klein
  // / Mittel → VerySmall / Small / Medium.
  '506': { label: '0.5 mL Eppendorf', tube: 'eppi', cap: true, W: 33.4, H: 12.7, wrapW: 23.9, circ: 9.5, qr: 6.5, ecc: 'L', qrSize: 'Small', fName: 2.6, fCas: 1.6, fCode: 2.6, fMin: 1.7, useShort: true, rule: false, labelName: 'LWCS506', rect: { x: 0.012187534, y: 0.0075000003, w: 1.2833055, h: 0.43402776 } },
  '507': { label: '1.5 mL Eppendorf', tube: 'eppi', cap: true, W: 39.7, H: 15.9, wrapW: 28.6, circ: 11.1, qr: 7.6, ecc: 'L', qrSize: 'SmallMedium', fName: 2.7, fCas: 1.8, fCode: 2.7, fMin: 1.6, rule: true, labelName: 'LWCS507', rect: { x: 0.14513889, y: 0.045138888, w: 1.5, h: 0.5509028 } },
  '503': { label: 'Falcon 15 & 50 mL', tube: 'falcon', cap: false, W: 38.1, H: 19.1, qr: 14, ecc: 'M', qrSize: 'Medium', fName: 3.2, fCas: 2.1, fCode: 3.0, fMin: 1.8, rule: true, labelName: 'LWCS503', rect: { x: 0.060000032, y: 0.045, w: 1.38, h: 0.675 } },
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

// A filled DYMO Connect DesktopLabel (v4) XML for one record — one QR + NAME/CAS/
// CODE TextObjects with ShrinkToFit, positioned in the label's DYMORect (inches).
// Ported verbatim from the design handoff so DYMO Connect opens/prints it as-is.
function escXml(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;') }
// Estimate a font size (pt) that fits `text` in a wIn × hIn inch box. DYMO Connect
// often ignores ShrinkToFit on import, so we bake a fitted size in (Arial glyph
// avg ≈ 0.52 em; bold ≈ 0.56). Never below 4 pt, never above the target size.
function fitPt(text, wIn, hIn, maxPt, glyph = 0.6, minPt = 4) {
  const L = Math.max(1, String(text ?? '').length)
  // 0.86 = ~14% width safety margin: DYMO Connect renders Arial a touch wider than
  // our estimate, and an exact fit truncated the last letters on import.
  const byWidth = (wIn * 72 * 0.86) / (L * glyph)
  const byHeight = hIn * 72 * 0.88
  return Math.round(Math.max(minPt, Math.min(maxPt, byWidth, byHeight)) * 10) / 10
}
// The chemical name printed on a label: LWCS506 prints the short name (full IUPAC
// won't hold at 300 DPI on the tiny cap); others print the full name.
export function labelTitle(sp, rec) { return sp.useShort ? (rec.short || rec.name || '') : (rec.name || '') }
export function dymoXml(key, rec, mode = 'full', shortHost = 'boek.li') {
  const sp = LWCS[key], r = sp.rect, esc = escXml, f = (n) => (+n).toFixed(4)
  const pad = 0.03
  const qr = sp.qr / 25.4
  const circ = sp.cap ? (sp.circ / 25.4) : 0
  // QR / SnapPEEL cap sits at the LEFT end (matching the die-cut in DYMO Connect);
  // the name/CAS/code text block runs to its right.
  const qrX = sp.cap ? (r.x + (circ - qr) / 2) : (r.x + pad)
  const qrY = r.y + (r.h - qr) / 2
  const tx = sp.cap ? (r.x + circ + pad) : (r.x + qr + 2 * pad)
  // Cap the text right edge at the die edge — the 507 print band runs ~2 mm past it.
  const dieR = sp.W / 25.4
  const tw = Math.max(0.3, Math.min(r.x + r.w, dieR) - pad - tx)
  const nH = r.h * 0.46, cH = r.h * 0.20, kH = r.h * 0.26
  const nY = r.y + pad, cY = nY + nH, kY = cY + cH
  const url = labelPayload(rec.code, mode, shortHost)
  const title = labelTitle(sp, rec)
  // Fit each line to its box so long names/codes don't overflow on import; the
  // per-label fMin (mm → pt) keeps the name legible on the tiny caps.
  const minPt = (sp.fMin || 1.4) * 2.835   // mm → pt
  const nSz = fitPt(title, tw, nH, (sp.fName || 3) * 2.835, 0.56, minPt)
  const cSz = fitPt('CAS ' + rec.cas, tw, cH, (sp.fCas || 1.8) * 2.835, 0.52)
  const kSz = fitPt(rec.code, tw, kH, (sp.fCode || 3) * 2.835, 0.6)
  const brT = `<Brushes><BackgroundBrush><SolidColorBrush><Color A="0" R="1" G="1" B="1"></Color></SolidColorBrush></BackgroundBrush><BorderBrush><SolidColorBrush><Color A="1" R="0" G="0" B="0"></Color></SolidColorBrush></BorderBrush><StrokeBrush><SolidColorBrush><Color A="1" R="0" G="0" B="0"></Color></SolidColorBrush></StrokeBrush><FillBrush><SolidColorBrush><Color A="0" R="0" G="0" B="0"></Color></SolidColorBrush></FillBrush></Brushes>`
  const brQ = `<Brushes><BackgroundBrush><SolidColorBrush><Color A="1" R="1" G="1" B="1"></Color></SolidColorBrush></BackgroundBrush><BorderBrush><SolidColorBrush><Color A="1" R="0" G="0" B="0"></Color></SolidColorBrush></BorderBrush><StrokeBrush><SolidColorBrush><Color A="1" R="0" G="0" B="0"></Color></SolidColorBrush></StrokeBrush><FillBrush><SolidColorBrush><Color A="1" R="0" G="0" B="0"></Color></SolidColorBrush></FillBrush></Brushes>`
  const T = (name, text, x, y, w, hh, font, size, bold, va) => `<TextObject><Name>${name}</Name>${brT}<Rotation>Rotation0</Rotation><OutlineThickness>1</OutlineThickness><IsOutlined>False</IsOutlined><BorderStyle>SolidLine</BorderStyle><Margin><DYMOThickness Left="0" Top="0" Right="0" Bottom="0" /></Margin><HorizontalAlignment>Left</HorizontalAlignment><VerticalAlignment>${va}</VerticalAlignment><FitMode>AlwaysFit</FitMode><IsVertical>False</IsVertical><FormattedText><FitMode>AlwaysFit</FitMode><HorizontalAlignment>Left</HorizontalAlignment><VerticalAlignment>${va}</VerticalAlignment><IsVertical>False</IsVertical><LineTextSpan><TextSpan><Text>${esc(text)}</Text><FontInfo><FontName>${font}</FontName><FontSize>${size}</FontSize><IsBold>${bold}</IsBold><IsItalic>False</IsItalic><IsUnderline>False</IsUnderline><FontBrush><SolidColorBrush><Color A="1" R="0" G="0" B="0"></Color></SolidColorBrush></FontBrush></FontInfo></TextSpan></LineTextSpan></FormattedText><ObjectLayout><DYMOPoint><X>${f(x)}</X><Y>${f(y)}</Y></DYMOPoint><Size><Width>${f(w)}</Width><Height>${f(hh)}</Height></Size></ObjectLayout></TextObject>`
  const Q = `<QRCodeObject><Name>QR</Name>${brQ}<Rotation>Rotation0</Rotation><OutlineThickness>1</OutlineThickness><IsOutlined>False</IsOutlined><BorderStyle>SolidLine</BorderStyle><Margin><DYMOThickness Left="0" Top="0" Right="0" Bottom="0" /></Margin><BarcodeFormat>QRCode</BarcodeFormat><Data><DataString>${esc(url)}</DataString></Data><HorizontalAlignment>Center</HorizontalAlignment><VerticalAlignment>Middle</VerticalAlignment><Size>${sp.qrSize || 'Medium'}</Size><EQRCodeType>QRCodeText</EQRCodeType><TextDataHolder><Value>${esc(url)}</Value></TextDataHolder><ObjectLayout><DYMOPoint><X>${f(qrX)}</X><Y>${f(qrY)}</Y></DYMOPoint><Size><Width>${f(qr)}</Width><Height>${f(qr)}</Height></Size></ObjectLayout></QRCodeObject>`
  return `<?xml version="1.0" encoding="utf-8"?>
<DesktopLabel Version="1">
  <DYMOLabel Version="4">
    <Description>Boekhoven Lab - ${sp.labelName}</Description>
    <Orientation>Portrait</Orientation>
    <LabelName>${sp.labelName}</LabelName>
    <InitialLength>0</InitialLength>
    <BorderStyle>SolidLine</BorderStyle>
    <DYMORect><DYMOPoint><X>${r.x}</X><Y>${r.y}</Y></DYMOPoint><Size><Width>${r.w}</Width><Height>${r.h}</Height></Size></DYMORect>
    <BorderColor><SolidColorBrush><Color A="1" R="0" G="0" B="0"></Color></SolidColorBrush></BorderColor>
    <BorderThickness>1</BorderThickness>
    <Show_Border>False</Show_Border>
    <HasFixedLength>False</HasFixedLength>
    <FixedLengthValue>0</FixedLengthValue>
    <DynamicLayoutManager><RotationBehavior>ClearObjects</RotationBehavior><LabelObjects>${Q}${T('NAME', rec.name, tx, nY, tw, nH, 'Arial', nSz, 'True', 'Top')}${T('CAS', 'CAS ' + rec.cas, tx, cY, tw, cH, 'Consolas', cSz, 'False', 'Middle')}${T('CODE', rec.code, tx, kY, tw, kH, 'Consolas', kSz, 'True', 'Middle')}</LabelObjects></DynamicLayoutManager>
  </DYMOLabel>
  <LabelApplication>Blank</LabelApplication>
  <DataTable><Columns></Columns><Rows></Rows></DataTable>
</DesktopLabel>`
}

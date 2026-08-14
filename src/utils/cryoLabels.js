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
  // qrSize = the DYMO QR "Layout". 'AutoFit' is DYMO's "Automatisch" — it scales the
  // code to fill its ObjectLayout box, so it can't clip, imports as Automatisch, and
  // matches the box the preview draws. (Verified from native saved files: 503 →
  // AutoFit. Valid fixed tiers if ever needed: Small / SmallMedium / Medium / Large.)
  // cond = how much of the solution's identity fits: 'full' = concentration ·
  // buffer · pH, 'conc' = the concentration alone (all the 0.5 mL cap can hold
  // and still stay legible — it already prints the short name for the same
  // reason), 'none' = omit. fCond = that line's font (mm).
  '506': { label: '0.5 mL Eppendorf', tube: 'eppi', cap: true, W: 33.4, H: 12.7, wrapW: 23.9, circ: 9.5, qr: 6.5, ecc: 'L', qrSize: 'AutoFit', fName: 2.6, fCas: 1.6, fCode: 2.6, fMin: 1.7, fCond: 1.5, cond: 'conc', useShort: true, rule: false, labelName: 'LWCS506', rect: { x: 0.012187534, y: 0.0075000003, w: 1.2833055, h: 0.43402776 } },
  // dxText / dyQr: physical print-alignment nudges (mm) applied ONLY to the
  // generated .dymo — checked against real prints on the 550, where the 507 text
  // block sat too close to the cap circle and the QR a hair low in the cap.
  // The preview keeps the ideal geometry; these compensate the printer, not the design.
  '507': { label: '1.5 mL Eppendorf', tube: 'eppi', cap: true, W: 39.7, H: 15.9, wrapW: 28.6, circ: 11.1, qr: 7.6, ecc: 'L', qrSize: 'AutoFit', fName: 2.7, fCas: 1.8, fCode: 2.7, fMin: 1.6, fCond: 1.6, cond: 'full', rule: true, labelName: 'LWCS507', dxText: 1.0, dyQr: -0.4, rect: { x: 0.14513889, y: 0.045138888, w: 1.5, h: 0.5509028 } },
  '503': { label: 'Falcon 15 & 50 mL', tube: 'falcon', cap: false, W: 38.1, H: 19.1, qr: 14, ecc: 'M', qrSize: 'AutoFit', fName: 3.2, fCas: 2.1, fCode: 3.0, fMin: 1.8, fCond: 1.9, cond: 'full', rule: true, labelName: 'LWCS503', rect: { x: 0.060000032, y: 0.045, w: 1.38, h: 0.675 } },
}

// HERMA 4363 — A4 sheet, 105 × 48 mm cells. Eppis tile inside a cell (cut apart);
// Falcons wrap the tube (15 mL repeats its block twice across the width).
export const HERMA = {
  cell: { w: 105, h: 48 },
  // tileH chosen so rows*tileH + (rows-1)*gutter + 2*cellPad (1mm) <= cell.h (48) with margin,
  // else the bottom row overflows and prints clipped. e05: 3*14+2*1.5+2 = 47; e15: 2*21.5+1.5+2 = 46.5.
  e05: { kind: 'eppi', label: '0.5 mL Eppendorf', tileW: 33, tileH: 14, cols: 3, rows: 3, gutter: 1.5, qr: 11.5, ecc: 'L', fName: 2.1, fCas: 1.6, fCode: 2.2, fCond: 1.5, cond: 'full' },
  e15: { kind: 'eppi', label: '1.5 mL Eppendorf', tileW: 33, tileH: 21.5, cols: 3, rows: 2, gutter: 1.5, qr: 13.5, ecc: 'L', fName: 2.6, fCas: 1.9, fCode: 2.6, fCond: 1.7, cond: 'full' },
  f15: { kind: 'wrap', label: '15 mL Falcon', repeat: 2, qr: 20, ecc: 'M', fName: 4, fCas: 2.6, fCode: 3.6, fCond: 2.4, cond: 'full' },
  f50: { kind: 'wrap', label: '50 mL Falcon', repeat: 1, qr: 34, ecc: 'M', fName: 7, fCas: 3.4, fCode: 5, fCond: 3.2, cond: 'full' },
}

// The value encoded in the QR. 'full' = the inventory deep link (a phone camera
// opens the item), 'short' = a redirect host, 'code' = the bare compound code.
// 'auto' → the smart default. With a short redirect configured (shortHost), EVERY label
// is a small, working QR that opens the compound via shortHost/CODE — including the
// 0.5 mL cap (confirmed scannable in practice). With no host it falls back to the full
// inventory URL where the box is big enough (≥7 mm), and the bare code on the 0.5 mL cap.
export function resolveQrMode(mode, sp, shortHost) {
  if (mode !== 'auto') return mode
  if (shortHost && shortHost.trim()) return 'short'
  return (sp && sp.qr < 7) ? 'code' : 'full'
}
export function labelPayload(code, mode = 'full', shortHost = 'boek.li') {
  const c = String(code || '')
  if (mode === 'short') return `${shortHost}/${c}`
  if (mode === 'code') return c
  return INVENTORY_BASE + c
}

const _cache = {}
// A crisp-edges SVG data URI of the QR, plus its module count (for scan-size math).
export function qrSvg(url, ecc = 'M', qz = 2) {
  const ck = ecc + '|' + qz + '|' + url
  if (_cache[ck]) return _cache[ck]
  const q = qrcode(0, ecc)
  q.addData(url); q.make()
  const n = q.getModuleCount()
  // Pad with a quiet zone (qz modules of white on every side) so the code renders
  // as a complete QR — not one whose modules run to the edge and read as "cut off"
  // inside the round cap — and stays scannable. (DYMO adds its own quiet zone on the
  // printed .dymo; this makes the preview / HERMA-printed SVG match that.)
  const span = n + 2 * qz
  let cells = ''
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c)) cells += `<rect x='${c + qz}' y='${r + qz}' width='1.02' height='1.02'/>`
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 ${span} ${span}' shape-rendering='crispEdges'><rect width='${span}' height='${span}' fill='#fff'/><g fill='#000'>${cells}</g></svg>`
  const res = { uri: 'data:image/svg+xml,' + encodeURIComponent(svg), n, span }
  _cache[ck] = res
  return res
}

// Printed module size (mm) for a given QR square — the scannability metric.
// span includes the quiet zone, matching how the code actually prints.
export function moduleMM(qrMM, url, ecc) {
  const { span } = qrSvg(url, ecc)
  return span ? qrMM / span : null
}
export function scanVerdict(mm) {
  if (mm == null) return { t: '—', c: '#888' }
  if (mm >= 0.22) return { t: 'Scannable', c: '#1c7d54' }   // field-confirmed: the short-URL v2 QR scans on the 0.5 mL cap (~0.22 mm)
  if (mm >= 0.17) return { t: 'Borderline', c: '#9a6b00' }
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
// Greedy word-wrap to <= maxChars per line; hard-breaks any single word longer than a line.
function wrapWords(text, maxChars) {
  const words = String(text ?? '').trim().split(/\s+/).filter(Boolean)
  const lines = []
  let cur = ''
  const push = () => { if (cur) { lines.push(cur); cur = '' } }
  for (let w of words) {
    while (w.length > maxChars) { push(); lines.push(w.slice(0, maxChars)); w = w.slice(maxChars) }
    const trial = cur ? cur + ' ' + w : w
    if (!cur || trial.length <= maxChars) cur = trial
    else { push(); cur = w }
  }
  push()
  return lines.length ? lines : ['']
}
// Largest font size (pt) at which `text` wraps into <= maxLines lines inside wIn×hIn.
// DYMO's AlwaysFit shrinks a long name to ONE line on a wide box instead of wrapping,
// so we pre-compute the line breaks and emit them explicitly (mirrors the preview).
function fitWrap(text, wIn, hIn, maxPt, glyph = 0.56, minPt = 4, maxLines = 3, lineH = 1.16) {
  for (let pt = maxPt; pt >= minPt; pt -= 0.5) {
    const maxChars = Math.max(1, Math.floor((wIn * 72 * 0.9) / (pt * glyph)))
    const lines = wrapWords(text, maxChars)
    if (lines.length <= maxLines && lines.length * pt * lineH <= hIn * 72 * 0.94) return { pt: Math.round(pt * 10) / 10, lines }
  }
  const maxChars = Math.max(1, Math.floor((wIn * 72 * 0.9) / (minPt * glyph)))
  return { pt: minPt, lines: wrapWords(text, maxChars).slice(0, maxLines) }
}
// The chemical name printed on a label: LWCS506 prints the short name (full IUPAC
// won't hold at 300 DPI on the tiny cap); others print the full name.
export function labelTitle(sp, rec) { return sp.useShort ? (rec.short || rec.name || '') : (rec.name || '') }
// The label's middle line: DNA/RNA compounds (rec.oligo) show their sequence in place of
// the CAS number; everything else shows the CAS.
export function labelMeta(rec) {
  const seq = String((rec && rec.seq) || '').trim()
  if (rec && rec.oligo && seq) return { seq: true, tag: '', value: seq }
  return { seq: false, tag: 'CAS ', value: (rec && rec.cas) || '' }
}
// What the tube actually contains: concentration, the buffer it is dissolved in,
// and the pH — printed only where the inventory record carries them. Same rules as
// the inventory PDF labels so the two never disagree: the buffer is the free-text
// field as entered (it normally carries the buffer's own concentration, e.g.
// "50 mM Tris, pH 7.5"), and a measured pH outranks the nominal one.
// Water is left unsaid — it is the default assumption and the millimetres are scarce.
export function labelCond(rec, sp) {
  const mode = (sp && sp.cond) || 'none'
  if (!rec || mode === 'none') return ''
  // The concentration is read straight from the inventory and nothing is inferred:
  // no stock recorded (blank, zero or non-numeric) prints no concentration at all,
  // and a stock with no unit prints the bare number rather than an assumed "µM".
  // A label asserting a concentration the inventory never recorded is worse than a
  // label that stays quiet about it — someone pipettes from what it says.
  const stockRaw = rec.stock == null ? '' : String(rec.stock).trim()
  const stockNum = Number(stockRaw)
  const unit = String(rec.stockUnit || '').trim()
  const conc = (stockRaw !== '' && isFinite(stockNum) && stockNum > 0)
    ? (unit ? `${stockRaw} ${unit}` : stockRaw) : ''
  if (mode === 'conc') return conc
  const buffer = String(rec.buffer || '').trim()
  const solvent = buffer || (rec.diluent === 'buffer' ? 'buffer' : '')
  const ph = (rec.measuredPH != null && String(rec.measuredPH).trim() !== '')
    ? Number(rec.measuredPH).toFixed(2)
    : (rec.pH != null && String(rec.pH).trim() !== '') ? String(rec.pH).trim() : ''
  // The buffer text usually ends in its own "pH 7.5" — don't print it twice.
  const phPart = (ph && !/ph\s*\d/i.test(solvent)) ? `pH ${ph}` : ''
  return [conc, solvent, phPart].filter(Boolean).join(' · ')
}
export function dymoXml(key, rec, mode = 'full', shortHost = 'boek.li') {
  const sp = LWCS[key], r = sp.rect, esc = escXml, f = (n) => (+n).toFixed(4)
  const pad = 0.03
  const qr = sp.qr / 25.4
  const circ = sp.cap ? (sp.circ / 25.4) : 0
  // QR / SnapPEEL cap sits at the LEFT end (matching the die-cut in DYMO Connect);
  // the name/CAS/code text block runs to its right.
  const qrX = sp.cap ? (r.x + (circ - qr) / 2) : (r.x + pad)
  // dyQr / dxText: per-size print-alignment nudges (mm, negative dyQr = up) — see LWCS.
  const qrY = r.y + (r.h - qr) / 2 + (sp.dyQr || 0) / 25.4
  const tx = (sp.cap ? (r.x + circ + pad) : (r.x + qr + 2 * pad)) + (sp.dxText || 0) / 25.4
  // Cap the text right edge at the die edge — the 507 print band runs ~2 mm past it.
  const dieR = sp.W / 25.4
  const tw = Math.max(0.3, Math.min(r.x + r.w, dieR) - pad - tx)
  const meta = labelMeta(rec)
  const cond = labelCond(rec, sp)
  // Height shares of the label, summing to ~0.92 so the top pad still fits. The
  // conditions line only claims height when the record actually has conditions —
  // a compound with no concentration or buffer keeps the old proportions exactly.
  // Height shares, summing to ~0.92 so the top pad still fits. The conditions box is
  // sized for TWO lines, because "10 mM · 50 mM Tris, pH 7.5" does not fit one on a
  // 38 mm die; the CAS gives up the room, being a single short line that never needed
  // a fifth of the label.
  //
  // The name outranks the conditions: a long name in a shrunken box would be scaled
  // below its legibility floor by DYMO's AlwaysFit, which is a worse label than one
  // without the conditions. So the layouts are tried widest-name-last and the first
  // one where the name fits its box unshrunk wins.
  const noCond  = meta.seq ? { n: 0.34, c: 0.42, d: 0,    k: 0.18 } : { n: 0.46, c: 0.20, d: 0,    k: 0.26 }
  const layouts = cond
    ? [ meta.seq ? { n: 0.24, c: 0.32, d: 0.20, k: 0.16 } : { n: 0.34, c: 0.14, d: 0.22, k: 0.22 },
        meta.seq ? { n: 0.30, c: 0.34, d: 0.12, k: 0.16 } : { n: 0.42, c: 0.14, d: 0.12, k: 0.24 },
        noCond ]
    : [ noCond ]
  const minPt = (sp.fMin || 1.4) * 2.835   // mm → pt
  const condMin = Math.min(minPt, 1.25 * 2.835)
  const title = labelTitle(sp, rec)
  const fitName = (hShare) => fitWrap(title, tw, r.h * hShare, (sp.fName || 3) * 2.835, 0.56, minPt, meta.seq ? 2 : 3)
  const fitsBox = (fit, hIn) => fit.lines.length * fit.pt * 1.16 <= hIn * 72 * 0.94 + 1e-9
  // The size a box will actually PRINT at: DYMO's AlwaysFit scales overset text down,
  // so a long name is already shrunk before the conditions take any room. Comparing
  // printed sizes — not requested ones — is what keeps a 37-character IUPAC name from
  // vetoing a "10 mM" that costs it nothing.
  const effPt = (fit, hIn) => fit.pt * Math.min(1, (hIn * 72 * 0.94) / (fit.lines.length * fit.pt * 1.16))
  // fitWrap truncates to maxLines as a last resort; a label saying "10 mM · 50 mM"
  // with the "pH 7.5" cut off is worse than one saying nothing, so those are rejected.
  const isWhole = (fit, text) =>
    fit.lines.join(' ').replace(/\s+/g, ' ').trim() === String(text).replace(/\s+/g, ' ').trim()

  const refFit = fitName(noCond.n)
  const refEff = effPt(refFit, r.h * noCond.n)
  let share = noCond, nameFit = refFit, condFit = null
  for (const cand of layouts) {
    if (!cand.d) break
    const dFit = fitWrap(cond, tw, r.h * cand.d, (sp.fCond || 1.6) * 2.835, 0.5, condMin, cand.d >= 0.16 ? 2 : 1)
    if (!isWhole(dFit, cond) || !fitsBox(dFit, r.h * cand.d)) continue
    const nFit = fitName(cand.n)
    if (effPt(nFit, r.h * cand.n) < 0.8 * refEff) continue   // the name keeps ≥80% of its printed size
    share = cand; nameFit = nFit; condFit = dFit
    break
  }
  const nH = r.h * share.n, cH = r.h * share.c, dH = r.h * share.d, kH = r.h * share.k
  const nY = r.y + pad, cY = nY + nH, dY = cY + cH, kY = dY + dH
  const showCond = !!(cond && share.d)
  const url = labelPayload(rec.code, resolveQrMode(mode, sp, shortHost), shortHost)
  // Fit each line to its box so long names/codes don't overflow on import; the
  // per-label fMin (mm → pt) keeps the name legible on the tiny caps.
  const nSz = nameFit.pt, nameLines = nameFit.lines
  let casPayload, cSz
  if (meta.seq) {   // wrap the sequence across the taller box instead of shrinking to one line
    const fw = fitWrap(meta.value, tw, cH, (sp.fCas || 1.8) * 2.835, 0.5, minPt, 4)
    cSz = fw.pt; casPayload = fw.lines
  } else {
    // Uses labelMeta's normalised value, so a compound with no CAS prints nothing
    // at all — the raw `'CAS ' + rec.cas` put a bare "CAS" tag with no number on
    // every die, asserting a field the inventory never had.
    const casText = meta.value ? meta.tag + meta.value : ''
    cSz = fitPt(casText || ' ', tw, cH, (sp.fCas || 1.8) * 2.835, 0.52)
    casPayload = casText
  }
  const showMeta = Array.isArray(casPayload) ? casPayload.length > 0 : !!casPayload
  const kSz = fitPt(rec.code, tw, kH, (sp.fCode || 3) * 2.835, 0.6)
  const brT = `<Brushes><BackgroundBrush><SolidColorBrush><Color A="0" R="1" G="1" B="1"></Color></SolidColorBrush></BackgroundBrush><BorderBrush><SolidColorBrush><Color A="1" R="0" G="0" B="0"></Color></SolidColorBrush></BorderBrush><StrokeBrush><SolidColorBrush><Color A="1" R="0" G="0" B="0"></Color></SolidColorBrush></StrokeBrush><FillBrush><SolidColorBrush><Color A="0" R="0" G="0" B="0"></Color></SolidColorBrush></FillBrush></Brushes>`
  const brQ = `<Brushes><BackgroundBrush><SolidColorBrush><Color A="1" R="1" G="1" B="1"></Color></SolidColorBrush></BackgroundBrush><BorderBrush><SolidColorBrush><Color A="1" R="0" G="0" B="0"></Color></SolidColorBrush></BorderBrush><StrokeBrush><SolidColorBrush><Color A="1" R="0" G="0" B="0"></Color></SolidColorBrush></StrokeBrush><FillBrush><SolidColorBrush><Color A="1" R="0" G="0" B="0"></Color></SolidColorBrush></FillBrush></Brushes>`
  const fInfo = (font, size, bold) => `<FontInfo><FontName>${font}</FontName><FontSize>${size}</FontSize><IsBold>${bold}</IsBold><IsItalic>False</IsItalic><IsUnderline>False</IsUnderline><FontBrush><SolidColorBrush><Color A="1" R="0" G="0" B="0"></Color></SolidColorBrush></FontBrush></FontInfo>`
  // text may be a string (one line) or an array of pre-wrapped lines (multiple LineTextSpans).
  const T = (name, text, x, y, w, hh, font, size, bold, va) => {
    const spans = (Array.isArray(text) ? text : [text]).map(t => `<LineTextSpan><TextSpan><Text>${esc(t)}</Text>${fInfo(font, size, bold)}</TextSpan></LineTextSpan>`).join('')
    return `<TextObject><Name>${name}</Name>${brT}<Rotation>Rotation0</Rotation><OutlineThickness>1</OutlineThickness><IsOutlined>False</IsOutlined><BorderStyle>SolidLine</BorderStyle><Margin><DYMOThickness Left="0" Top="0" Right="0" Bottom="0" /></Margin><HorizontalAlignment>Left</HorizontalAlignment><VerticalAlignment>${va}</VerticalAlignment><FitMode>AlwaysFit</FitMode><IsVertical>False</IsVertical><FormattedText><FitMode>AlwaysFit</FitMode><HorizontalAlignment>Left</HorizontalAlignment><VerticalAlignment>${va}</VerticalAlignment><IsVertical>False</IsVertical>${spans}</FormattedText><ObjectLayout><DYMOPoint><X>${f(x)}</X><Y>${f(y)}</Y></DYMOPoint><Size><Width>${f(w)}</Width><Height>${f(hh)}</Height></Size></ObjectLayout></TextObject>`
  }
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
    <DynamicLayoutManager><RotationBehavior>ClearObjects</RotationBehavior><LabelObjects>${Q}${T('NAME', nameLines, tx, nY, tw, nH, 'Arial Narrow', nSz, 'True', 'Top')}${showMeta ? T('CAS', casPayload, tx, cY, tw, cH, 'Consolas', cSz, 'False', meta.seq ? 'Top' : 'Middle') : ''}${showCond ? T('COND', condFit.lines, tx, dY, tw, dH, 'Arial Narrow', condFit.pt, 'False', 'Middle') : ''}${T('CODE', rec.code, tx, kY, tw, kH, 'Consolas', kSz, 'True', 'Middle')}</LabelObjects></DynamicLayoutManager>
  </DYMOLabel>
  <LabelApplication>Blank</LabelApplication>
  <DataTable><Columns></Columns><Rows></Rows></DataTable>
</DesktopLabel>`
}

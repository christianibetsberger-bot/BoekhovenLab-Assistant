// What is actually in a well.
//
// A well's content is authored as HTML — inventory chips plus pipetted volumes —
// because that is what the editor renders and what the .onp exporters parse back
// out. This module is the structured view of that same content: read it, compute
// the concentrations the well really holds, and write it back.
//
// The distinction that matters: a chip states the STOCK concentration, and the
// text after it states the VOLUME pipetted. The concentration in the tube is
// neither of those — it is stock · volume / total, and the total is whatever was
// actually pipetted, not the volume the plate was designed for. A well that was
// overfilled therefore holds weaker concentrations than intended, and the only
// honest way to show that is to divide by the real total.
import { esc } from './htmlSafe'
import { invChip, textChip } from './invChip'

// Chip text is `[CODE] Name (value unit)`; the volume follows the chip as plain text.
// Written by invChip/textChip, parsed here and by the .onp exporters — keep in step.
const CHIP_RE = /<span class="inv-ref"[^>]*>([\s\S]*?)<\/span>\s*(?:&nbsp;)?\s*([\d.,]+)\s*(µL|uL|mL|L)?/gi
const WATER_RE = /<strong>\s*(?:MQ\s*H₂O|MQ\s*Water)\s*:?\s*<\/strong>\s*(?:&nbsp;)?\s*([\d.,]+)\s*(µL|uL|mL|L)?/i

// The fill-up is not always water. A plate made up with buffer is written
// `<strong>MOPS pH 7:</strong> 6.33 µL` — the same line, with the medium's own
// name — and Matrix/Screening wrap the number in a <span>. WATER_RE matches
// neither, so that volume was simply absent from the well total.
//
// What separates a fill-up from an unchipped reagent is one character: every
// unchipped COMPONENT or CONSTANT line states its target concentration in
// parentheses (`<strong>EDC:</strong> 4.00 µL (10 mM)`) and a fill-up never does.
// So the trailing `(` is the discriminator, and it has to stay true — the producer
// fixtures in wellComposition.test.js are there to catch it drifting.
//
// Deliberately stricter than WATER_RE in two ways: a bare `<strong>` with no
// attributes (every header carries a style, so no header can match) and a
// MANDATORY volume unit, so a hand-typed `<strong>pH:</strong> 7.4` is a note and
// not 7.4 µL of buffer.
const FILLUP_RE = /<strong>\s*([^<:]{1,40}?)\s*:\s*<\/strong>(?:\s|&nbsp;)*(?:<span[^>]*>\s*)?([\d.,]+)\s*(µL|uL|mL|L)(?![^<]*\()/gi

// The mirror image: a labelled volume that DOES carry a concentration. That is a
// reagent nobody linked to a bottle — `<strong>Unknown Component:</strong> 12.34 µL
// (5 mM)`, or LidaKinetics' `<strong>T4-Ligase:</strong> <strong>Manual:</strong>
// 3.00 µL (5 U)`. Matched only so it can be REPORTED; see unlinkedVolumes.
const UNLINKED_RE = /<strong>\s*([^<:]{1,60}?)\s*:\s*<\/strong>(?:\s|&nbsp;)*(?:<strong>\s*[^<]*<\/strong>(?:\s|&nbsp;)*)?([\d.,]+)\s*(µL|uL|mL|L)\s*\(/gi

const num = (s) => {
  const v = parseFloat(String(s ?? '').replace(',', '.'))
  return isFinite(v) ? v : 0
}
// Volumes are stored in µL everywhere in the app; mL/L only appear in pasted text.
const toUL = (value, unit) => {
  const v = num(value)
  if (!unit) return v
  const u = String(unit).toLowerCase()
  if (u === 'ml') return v * 1000
  if (u === 'l') return v * 1e6
  return v
}
const stripTags = (html) => String(html || '').replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ')
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ').trim()

/**
 * Structured entries for one well's HTML.
 * Each reagent entry: { kind:'reagent', invId, code, name, stock, unit, volume }
 * The water entry:    { kind:'water', volume }
 * Unparseable content is left alone — see `extra`, which is preserved on rebuild.
 */
export function parseWellHtml(html) {
  const src = String(html || '')
  const entries = []

  CHIP_RE.lastIndex = 0
  let m
  while ((m = CHIP_RE.exec(src)) !== null) {
    const chipHtml = m[0]
    const label = stripTags(m[1])
    const idMatch = chipHtml.match(/data-inv-id="([^"]*)"/)
    const labwareMatch = chipHtml.match(/data-labware="([^"]*)"/)
    const codeMatch = label.match(/\[(.*?)\]/)
    // Name is what sits between the code and the concentration — the same slice the
    // .onp exporter takes, so both agree on what the compound is called.
    const nameMatch = label.match(/\]\s*(.*?)\s*\(/)
    const concMatch = label.match(/\(([\d.,]+)\s*([^)]*)\)/)
    const name = nameMatch ? nameMatch[1].trim()
      : label.replace(/\[.*?\]/, '').replace(/\(.*?\)/, '').trim()
    if (!name) continue
    entries.push({
      kind: 'reagent',
      invId: idMatch ? idMatch[1] : '',
      labware: labwareMatch ? labwareMatch[1] : '',
      code: codeMatch ? codeMatch[1].trim() : '',
      name,
      stock: concMatch ? num(concMatch[1]) : null,
      unit: concMatch ? (concMatch[2] || '').trim().replace(/^u/, 'µ') : '',
      volume: toUL(m[2], m[3]),
    })
  }

  // The fill-up. An explicit MQ H₂O line wins, exactly as before — only a well that
  // has none falls through to the general form, so nothing that parses today parses
  // differently. The LAST match is taken because every producer writes the fill-up
  // as the final volume line of the well.
  const w = src.match(WATER_RE)
  if (w) {
    entries.push({ kind: 'water', name: 'MQ H₂O', volume: toUL(w[1], w[2]) })
  } else {
    FILLUP_RE.lastIndex = 0
    let f, last = null
    while ((f = FILLUP_RE.exec(src)) !== null) last = f
    if (last) entries.push({ kind: 'water', name: stripTags(last[1]) || 'Fill-up', volume: toUL(last[2], last[3]) })
  }

  return entries
}

/**
 * Volumes the well states that are deliberately NOT entries: a labelled line that
 * carries a concentration but no chip, so nothing records which bottle it came from.
 *
 * They are real liquid, and they are why a well can read short. They are still not
 * summed into the total, because both .onp exporters skip them for the same reason —
 * counting them here would make the editor agree with a plate the robot will not
 * build, which is a worse failure than a number that is visibly short. Reported so
 * the editor can say the volume is there and say why it is not counted.
 *
 * @returns [{ name, volume }] in the order they appear.
 */
export function unlinkedVolumes(html) {
  const src = String(html || '')
  const out = []
  UNLINKED_RE.lastIndex = 0
  let m
  while ((m = UNLINKED_RE.exec(src)) !== null) {
    const name = stripTags(m[1])
    const volume = toUL(m[2], m[3])
    if (name && volume > 0) out.push({ name, volume })
  }
  return out
}

/** Total volume actually pipetted into the well (µL). */
export function totalVolume(entries) {
  return (entries || []).reduce((sum, e) => sum + (Number(e.volume) || 0), 0)
}

/**
 * The concentration each component actually reaches in the tube:
 *   final = stock · volume / total_volume
 * Uses the REAL total, so an overfilled well correctly reports weaker
 * concentrations than the plate was designed for rather than the intended ones.
 * A component with no stock recorded gets `final: null` — nothing is invented.
 */
export function withFinalConcentrations(entries) {
  const total = totalVolume(entries)
  return (entries || []).map(e => {
    if (e.kind !== 'reagent' || total <= 0 || e.stock == null || !isFinite(e.stock)) {
      return { ...e, final: null }
    }
    return { ...e, final: (e.stock * (Number(e.volume) || 0)) / total }
  })
}

/** Round for display without inventing precision: 3 significant-ish decimals. */
export const fmtConc = (v) => {
  if (v == null || !isFinite(v)) return ''
  const a = Math.abs(v)
  return v.toFixed(a >= 100 ? 1 : a >= 1 ? 2 : a >= 0.01 ? 3 : 4).replace(/\.?0+$/, '')
}
const fmtVol = (v) => (Number(v) || 0).toFixed(2)

/**
 * Identity of a component for plate-wide operations: the inventory link when there
 * is one, otherwise the name. Two wells referring to the same compound group together
 * even if one was pipetted at a different stock.
 */
export const entryKey = (e) => e.invId ? 'inv:' + e.invId : 'name:' + String(e.name || '').trim().toLowerCase()

/**
 * Every distinct component used across a plate, with where and how it was used.
 * `stock` is null when wells disagree — that is reported as "mixed" rather than
 * silently picking one, because disagreeing stocks is a thing worth seeing.
 */
export function collectPlateStocks(wells) {
  const byKey = new Map()
  Object.entries(wells || {}).forEach(([wellId, html]) => {
    parseWellHtml(html).forEach(e => {
      if (e.kind !== 'reagent') return
      const key = entryKey(e)
      if (!byKey.has(key)) {
        byKey.set(key, { key, name: e.name, code: e.code, invId: e.invId, unit: e.unit,
                         stock: e.stock, mixedStock: false, wells: [], totalVolume: 0 })
      }
      const g = byKey.get(key)
      if (g.stock !== e.stock) { if (g.wells.length) g.mixedStock = true; if (g.stock == null) g.stock = e.stock }
      if (!g.unit && e.unit) g.unit = e.unit
      if (!g.code && e.code) g.code = e.code
      g.wells.push(wellId)
      g.totalVolume += Number(e.volume) || 0
    })
  })
  return [...byKey.values()].sort((a, b) => b.wells.length - a.wells.length)
}

/**
 * Apply a stock change to every well of a plate at once — the plate-wide counterpart
 * to editing a single well. Used to say "the EDC in this plate was THIS bottle":
 * `patch.inv` links every occurrence to an inventory item, which restores the
 * data-inv-id the usage tracker keys on, and `patch.stock` / `patch.unit` correct
 * the concentration that was actually used.
 *
 * Linking to inventory adopts that item's concentration only where the well had none
 * recorded — a well's own value is what was pipetted into it and outranks the bottle.
 */
export function applyStockToPlate(wells, key, patch = {}, { inventory = [] } = {}) {
  const out = {}
  let wellsChanged = 0, entriesChanged = 0
  Object.entries(wells || {}).forEach(([wellId, html]) => {
    const entries = parseWellHtml(html)
    let touched = false
    entries.forEach(e => {
      if (e.kind !== 'reagent' || entryKey(e) !== key) return
      if (patch.inv) {
        e.invId = patch.inv.id
        e.code = patch.inv.code || e.code
        e.name = patch.inv.name || e.name
        if (e.stock == null) { e.stock = Number(patch.inv.stock); e.unit = patch.inv.stockUnit || e.unit }
      }
      if (patch.stock != null && isFinite(patch.stock)) e.stock = Number(patch.stock)
      if (patch.unit) e.unit = String(patch.unit).trim()
      touched = true
      entriesChanged++
    })
    if (touched) wellsChanged++
    out[wellId] = touched ? buildWellHtml(entries, { inventory, showFinal: true }) : html
  })
  return { wells: out, wellsChanged, entriesChanged }
}

/**
 * Rebuild a well's HTML from entries, optionally annotating each line with the
 * concentration actually reached. The chip keeps the `[CODE] Name (stock unit)`
 * shape and the volume stays the first `number µL` after it, because the .onp
 * exporters read exactly those two things back out.
 *
 * `inventory` lets a parsed entry re-link to a real stock so the chip carries
 * data-inv-id again (that attribute is what the usage tracker keys on).
 */
export function buildWellHtml(entries, { inventory = [], showFinal = true, targetVolume = null } = {}) {
  const rows = withFinalConcentrations(entries)
  const total = totalVolume(entries)
  let html = ''

  rows.filter(e => e.kind === 'reagent').forEach(e => {
    const inv = e.invId ? (inventory || []).find(i => i.id === e.invId) : null
    // The chip states the stock used IN THIS WELL, which may differ from the
    // inventory's current stock — the well records what was pipetted, not what the
    // bottle says today, so the well's own value wins.
    const shown = e.stock == null ? '' : `${fmtConc(e.stock)} ${e.unit || ''}`.trim()
    const chip = inv
      ? invChip({ ...inv, stock: e.stock == null ? inv.stock : fmtConc(e.stock), stockUnit: e.unit || inv.stockUnit },
                { labware: e.labware || '', removable: true })
      : textChip(`${e.code ? '[' + e.code + '] ' : ''}${e.name}${shown ? ' (' + shown + ')' : ''}`,
                 { labware: e.labware || '' })
    const final = (showFinal && e.final != null)
      ? ` <span class="well-final" style="opacity:0.75;">→ ${esc(fmtConc(e.final))} ${esc(e.unit || '')}</span>`
      : ''
    html += `${chip}&nbsp; ${fmtVol(e.volume)} µL${final}<br>`
  })

  // The fill-up keeps the name it was written with. Re-emitting a buffer fill-up as
  // "MQ H₂O" would be worse than dropping it: the .onp exporters key that label to
  // the water position on the deck, so a rebuilt well would tell the robot to top a
  // buffered coacervation up with water. Under its own name it stays what it is —
  // and stays invisible to the exporters, exactly as it is today.
  const water = rows.find(e => e.kind === 'water')
  if (water) html += `<strong>${esc(water.name || 'MQ H₂O')}:</strong> ${fmtVol(water.volume)} µL<br>`

  if (showFinal && total > 0) {
    const over = targetVolume != null && total > Number(targetVolume) + 1e-9
    html += `<span class="well-total" style="font-size:0.7rem; ${over ? 'color:#ef4444;' : 'opacity:0.6;'}">`
      + `Σ ${fmtVol(total)} µL${targetVolume != null ? ` of ${esc(String(targetVolume))} µL` : ''}`
      + `${over ? ' — overfilled, concentrations shown are the actual ones' : ''}</span>`
  }
  return html
}

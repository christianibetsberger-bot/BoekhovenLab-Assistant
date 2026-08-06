// What a plate well says about a phase-diagram point.
//
// The Phase Predictor needs three or four numbers per well — how much of each
// component ended up in it — but a well can have been written two different ways:
//
//   · by "Send to plate", which stamps the sample id and each component's TARGET
//     concentration: `AI Target [9001]` then `5.50 µL (5.5 mM)` per component;
//   · by anything else — a hand-built plate, or one reconstructed from a robot
//     protocol (.onp) — which records the chip, the volume pipetted and the
//     concentration the compound REACHES, and carries no sample id at all.
//
// Reading only the first shape is why an imported .onp plate maps zero wells. So
// try it first (it states the intent, and it round-trips exactly), then fall back
// to reading the composition and matching each reagent to a component of the
// screen by its inventory link, or by name when there is no link.
//
// Nothing is guessed: a reagent whose unit cannot be converted to the component's
// unit is left out rather than mixed in at face value, and a well where no
// component was recognised is not mapped at all.
import { parseWellHtml, withFinalConcentrations, entryKey } from './wellComposition'
import { convertConcentration } from './units'

// `5.50 µL (5.5 mM)` — one per component, in A, B, C(, D) order, written by
// PhasePredictor's exportSuggestionsToPlate. Constants are emitted after them.
const TARGET_CONC_RE = /[\d.]+\s*µL\s*\(([\d.]+)\s*mM\)/g

// The sample id is the number in the stamp a plate export writes: "AI Target
// [9001]" for a suggestion, "Sample [9001]" for a condition replated out of the
// phase map. A bare [123] is not one — inventory chips lead with a code, and a
// numeric code read as a sample id would give every well of the plate the same
// identity and collapse them onto one point. The bare form is still accepted
// alongside the target concentrations, where it can only be the stamp, so plates
// whose label was edited still import.
const STAMPED_ID_RE = /(?:AI\s*Target|Sample)\s*\[(\d+)\]/i
const ANY_ID_RE = /\[(\d+)\]/

const sampleIdOf = (src, { stampedOnly = false } = {}) => {
  const stamped = src.match(STAMPED_ID_RE)
  if (stamped) return parseInt(stamped[1], 10)
  if (stampedOnly) return null
  const any = src.match(ANY_ID_RE)
  return any ? parseInt(any[1], 10) : null
}

const SLOT_KEYS = ['anion', 'cation', 'salt', 'compD']

/**
 * A well written by "Send to plate": sample id plus the target concentration of
 * each component. Returns null when the well is not in that shape.
 */
export function readAiTargetWell(html, { hasD = false, components = [] } = {}) {
  const src = String(html || '')
  const sampleId = sampleIdOf(src)
  if (sampleId === null) return null
  TARGET_CONC_RE.lastIndex = 0
  const concs = [...src.matchAll(TARGET_CONC_RE)].map(m => parseFloat(m[1]))
  if (concs.length < 3) return null

  // The first three pairs are always A, B, C. The fourth is D only if D was part
  // of the export — a plate sent before D was switched on has a constant sitting
  // in that position, and reading it as D would invent a fourth axis out of a
  // buffer. So D is taken only when the well actually contains D's compound.
  const dComponent = hasD ? components.find(c => c.key === 'compD') : null
  const hasDCompound = dComponent && concs.length >= 4
    && parseWellHtml(src).some(e => e.kind === 'reagent' && sameComponent(dComponent, e))

  return {
    sampleId,
    anion: concs[0], cation: concs[1], salt: concs[2],
    compD: hasDCompound ? concs[3] : 0,
    source: 'target',
  }
}

// The inventory link is the identity when both sides have one; a plate typed by
// hand, or one rebuilt from a protocol that carries no stock codes, only has a name.
const sameComponent = (component, entry) => {
  if (!component) return false
  if (component.invId && entry.invId) return String(component.invId) === String(entry.invId)
  const a = String(component.name || '').trim().toLowerCase()
  const b = String(entry.name || '').trim().toLowerCase()
  return !!a && a === b
}

// Volumes are written to two decimals, so anything under a hundredth of a µL is
// the same volume written twice.
const VOL_TOL = 0.005

/**
 * What a plate was screening, read off the plate itself.
 *
 * A phase screen is a set of components that were varied and a set that were the
 * same everywhere. The plate already says which is which: a compound pipetted at
 * the same volume, from the same stock, into every single well is a constant of
 * the experiment; one whose volume changes between wells — or that is missing
 * from some — is an axis. So the components are inferred rather than declared,
 * and the axes are assigned in the order the compounds were pipetted (A, B, C, D)
 * unless the screen already links one of them to an inventory item, which pins it
 * to its slot.
 *
 * Constancy is judged on volume and stock rather than on concentration, because
 * a well that was overfilled dilutes everything in it slightly — that is a
 * pipetting difference, not a screened level, and judging it on concentration
 * would turn every constant into a fourth axis.
 *
 * @returns { wells, screened, constants, unmapped, unitClashes, wellCount } or
 *          null when the plate holds nothing that varies.
 */
export function inferScreenFromPlate(wells, { components = [], plateId = '' } = {}) {
  const wellIds = Object.keys(wells || {})
  if (!wellIds.length) return null

  // Gather every compound across the plate, keeping the order it was pipetted in.
  const compounds = new Map()
  const wellsWithReagent = new Set()
  const waterByWell = new Map()
  const totalByWell = new Map()
  let waterName = ''
  let seen = 0
  for (const wellId of wellIds) {
    for (const e of withFinalConcentrations(parseWellHtml(wells[wellId]))) {
      // The fill-up is not a screened component — it is what makes the volume up,
      // and its volume changes precisely so the total does not. Recording it keeps
      // a replated well faithful to how the original was actually made.
      totalByWell.set(wellId, (totalByWell.get(wellId) || 0) + (Number(e.volume) || 0))
      if (e.kind === 'water') {
        waterByWell.set(wellId, (waterByWell.get(wellId) || 0) + (Number(e.volume) || 0))
        waterName = waterName || e.name || 'MQ H₂O'
        continue
      }
      if (e.kind !== 'reagent') continue
      wellsWithReagent.add(wellId)
      const key = entryKey(e)
      let c = compounds.get(key)
      if (!c) {
        c = { key, invId: e.invId || '', code: e.code || '', name: e.name, unit: e.unit || '', order: seen++, byWell: new Map(), volByWell: new Map(), stocks: new Set() }
        compounds.set(key, c)
      }
      // The same compound pipetted in two steps lands in the same well twice.
      const conc = e.final == null ? null : convertConcentration(e.final, e.unit, c.unit)
      if (conc != null) c.byWell.set(wellId, (c.byWell.get(wellId) || 0) + conc)
      c.volByWell.set(wellId, (c.volByWell.get(wellId) || 0) + (Number(e.volume) || 0))
      if (e.stock != null) c.stocks.add(Number(e.stock))
    }
  }
  if (!wellsWithReagent.size) return null

  const ids = [...wellsWithReagent]
  for (const c of compounds.values()) {
    const vols = ids.map(id => c.volByWell.get(id) ?? 0)
    const concs = ids.map(id => c.byWell.get(id) ?? 0)
    c.inEveryWell = ids.every(id => c.volByWell.has(id))
    c.minVol = Math.min(...vols); c.maxVol = Math.max(...vols)
    c.min = Math.min(...concs); c.max = Math.max(...concs)
    const sameVolume = (c.maxVol - c.minVol) <= VOL_TOL
    const sameStock = c.stocks.size <= 1
    // One well cannot show a difference, so with a single well nothing is constant.
    c.varies = ids.length < 2 || !(c.inEveryWell && sameVolume && sameStock)
  }

  const ordered = [...compounds.values()].sort((a, b) => a.order - b.order)
  const screened = ordered.filter(c => c.varies)
  const constants = ordered.filter(c => !c.varies)
  if (!screened.length) return null

  // A component already linked to an inventory item keeps its slot; the rest fill
  // the free slots in pipetting order.
  const assigned = {}
  const taken = new Set()
  for (const key of SLOT_KEYS) {
    const component = components.find(c => c.key === key)
    const hit = component && screened.find(c => !taken.has(c.key) && sameComponent(component, c))
    if (hit) { assigned[key] = hit; taken.add(hit.key) }
  }
  const unmapped = []
  for (const c of screened) {
    if (taken.has(c.key)) continue
    const free = SLOT_KEYS.find(k => !assigned[k])
    if (!free) { unmapped.push(c); continue }
    assigned[free] = c
    taken.add(c.key)
  }

  // Each axis is reported in the unit the screen is configured in, when the two
  // are the same kind of quantity. When they are not (µM into mg/mL needs a molar
  // mass), the compound's own unit is kept and the clash is reported rather than
  // rescaled by a factor nobody can supply.
  const slotUnit = {}, unitClashes = []
  for (const key of SLOT_KEYS) {
    const c = assigned[key]
    if (!c) continue
    const want = components.find(x => x.key === key)?.unit || c.unit
    if (convertConcentration(1, c.unit, want) == null) {
      slotUnit[key] = c.unit
      unitClashes.push({ slot: key, name: c.name, from: c.unit, to: want })
    } else {
      slotUnit[key] = want
    }
  }

  const out = {}
  for (const wellId of ids) {
    const row = { anion: 0, cation: 0, salt: 0, compD: 0 }
    for (const key of SLOT_KEYS) {
      const c = assigned[key]
      if (!c) continue
      const raw = c.byWell.get(wellId)
      if (raw === undefined) continue
      const v = convertConcentration(raw, c.unit, slotUnit[key])
      if (v != null) row[key] = v
    }
    out[wellId] = {
      ...row,
      // A composition carries no sample id unless the well still has the stamp, so
      // one is derived from where the well is. Deriving rather than randomising
      // means re-importing the same plate updates the same points instead of
      // stacking duplicates beside them.
      sampleId: sampleIdOf(String(wells[wellId] || ''), { stampedOnly: true }) ?? syntheticSampleId(plateId, wellId),
      source: 'composition',
    }
  }

  const describe = (c, key) => {
    const unit = slotUnit[key] || c.unit
    const into = (v) => convertConcentration(v, c.unit, unit) ?? v
    // Every level the component was dosed at, in the unit the axis will use —
    // a well it was left out of is a real level, zero.
    const spacing = levelSpacing(ids.map(id => into(c.byWell.get(id) ?? 0)))
    // The stock the plate was actually dosed from — only when there was one. Two
    // different stocks for the same compound is a fact about the plate, not a
    // number to average.
    const stock = c.stocks.size === 1 ? [...c.stocks][0] : null
    return {
      slot: key, key: c.key, invId: c.invId, code: c.code, name: c.name,
      unit,
      nativeUnit: c.unit,
      stock: stock == null ? null : into(stock),
      min: spacing ? spacing.min : into(c.min),
      max: spacing ? spacing.max : into(c.max),
      step: spacing ? spacing.step : 0,
      levels: spacing ? spacing.levels : [],
      inEveryWell: c.inEveryWell,
    }
  }

  const totals = ids.map(id => totalByWell.get(id) || 0).filter(v => v > 0)
  const wellVolume = totals.length
    ? { min: Math.min(...totals), max: Math.max(...totals), uniform: Math.max(...totals) - Math.min(...totals) <= VOL_TOL }
    : null

  const waterVols = ids.map(id => waterByWell.get(id)).filter(v => v !== undefined)
  const fillup = waterVols.length
    ? {
        kind: 'water',
        name: waterName || 'MQ H₂O',
        minVolume: Math.min(...waterVols),
        maxVolume: Math.max(...waterVols),
        inEveryWell: waterVols.length === ids.length,
      }
    : null

  return {
    wells: out,
    screened: SLOT_KEYS.filter(k => assigned[k]).map(k => describe(assigned[k], k)),
    constants: constants.map(c => ({
      name: c.name, code: c.code, invId: c.invId, unit: c.unit,
      value: c.max, volume: c.maxVol,
      // Without a stock nobody can say what volume reproduces this constant, so
      // the caller is told it is missing rather than handed a number to guess with.
      stock: c.stocks.size === 1 ? [...c.stocks][0] : null,
    })),
    unmapped: unmapped.map(c => ({ name: c.name, unit: c.unit, min: c.min, max: c.max })),
    unitClashes,
    fillup,
    wellVolume,
    wellCount: ids.length,
  }
}

/**
 * The levels a component was actually screened at, and the range that covers them.
 *
 * A phase map's axis is not "0 to whatever the box said" — it is the ground the
 * experiment actually covered. So min and max come from the data, and the step is
 * the spacing between neighbouring levels: the real spacing when the levels are
 * evenly spread, the average when they are not, because a suggestion grid built on
 * the smallest gap of an uneven series explodes into points nobody asked for.
 *
 * Values are rounded to `precision` significant digits first — 0.012000000000002
 * and 0.012 are one level, not two.
 *
 * `maxLevels` caps how fine the step may get. A continuous gradient across a plate
 * has as many levels as it has wells, and a step that fine turns the suggestion
 * grid into hundreds of thousands of combinations. The measured levels are
 * reported either way; only the step is coarsened, and `capped` says so.
 */
export function levelSpacing(values, { precision = 6, maxLevels = 32 } = {}) {
  const clean = (values || []).map(Number).filter(v => isFinite(v))
  if (!clean.length) return null
  const levels = [...new Set(clean.map(v => Number(v.toPrecision(precision))))].sort((a, b) => a - b)
  const min = levels[0], max = levels[levels.length - 1]
  if (levels.length < 2) return { levels, min, max, step: 0, capped: false }

  const gaps = levels.slice(1).map((v, i) => v - levels[i])
  const smallest = Math.min(...gaps)
  const even = gaps.every(g => Math.abs(g - smallest) <= smallest * 0.05)
  let step = even ? smallest : (max - min) / (levels.length - 1)

  const capped = maxLevels > 1 && (max - min) / step > maxLevels - 1
  if (capped) step = (max - min) / (maxLevels - 1)

  return { levels, min, max, step: Number(step.toPrecision(precision)), capped }
}

// FNV-1a over "plate:well", kept to six digits so it reads as an id rather than
// as a measurement.
export function syntheticSampleId(plateId, wellId) {
  let h = 2166136261
  const key = `${plateId || 'plate'}:${wellId || '?'}`
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return 100000 + (Math.abs(h) % 800000)
}

/**
 * Every well of a plate that says something about the screen.
 *
 * Wells stamped by "Send to plate" are read from their own sample id and target
 * concentrations — they state the intent, so nothing needs inferring. Whatever is
 * left is read as a plate whose design has to be worked out from what is in it.
 *
 * @param wells      plate.wells — { A1: html }
 * @param components the screen's components, [{ key, invId, name, unit }]
 * @returns { wells: { A1: {sampleId, anion, cation, salt, compD, source} }, inference }
 *          where `inference` is non-null when any well had to be inferred.
 */
export function readPlateWells(wells, { components = [], plateId = '', hasD = false } = {}) {
  const out = {}
  const rest = {}
  for (const [wellId, html] of Object.entries(wells || {})) {
    if (!html) continue
    const stamped = readAiTargetWell(html, { hasD, components })
    if (stamped) out[wellId] = stamped
    else rest[wellId] = html
  }

  const inference = Object.keys(rest).length
    ? inferScreenFromPlate(rest, { components, plateId })
    : null
  if (inference) Object.assign(out, inference.wells)

  return { wells: out, inference }
}

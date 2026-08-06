// Read an Andrew+ robot protocol (.onp) back into well plates — the inverse of the
// exporters in WellPlateEditor.vue.
//
// An .onp is JSON: `labwares` (the target plate(s) and one source labware per stock),
// `reagents` (what each source holds, with its stock concentration), and `steps`.
// Step 0 carries the initial `labwareStates`, which is what ties a source labware to
// its reagent; every later PIPETTING step moves a volume from one source cavity into
// a list of destination cavities on a target labware.
//
// Reversing it is therefore: find the labwares that are pipetted INTO, and replay every
// step into them. A grouped export puts several plates in one file, so this returns a
// list — one plate per target labware.
//
// What cannot be recovered, and is not guessed: the exporters write the compound NAME
// but not its inventory code, so links back to inventory are re-established by name
// match only, and anything that was in the well but not pipetted (sample IDs, phase
// notes) was never in the file to begin with.

// The catalog UUIDs the exporters write for each plate geometry.
const UUID_FORMAT = {
  '201901101700': 384,
  '201901101715': 24,
  '201812181400': 96,
}
const FORMAT_UUID = { 384: '201901101700', 24: '201901101715', 96: '201812181400' }

const wellIdOf = (cavity) => {
  const row = Number(cavity && cavity.row) || 1
  const col = Number(cavity && cavity.column) || 1
  return String.fromCharCode(64 + row) + col
}

const volumeUL = (v) => {
  if (!v) return 0
  const value = Number(v.value) || 0
  const unit = String(v.unit || 'uL').toLowerCase()
  if (unit === 'ml') return value * 1000
  if (unit === 'l') return value * 1e6
  if (unit === 'nl') return value / 1000
  return value
}

/** Plate geometry: from the labware UUID when known, else inferred from the wells used. */
function formatFor(labwareUuid, maxRow, maxCol) {
  if (UUID_FORMAT[labwareUuid]) return UUID_FORMAT[labwareUuid]
  if (maxRow > 8 || maxCol > 12) return 384
  if (maxRow <= 4 && maxCol <= 6) return 24
  if (maxRow <= 6 && maxCol <= 8) return 48
  return 96
}

/**
 * Parse an .onp protocol object into plates.
 *
 * @param protocol  the parsed JSON of an .onp file
 * @param inventory store.inventory, used to re-link compounds by name
 * @returns { plates: [{ name, format, targetLabware, wells: { A1: entries[] } }], warnings: [] }
 *          where entries are the shape wellComposition.js works with.
 */
export function parseOnp(protocol, { inventory = [] } = {}) {
  const warnings = []
  if (!protocol || typeof protocol !== 'object') throw new Error('Not a protocol file.')
  const steps = Array.isArray(protocol.steps) ? protocol.steps : []
  const labwares = Array.isArray(protocol.labwares) ? protocol.labwares : []
  if (!steps.length || !labwares.length) throw new Error('This file has no pipetting steps — it may not be an Andrew+ protocol.')

  const labwareByRef = {}
  labwares.forEach(l => { if (l && l.ref) labwareByRef[l.ref] = l })

  const reagentByRef = {}
  ;(protocol.reagents || []).forEach(r => {
    if (r && r.ref) reagentByRef[r.ref] = r.reagent || r
  })

  // Source labware → the reagent it holds, read from the initial state.
  const reagentOfLabware = {}
  steps.forEach(s => {
    const states = (s && s.state && s.state.labwareStates) || null
    if (!states) return
    Object.values(states).forEach(st => {
      const cav = st && st.cavityStates && (st.cavityStates['1-1'] || Object.values(st.cavityStates)[0])
      const content = cav && cav.solution && cav.solution.content
      if (!content) return
      const first = Object.values(content)[0]
      if (first && first.reagentRef && !reagentOfLabware[st.labwareRef]) {
        reagentOfLabware[st.labwareRef] = first.reagentRef
      }
    })
  })

  // A target plate is any labware that gets pipetted INTO.
  const perPlate = new Map()
  const seenSourcesWithoutReagent = new Set()

  steps.forEach(step => {
    const action = step && step.action
    if (!action || String(action.type || step.actionTypeId || '').toUpperCase() !== 'PIPETTING') return
    const src = (action.sources || [])[0]
    const vol = volumeUL(action.params && action.params.volume)
    if (!src || vol <= 0) return

    const reagentRef = reagentOfLabware[src.labwareRef]
    const reagent = reagentRef ? reagentByRef[reagentRef] : null
    const srcLabware = labwareByRef[src.labwareRef]
    // Name from the reagent when the state links one, else from the source labware —
    // a protocol authored in Andrew Lab may not carry the same initial state we write.
    const name = String((reagent && reagent.name) || (srcLabware && srcLabware.name) || '').trim()
    if (!name) { seenSourcesWithoutReagent.add(src.labwareRef); return }
    const isWater = /^(water|mq\s*h₂o|mq\s*water)$/i.test(name)
      || String((reagent && reagent.concentrationUnit) || '').toLowerCase() === 'au'

    const stock = reagent && reagent.concentrationValue != null ? parseFloat(reagent.concentrationValue) : null
    // The exporters write "uM" where the app shows "µM" — undo that on the way back.
    const unit = String((reagent && reagent.concentrationUnit) || '').replace(/^u(?=[ML])/, 'µ')

    ;(action.destinations || []).forEach(dest => {
      if (!dest || !dest.labwareRef) return
      if (!perPlate.has(dest.labwareRef)) perPlate.set(dest.labwareRef, new Map())
      const wells = perPlate.get(dest.labwareRef)
      ;(dest.cavities || []).forEach(cav => {
        const wellId = wellIdOf(cav)
        if (!wells.has(wellId)) wells.set(wellId, [])
        const list = wells.get(wellId)
        // The exporter splits repeats of the same stock+volume into separate rounds;
        // rejoin them here so the well shows one line per component with the volume
        // that actually went in.
        const key = isWater ? 'water' : (name.toLowerCase() + '|' + (stock == null ? '' : stock) + '|' + unit)
        const existing = list.find(e => e._key === key)
        if (existing) { existing.volume += vol; return }
        if (isWater) {
          list.push({ _key: key, kind: 'water', name: 'MQ H₂O', volume: vol })
        } else {
          const match = (inventory || []).find(i => String(i.name || '').trim().toLowerCase() === name.toLowerCase())
          list.push({
            _key: key,
            kind: 'reagent',
            invId: match ? match.id : '',
            labware: (srcLabware && srcLabware.labware && srcLabware.labware.uuid) || '',
            code: match ? (match.code || '') : '',
            name,
            stock: (stock != null && isFinite(stock)) ? stock : null,
            unit: unit || (match ? (match.stockUnit || '') : ''),
            volume: vol,
          })
        }
      })
    })
  })

  if (seenSourcesWithoutReagent.size) {
    warnings.push(`${seenSourcesWithoutReagent.size} source labware had no reagent attached and was skipped.`)
  }
  if (!perPlate.size) throw new Error('No pipetting destinations found — nothing to build a plate from.')

  const plates = []
  for (const [targetRef, wellMap] of perPlate.entries()) {
    const labware = labwareByRef[targetRef] || {}
    const uuid = (labware.labware && labware.labware.uuid) || ''
    let maxRow = 0, maxCol = 0
    for (const wellId of wellMap.keys()) {
      maxRow = Math.max(maxRow, wellId.charCodeAt(0) - 64)
      maxCol = Math.max(maxCol, parseInt(wellId.slice(1), 10) || 0)
    }
    const format = formatFor(uuid, maxRow, maxCol)
    const wells = {}
    for (const [wellId, list] of wellMap.entries()) {
      wells[wellId] = list.map(({ _key, ...e }) => e)
    }
    // Totals per well, so the caller can report the spread — a protocol carries no
    // design volume, and wells that differ are exactly the ones worth looking at.
    const totals = Object.values(wells).map(list => list.reduce((s, e) => s + (e.volume || 0), 0))
    plates.push({
      ref: targetRef,
      name: String(labware.name || protocol.name || 'Imported plate').trim(),
      format,
      targetLabware: uuid || FORMAT_UUID[format] || FORMAT_UUID[96],
      wells,
      volumeRange: totals.length ? { min: Math.min(...totals), max: Math.max(...totals) } : null,
    })
  }

  // A grouped .onp lists its targets in export order; keep that order stable.
  const order = labwares.map(l => l.ref)
  plates.sort((a, b) => order.indexOf(a.ref) - order.indexOf(b.ref))
  return { plates, warnings, protocolName: String(protocol.name || '').trim() }
}

import { parseWellHtml, withFinalConcentrations, totalVolume, unlinkedVolumes } from './wellComposition'

/**
 * Turning a plate into something you can hand to someone else.
 *
 * A well in this app is a fragment of HTML — chips, volumes, a fill-up line.
 * That is a good thing to edit and a terrible thing to analyse, so this flattens
 * it into rows: one per compound per well, carrying who it is, what it came out
 * of, how much was pipetted and what it reached.
 *
 * The unit of export is deliberately the long row rather than the plate grid. A
 * grid is what you read; a row is what pandas, R and a colleague's script can
 * use without writing a parser first. The grid ships too, as a second sheet.
 */

const ROW_LETTERS = 'ABCDEFGHIJKLMNOP'

/** Rows and columns for the plate formats the editor supports. */
export function plateDims(format) {
  if (format === 'ibidi') return { rows: 3, cols: 6 }
  if (format === 'pcr8') return { rows: 1, cols: 8 }
  if (format === 384) return { rows: 16, cols: 24 }
  if (format === 48) return { rows: 6, cols: 8 }
  if (format === 24) return { rows: 4, cols: 6 }
  return { rows: 8, cols: 12 }
}

export function wellIdsFor(format) {
  const { rows, cols } = plateDims(format)
  const out = []
  for (let r = 0; r < rows; r++) for (let c = 1; c <= cols; c++) out.push(`${ROW_LETTERS[r]}${c}`)
  return out
}

// Volumes are pipetted to two decimals; concentrations can be anything from
// 0.0005 µM to 1000 mM, so they get significant figures rather than a fixed
// scale. Returning a Number, not a string — a spreadsheet column of numbers
// that are secretly text is the classic way an export becomes unusable.
const vol = (n) => (Number.isFinite(Number(n)) ? Math.round(Number(n) * 100) / 100 : null)
const conc = (n) => {
  const v = Number(n)
  if (!Number.isFinite(v)) return null
  return Number(v.toPrecision(6))
}

/**
 * Every compound in every well, one row each.
 *
 * Unlinked volumes — a labelled amount with no inventory chip — are included and
 * flagged rather than dropped. They are real liquid; the plate total deliberately
 * excludes them because the robot cannot source them, and an export that silently
 * omitted them would hide the discrepancy instead of explaining it.
 *
 * @returns {Array<object>} flat rows, ordered by well then by position in the well
 */
export function buildPlateRows(plate) {
  const wells = plate?.wells || {}
  const ids = wellIdsFor(plate?.format)
  const rows = []

  for (const wellId of ids) {
    const html = wells[wellId]
    if (!html || !String(html).trim()) continue

    const entries = withFinalConcentrations(parseWellHtml(html))
    const total = totalVolume(entries)
    const unlinked = unlinkedVolumes(html)
    if (!entries.length && !unlinked.length) continue

    const base = {
      well: wellId,
      row: wellId[0],
      column: Number(wellId.slice(1)),
      well_total_ul: vol(total),
    }

    for (const e of entries) {
      rows.push({
        ...base,
        compound: e.name || '',
        code: e.code || '',
        inventory_id: e.invId || '',
        role: e.kind === 'water' ? 'fill-up' : 'component',
        stock_conc: conc(e.stock),
        stock_unit: e.unit || '',
        volume_ul: vol(e.volume),
        final_conc: conc(e.final),
        final_unit: e.final == null ? '' : (e.unit || ''),
        linked_to_inventory: e.kind === 'water' ? '' : (e.invId ? 'yes' : 'no'),
      })
    }

    for (const u of unlinked) {
      rows.push({
        ...base,
        compound: u.name || '',
        code: '',
        inventory_id: '',
        role: 'unlinked',
        stock_conc: null,
        stock_unit: '',
        volume_ul: vol(u.volume),
        final_conc: null,
        final_unit: '',
        linked_to_inventory: 'no',
      })
    }
  }
  return rows
}

/** One row per well: what it holds in total and whether that exceeds the design. */
export function buildWellSummary(plate) {
  const wells = plate?.wells || {}
  const target = Number(plate?.targetVolume)
  const out = []
  for (const wellId of wellIdsFor(plate?.format)) {
    const html = wells[wellId]
    if (!html || !String(html).trim()) continue
    const entries = parseWellHtml(html)
    const unlinked = unlinkedVolumes(html)
    if (!entries.length && !unlinked.length) continue
    const total = totalVolume(entries)
    const unlinkedTotal = unlinked.reduce((s, u) => s + (Number(u.volume) || 0), 0)
    out.push({
      well: wellId,
      components: entries.filter(e => e.kind !== 'water').length,
      total_ul: vol(total),
      unlinked_ul: vol(unlinkedTotal),
      design_volume_ul: Number.isFinite(target) && target > 0 ? vol(target) : null,
      overfilled: Number.isFinite(target) && target > 0 ? (total > target + 1e-9 ? 'yes' : 'no') : '',
    })
  }
  return out
}

/**
 * The plate as a grid, one cell per well, for the humans.
 * Each cell is a compact "name volume (final)" list.
 */
export function buildPlateGrid(plate) {
  const { rows, cols } = plateDims(plate?.format)
  const wells = plate?.wells || {}
  const header = ['', ...Array.from({ length: cols }, (_, i) => i + 1)]
  const grid = [header]
  for (let r = 0; r < rows; r++) {
    const line = [ROW_LETTERS[r]]
    for (let c = 1; c <= cols; c++) {
      const html = wells[`${ROW_LETTERS[r]}${c}`]
      if (!html || !String(html).trim()) { line.push(''); continue }
      const entries = withFinalConcentrations(parseWellHtml(html))
      line.push(entries.map(e => {
        const amount = e.final != null ? ` (${conc(e.final)} ${e.unit || ''})`.trimEnd() : ''
        return `${e.name} ${vol(e.volume)} µL${amount}`
      }).join('\n'))
    }
    grid.push(line)
  }
  return grid
}

// ── YAML ─────────────────────────────────────────────────────────────────────
// Hand-rolled rather than pulling in a dependency: the shape here is maps, lists
// and scalars, which is the part of YAML that is small enough to get right.
//
// Every string is double-quoted. Unquoted YAML has too many ways to change
// meaning — a compound called "NO" is a boolean, one called "1.5" is a number,
// one containing ": " splits into a mapping — and quoting all of them costs a
// character each and removes the entire class of problem.
const yamlStr = (s) => '"' + String(s ?? '')
  .replace(/\\/g, '\\\\')
  .replace(/"/g, '\\"')
  .replace(/\n/g, '\\n')
  .replace(/\r/g, '\\r')
  .replace(/\t/g, '\\t')
  // Remaining C0 controls, written as escapes rather than literal bytes: a raw
  // 0x01 pasted out of a vendor sheet is invisible in a diff and makes the
  // document unparseable at a line the parser then blames for it.
  // eslint-disable-next-line no-control-regex
  .replace(/[\u0000-\u001f]/g, (c) => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'))
  + '"'

const yamlScalar = (v) => {
  if (v === null || v === undefined || v === '') return 'null'
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : 'null'
  if (typeof v === 'boolean') return v ? 'true' : 'false'
  return yamlStr(v)
}

/**
 * The plate as a YAML document.
 *
 * Keyed by well so it reads like the plate rather than like a database dump,
 * and so a diff between two exports shows which wells changed.
 */
export function plateToYaml(plate, { exportedAt = '' } = {}) {
  const wells = plate?.wells || {}
  const pad = (n) => ' '.repeat(n)
  const L = []

  L.push('# Well plate export — Boekhoven Lab Assistant')
  L.push('# volumes in µL; final concentrations are computed on the well\'s real total,')
  L.push('# which is what it actually reached, not what it was designed for.')
  L.push('plate:')
  L.push(`${pad(2)}name: ${yamlScalar(plate?.name || 'Plate')}`)
  L.push(`${pad(2)}format: ${yamlScalar(plate?.format ?? 96)}`)
  const t = Number(plate?.targetVolume)
  L.push(`${pad(2)}design_volume_ul: ${yamlScalar(Number.isFinite(t) && t > 0 ? vol(t) : null)}`)
  L.push(`${pad(2)}exported: ${yamlScalar(exportedAt || null)}`)

  L.push('wells:')
  let any = false
  for (const wellId of wellIdsFor(plate?.format)) {
    const html = wells[wellId]
    if (!html || !String(html).trim()) continue
    const entries = withFinalConcentrations(parseWellHtml(html))
    const unlinked = unlinkedVolumes(html)
    if (!entries.length && !unlinked.length) continue
    any = true

    L.push(`${pad(2)}${wellId}:`)
    L.push(`${pad(4)}total_volume_ul: ${yamlScalar(vol(totalVolume(entries)))}`)

    const comps = entries.filter(e => e.kind !== 'water')
    if (comps.length) {
      L.push(`${pad(4)}components:`)
      for (const e of comps) {
        L.push(`${pad(6)}- name: ${yamlScalar(e.name)}`)
        L.push(`${pad(8)}code: ${yamlScalar(e.code || null)}`)
        L.push(`${pad(8)}inventory_id: ${yamlScalar(e.invId || null)}`)
        L.push(`${pad(8)}stock_conc: ${yamlScalar(conc(e.stock))}`)
        L.push(`${pad(8)}stock_unit: ${yamlScalar(e.unit || null)}`)
        L.push(`${pad(8)}volume_ul: ${yamlScalar(vol(e.volume))}`)
        L.push(`${pad(8)}final_conc: ${yamlScalar(conc(e.final))}`)
        L.push(`${pad(8)}final_unit: ${yamlScalar(e.final == null ? null : (e.unit || null))}`)
      }
    }

    const fill = entries.find(e => e.kind === 'water')
    if (fill) {
      L.push(`${pad(4)}fill_up:`)
      L.push(`${pad(6)}name: ${yamlScalar(fill.name)}`)
      L.push(`${pad(6)}volume_ul: ${yamlScalar(vol(fill.volume))}`)
    }

    // Present, deliberately not counted in total_volume_ul — see wellComposition.
    if (unlinked.length) {
      L.push(`${pad(4)}unlinked:`)
      for (const u of unlinked) {
        L.push(`${pad(6)}- name: ${yamlScalar(u.name)}`)
        L.push(`${pad(8)}volume_ul: ${yamlScalar(vol(u.volume))}`)
        L.push(`${pad(8)}note: ${yamlScalar('no inventory chip; excluded from total and from robot export')}`)
      }
    }
  }
  if (!any) L.push(`${pad(2)}{}`)

  return L.join('\n') + '\n'
}

/** A filename that sorts, survives every filesystem, and still says what it is. */
export function plateExportFilename(plate, ext, today = '') {
  const safe = String(plate?.name || 'plate')
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'plate'
  return `${safe}${today ? `_${today}` : ''}.${ext}`
}

import { describe, it, expect } from 'vitest'
import {
  plateDims, wellIdsFor, buildPlateRows, buildWellSummary, buildPlateGrid,
  plateToYaml, plateExportFilename,
} from './plateExport'

// The markup PhasePredictor and the planners actually write into a well.
const chip = (code, name, stock, unit) =>
  `<span class="inv-ref" data-inv-id="inv-${code}" data-labware="">[${code}] ${name} (${stock} ${unit})</span>`
const linked = (code, name, stock, unit, vol, conc) =>
  `&nbsp;${chip(code, name, stock, unit)}&nbsp; ${vol} µL (${conc} ${unit})<br>`
const fill = (label, vol) => `<strong>${label}:</strong> ${vol} µL<br>`

// 80 µL total: 40 + 20 + 16 of chipped reagents and 4 µL of buffer fill-up.
// Stocks are chosen so each final concentration works out round — the parser
// derives final from stock x volume / total, so a fixture whose arithmetic does
// not close would be testing the fixture rather than the code.
const WELL_A1 =
  `<strong style="color: var(--primary);">Sample [9001]</strong><br>`
  + linked('C1', 'K10 peptide', 10, 'mM', '40.00', 5)     // 10 x 40 / 80 = 5 mM
  + linked('C2', 'pU RNA', 8, 'mM', '20.00', 2)           //  8 x 20 / 80 = 2 mM
  + linked('C3', 'NaCl', 150, 'mM', '16.00', 30)          // 150 x 16 / 80 = 30 mM
  + fill('MOPS pH 7', '4.00')

const WELL_B2 = linked('C1', 'K10 peptide', 10, 'mM', '30.00', 3.75)
  + `<strong>EDC:</strong> 4.00 µL (10 mM)<br>`
  + fill('MQ H₂O', '46.00')

const plate = {
  name: 'Coacervate screen 3',
  format: 96,
  targetVolume: 80,
  wells: { A1: WELL_A1, B2: WELL_B2 },
}

/**
 * A parser for exactly the YAML subset plateToYaml emits: two-space indentation,
 * `key: scalar`, `key:` opening a block, and `- key: scalar` opening a list item.
 * It is strict on purpose — anything the emitter produces that this cannot read
 * is a bug in the emitter, which is the whole point of parsing it back.
 */
function parseSubsetYaml(text) {
  const unquote = (raw) => {
    if (raw === 'null') return null
    if (raw === 'true') return true
    if (raw === 'false') return false
    if (/^-?\d+(\.\d+)?([eE][-+]?\d+)?$/.test(raw)) return Number(raw)
    if (!(raw.startsWith('"') && raw.endsWith('"') && raw.length >= 2)) {
      throw new Error(`unquoted scalar in emitted YAML: ${raw}`)
    }
    return raw.slice(1, -1).replace(/\\u([0-9a-fA-F]{4})|\\(.)/g, (_, hex, ch) => {
      if (hex) return String.fromCharCode(parseInt(hex, 16))
      return { n: '\n', r: '\r', t: '\t', '"': '"', '\\': '\\' }[ch] ?? ch
    })
  }

  const lines = text.split('\n')
    .filter(l => l.trim() && !l.trimStart().startsWith('#'))
    .map(l => ({ indent: l.length - l.trimStart().length, text: l.trim() }))

  let i = 0
  const parseBlock = (indent) => {
    let node = null
    while (i < lines.length && lines[i].indent >= indent) {
      const line = lines[i]
      if (line.indent > indent) throw new Error(`unexpected indent at: ${line.text}`)

      if (line.text.startsWith('- ')) {
        if (node === null) node = []
        if (!Array.isArray(node)) throw new Error(`list item inside a mapping: ${line.text}`)
        const item = {}
        const m = /^- ([A-Za-z0-9_]+): (.*)$/.exec(line.text)
        if (!m) throw new Error(`malformed list item: ${line.text}`)
        item[m[1]] = unquote(m[2])
        i++
        // Continuation keys of the same item are indented past the dash.
        while (i < lines.length && lines[i].indent > indent && !lines[i].text.startsWith('- ')) {
          const c = /^([A-Za-z0-9_]+): (.*)$/.exec(lines[i].text)
          if (!c) throw new Error(`malformed list continuation: ${lines[i].text}`)
          item[c[1]] = unquote(c[2])
          i++
        }
        node.push(item)
        continue
      }

      if (node === null) node = {}
      if (Array.isArray(node)) throw new Error(`mapping key inside a list: ${line.text}`)
      if (line.text === '{}') { i++; continue }

      const m = /^([A-Za-z0-9_]+): ?(.*)$/.exec(line.text)
      if (!m) throw new Error(`malformed line: ${line.text}`)
      const [, key, rest] = m
      i++
      if (rest === '') node[key] = parseBlock(indent + 2)
      else node[key] = unquote(rest)
    }
    return node ?? {}
  }
  return parseBlock(0)
}

describe('plate geometry', () => {
  it('knows every format the editor offers', () => {
    expect(plateDims(96)).toEqual({ rows: 8, cols: 12 })
    expect(plateDims(384)).toEqual({ rows: 16, cols: 24 })
    expect(plateDims(48)).toEqual({ rows: 6, cols: 8 })
    expect(plateDims(24)).toEqual({ rows: 4, cols: 6 })
    expect(plateDims('ibidi')).toEqual({ rows: 3, cols: 6 })
    expect(plateDims('pcr8')).toEqual({ rows: 1, cols: 8 })
    expect(plateDims(undefined)).toEqual({ rows: 8, cols: 12 })
  })

  it('enumerates wells in reading order', () => {
    const ids = wellIdsFor(96)
    expect(ids).toHaveLength(96)
    expect(ids[0]).toBe('A1')
    expect(ids[11]).toBe('A12')
    expect(ids[12]).toBe('B1')
    expect(ids[95]).toBe('H12')
    expect(wellIdsFor(384)).toHaveLength(384)
    expect(wellIdsFor(384)[383]).toBe('P24')
  })
})

describe('buildPlateRows', () => {
  const rows = buildPlateRows(plate)

  it('emits one row per compound per well, skipping empty wells', () => {
    expect(rows.filter(r => r.well === 'A1')).toHaveLength(4)  // 3 reagents + fill-up
    expect(rows.some(r => r.well === 'A3')).toBe(false)
  })

  it('preserves the five things the export exists for', () => {
    const r = rows.find(r => r.well === 'A1' && r.compound === 'K10 peptide')
    expect(r.well).toBe('A1')            // well identity
    expect(r.compound).toBe('K10 peptide') // compound name
    expect(r.stock_conc).toBe(10)        // stock concentration
    expect(r.stock_unit).toBe('mM')
    expect(r.volume_ul).toBe(40)         // pipetted volume
    expect(r.final_conc).toBe(5)         // concentration reached
  })

  it('writes numbers as numbers, not strings', () => {
    for (const r of rows) {
      for (const k of ['volume_ul', 'well_total_ul', 'column']) {
        if (r[k] !== null) expect(typeof r[k]).toBe('number')
      }
    }
  })

  it('computes the final concentration on the real total, fill-up included', () => {
    // 10 mM x 40 µL / 80 µL = 5 mM — only correct if the buffer fill-up counted.
    expect(rows.find(r => r.well === 'A1' && r.code === 'C1').final_conc).toBe(5)
    expect(rows.find(r => r.well === 'A1' && r.role === 'fill-up').volume_ul).toBe(4)
  })

  it('labels the fill-up by its own name rather than calling everything water', () => {
    const f = rows.find(r => r.well === 'A1' && r.role === 'fill-up')
    expect(f.compound).toBe('MOPS pH 7')
  })

  it('includes unlinked volumes and flags them instead of dropping them', () => {
    const u = rows.find(r => r.well === 'B2' && r.compound === 'EDC')
    expect(u.role).toBe('unlinked')
    expect(u.volume_ul).toBe(4)
    expect(u.linked_to_inventory).toBe('no')
  })

  it('carries the inventory id so a row can be traced back to a bottle', () => {
    expect(rows.find(r => r.code === 'C3').inventory_id).toBe('inv-C3')
  })

  it('returns nothing for an empty or missing plate', () => {
    expect(buildPlateRows({ format: 96, wells: {} })).toEqual([])
    expect(buildPlateRows(null)).toEqual([])
    expect(buildPlateRows({ format: 96, wells: { A1: '   ' } })).toEqual([])
  })
})

describe('buildWellSummary', () => {
  it('totals each well and compares it against the design volume', () => {
    const s = buildWellSummary(plate)
    const a1 = s.find(r => r.well === 'A1')
    expect(a1.total_ul).toBe(80)
    expect(a1.design_volume_ul).toBe(80)
    expect(a1.overfilled).toBe('no')
    expect(a1.components).toBe(3)
  })

  it('reports unlinked volume separately from the total', () => {
    const b2 = buildWellSummary(plate).find(r => r.well === 'B2')
    expect(b2.total_ul).toBe(76)      // 30 + 46, EDC excluded
    expect(b2.unlinked_ul).toBe(4)
  })

  it('flags a well that exceeds its design volume', () => {
    const over = buildWellSummary({
      format: 96, targetVolume: 50,
      wells: { A1: linked('C1', 'X', 100, 'mM', '60.00', 10) },
    })
    expect(over[0].overfilled).toBe('yes')
  })

  it('says nothing about overfill when no design volume was set', () => {
    const s = buildWellSummary({ format: 96, wells: { A1: WELL_A1 } })
    expect(s[0].overfilled).toBe('')
    expect(s[0].design_volume_ul).toBeNull()
  })
})

describe('buildPlateGrid', () => {
  it('is a full rectangle with row letters and column numbers', () => {
    const g = buildPlateGrid(plate)
    expect(g).toHaveLength(9)          // header + 8 rows
    expect(g[0]).toHaveLength(13)      // corner + 12 columns
    expect(g[0][1]).toBe(1)
    expect(g[1][0]).toBe('A')
    expect(g[8][0]).toBe('H')
  })

  it('describes a filled well and leaves empty ones blank', () => {
    const g = buildPlateGrid(plate)
    expect(g[1][1]).toContain('K10 peptide 40 µL (5 mM)')
    expect(g[1][2]).toBe('')
  })
})

describe('plateToYaml', () => {
  const yaml = plateToYaml(plate, { exportedAt: '2026-08-11T10:00:00Z' })

  it('records the plate header', () => {
    expect(yaml).toContain('name: "Coacervate screen 3"')
    expect(yaml).toContain('format: 96')
    expect(yaml).toContain('design_volume_ul: 80')
  })

  it('keys wells by id and nests their components', () => {
    expect(yaml).toContain('  A1:')
    expect(yaml).toContain('total_volume_ul: 80')
    expect(yaml).toContain('- name: "K10 peptide"')
    expect(yaml).toContain('stock_conc: 10')
    expect(yaml).toContain('volume_ul: 40')
    expect(yaml).toContain('final_conc: 5')
  })

  it('records the fill-up under its own name', () => {
    expect(yaml).toContain('fill_up:')
    expect(yaml).toContain('name: "MOPS pH 7"')
  })

  it('records unlinked volumes with the reason they are not in the total', () => {
    expect(yaml).toContain('unlinked:')
    expect(yaml).toContain('- name: "EDC"')
    expect(yaml).toContain('excluded from total')
  })

  it('quotes every string, so a compound named NO stays a string', () => {
    // Unquoted, YAML 1.1 reads NO as false and 1.5 as a number.
    const y = plateToYaml({
      format: 96,
      wells: { A1: linked('C1', 'NO', 100, 'mM', '10.00', 5) },
    })
    expect(y).toContain('- name: "NO"')
    expect(y).not.toMatch(/- name: NO\s*$/m)
  })

  it('escapes quotes and backslashes rather than breaking the document', () => {
    const y = plateToYaml({
      format: 96,
      wells: { A1: linked('C1', 'a "quoted" C:\\path', 100, 'mM', '10.00', 5) },
    })
    expect(y).toContain('\\"quoted\\"')
    expect(y).toContain('C:\\\\path')
  })

  it('round-trips through a parser back into the values that went in', () => {
    // Parsed with parseSubsetYaml below rather than a library, because no YAML
    // parser is installed here and a test that quietly skips itself is worse
    // than no test — it reads as coverage while asserting nothing.
    const doc = parseSubsetYaml(yaml)
    expect(doc.plate.name).toBe('Coacervate screen 3')
    expect(doc.plate.format).toBe(96)
    expect(doc.plate.design_volume_ul).toBe(80)
    expect(doc.wells.A1.total_volume_ul).toBe(80)
    expect(doc.wells.A1.components).toHaveLength(3)
    expect(doc.wells.A1.components[0]).toMatchObject({
      name: 'K10 peptide', code: 'C1', stock_conc: 10, stock_unit: 'mM',
      volume_ul: 40, final_conc: 5, final_unit: 'mM',
    })
    expect(doc.wells.A1.fill_up).toEqual({ name: 'MOPS pH 7', volume_ul: 4 })
    expect(doc.wells.B2.unlinked[0].name).toBe('EDC')
    expect(doc.wells.B2.unlinked[0].volume_ul).toBe(4)
  })

  it('round-trips a name that would break a naive emitter', () => {
    const nasty = 'NO: "1.5" #comment \\ end'
    const doc = parseSubsetYaml(plateToYaml({
      format: 96, wells: { A1: linked('C1', nasty, 10, 'mM', '10.00', 1) },
    }))
    expect(doc.wells.A1.components[0].name).toBe(nasty)
  })

  it('produces a document even when the plate is empty', () => {
    const y = plateToYaml({ name: 'Empty', format: 96, wells: {} })
    expect(y).toContain('wells:')
    expect(y.trimEnd().endsWith('{}')).toBe(true)
  })
})

describe('plateExportFilename', () => {
  it('keeps the plate name but makes it safe', () => {
    expect(plateExportFilename({ name: 'Coacervate screen 3' }, 'xlsx', '2026-08-11'))
      .toBe('Coacervate-screen-3_2026-08-11.xlsx')
  })

  it('strips characters a filesystem or a shell would choke on', () => {
    expect(plateExportFilename({ name: 'a/b\\c:d*?"<>|' }, 'yaml')).toBe('a-b-c-d.yaml')
  })

  it('falls back rather than producing a nameless file', () => {
    expect(plateExportFilename({ name: '///' }, 'xlsx')).toBe('plate.xlsx')
    expect(plateExportFilename(null, 'yaml')).toBe('plate.yaml')
  })
})

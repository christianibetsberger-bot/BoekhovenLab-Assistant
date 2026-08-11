import { describe, it, expect } from 'vitest'
import * as XLSX from 'xlsx'
import { buildPlateRows, buildWellSummary, buildPlateGrid } from './plateExport'

const chip = (code, name, stock, unit) =>
  `<span class="inv-ref" data-inv-id="inv-${code}" data-labware="">[${code}] ${name} (${stock} ${unit})</span>`
const linked = (code, name, stock, unit, vol, conc) =>
  `&nbsp;${chip(code, name, stock, unit)}&nbsp; ${vol} µL (${conc} ${unit})<br>`

const plate = {
  name: 'Coacervate screen 3', format: 96, targetVolume: 80,
  wells: {
    A1: linked('C1', 'K10 peptide', 10, 'mM', '40.00', 5)
      + linked('C2', 'pU RNA', 8, 'mM', '20.00', 2)
      + linked('C3', 'NaCl', 150, 'mM', '16.00', 30)
      + `<strong>MOPS pH 7:</strong> 4.00 µL<br>`,
    B2: linked('C1', 'K10 peptide', 10, 'mM', '30.00', 3.75)
      + `<strong>EDC:</strong> 4.00 µL (10 mM)<br>`
      + `<strong>MQ H₂O:</strong> 46.00 µL<br>`,
  },
}

describe('the workbook actually survives a write/read cycle', () => {
  it('reopens with its sheets, rows and numeric types intact', () => {
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(buildPlateRows(plate)), 'Wells')
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(buildWellSummary(plate)), 'Well summary')
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(buildPlateGrid(plate)), 'Plate map')

    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })
    const back = XLSX.read(buf, { type: 'buffer' })

    expect(back.SheetNames).toEqual(['Wells', 'Well summary', 'Plate map'])

    const wells = XLSX.utils.sheet_to_json(back.Sheets['Wells'])
    expect(wells).toHaveLength(7) // A1: 3 reagents + fill-up; B2: 1 reagent + fill-up + unlinked EDC
    const k10 = wells.find(r => r.well === 'A1' && r.compound === 'K10 peptide')
    expect(k10).toMatchObject({ stock_conc: 10, stock_unit: 'mM', volume_ul: 40, final_conc: 5 })
    for (const k of ['stock_conc', 'volume_ul', 'final_conc', 'well_total_ul', 'column']) {
      expect(typeof k10[k]).toBe('number')
    }

    const grid = XLSX.utils.sheet_to_json(back.Sheets['Plate map'], { header: 1 })
    expect(grid).toHaveLength(9)
    expect(grid[0]).toHaveLength(13)
    expect(grid[1][1]).toContain('K10 peptide 40 µL (5 mM)')

    const summary = XLSX.utils.sheet_to_json(back.Sheets['Well summary'])
    expect(summary.find(r => r.well === 'A1')).toMatchObject({ total_ul: 80, overfilled: 'no' })
  })
})

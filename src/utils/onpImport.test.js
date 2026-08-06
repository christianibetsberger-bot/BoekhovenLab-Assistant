import { describe, it, expect } from 'vitest'
import { parseOnp } from './onpImport'
import { parseWellHtml, buildWellHtml, withFinalConcentrations, totalVolume,
         collectPlateStocks, applyStockToPlate } from './wellComposition'

// A minimal .onp in exactly the shape WellPlateEditor's exporters write: one target
// plate, a water source and two reagent sources, with the reagent identity carried by
// step 0's labwareStates.
function makeOnp({ targetUuid = '201812181400', plateName = 'Plate 1', transfers, reagents } = {}) {
  const labwares = [{ ref: 'TARGET', name: plateName, labware: { uuid: targetUuid } }]
  const labwareStates = { TARGET: { labwareRef: 'TARGET', cavityStates: {}, inError: false } }
  const reagentList = []
  reagents.forEach(r => {
    labwares.push({ ref: r.labwareRef, name: r.name, labware: { uuid: r.labwareUuid || 'SRC-UUID' } })
    reagentList.push({ isReagent: true, ref: r.reagentRef, reagent: {
      uuid: 'u-' + r.reagentRef, name: r.name,
      concentrationValue: r.conc, concentrationUnit: r.unit, color: 1, sample: false } })
    labwareStates[r.labwareRef] = {
      labwareRef: r.labwareRef,
      cavityStates: { '1-1': { cavity: { row: 1, column: 1 }, solution: {
        volume: { value: 100, unit: 'uL' },
        content: { [r.reagentRef]: { reagentRef: r.reagentRef, volume: { value: 100, unit: 'uL' } } } } } },
      inError: false,
    }
  })
  const steps = [{ index: 0, state: { labwareStates, errors: [], warnings: [] }, ref: 'step0' }]
  transfers.forEach((t, i) => steps.push({
    index: i + 1, actionTypeId: 'PIPETTING',
    action: {
      type: 'PIPETTING',
      sources: [{ labwareRef: t.labwareRef, cavities: [{ row: 1, column: 1 }] }],
      destinations: [{ labwareRef: t.target || 'TARGET', cavities: t.cavities }],
      params: { volume: { value: t.volume, unit: 'uL' } },
    },
    ref: 'step' + (i + 1),
  }))
  return { name: 'Test protocol', steps, labwares, reagents: reagentList, version: '1.2.0' }
}

const REAGENTS = [
  { labwareRef: 'L_WATER', reagentRef: 'R_WATER', name: 'Water', conc: '1.000', unit: 'au' },
  { labwareRef: 'L_A', reagentRef: 'R_A', name: 'Thioglycerin', conc: '200.000', unit: 'mM' },
  { labwareRef: 'L_B', reagentRef: 'R_B', name: 'RG3D', conc: '100.000', unit: 'uM' },
]

describe('parseOnp', () => {
  it('rebuilds wells, volumes and stock concentrations from a protocol', () => {
    const onp = makeOnp({ transfers: [
      { labwareRef: 'L_WATER', volume: 30, cavities: [{ row: 1, column: 1 }, { row: 2, column: 3 }] },
      { labwareRef: 'L_A', volume: 12.5, cavities: [{ row: 1, column: 1 }] },
      { labwareRef: 'L_B', volume: 7.5, cavities: [{ row: 1, column: 1 }] },
    ], reagents: REAGENTS })

    const { plates } = parseOnp(onp)
    expect(plates).toHaveLength(1)
    expect(plates[0].format).toBe(96)
    expect(Object.keys(plates[0].wells).sort()).toEqual(['A1', 'B3'])

    const a1 = plates[0].wells.A1
    expect(a1.find(e => e.name === 'Thioglycerin')).toMatchObject({ stock: 200, unit: 'mM', volume: 12.5 })
    // "uM" in the file is the app's "µM"
    expect(a1.find(e => e.name === 'RG3D')).toMatchObject({ stock: 100, unit: 'µM', volume: 7.5 })
    expect(a1.find(e => e.kind === 'water')).toMatchObject({ volume: 30 })
    expect(totalVolume(a1)).toBe(50)
  })

  it('reports the concentration actually reached, not the intended one', () => {
    // 12.5 µL of a 200 mM stock in 50 µL total = 50 mM
    const onp = makeOnp({ transfers: [
      { labwareRef: 'L_WATER', volume: 37.5, cavities: [{ row: 1, column: 1 }] },
      { labwareRef: 'L_A', volume: 12.5, cavities: [{ row: 1, column: 1 }] },
    ], reagents: REAGENTS })
    const rows = withFinalConcentrations(parseOnp(onp).plates[0].wells.A1)
    expect(rows.find(e => e.name === 'Thioglycerin').final).toBeCloseTo(50, 9)
  })

  it('an overfilled well reports weaker concentrations, computed on the real total', () => {
    // The same 12.5 µL of 200 mM, but the well received 75 µL in total, not 50.
    const onp = makeOnp({ transfers: [
      { labwareRef: 'L_WATER', volume: 62.5, cavities: [{ row: 1, column: 1 }] },
      { labwareRef: 'L_A', volume: 12.5, cavities: [{ row: 1, column: 1 }] },
    ], reagents: REAGENTS })
    const a1 = parseOnp(onp).plates[0].wells.A1
    expect(totalVolume(a1)).toBe(75)
    const thio = withFinalConcentrations(a1).find(e => e.name === 'Thioglycerin')
    expect(thio.final).toBeCloseTo(200 * 12.5 / 75, 9)   // 33.3 mM, not the intended 50
  })

  it('rejoins repeats the exporter split into rounds', () => {
    const onp = makeOnp({ transfers: [
      { labwareRef: 'L_A', volume: 5, cavities: [{ row: 1, column: 1 }] },
      { labwareRef: 'L_A', volume: 5, cavities: [{ row: 1, column: 1 }] },
    ], reagents: REAGENTS })
    const a1 = parseOnp(onp).plates[0].wells.A1
    expect(a1.filter(e => e.name === 'Thioglycerin')).toHaveLength(1)
    expect(a1[0].volume).toBe(10)
  })

  it('splits a grouped protocol into one plate per target labware', () => {
    const onp = makeOnp({ transfers: [
      { labwareRef: 'L_A', volume: 5, cavities: [{ row: 1, column: 1 }] },
      { labwareRef: 'L_B', volume: 5, target: 'TARGET2', cavities: [{ row: 2, column: 2 }] },
    ], reagents: REAGENTS })
    onp.labwares.push({ ref: 'TARGET2', name: 'Plate 2', labware: { uuid: '201901101700' } })

    const { plates } = parseOnp(onp)
    expect(plates).toHaveLength(2)
    const p2 = plates.find(p => p.name === 'Plate 2')
    expect(p2.format).toBe(384)
    expect(Object.keys(p2.wells)).toEqual(['B2'])
  })

  it('infers the plate format from the wells used when the UUID is unknown', () => {
    const onp = makeOnp({ targetUuid: 'unknown-uuid', transfers: [
      { labwareRef: 'L_A', volume: 5, cavities: [{ row: 12, column: 20 }] },
    ], reagents: REAGENTS })
    expect(parseOnp(onp).plates[0].format).toBe(384)
  })

  it('re-links compounds to inventory by name', () => {
    const onp = makeOnp({ transfers: [
      { labwareRef: 'L_A', volume: 5, cavities: [{ row: 1, column: 1 }] },
    ], reagents: REAGENTS })
    const inventory = [{ id: 'inv-1', code: 'CTI-126-12', name: 'Thioglycerin', stock: 200, stockUnit: 'mM' }]
    const e = parseOnp(onp, { inventory }).plates[0].wells.A1[0]
    expect(e.invId).toBe('inv-1')
    expect(e.code).toBe('CTI-126-12')
  })

  it('refuses a file that is not a protocol', () => {
    expect(() => parseOnp(null)).toThrow()
    expect(() => parseOnp({ steps: [], labwares: [] })).toThrow()
  })
})

describe('round trip: onp -> entries -> well html -> entries', () => {
  it('preserves compound, stock and volume through the HTML the editor stores', () => {
    const onp = makeOnp({ transfers: [
      { labwareRef: 'L_WATER', volume: 30, cavities: [{ row: 1, column: 1 }] },
      { labwareRef: 'L_A', volume: 12.5, cavities: [{ row: 1, column: 1 }] },
      { labwareRef: 'L_B', volume: 7.5, cavities: [{ row: 1, column: 1 }] },
    ], reagents: REAGENTS })

    const entries = parseOnp(onp).plates[0].wells.A1
    const html = buildWellHtml(entries, { targetVolume: 50 })
    const back = parseWellHtml(html)

    const thio = back.find(e => e.name === 'Thioglycerin')
    expect(thio).toMatchObject({ stock: 200, unit: 'mM', volume: 12.5 })
    expect(back.find(e => e.name === 'RG3D')).toMatchObject({ stock: 100, unit: 'µM', volume: 7.5 })
    expect(back.find(e => e.kind === 'water').volume).toBe(30)
    expect(totalVolume(back)).toBe(50)
  })

  it('keeps the volume readable by the .onp exporter regex after the final-concentration note', () => {
    // The exporter takes the FIRST "number µL" in the text following a chip; the
    // "→ x mM" annotation must not shadow it.
    const html = buildWellHtml([
      { kind: 'reagent', name: 'Thioglycerin', code: 'C1', stock: 200, unit: 'mM', volume: 12.5 },
      { kind: 'water', name: 'MQ H₂O', volume: 37.5 },
    ], { targetVolume: 50 })
    expect(html).toMatch(/→/)                       // the annotation is present
    const after = html.split('</span>')[1] || ''
    expect(after).toMatch(/([\d.]+)\s*µL/)
    expect(after.match(/([\d.]+)\s*µL/)[1]).toBe('12.50')
  })

  it('an overfilled well is marked as such in the html', () => {
    const html = buildWellHtml([
      { kind: 'reagent', name: 'A', stock: 100, unit: 'mM', volume: 40 },
      { kind: 'water', name: 'MQ H₂O', volume: 35 },
    ], { targetVolume: 50 })
    expect(html).toContain('Σ 75.00 µL of 50 µL')
    expect(html).toContain('overfilled')
  })
})

describe('plate-wide stock assignment', () => {
  const plateWells = () => ({
    A1: buildWellHtml([
      { kind: 'reagent', name: 'EDC', stock: 100, unit: 'mM', volume: 5 },
      { kind: 'reagent', name: 'Thioglycerin', stock: 200, unit: 'mM', volume: 10 },
      { kind: 'water', name: 'MQ H₂O', volume: 35 },
    ]),
    A2: buildWellHtml([
      { kind: 'reagent', name: 'EDC', stock: 100, unit: 'mM', volume: 7.5 },
      { kind: 'water', name: 'MQ H₂O', volume: 42.5 },
    ]),
  })

  it('lists each compound with the wells it appears in', () => {
    const stocks = collectPlateStocks(plateWells())
    const edc = stocks.find(s => s.name === 'EDC')
    expect(edc.wells.sort()).toEqual(['A1', 'A2'])
    expect(edc.stock).toBe(100)
    expect(edc.totalVolume).toBe(12.5)
    expect(edc.mixedStock).toBe(false)
  })

  it('flags a compound whose stock differs between wells', () => {
    const wells = plateWells()
    wells.A2 = buildWellHtml([{ kind: 'reagent', name: 'EDC', stock: 250, unit: 'mM', volume: 7.5 }])
    expect(collectPlateStocks(wells).find(s => s.name === 'EDC').mixedStock).toBe(true)
  })

  it('links one compound to an inventory item across every well', () => {
    const inv = { id: 'inv-edc', code: 'CTI-130-EDC', name: 'EDC', stock: 100, stockUnit: 'mM' }
    const { wells, wellsChanged, entriesChanged } = applyStockToPlate(
      plateWells(), 'name:edc', { inv }, { inventory: [inv] })
    expect(wellsChanged).toBe(2)
    expect(entriesChanged).toBe(2)
    expect(wells.A1).toContain('data-inv-id="inv-edc"')
    expect(wells.A1).toContain('CTI-130-EDC')
    // the other compound in the same well is untouched
    expect(parseWellHtml(wells.A1).find(e => e.name === 'Thioglycerin')).toMatchObject({ stock: 200, volume: 10 })
  })

  it('corrects the stock plate-wide and recomputes what each well actually holds', () => {
    const { wells } = applyStockToPlate(plateWells(), 'name:edc', { stock: 250, unit: 'mM' })
    const a1 = withFinalConcentrations(parseWellHtml(wells.A1))
    const a2 = withFinalConcentrations(parseWellHtml(wells.A2))
    expect(a1.find(e => e.name === 'EDC')).toMatchObject({ stock: 250, volume: 5 })
    // A1 totals 50 µL, A2 totals 50 µL — same stock, different volume, different result
    expect(a1.find(e => e.name === 'EDC').final).toBeCloseTo(250 * 5 / 50, 9)
    expect(a2.find(e => e.name === 'EDC').final).toBeCloseTo(250 * 7.5 / 50, 9)
  })

  it("keeps a well's own recorded stock when linking inventory", () => {
    const wells = { A1: buildWellHtml([{ kind: 'reagent', name: 'EDC', stock: 250, unit: 'mM', volume: 5 }]) }
    const inv = { id: 'inv-edc', code: 'C1', name: 'EDC', stock: 100, stockUnit: 'mM' }
    const res = applyStockToPlate(wells, 'name:edc', { inv }, { inventory: [inv] })
    // 250 was what went into the well; the bottle saying 100 today does not rewrite history
    expect(parseWellHtml(res.wells.A1)[0].stock).toBe(250)
  })
})

import { describe, it, expect } from 'vitest'
import { readAiTargetWell, inferScreenFromPlate, readPlateWells, syntheticSampleId, levelSpacing } from './phaseWellMapping'
import { buildWellHtml } from './wellComposition'
import { convertConcentration } from './units'

// A well exactly as PhasePredictor's "Send to plate" writes it.
const targetWell = (sampleId, [a, b, c], d = null) => `<strong style="color: var(--primary);">AI Target [${sampleId}]</strong><br>
  &nbsp;<span class="inv-ref" data-inv-id="i1">[C1] Peptide (100 µM)</span>&nbsp; 5.50 µL (${a} mM)<br>
  &nbsp;<span class="inv-ref" data-inv-id="i2">[C2] RNA (100 µM)</span>&nbsp; 6.50 µL (${b} mM)<br>
  &nbsp;<span class="inv-ref" data-inv-id="i3">[C3] NaCl (1000 mM)</span>&nbsp; 7.50 µL (${c} mM)<br>
  ${d === null ? '' : `&nbsp;<span class="inv-ref" data-inv-id="i4">[C4] EDC (100 mM)</span>&nbsp; 2.00 µL (${d} mM)<br>`}
  <strong>Buffer:</strong> 4.00 µL (10 mM)<br>
  <strong>MQ H₂O:</strong> 30.00 µL<br>`

const INVENTORY = [
  { id: 'i1', code: 'C1', name: 'Peptide', stock: 100, stockUnit: 'µM' },
  { id: 'i2', code: 'C2', name: 'RNA', stock: 100, stockUnit: 'µM' },
  { id: 'i3', code: 'C3', name: 'NaCl', stock: 1000, stockUnit: 'mM' },
  { id: 'i4', code: 'C4', name: 'EDC', stock: 100, stockUnit: 'mM' },
]

// A well as the .onp importer writes it: chip, volume pipetted, and the
// concentration the compound REACHES — no sample id, no target concentration.
const onpWell = (entries) => buildWellHtml(entries, { inventory: INVENTORY, showFinal: true })

// Shorthand: a well of 50 µL made of the named compounds at the given volumes.
const reagent = (id, name, stock, unit, volume) => ({ kind: 'reagent', invId: id, code: '', name, stock, unit, volume })
const well = (...entries) => {
  const used = entries.reduce((s, e) => s + e.volume, 0)
  return onpWell([...entries, { kind: 'water', name: 'MQ H₂O', volume: 50 - used }])
}

const COMPONENTS = [
  { key: 'anion',  invId: '', name: 'Compound A', unit: 'mM' },
  { key: 'cation', invId: '', name: 'Compound B', unit: 'mM' },
  { key: 'salt',   invId: '', name: 'Compound C', unit: 'mM' },
  { key: 'compD',  invId: '', name: 'Compound D', unit: 'mM' },
]

describe('readAiTargetWell', () => {
  it('reads the sample id and the three target concentrations', () => {
    expect(readAiTargetWell(targetWell(9001, [1.5, 2.5, 30]))).toMatchObject({
      sampleId: 9001, anion: 1.5, cation: 2.5, salt: 30, compD: 0, source: 'target',
    })
  })

  it('reads the fourth component only when the screen has one', () => {
    const linked = [...COMPONENTS.slice(0, 3), { key: 'compD', invId: 'i4', name: 'EDC', unit: 'mM' }]
    const html = targetWell(9002, [1, 2, 3], 0.4)
    expect(readAiTargetWell(html).compD).toBe(0)
    expect(readAiTargetWell(html, { hasD: true, components: linked }).compD).toBe(0.4)
  })

  it('does not mistake a constant for component D', () => {
    // D is switched on in the screen, but this plate was sent before it was — the
    // fourth "µL (x mM)" pair is the buffer constant, and D's compound is absent.
    const linked = [...COMPONENTS.slice(0, 3), { key: 'compD', invId: 'i4', name: 'EDC', unit: 'mM' }]
    expect(readAiTargetWell(targetWell(9003, [1, 2, 3]), { hasD: true, components: linked }).compD).toBe(0)
  })

  it('reads a condition replated out of the phase map', () => {
    // "Replate one phase" stamps `Sample [id] · <phase>` rather than "AI Target",
    // because the condition was measured, not proposed — but it must still come
    // back with its identity when the new plate is read again.
    const replated = targetWell(9007, [1, 2, 3]).replace('AI Target [9007]', 'Sample [9007] · Transient coacervate')
    expect(readAiTargetWell(replated)).toMatchObject({ sampleId: 9007, anion: 1, cation: 2, salt: 3 })
  })

  it('is null for a well that was not written by Send to plate', () => {
    expect(readAiTargetWell(well(reagent('i1', 'Peptide', 100, 'µM', 5)))).toBeNull()
    expect(readAiTargetWell('')).toBeNull()
  })
})

describe('inferScreenFromPlate', () => {
  // Peptide and RNA are dosed differently well to well; NaCl goes in at 5 µL
  // everywhere. That makes two axes and one constant — without anything having
  // been declared up front.
  const plate = {
    A1: well(reagent('i1', 'Peptide', 100, 'µM', 2), reagent('i2', 'RNA', 100, 'µM', 1), reagent('i3', 'NaCl', 1000, 'mM', 5)),
    A2: well(reagent('i1', 'Peptide', 100, 'µM', 4), reagent('i2', 'RNA', 100, 'µM', 1), reagent('i3', 'NaCl', 1000, 'mM', 5)),
    A3: well(reagent('i1', 'Peptide', 100, 'µM', 6), reagent('i2', 'RNA', 100, 'µM', 3), reagent('i3', 'NaCl', 1000, 'mM', 5)),
  }

  it('makes an axis of what varies and a constant of what does not', () => {
    const inf = inferScreenFromPlate(plate, { components: COMPONENTS, plateId: 'p1' })
    expect(inf.screened.map(s => [s.slot, s.name])).toEqual([['anion', 'Peptide'], ['cation', 'RNA']])
    expect(inf.constants.map(c => c.name)).toEqual(['NaCl'])
    expect(inf.wellCount).toBe(3)
  })

  it('assigns the axes in the order they were pipetted', () => {
    const reversed = {
      A1: well(reagent('i2', 'RNA', 100, 'µM', 1), reagent('i1', 'Peptide', 100, 'µM', 2)),
      A2: well(reagent('i2', 'RNA', 100, 'µM', 3), reagent('i1', 'Peptide', 100, 'µM', 4)),
    }
    const inf = inferScreenFromPlate(reversed, { components: COMPONENTS })
    expect(inf.screened.map(s => s.name)).toEqual(['RNA', 'Peptide'])
  })

  it('a component already linked to inventory keeps its own slot', () => {
    // The screen says C is NaCl-the-inventory-item, so NaCl lands on C even
    // though it was pipetted third and would otherwise have taken the next slot.
    const varyingSalt = {
      A1: well(reagent('i1', 'Peptide', 100, 'µM', 2), reagent('i2', 'RNA', 100, 'µM', 1), reagent('i3', 'NaCl', 1000, 'mM', 1)),
      A2: well(reagent('i1', 'Peptide', 100, 'µM', 4), reagent('i2', 'RNA', 100, 'µM', 3), reagent('i3', 'NaCl', 1000, 'mM', 5)),
    }
    const linked = [{ key: 'salt', invId: 'i3', name: 'NaCl', unit: 'mM' }, ...COMPONENTS.filter(c => c.key !== 'salt')]
    const inf = inferScreenFromPlate(varyingSalt, { components: linked })
    expect(inf.screened.find(s => s.slot === 'salt').name).toBe('NaCl')
    expect(inf.screened.find(s => s.slot === 'anion').name).toBe('Peptide')
  })

  it('a compound missing from some wells is an axis, not a constant', () => {
    const sometimes = {
      A1: well(reagent('i1', 'Peptide', 100, 'µM', 5), reagent('i4', 'EDC', 100, 'mM', 2)),
      A2: well(reagent('i1', 'Peptide', 100, 'µM', 5)),
    }
    const inf = inferScreenFromPlate(sometimes, { components: COMPONENTS })
    expect(inf.screened.map(s => s.name)).toContain('EDC')
    expect(inf.screened.find(s => s.name === 'EDC').inEveryWell).toBe(false)
    expect(inf.wells.A2.cation).toBe(0)     // absent means zero, not missing
  })

  it('the same volume from a different stock is still an axis', () => {
    const restocked = {
      A1: well(reagent('i1', 'Peptide', 100, 'µM', 5), reagent('i3', 'NaCl', 1000, 'mM', 5)),
      A2: well(reagent('i1', 'Peptide', 200, 'µM', 5), reagent('i3', 'NaCl', 1000, 'mM', 5)),
    }
    const inf = inferScreenFromPlate(restocked, { components: COMPONENTS })
    expect(inf.screened.map(s => s.name)).toEqual(['Peptide'])
    expect(inf.constants.map(c => c.name)).toEqual(['NaCl'])
  })

  it('reports the levels an axis was screened at, so the search space can be fitted to them', () => {
    const inf = inferScreenFromPlate(plate, { components: COMPONENTS })
    const peptide = inf.screened.find(s => s.name === 'Peptide')
    // 2, 4 and 6 µL of 100 µM into 50 µL → 4, 8 and 12 µM → 0.004…0.012 mM
    expect(peptide.levels).toEqual([0.004, 0.008, 0.012])
    expect(peptide.step).toBeCloseTo(0.004, 9)
    expect(peptide.stock).toBeCloseTo(0.1, 9)     // 100 µM stock, stated in mM
    expect(peptide.nativeUnit).toBe('µM')
  })

  it('reports the concentration each axis actually reaches, in the screen unit', () => {
    const inf = inferScreenFromPlate(plate, { components: COMPONENTS })
    // 100 µM · 6/50 = 12 µM = 0.012 mM
    expect(inf.wells.A3.anion).toBeCloseTo(0.012, 9)
    const peptide = inf.screened.find(s => s.name === 'Peptide')
    expect(peptide.unit).toBe('mM')
    expect(peptide.min).toBeCloseTo(0.004, 9)
    expect(peptide.max).toBeCloseTo(0.012, 9)
  })

  it('adds up a compound that was pipetted in two steps', () => {
    const twice = {
      A1: well(reagent('i1', 'Peptide', 100, 'µM', 5), reagent('i1', 'Peptide', 200, 'µM', 5)),
      A2: well(reagent('i1', 'Peptide', 100, 'µM', 1)),
    }
    // 100·5/50 + 200·5/50 = 30 µM = 0.03 mM
    expect(inferScreenFromPlate(twice, { components: COMPONENTS }).wells.A1.anion).toBeCloseTo(0.03, 9)
  })

  it('says so when more compounds vary than there are slots', () => {
    const five = {}
    for (let i = 1; i <= 2; i++) {
      five[`A${i}`] = well(
        reagent('a', 'One', 100, 'mM', i), reagent('b', 'Two', 100, 'mM', i + 1),
        reagent('c', 'Three', 100, 'mM', i + 2), reagent('d', 'Four', 100, 'mM', i + 3),
        reagent('e', 'Five', 100, 'mM', i + 4))
    }
    const inf = inferScreenFromPlate(five, { components: COMPONENTS })
    expect(inf.screened).toHaveLength(4)
    expect(inf.unmapped.map(c => c.name)).toEqual(['Five'])
  })

  it('keeps a compound in its own unit rather than rescaling across dimensions', () => {
    const massUnit = {
      A1: well(reagent('i2', 'RNA', 2, 'mg/mL', 5)),
      A2: well(reagent('i2', 'RNA', 2, 'mg/mL', 10)),
    }
    const inf = inferScreenFromPlate(massUnit, { components: COMPONENTS })
    expect(inf.unitClashes).toEqual([{ slot: 'anion', name: 'RNA', from: 'mg/mL', to: 'mM' }])
    expect(inf.screened[0].unit).toBe('mg/mL')
    expect(inf.wells.A2.anion).toBeCloseTo(0.4, 9)   // 2 mg/mL · 10/50
    expect(convertConcentration(1, 'mg/mL', 'mM')).toBeNull()
  })

  it('reports the fill-up and the well volume, so a replated well can be made the same way', () => {
    const inf = inferScreenFromPlate(plate, { components: COMPONENTS })
    expect(inf.fillup).toMatchObject({ kind: 'water', name: 'MQ H₂O', inEveryWell: true })
    expect(inf.wellVolume).toMatchObject({ min: 50, max: 50, uniform: true })
  })

  it('says the well totals differ rather than picking one', () => {
    const ragged = {
      A1: onpWell([reagent('i1', 'Peptide', 100, 'µM', 5), { kind: 'water', name: 'MQ H₂O', volume: 45 }]),
      A2: onpWell([reagent('i1', 'Peptide', 100, 'µM', 10), { kind: 'water', name: 'MQ H₂O', volume: 30 }]),
    }
    const inf = inferScreenFromPlate(ragged, { components: COMPONENTS })
    expect(inf.wellVolume).toMatchObject({ min: 40, max: 50, uniform: false })
  })

  it('has no fill-up to report when none was pipetted', () => {
    const dry = {
      A1: onpWell([reagent('i1', 'Peptide', 100, 'µM', 5)]),
      A2: onpWell([reagent('i1', 'Peptide', 100, 'µM', 10)]),
    }
    expect(inferScreenFromPlate(dry, { components: COMPONENTS }).fillup).toBeNull()
  })

  it('carries the stock of a constant, and admits when there is none', () => {
    const inf = inferScreenFromPlate(plate, { components: COMPONENTS })
    expect(inf.constants[0]).toMatchObject({ name: 'NaCl', stock: 1000, unit: 'mM' })

    const noStock = {
      A1: onpWell([reagent('i1', 'Peptide', 100, 'µM', 2), { kind: 'reagent', invId: '', name: 'Dye', stock: null, unit: '', volume: 1 }, { kind: 'water', name: 'MQ H₂O', volume: 47 }]),
      A2: onpWell([reagent('i1', 'Peptide', 100, 'µM', 4), { kind: 'reagent', invId: '', name: 'Dye', stock: null, unit: '', volume: 1 }, { kind: 'water', name: 'MQ H₂O', volume: 45 }]),
    }
    const dye = inferScreenFromPlate(noStock, { components: COMPONENTS }).constants.find(c => c.name === 'Dye')
    expect(dye.stock).toBeNull()
  })

  it('is null when nothing in the plate varies', () => {
    const identical = {
      A1: well(reagent('i1', 'Peptide', 100, 'µM', 5), reagent('i3', 'NaCl', 1000, 'mM', 5)),
      A2: well(reagent('i1', 'Peptide', 100, 'µM', 5), reagent('i3', 'NaCl', 1000, 'mM', 5)),
    }
    expect(inferScreenFromPlate(identical, { components: COMPONENTS })).toBeNull()
    expect(inferScreenFromPlate({}, { components: COMPONENTS })).toBeNull()
  })

  it('treats every compound as an axis when there is only one well to look at', () => {
    const single = { A1: well(reagent('i1', 'Peptide', 100, 'µM', 5), reagent('i3', 'NaCl', 1000, 'mM', 5)) }
    const inf = inferScreenFromPlate(single, { components: COMPONENTS })
    expect(inf.screened.map(s => s.name)).toEqual(['Peptide', 'NaCl'])
    expect(inf.constants).toEqual([])
  })

  it('derives a stable sample id from the plate and the well', () => {
    const a = syntheticSampleId('plate-1', 'A1')
    expect(a).toBe(syntheticSampleId('plate-1', 'A1'))
    expect(a).not.toBe(syntheticSampleId('plate-1', 'A2'))
    expect(a).not.toBe(syntheticSampleId('plate-2', 'A1'))
    expect(a).toBeGreaterThanOrEqual(100000)
    expect(a).toBeLessThan(900000)
  })
})

describe('levelSpacing', () => {
  it('reads the range and the step off an evenly spaced series', () => {
    expect(levelSpacing([0.02, 0.04, 0.06, 0.08])).toMatchObject({ min: 0.02, max: 0.08, step: 0.02 })
  })

  it('collapses float noise into one level', () => {
    const s = levelSpacing([0.012, 0.012000000000000002, 0.024])
    expect(s.levels).toEqual([0.012, 0.024])
    expect(s.step).toBeCloseTo(0.012, 9)
  })

  it('averages the spacing when the levels are uneven', () => {
    // Smallest gap 1, but four levels over 0–100: stepping by 1 would build a
    // suggestion grid of a hundred points across a screen that had four.
    const s = levelSpacing([0, 1, 10, 100])
    expect(s.step).toBeCloseTo(100 / 3, 3)   // rounded to six significant digits
    expect(s.min).toBe(0)
    expect(s.max).toBe(100)
  })

  it('will not cut the range finer than the cap, however many levels there were', () => {
    // A continuous gradient down a plate: 96 levels, and a suggestion grid built
    // on that step would be 96 points wide on this axis alone.
    const gradient = Array.from({ length: 96 }, (_, i) => i * 0.001)
    const s = levelSpacing(gradient)
    expect(s.levels).toHaveLength(96)          // the data is reported as measured
    expect(s.capped).toBe(true)
    expect((s.max - s.min) / s.step).toBeLessThanOrEqual(31.001)
    expect(levelSpacing([0, 1, 2, 3]).capped).toBe(false)
  })

  it('has no step to report for a single level', () => {
    expect(levelSpacing([5, 5, 5])).toMatchObject({ min: 5, max: 5, step: 0 })
  })

  it('is null when there is nothing to measure', () => {
    expect(levelSpacing([])).toBeNull()
    expect(levelSpacing([NaN, undefined])).toBeNull()
  })
})

describe('readPlateWells', () => {
  it('reads stamped wells as stamped and infers the rest', () => {
    const plate = {
      A1: targetWell(9001, [1.5, 2.5, 30]),
      A2: well(reagent('i2', 'RNA', 100, 'µM', 5)),
      A3: well(reagent('i2', 'RNA', 100, 'µM', 10)),
      A4: '<strong>Blank</strong><br>',
      A5: '',
    }
    const { wells, inference } = readPlateWells(plate, { components: COMPONENTS, plateId: 'p1' })
    expect(Object.keys(wells).sort()).toEqual(['A1', 'A2', 'A3'])
    expect(wells.A1.source).toBe('target')
    expect(wells.A1.sampleId).toBe(9001)
    expect(wells.A2.source).toBe('composition')
    expect(wells.A3.anion).toBeCloseTo(0.02, 9)
    expect(inference.screened.map(s => s.name)).toEqual(['RNA'])
  })

  it('does not read a numeric inventory code as a sample id', () => {
    // [123] is the compound's code, not a sample. Reading it as one would give
    // every well of the plate the same identity and collapse them onto one point.
    const numericCode = (vol) => buildWellHtml(
      [{ kind: 'reagent', invId: '', code: '123', name: 'Peptide', stock: 100, unit: 'µM', volume: vol },
       { kind: 'water', name: 'MQ H₂O', volume: 50 - vol }],
      { inventory: [], showFinal: true })
    const { wells } = readPlateWells({ A1: numericCode(5), A2: numericCode(10) }, { components: COMPONENTS, plateId: 'p1' })
    expect(Object.keys(wells)).toHaveLength(2)
    expect(wells.A1.sampleId).not.toBe(123)
    expect(wells.A1.sampleId).not.toBe(wells.A2.sampleId)
    expect(wells.A2.anion).toBeCloseTo(0.02, 9)
  })

  it('an .onp plate maps every well it filled — the case that used to map none', () => {
    const plate = {}
    for (let c = 1; c <= 12; c++) {
      plate[`A${c}`] = well(reagent('i1', 'Peptide', 100, 'µM', c), reagent('i3', 'NaCl', 1000, 'mM', 5))
    }
    const { wells, inference } = readPlateWells(plate, { components: COMPONENTS, plateId: 'p1' })
    expect(Object.keys(wells)).toHaveLength(12)
    expect(inference.screened.map(s => s.name)).toEqual(['Peptide'])
    expect(inference.constants.map(c => c.name)).toEqual(['NaCl'])
    expect(wells.A12.anion).toBeCloseTo(100 * 12 / 50 / 1000, 9)
    // Distinct wells get distinct points rather than collapsing onto one id.
    expect(new Set(Object.values(wells).map(w => w.sampleId)).size).toBe(12)
  })
})

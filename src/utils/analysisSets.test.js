import { describe, it, expect } from 'vitest'
import {
  BUILTIN_ANALYSIS_SETS, getAnalysisSetById, resolveParams,
  deriveHplcDnaRow, buildMatrix, timepointsOf, HPLC_DNA_DEFAULTS,
} from './analysisSets.js'
import { areaToMicromolar } from './hplcConcentration.js'
import { calcSeqExtinction } from './seqUtils.js'

describe('registry', () => {
  it('exposes the builtin HPLC-DNA set and looks it up by id', () => {
    const s = getAnalysisSetById('builtin:hplc-dna-heatmap')
    expect(s).toBeTruthy()
    expect(s.builtinKey).toBe('hplc-dna')
  })

  it('finds custom sets passed alongside the builtins', () => {
    const custom = { id: 'aset_x', kind: 'python', name: 'X' }
    expect(getAnalysisSetById('aset_x', [custom])).toBe(custom)
  })
})

describe('resolveParams', () => {
  it('overlays user values on the set defaults and coerces numbers', () => {
    const set = BUILTIN_ANALYSIS_SETS[0]
    const p = resolveParams(set, { productMin: '6.0', rMax_uM: '3' })
    expect(p.productMin).toBe(6.0)
    expect(p.rMax_uM).toBe(3)
    expect(p.scanMin).toBe(HPLC_DNA_DEFAULTS.scanMin) // untouched default
  })

  it('ignores blank/undefined overrides', () => {
    const p = resolveParams(BUILTIN_ANALYSIS_SETS[0], { productMin: '' })
    expect(p.productMin).toBe(HPLC_DNA_DEFAULTS.productMin)
  })
})

describe('deriveHplcDnaRow', () => {
  const result = {
    name: 'CTI-117_Aalpha_4h.txt',
    trace: { t: [], s: [] },
    peaks: [
      { rt: 3.0, area_mAU_min: 5.0 },   // building block
      { rt: 6.6, area_mAU_min: 2.0 },   // product (in default window 6.2–7.4)
      { rt: 6.9, area_mAU_min: 1.0 },   // product
    ],
  }
  const meta = { seqName: 'Aalpha', code: 'CTI-117', timeMin: 240, seqAB: 'ATCGATCG', seqABprime: 'CGATCGAT' }

  it('sums the product-window peaks and applies Beer-Lambert with product ε', () => {
    const row = deriveHplcDnaRow(result, meta, HPLC_DNA_DEFAULTS)
    const eps = calcSeqExtinction('ATCGATCG', 'DNA') + calcSeqExtinction('CGATCGAT', 'DNA')
    const beer = {
      pathLength_cm: HPLC_DNA_DEFAULTS.pathLength_cm, flow_mL_min: HPLC_DNA_DEFAULTS.flow_mL_min,
      injection_uL: HPLC_DNA_DEFAULTS.injection_uL, aliquot_uL: HPLC_DNA_DEFAULTS.aliquot_uL,
      vial_uL: HPLC_DNA_DEFAULTS.vial_uL, solventCorrection: HPLC_DNA_DEFAULTS.solventCorrection,
    }
    expect(row.epsilon).toBe(eps)
    expect(row.epsilonEstimated).toBe(false)
    expect(row.productArea_mAU_min).toBeCloseTo(3.0, 9) // 2 + 1
    expect(row.product_uM).toBeCloseTo(areaToMicromolar(3.0, eps, beer), 9)
    expect(row.row).toBe('A')
    expect(row.col).toBe('alpha')
    expect(row.timeMin).toBe(240)
  })

  it('classifies peaks by the product window', () => {
    const row = deriveHplcDnaRow(result, meta, HPLC_DNA_DEFAULTS)
    const classes = Object.fromEntries(row.peaks.map(p => [p.rt, p.peakClass]))
    expect(classes[3.0]).toBe('building_block')
    expect(classes[6.6]).toBe('product')
  })

  it('falls back to the default ε (flagged) when strands are unknown', () => {
    const row = deriveHplcDnaRow(result, { seqName: 'Aalpha', timeMin: 30 }, HPLC_DNA_DEFAULTS)
    expect(row.epsilon).toBe(HPLC_DNA_DEFAULTS.defaultEpsilon)
    expect(row.epsilonEstimated).toBe(true)
    expect(row.product_uM).toBeGreaterThan(0)
  })
})

describe('buildMatrix + timepointsOf', () => {
  const rows = [
    { row: 'A', col: 'alpha', timeMin: 30, conversion_pct: 40 },
    { row: 'A', col: 'beta', timeMin: 30, conversion_pct: 60 },
    { row: 'B', col: 'alpha', timeMin: 30, conversion_pct: 20 },
    { row: 'A', col: 'alpha', timeMin: 240, conversion_pct: 90 },
  ]

  it('lists distinct timepoints ascending', () => {
    expect(timepointsOf(rows)).toEqual([30, 240])
  })

  it('pivots into a z-grid filtered by timepoint', () => {
    const m = buildMatrix(rows, { value: 'conversion_pct', timeMin: 30 })
    expect(m.y).toEqual(['A', 'B'])
    expect(m.x).toEqual(['alpha', 'beta'])
    expect(m.xLabels).toEqual(['α', 'β'])
    // A/alpha = 40, A/beta = 60, B/alpha = 20, B/beta = missing
    expect(m.z[0][0]).toBe(40)
    expect(m.z[0][1]).toBe(60)
    expect(m.z[1][0]).toBe(20)
    expect(m.z[1][1]).toBeNull()
  })

  it('averages replicate cells', () => {
    const dup = [
      { row: 'A', col: 'alpha', timeMin: 30, conversion_pct: 40 },
      { row: 'A', col: 'alpha', timeMin: 30, conversion_pct: 60 },
    ]
    const m = buildMatrix(dup, { value: 'conversion_pct', timeMin: 30 })
    expect(m.z[0][0]).toBe(50)
  })
})

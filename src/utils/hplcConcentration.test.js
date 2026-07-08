import { describe, it, expect } from 'vitest'
import {
  DEFAULT_HPLC_PARAMS,
  dilutionFactorFromVial,
  areaToMolarity,
  areaToMicromolar,
  concentrationToConversion,
} from './hplcConcentration.js'

describe('dilutionFactorFromVial', () => {
  it('is vial / aliquot for the default 14 µL vial, 1.5 µL aliquot', () => {
    expect(dilutionFactorFromVial(14, 1.5)).toBeCloseTo(14 / 1.5, 12)
  })

  it('defaults to 1 for a non-positive aliquot (no divide-by-zero)', () => {
    expect(dilutionFactorFromVial(14, 0)).toBe(1)
    expect(dilutionFactorFromVial(14, -2)).toBe(1)
  })
})

describe('areaToMolarity', () => {
  it('matches the hand-computed Beer-Lambert + dilution value for defaults', () => {
    // area=100 mAU·min, epsilon=12000 → verified independently in Python
    expect(areaToMolarity(100, 12000)).toBeCloseTo(0.011566042100393248, 15)
  })

  it('is linear in peak area', () => {
    const a = areaToMolarity(100, 12000)
    const b = areaToMolarity(200, 12000)
    expect(b / a).toBeCloseTo(2, 9)
  })

  it('is inversely proportional to epsilon', () => {
    const a = areaToMolarity(100, 12000)
    const b = areaToMolarity(100, 24000)
    expect(a / b).toBeCloseTo(2, 9)
  })

  it('honours an explicit dilutionFactor override over vial/aliquot', () => {
    const withOverride = areaToMolarity(100, 12000, { dilutionFactor: 1 })
    const withDefault  = areaToMolarity(100, 12000)
    expect(withDefault / withOverride).toBeCloseTo(DEFAULT_HPLC_PARAMS.vial_uL / DEFAULT_HPLC_PARAMS.aliquot_uL, 9)
  })

  it('returns 0 for an invalid epsilon rather than Infinity/NaN', () => {
    expect(areaToMolarity(100, 0)).toBe(0)
    expect(areaToMolarity(100, -1)).toBe(0)
  })

  it('treats a null/blank area as 0', () => {
    expect(areaToMolarity(null, 12000)).toBe(0)
    expect(areaToMolarity('', 12000)).toBe(0)
  })
})

describe('areaToMicromolar', () => {
  it('is exactly 1e6 × the molar value', () => {
    expect(areaToMicromolar(100, 12000)).toBeCloseTo(11566.042100393248, 9)
  })
})

describe('concentrationToConversion', () => {
  it('is a straight percentage of R_max', () => {
    expect(concentrationToConversion(50, 100)).toBe(50)
    expect(concentrationToConversion(25, 100)).toBe(25)
  })

  it('clamps overshoot to 100', () => {
    expect(concentrationToConversion(150, 100)).toBe(100)
  })

  it('clamps negatives to 0', () => {
    expect(concentrationToConversion(-5, 100)).toBe(0)
  })

  it('returns 0 for a non-positive R_max (no divide-by-zero)', () => {
    expect(concentrationToConversion(50, 0)).toBe(0)
    expect(concentrationToConversion(50, -10)).toBe(0)
  })
})

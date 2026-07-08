import { describe, it, expect } from 'vitest'
import {
  concentrationRatio,
  dimsCompatible,
  unitDimension,
  compatibleUnits,
  defaultUnitForDim,
} from './units.js'

describe('concentrationRatio', () => {
  it('computes a 1/100 dilution: 10 µM target from 1 mM stock', () => {
    expect(concentrationRatio(10, 'µM', 1, 'mM')).toBeCloseTo(0.01, 12)
  })

  it('V_stock = ratio × V_total holds for a 50 nM target from 100 µM stock', () => {
    const ratio = concentrationRatio(50, 'nM', 100, 'µM') // 0.0005
    expect(ratio).toBeCloseTo(0.0005, 12)
    expect(ratio * 20 /* µL total */).toBeCloseTo(0.01, 12)
  })

  it('handles ratio ("X") units', () => {
    expect(concentrationRatio(2, 'X', 10, 'X')).toBeCloseTo(0.2, 12)
  })

  it('returns null across incompatible dimensions (µM vs mg/mL)', () => {
    // This is the guard behind the "unit mismatch" cell warning in MatrixPlanner
    expect(concentrationRatio(10, 'µM', 5, 'mg/mL')).toBeNull()
  })

  it('returns null on zero stock instead of dividing by zero', () => {
    expect(concentrationRatio(10, 'µM', 0, 'µM')).toBeNull()
  })

  it('returns null on an unknown stock unit', () => {
    expect(concentrationRatio(10, 'µM', 5, 'bogus')).toBeNull()
  })
})

describe('dimsCompatible', () => {
  it('treats all molar units as one dimension', () => {
    expect(dimsCompatible('nM', 'M')).toBe(true)
    expect(dimsCompatible('µM', 'mM')).toBe(true)
  })

  it('rejects molar vs mass/volume', () => {
    expect(dimsCompatible('µM', 'µg/µL')).toBe(false)
  })

  it('two unknown units are trivially "compatible" (both unknown)', () => {
    // Documents current behaviour: unknown === unknown. Guarded upstream by
    // concentrationRatio returning null when the stock cannot be converted.
    expect(dimsCompatible('bogus', 'nonsense')).toBe(true)
  })
})

describe('unitDimension', () => {
  it('maps known units to their dimension', () => {
    expect(unitDimension('mM')).toBe('molar')
    expect(unitDimension('mg/mL')).toBe('mass_vol')
    expect(unitDimension('µL')).toBe('volume')
    expect(unitDimension('U/µL')).toBe('enzyme')
  })

  it('returns "unknown" for an unrecognised unit', () => {
    expect(unitDimension('foo')).toBe('unknown')
  })
})

describe('compatibleUnits', () => {
  it('returns every molar unit for a molar stock', () => {
    expect(compatibleUnits('mM').sort()).toEqual(['M', 'mM', 'nM', 'µM'].sort())
  })

  it('returns only volume units for a volume stock', () => {
    expect(compatibleUnits('mL').sort()).toEqual(['L', 'mL', 'nL', 'µL'].sort())
  })
})

describe('defaultUnitForDim', () => {
  it('picks the canonical unit for the stock unit dimension', () => {
    expect(defaultUnitForDim('nM')).toBe('µM')      // molar → µM
    expect(defaultUnitForDim('ng/µL')).toBe('mg/mL') // mass_vol → mg/mL
  })

  it('falls back to the input unit for an unknown dimension', () => {
    expect(defaultUnitForDim('bogus')).toBe('bogus')
  })
})

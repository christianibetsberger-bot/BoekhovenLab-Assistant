import { describe, it, expect } from 'vitest'
import {
  calcSeqGc,
  calcSeqExtinction,
  calcSeqMw,
  calcSeqTm,
} from './seqUtils.js'

describe('calcSeqGc', () => {
  it('computes GC percentage', () => {
    expect(calcSeqGc('ATCG')).toBe(50)
    expect(calcSeqGc('GGCC')).toBe(100)
    expect(calcSeqGc('ATAT')).toBe(0)
  })

  it('strips modifications, 5\'/3\' notation, case and whitespace', () => {
    expect(calcSeqGc("5'-atcg-3'")).toBe(50)
    expect(calcSeqGc('[DSPC]ATCG')).toBe(50)
    expect(calcSeqGc('AT CG')).toBe(50)
  })

  it('returns 0 for empty or all-modifier input', () => {
    expect(calcSeqGc('')).toBe(0)
    expect(calcSeqGc('[DSPC]')).toBe(0)
    expect(calcSeqGc(null)).toBe(0)
  })
})

describe('calcSeqExtinction (DNA, nearest-neighbour)', () => {
  it('equals the single dimer term for a 2-mer', () => {
    // AT: nn['AT'] = 22800, no interior individual term subtracted
    expect(calcSeqExtinction('AT', 'DNA')).toBe(22800)
  })

  it('subtracts interior individual coefficients for a 3-mer', () => {
    // ATC: nn[AT] + nn[TC] - ind[T] = 22800 + 16200 - 8700
    expect(calcSeqExtinction('ATC', 'DNA')).toBe(30300)
  })

  it('matches the hand-computed value for a 4-mer', () => {
    expect(calcSeqExtinction('ATCG', 'DNA')).toBe(40900)
  })

  it('ignores modification blocks', () => {
    expect(calcSeqExtinction('[Cy3]ATCG', 'DNA')).toBe(40900)
  })

  it('returns 0 for empty input', () => {
    expect(calcSeqExtinction('', 'DNA')).toBe(0)
    expect(calcSeqExtinction(null, 'DNA')).toBe(0)
  })
})

describe('calcSeqExtinction (RNA)', () => {
  it('uses the RNA dimer table (AU = 24000)', () => {
    expect(calcSeqExtinction('AU', 'RNA')).toBe(24000)
  })

  it('is positive and grows with length', () => {
    const short = calcSeqExtinction('AUCG', 'RNA')
    const long = calcSeqExtinction('AUCGAUCG', 'RNA')
    expect(short).toBeGreaterThan(0)
    expect(long).toBeGreaterThan(short)
  })
})

describe('calcSeqMw', () => {
  it('sums nucleotide weights minus terminal water for DNA', () => {
    // ATCG: 313.21 + 304.2 + 289.18 + 329.21 - 61.96
    expect(calcSeqMw('ATCG', 'DNA')).toBeCloseTo(1173.84, 5)
  })

  it('uses RNA weights for RNA', () => {
    // AUCG: 329.21 + 306.2 + 305.18 + 345.21 - 61.96
    expect(calcSeqMw('AUCG', 'RNA')).toBeCloseTo(1223.84, 5)
  })

  it('is unaffected by modification blocks', () => {
    expect(calcSeqMw('[DSPC]ATCG', 'DNA')).toBeCloseTo(1173.84, 5)
  })

  it('returns 0 for empty input', () => {
    expect(calcSeqMw('', 'DNA')).toBe(0)
    expect(calcSeqMw(null, 'DNA')).toBe(0)
  })
})

describe('calcSeqTm (SantaLucia 1998, DNA)', () => {
  it('returns 0 for sequences shorter than 2 bases', () => {
    expect(calcSeqTm('')).toBe(0)
    expect(calcSeqTm('A')).toBe(0)
  })

  it('gives a higher Tm for GC-rich than AT-rich of equal length', () => {
    const gc = calcSeqTm('GCGCGCGCGC')
    const at = calcSeqTm('ATATATATAT')
    expect(gc).toBeGreaterThan(at)
    expect(gc).toBeGreaterThan(0)
  })

  it('never returns a negative Tm (clamped at 0)', () => {
    expect(calcSeqTm('AT')).toBeGreaterThanOrEqual(0)
  })
})

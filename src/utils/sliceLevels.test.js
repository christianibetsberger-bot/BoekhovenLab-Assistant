import { describe, it, expect } from 'vitest'
import { sliceLevels } from './sliceLevels'

describe('sliceLevels', () => {
  it('uses the levels the screen actually visited', () => {
    // A three-level EDC sweep gets three stops, not a grid of round numbers.
    expect(sliceLevels([10, 30, 30, 10, 20], { min: 0, max: 50 })).toEqual([10, 20, 30])
  })

  it('ignores wells with no value for the component', () => {
    expect(sliceLevels([5, null, undefined, NaN, '', 15], { min: 0, max: 20 })).toEqual([5, 15])
  })

  it('reads numeric strings, which is how a form hands them over', () => {
    expect(sliceLevels(['5', 5, '10'], { min: 0, max: 20 })).toEqual([5, 10])
  })

  it('sweeps the search space when the component was varied continuously', () => {
    const many = Array.from({ length: 200 }, (_, i) => i * 0.37)
    const out = sliceLevels(many, { min: 0, max: 60, sweepSteps: 12 })
    expect(out).toHaveLength(13)
    expect(out[0]).toBe(0)
    expect(out[12]).toBe(60)
  })

  it('honours maxLevels as the point where enumerating gives way to sweeping', () => {
    const twelve = Array.from({ length: 12 }, (_, i) => i)
    expect(sliceLevels(twelve, { min: 0, max: 11, maxLevels: 12 })).toHaveLength(12)
    expect(sliceLevels(twelve, { min: 0, max: 11, maxLevels: 5, sweepSteps: 4 })).toEqual([0, 2.75, 5.5, 8.25, 11])
  })

  it('sweeps the data spread when the search space is missing or inverted', () => {
    const many = Array.from({ length: 100 }, (_, i) => 20 + i)
    expect(sliceLevels(many, { sweepSteps: 2 })).toEqual([20, 69.5, 119])
    expect(sliceLevels(many, { min: 90, max: 10, sweepSteps: 2 })).toEqual([20, 69.5, 119])
  })

  it('never returns an empty list, so the caller always has a frame to draw', () => {
    expect(sliceLevels([], { min: 0, max: 10 })).toEqual([0])
    expect(sliceLevels([], { fallback: 7 })).toEqual([7])
    expect(sliceLevels(undefined, { fallback: 2.5 })).toEqual([2.5])
  })

  it('collapses to a single stop when every well shares one value', () => {
    expect(sliceLevels([4, 4, 4], { min: 4, max: 4 })).toEqual([4])
  })

  it('caps the frame count on every path', () => {
    // The pathological case: hundreds of distinct values AND no usable range.
    const many = Array.from({ length: 500 }, (_, i) => i)
    for (const opts of [{}, { min: 0, max: 499 }, { min: 5, max: 5 }, { min: NaN, max: NaN }]) {
      expect(sliceLevels(many, opts).length).toBeLessThanOrEqual(41)
    }
  })

  it('returns levels in ascending order with no duplicates', () => {
    const out = sliceLevels([30, 10, 30, 20, 10], { min: 0, max: 40 })
    expect(out).toEqual([...out].sort((a, b) => a - b))
    expect(new Set(out).size).toBe(out.length)
  })
})

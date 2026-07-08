import { describe, it, expect } from 'vitest'
import {
  BOEKHOVEN_PALETTE, stableIndexForKey, categoricalColor, colorForKey,
  assignColors, hexToRgba, plotlyColorscale, clonePalette,
} from './palette.js'

describe('categoricalColor', () => {
  it('wraps around the categorical list', () => {
    const n = BOEKHOVEN_PALETTE.categorical.length
    expect(categoricalColor(BOEKHOVEN_PALETTE, 0)).toBe(BOEKHOVEN_PALETTE.categorical[0])
    expect(categoricalColor(BOEKHOVEN_PALETTE, n)).toBe(BOEKHOVEN_PALETTE.categorical[0])
    expect(categoricalColor(BOEKHOVEN_PALETTE, n + 1)).toBe(BOEKHOVEN_PALETTE.categorical[1])
  })

  it('handles negative indices without going out of range', () => {
    expect(BOEKHOVEN_PALETTE.categorical).toContain(categoricalColor(BOEKHOVEN_PALETTE, -1))
  })
})

describe('stableIndexForKey', () => {
  it('is deterministic for the same key', () => {
    expect(stableIndexForKey('Aalpha', 8)).toBe(stableIndexForKey('Aalpha', 8))
  })

  it('stays within [0, n)', () => {
    for (const k of ['A', 'Bbeta', 'seeded', '']) {
      const idx = stableIndexForKey(k, 8)
      expect(idx).toBeGreaterThanOrEqual(0)
      expect(idx).toBeLessThan(8)
    }
  })
})

describe('colorForKey', () => {
  it('honours an explicit colorMap pin', () => {
    const pal = { ...BOEKHOVEN_PALETTE, colorMap: { seeded: '#123456' } }
    expect(colorForKey(pal, 'seeded')).toBe('#123456')
  })

  it('falls back to the categorical slot at the given index', () => {
    expect(colorForKey(BOEKHOVEN_PALETTE, 'x', 2)).toBe(BOEKHOVEN_PALETTE.categorical[2])
  })
})

describe('assignColors', () => {
  it('gives distinct keys the next categorical slots in order', () => {
    const map = assignColors(BOEKHOVEN_PALETTE, ['a', 'b', 'c'])
    expect(map.a).toBe(BOEKHOVEN_PALETTE.categorical[0])
    expect(map.b).toBe(BOEKHOVEN_PALETTE.categorical[1])
    expect(map.c).toBe(BOEKHOVEN_PALETTE.categorical[2])
  })

  it('keeps existing pins and avoids colliding new keys with them', () => {
    const pinnedColor = BOEKHOVEN_PALETTE.categorical[0]
    const pal = { ...BOEKHOVEN_PALETTE, colorMap: { pinned: pinnedColor } }
    const map = assignColors(pal, ['pinned', 'fresh'])
    expect(map.pinned).toBe(pinnedColor)
    expect(map.fresh).not.toBe(pinnedColor)
  })
})

describe('hexToRgba', () => {
  it('converts #rrggbb with alpha', () => {
    expect(hexToRgba('#0065BD', 0.35)).toBe('rgba(0,101,189,0.35)')
  })

  it('tolerates a missing leading #', () => {
    expect(hexToRgba('0065BD', 1)).toBe('rgba(0,101,189,1)')
  })

  it('returns a safe black for garbage input', () => {
    expect(hexToRgba('nope', 0.5)).toBe('rgba(0,0,0,0.5)')
  })
})

describe('plotlyColorscale', () => {
  it('maps the sequential ramp onto [0, 1] stops', () => {
    const scale = plotlyColorscale(BOEKHOVEN_PALETTE)
    expect(scale[0][0]).toBe(0)
    expect(scale[scale.length - 1][0]).toBe(1)
    expect(scale[0][1]).toBe(BOEKHOVEN_PALETTE.sequential[0])
  })
})

describe('clonePalette', () => {
  it('produces an editable non-builtin copy with a fresh id', () => {
    const copy = clonePalette(BOEKHOVEN_PALETTE)
    expect(copy.builtin).toBe(false)
    expect(copy.id).not.toBe(BOEKHOVEN_PALETTE.id)
    expect(copy.categorical).toEqual(BOEKHOVEN_PALETTE.categorical)
    // Mutating the copy must not touch the seeded palette.
    copy.categorical.push('#000000')
    expect(BOEKHOVEN_PALETTE.categorical).not.toContain('#000000')
  })
})

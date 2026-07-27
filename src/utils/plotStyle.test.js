import { describe, it, expect } from 'vitest'
import {
  DEFAULT_PRESET, WILKE_PRESET, LEGACY_PRESET, BUILTIN_PRESETS, isBuiltinPreset,
  resolvePreset, axisTitle, boekhovenPlotlyLayout,
  boekhovenHeatmapLayout, matplotlibStyleCode,
} from './plotStyle.js'
import { BOEKHOVEN_PALETTE } from './palette.js'

describe('Boekhoven Wilke preset (the default)', () => {
  it('is the default preset', () => {
    expect(DEFAULT_PRESET).toBe(WILKE_PRESET)
    expect(DEFAULT_PRESET.id).toBe('boekhoven-wilke')
    expect(DEFAULT_PRESET.fontSize).toBe(15)
    expect(DEFAULT_PRESET.lineWidth).toBe(2.2)
    expect(DEFAULT_PRESET.control.dash).toBe('6 4')
  })

  it('exposes both built-in presets, Wilke first', () => {
    expect(BUILTIN_PRESETS.map(p => p.id)).toEqual(['boekhoven-wilke', 'boekhoven-default'])
    expect(isBuiltinPreset('boekhoven-wilke')).toBe(true)
    expect(isBuiltinPreset('boekhoven-default')).toBe(true)
    expect(isBuiltinPreset('preset_custom')).toBe(false)
  })

  it('caps ticks at 5 and uses the larger margins', () => {
    const layout = boekhovenPlotlyLayout(WILKE_PRESET, BOEKHOVEN_PALETTE, {
      x: { quantity: 't', unit: 'min' }, y: { quantity: 'signal', unit: 'mAU' },
    })
    expect(layout.xaxis.nticks).toBe(5)
    expect(layout.yaxis.nticks).toBe(5)
    expect(layout.margin.l).toBe(64)
    expect(layout.margin.b).toBe(56)
    expect(layout.xaxis.tickfont.size).toBe(14)
    expect(layout.xaxis.title.font.size).toBe(15.5)
  })

  it('legacy preset leaves ticks on auto (no nticks)', () => {
    const layout = boekhovenPlotlyLayout(LEGACY_PRESET, BOEKHOVEN_PALETTE, { x: {}, y: {} })
    expect(layout.xaxis.nticks).toBeUndefined()
    expect(layout.margin.l).toBe(55)
  })

  it('matplotlib code carries the tick cap, dashed control and heavier lines', () => {
    const code = matplotlibStyleCode(WILKE_PRESET, BOEKHOVEN_PALETTE)
    expect(code).toContain('def apply_ticks(ax)')
    expect(code).toContain('BOEKHOVEN_MAX_TICKS   = 5')
    expect(code).toContain('"lines.linewidth": 2.2')
    expect(code).toContain('(0, (6, 4))')
  })
})

describe('resolvePreset', () => {
  it('fills defaults for a partial preset', () => {
    const p = resolvePreset({ fontSize: 20 })
    expect(p.fontSize).toBe(20)
    expect(p.font).toBe(DEFAULT_PRESET.font)
    expect(p.spines.top).toBe(false)
  })

  it('deep-merges nested spines/legend/band', () => {
    const p = resolvePreset({ spines: { top: true } })
    expect(p.spines.top).toBe(true)
    expect(p.spines.left).toBe(true) // preserved from defaults
  })
})

describe('axisTitle', () => {
  it('joins quantity and unit with the preset separator', () => {
    expect(axisTitle('Absorbance 600 nm', 'AU', DEFAULT_PRESET)).toBe('Absorbance 600 nm | AU')
  })

  it('omits the separator when there is no unit', () => {
    expect(axisTitle('Row', '', DEFAULT_PRESET)).toBe('Row')
  })

  it('honours a custom separator', () => {
    expect(axisTitle('t', 'min', { axisSep: ' / ' })).toBe('t / min')
  })
})

describe('boekhovenPlotlyLayout', () => {
  it('is despined (no mirror), Arial, palette colourway', () => {
    const layout = boekhovenPlotlyLayout(DEFAULT_PRESET, BOEKHOVEN_PALETTE, {
      x: { quantity: 't', unit: 'min' }, y: { quantity: 'signal', unit: 'mAU' },
    })
    expect(layout.font.family).toBe('Arial')
    expect(layout.colorway).toEqual(BOEKHOVEN_PALETTE.categorical)
    expect(layout.xaxis.mirror).toBe(false)
    expect(layout.xaxis.title.text).toBe('t | min')
    expect(layout.yaxis.title.text).toBe('signal | mAU')
  })

  it('switches paper/plot background with the dark flag', () => {
    const light = boekhovenPlotlyLayout(DEFAULT_PRESET, BOEKHOVEN_PALETTE, { isDark: false })
    const dark = boekhovenPlotlyLayout(DEFAULT_PRESET, BOEKHOVEN_PALETTE, { isDark: true })
    expect(light.paper_bgcolor).toBe('#ffffff')
    expect(dark.paper_bgcolor).not.toBe('#ffffff')
  })
})

describe('boekhovenHeatmapLayout', () => {
  it('uses category axes with the matrix row reversed and a colorscale', () => {
    const { layout, colorscale } = boekhovenHeatmapLayout(DEFAULT_PRESET, BOEKHOVEN_PALETTE, {})
    expect(layout.xaxis.type).toBe('category')
    expect(layout.yaxis.type).toBe('category')
    expect(layout.yaxis.autorange).toBe('reversed')
    expect(colorscale[0][0]).toBe(0)
  })
})

describe('matplotlibStyleCode', () => {
  it('emits an apply_style() snippet carrying the preset + palette', () => {
    const code = matplotlibStyleCode({ font: 'Arial', fontSize: 14, dpi: 200, sizeInches: [5, 3] }, BOEKHOVEN_PALETTE)
    expect(code).toContain('def apply_style()')
    expect(code).toContain('"font.size": 14')
    expect(code).toContain('(5, 3)')
    expect(code).toContain(JSON.stringify(BOEKHOVEN_PALETTE.categorical))
    expect(code).toContain('def sequential_cmap()')
  })
})

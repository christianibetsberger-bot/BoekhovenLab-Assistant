import { describe, it, expect } from 'vitest'
import {
  DEFAULT_PRESET, resolvePreset, axisTitle, boekhovenPlotlyLayout,
  boekhovenHeatmapLayout, matplotlibStyleCode,
} from './plotStyle.js'
import { BOEKHOVEN_PALETTE } from './palette.js'

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

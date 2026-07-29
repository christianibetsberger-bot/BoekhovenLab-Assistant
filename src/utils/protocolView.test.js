import { describe, it, expect } from 'vitest'
import { protocolHtml, protocolSummary, isRecipeType } from './protocolView.js'

describe('isRecipeType', () => {
  it('covers Synthesis, Peptide, DNA only', () => {
    expect(['Synthesis', 'Peptide', 'DNA'].every(isRecipeType)).toBe(true)
    expect(isRecipeType('HPLC')).toBe(false)
  })
})

describe('protocolHtml — recipe types', () => {
  const p = {
    name: 'SPPS FLFLF', type: 'Peptide', sequence: 'H-FLFLF-NH2', scale: 0.1, scaleUnit: 'mmol',
    reagents: [{ name: 'Fmoc-Phe-OH', amount: '0.3 mmol', equiv: '3' }],
    steps: [
      { text: 'Swell resin in DMF', temp: null, time: '30 min', atmosphere: '' },
      { text: 'Couple amino acid', temp: 40, time: '1 h', atmosphere: 'N2' },
    ],
    scheme: { ket: '{}', img: 'data:image/png;base64,AAAA' },
  }
  const html = protocolHtml(p)

  it('embeds the reaction scheme image', () => {
    expect(html).toContain('data:image/png;base64,AAAA')
  })
  it('shows the sequence with N→C direction and the scale', () => {
    expect(html).toContain('H-FLFLF-NH2')
    expect(html).toContain('N→C')
    expect(html).toContain('0.1 mmol')
  })
  it('lists steps with their conditions', () => {
    expect(html).toContain('Swell resin in DMF')
    expect(html).toContain('Couple amino acid')
    expect(html).toContain('40 °C')
    expect(html).toContain('1 h')
  })
  it('renders DNA sequence direction as 5→3', () => {
    expect(protocolHtml({ name: 'x', type: 'DNA', sequence: 'ACGT' })).toContain("5'→3'")
  })
})

describe('protocolSummary — recipe types', () => {
  it('summarizes sequence, step count and scale', () => {
    const s = protocolSummary({ type: 'Peptide', sequence: 'FLFLF', scale: 0.1, scaleUnit: 'mmol', steps: [{ text: 'a' }, { text: 'b' }] })
    expect(s).toContain('FLFLF')
    expect(s).toContain('2 steps')
    expect(s).toContain('0.1 mmol')
  })
})

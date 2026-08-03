import { describe, it, expect } from 'vitest'
import { invChip, textChip } from './invChip.js'

// This markup is not cosmetic: the usage tracker keys traceability on data-inv-id,
// and the Opentrons exporters regex the "[CODE] Name (value unit)" text back out of
// it. Pin the exact output so extracting it from 12 inline copies can't have changed
// what lands in saved experiment content.
const fmt = (v) => String(v)
const inv = { id: 'inv_1', code: 'R00012', name: 'Ac-FFD', stock: 10, stockUnit: 'mM' }

describe('inventory chip markup', () => {
  it('is byte-identical to the inline literal it replaced', () => {
    const expected = '<span class="inv-ref" contenteditable="false" data-inv-id="inv_1" data-labware="plate1">'
      + '<i class="fas fa-tag"></i>&nbsp;[R00012] Ac-FFD (10 mM)'
      + '&nbsp;<i class="fas fa-times inv-ref-remove" style="cursor:pointer; margin-left:4px; opacity: 0.7;"></i></span>'
    expect(invChip(inv, { labware: 'plate1', fmt })).toBe(expected)
  })

  it('carries the inventory id the usage tracker needs', () => {
    expect(invChip(inv, { fmt })).toContain('data-inv-id="inv_1"')
  })

  it('keeps the [CODE] Name (value unit) text the exporters parse', () => {
    expect(invChip(inv, { fmt })).toContain('[R00012] Ac-FFD (10 mM)')
  })

  it('falls back to the given unit when the item has none', () => {
    expect(invChip({ ...inv, stockUnit: '' }, { unit: 'µM', fmt })).toContain('(10 µM)')
  })

  it('escapes user-controlled fields', () => {
    const nasty = { ...inv, name: '<img src=x onerror=alert(1)>' }
    expect(invChip(nasty, { fmt })).not.toContain('<img')
  })

  it('text chips carry no inventory id — nothing to trace', () => {
    const c = textChip('Ligase buffer', { labware: 'lw1' })
    expect(c).not.toContain('data-inv-id')
    expect(c).toContain('Ligase buffer')
  })
})

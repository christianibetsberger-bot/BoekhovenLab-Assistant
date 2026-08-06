import { describe, it, expect } from 'vitest'
import { swapComponentSlots, stockKeyOf, COMPONENT_SLOTS, SLOT_LETTERS } from './componentSlots'

const makeConfig = () => ({
  anionName: 'Peptide', anionMin: 0, anionMax: 6, anionStep: 0.5, anionUnit: 'mM',
  anionInv: { id: 'i1' }, anionSearchQuery: 'pep', anionSearchScope: 'Global',
  anionMedium: { type: 'buffer', bufName: 'HEPES' }, stockAnion: 100,

  compDName: 'polyU', compDMin: 0, compDMax: 1, compDStep: 0.1, compDUnit: 'µM',
  compDInv: { id: 'i4' }, compDSearchQuery: 'pu', compDSearchScope: 'Personal',
  compDMedium: { type: 'water', bufName: '' }, stockCompD: 1000,

  cationName: 'RNA', cationMin: 0, cationMax: 6, cationUnit: 'mM', stockCation: 50,
  saltName: 'NaCl', saltMin: 0, saltMax: 200, saltUnit: 'mM', stockSalt: 1000,
  dependencies: [{ source: 'anion', target: 'compD', factor: 2 }],
})

describe('swapComponentSlots', () => {
  it('moves everything the slot owns, not just the name', () => {
    const config = makeConfig()
    swapComponentSlots(config, [], 'anion', 'compD')
    expect(config.anionName).toBe('polyU')
    expect(config.anionMax).toBe(1)
    expect(config.anionStep).toBe(0.1)
    expect(config.anionUnit).toBe('µM')
    expect(config.anionInv).toEqual({ id: 'i4' })
    expect(config.anionSearchScope).toBe('Personal')
    expect(config.anionMedium).toEqual({ type: 'water', bufName: '' })
    expect(config.stockAnion).toBe(1000)

    expect(config.compDName).toBe('Peptide')
    expect(config.compDMax).toBe(6)
    expect(config.compDUnit).toBe('mM')
    expect(config.stockCompD).toBe(100)
  })

  it('moves the logged values with the slot', () => {
    const config = makeConfig()
    const rows = [
      { sampleId: 1, anion: 1.5, cation: 2, salt: 30, compD: 0.4, phase: 1 },
      { sampleId: 2, anion: 3.0, cation: 2, salt: 30, compD: 0.8, phase: 2 },
    ]
    swapComponentSlots(config, rows, 'anion', 'compD')
    expect(rows[0]).toMatchObject({ anion: 0.4, compD: 1.5, cation: 2, salt: 30, phase: 1 })
    expect(rows[1]).toMatchObject({ anion: 0.8, compD: 3.0 })
  })

  it('treats a value that was never recorded as zero', () => {
    const rows = [{ anion: 2.5 }]        // no compD at all
    swapComponentSlots(makeConfig(), rows, 'anion', 'compD')
    expect(rows[0].anion).toBe(0)
    expect(rows[0].compD).toBe(2.5)
  })

  it('keeps a dependency pointing at the same two compounds', () => {
    const config = makeConfig()
    swapComponentSlots(config, [], 'anion', 'compD')
    expect(config.dependencies[0]).toMatchObject({ source: 'compD', target: 'anion' })
  })

  it('rewrites only the end of a dependency that moved', () => {
    const config = makeConfig()
    config.dependencies = [{ source: 'salt', target: 'compD' }]
    swapComponentSlots(config, [], 'anion', 'compD')
    expect(config.dependencies[0]).toMatchObject({ source: 'salt', target: 'anion' })
  })

  it('refuses a swap that is not one', () => {
    const config = makeConfig()
    expect(swapComponentSlots(config, [], 'anion', 'anion')).toBe(false)
    expect(swapComponentSlots(config, [], 'anion', 'nonsense')).toBe(false)
    expect(config.anionName).toBe('Peptide')
  })

  it('round-trips: swapping twice puts everything back', () => {
    const before = JSON.stringify(makeConfig())
    const config = makeConfig()
    const rows = [{ anion: 1.5, cation: 2, salt: 30, compD: 0.4 }]
    swapComponentSlots(config, rows, 'cation', 'salt')
    swapComponentSlots(config, rows, 'cation', 'salt')
    expect(JSON.stringify(config)).toBe(before)
    expect(rows[0]).toEqual({ anion: 1.5, cation: 2, salt: 30, compD: 0.4 })
  })

  it('names the slots the way the UI does', () => {
    expect(COMPONENT_SLOTS.map(k => SLOT_LETTERS[k])).toEqual(['A', 'B', 'C', 'D'])
    expect(COMPONENT_SLOTS.map(stockKeyOf)).toEqual(['stockAnion', 'stockCation', 'stockSalt', 'stockCompD'])
  })
})

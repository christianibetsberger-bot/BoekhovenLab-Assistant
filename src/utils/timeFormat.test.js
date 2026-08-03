import { describe, it, expect } from 'vitest'
import { formatDuration, formatHours, toDatetimeLocal, getMonday, entryMinutes, isNachbuchung } from './timeFormat.js'

// Characterization of the tracker's time math, extracted from TimeTracker.vue.
// Inputs are built from local-time Date objects so the assertions hold in any
// timezone (CI runs UTC, the lab runs Europe/Berlin).

describe('formatDuration (ms → label)', () => {
  it('formats zero, minutes-only and hours+minutes', () => {
    expect(formatDuration(0)).toBe('0m')
    expect(formatDuration(-5000)).toBe('0m')
    expect(formatDuration(25 * 60000)).toBe('25m')
    expect(formatDuration(3600000)).toBe('1h 0m')
    expect(formatDuration(5400000)).toBe('1h 30m')
  })
})

describe('formatHours (decimal hours → label)', () => {
  it('formats whole, fractional and negative balances', () => {
    expect(formatHours(0)).toBe('0h')
    expect(formatHours(2)).toBe('2h')
    expect(formatHours(1.5)).toBe('1h 30m')
    expect(formatHours(-1.5)).toBe('-1h 30m')
  })
  it('documents the rounding quirk near a whole hour (current behaviour)', () => {
    // 1.9999h rounds the minute part to 60 rather than carrying into hours.
    // Recorded, not endorsed — fixing it would change displayed balances.
    expect(formatHours(1.9999)).toBe('1h 60m')
  })
})

describe('toDatetimeLocal', () => {
  it('renders a local timestamp for datetime-local inputs and passes empty through', () => {
    expect(toDatetimeLocal(new Date(2026, 0, 5, 9, 7))).toBe('2026-01-05T09:07')
    expect(toDatetimeLocal('')).toBe('')
    expect(toDatetimeLocal(null)).toBe('')
  })
})

describe('getMonday', () => {
  const ymd = (d) => [d.getFullYear(), d.getMonth() + 1, d.getDate()].join('-')
  it('maps every weekday to that week’s Monday, with Sunday belonging to the week before', () => {
    expect(ymd(getMonday(new Date(2026, 7, 5)))).toBe('2026-8-3')    // Wed → Mon
    expect(ymd(getMonday(new Date(2026, 7, 3)))).toBe('2026-8-3')    // Mon → itself
    expect(ymd(getMonday(new Date(2026, 7, 9)))).toBe('2026-8-3')    // Sun → previous Mon
    expect(ymd(getMonday(new Date(2026, 7, 10)))).toBe('2026-8-10')  // next Mon → itself
  })
  it('returns midnight', () => {
    const m = getMonday(new Date(2026, 7, 5, 17, 45))
    expect([m.getHours(), m.getMinutes(), m.getSeconds()]).toEqual([0, 0, 0])
  })
})

describe('entryMinutes', () => {
  it('is the checked-in→out span, and 0 while still running', () => {
    const t0 = new Date(2026, 7, 5, 9, 0)
    const t1 = new Date(2026, 7, 5, 10, 30)
    expect(entryMinutes({ checked_in: t0.toISOString(), checked_out: t1.toISOString() })).toBe(90)
    expect(entryMinutes({ checked_in: t0.toISOString(), checked_out: null })).toBe(0)
  })
})

describe('isNachbuchung', () => {
  const at = (h) => new Date(2026, 7, 5, h, 0).toISOString()
  it('flags entries logged more than an hour after the fact', () => {
    expect(isNachbuchung({ checked_in: at(9), created_at: at(11) })).toBe(true)
    expect(isNachbuchung({ checked_in: at(9), created_at: at(9) })).toBe(false)
    expect(isNachbuchung({ checked_in: at(9) })).toBe(false)
  })
})

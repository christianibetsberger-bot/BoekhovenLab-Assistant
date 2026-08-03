import { describe, it, expect } from 'vitest'
import { easterDate, getBavarianHolidays, isBavarianHoliday } from './holidays.js'

// Characterization for the holiday math extracted from TimeTracker: the tracker
// uses these to decide which weekdays carry no work-hour target, so a silently
// wrong holiday shifts someone's overtime balance.
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

describe('easterDate (Meeus/Jones/Butcher)', () => {
  it('matches the published Easter Sundays', () => {
    expect(ymd(easterDate(2024))).toBe('2024-03-31')
    expect(ymd(easterDate(2025))).toBe('2025-04-20')
    expect(ymd(easterDate(2026))).toBe('2026-04-05')
    expect(ymd(easterDate(2027))).toBe('2027-03-28')
  })
  it('handles the calendar extremes', () => {
    expect(ymd(easterDate(2038))).toBe('2038-04-25')   // latest possible
    expect(ymd(easterDate(2285))).toBe('2285-03-22')   // earliest possible
  })
})

describe('getBavarianHolidays', () => {
  const h2026 = getBavarianHolidays(2026)
  it('contains the eight fixed Bavarian holidays', () => {
    for (const d of ['2026-01-01', '2026-01-06', '2026-05-01', '2026-08-15', '2026-10-03', '2026-11-01', '2026-12-25', '2026-12-26']) {
      expect(h2026.has(d), d).toBe(true)
    }
  })
  it('derives the five movable feasts from Easter (2026-04-05)', () => {
    expect(h2026.has('2026-04-03'), 'Karfreitag').toBe(true)
    expect(h2026.has('2026-04-06'), 'Ostermontag').toBe(true)
    expect(h2026.has('2026-05-14'), 'Christi Himmelfahrt').toBe(true)
    expect(h2026.has('2026-05-25'), 'Pfingstmontag').toBe(true)
    expect(h2026.has('2026-06-04'), 'Fronleichnam').toBe(true)
  })
  it('is exactly 13 holidays, no strays', () => {
    expect(h2026.size).toBe(13)
  })
})

describe('isBavarianHoliday', () => {
  it('accepts holidays and rejects neighbours', () => {
    expect(isBavarianHoliday('2026-10-03')).toBe(true)
    expect(isBavarianHoliday('2026-10-04')).toBe(false)
    expect(isBavarianHoliday('2025-06-09')).toBe(true)   // Pfingstmontag 2025 (Easter 2025-04-20 + 50)
  })
})

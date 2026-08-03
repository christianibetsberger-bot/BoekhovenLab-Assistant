import { describe, it, expect } from 'vitest'
import * as XLSX from 'xlsx'
import { buildMonthSheet, buildYearSummarySheet } from './timeExport.js'

// Characterization of the work-protocol sheet builders extracted from
// TimeTracker.vue: these numbers go to the chair as the official Arbeitszeit-
// protokoll, so pin the layout and the arithmetic. Timestamps are built from
// local Dates (mid-day, mid-month) so the assertions are timezone-safe.

const iso = (y, m, d, h, min = 0) => new Date(y, m, d, h, min).toISOString()

// Three entries: two in the week of Mon 2026-08-03, one in the week of Mon
// 2026-08-10; the last one logged a day late (Nachbuchung).
const entries = [
  { checked_in: iso(2026, 7, 4, 9),  checked_out: iso(2026, 7, 4, 13),     created_at: iso(2026, 7, 4, 9),  task: 'Synthesis', project: 'LIDA',  note: '' },        // Tue, 4 h
  { checked_in: iso(2026, 7, 5, 10), checked_out: iso(2026, 7, 5, 13, 30), created_at: iso(2026, 7, 5, 10), task: 'HPLC',      project: '',      note: 'run 2' },   // Wed, 3.5 h
  { checked_in: iso(2026, 7, 11, 9), checked_out: iso(2026, 7, 11, 17),    created_at: iso(2026, 7, 12, 9), task: 'Analysis',  project: 'LIDA',  note: '' },        // next Tue, 8 h, NB
]
const absences = [
  { date: '2026-08-07', type: 'vacation', half_day: false, note: 'Sommer' },
  { date: '2026-08-12', type: 'sick',     half_day: true,  note: '' },
]

const grid = (ws) => XLSX.utils.sheet_to_json(ws, { header: 1 })
const findRow = (rows, cell) => rows.find(r => r?.includes(cell))

describe('buildMonthSheet (August 2026, 40 h/week)', () => {
  const rows = grid(buildMonthSheet(2026, 7, entries, absences, 'christian', 40))

  it('carries the header block', () => {
    expect(rows[0][0]).toBe('ARBEITSZEITPROTOKOLL / WORK TIME PROTOCOL')
    expect(findRow(rows, 'Name / Email:')[1]).toBe('christian')
    expect(findRow(rows, 'Wochenstunden / Weekly target:')[1]).toBe('40 h')
  })

  it('computes the monthly summary: 15.5 h worked, 3 days, Soll = 40·31/7', () => {
    const header = rows.findIndex(r => r?.[0] === 'Geleistete Stunden')
    const s = rows[header + 1]
    expect(s[0]).toBe(15.5)                       // 4 + 3.5 + 8
    expect(s[1]).toBe(+(40 * (31 / 7)).toFixed(2)) // 177.14
    expect(s[2]).toBe(+(15.5 - 40 * (31 / 7)).toFixed(2))
    expect(s[3]).toBe(3)                          // distinct days worked
    expect(s[4]).toBe(0.5)                        // half sick day
    expect(s[5]).toBe(1)                          // one vacation day
  })

  it('splits the daily table into calendar weeks with subtotals and a month total', () => {
    const kw = rows.filter(r => r?.[3] === 'KW-Summe →').map(r => r[4])
    expect(kw).toEqual([7.5, 8])                  // week 1: 4+3.5, week 2: 8
    expect(findRow(rows, 'MONATSSUMME →')[4]).toBe(15.5)
  })

  it('flags the late-logged entry as Nachbuchung', () => {
    // exclude the table header, whose 9th column is the literal 'NB' label
    const daily = rows.filter(r => r?.[8] === 'NB' && r?.[0] !== 'Datum')
    expect(daily).toHaveLength(1)
    expect(daily[0][5]).toBe('Analysis')
  })

  it('lists absences with kind and duration', () => {
    expect(findRow(rows, 'Urlaub / Vacation')).toBeTruthy()
    const sick = findRow(rows, 'Krank / Sick')
    expect(sick[2]).toBe('Halbtag')
  })
})

describe('buildYearSummarySheet', () => {
  const rows = grid(buildYearSummarySheet({
    year: 2026, entries, weeklyHours: 40,
    vacationPerYear: 30, vacationUsed: 12, vacationRemaining: 18, sickDays: 3,
  }))

  it('reports the vacation balance and sick days it was given', () => {
    expect(rows[0][0]).toBe('JAHRESÜBERSICHT / YEAR SUMMARY 2026')
    expect(findRow(rows, 'Anspruch / Total')[1]).toBe(30)
    expect(findRow(rows, 'Genommen / Used')[1]).toBe(12)
    expect(findRow(rows, 'Verbleibend / Remaining')[1]).toBe(18)
    expect(findRow(rows, 'Kranktage / Sick days (YTD)')[1]).toBe(3)
  })

  it('covers 26 weeks, each judged against the weekly target', () => {
    const header = rows.findIndex(r => r?.[0] === 'Woche / Week')
    const weeks = rows.slice(header + 1).filter(r => r?.length >= 4)
    expect(weeks).toHaveLength(26)
    for (const w of weeks) expect(w[3]).toBe(+(w[1] - 40).toFixed(2))
  })
})

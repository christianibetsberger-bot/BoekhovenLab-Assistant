// Work-protocol Excel export — extracted from TimeTracker.vue.
//
// Builds the WorkProtocol_<name>_<year>.xlsx workbook: one sheet per month that
// has entries (header block, monthly summary, daily table with KW subtotals,
// absences, an embedded Plotly hours chart) plus a year-summary sheet.
//
// Everything the component used to read from its reactive state arrives as plain
// arguments, so this module is pure data→file and unit-testable. Plotly is
// imported lazily inside renderMonthChart: chart embedding is best-effort in the
// caller anyway, and the sheet builders stay importable in Node (tests) where
// plotly.js-dist-min cannot load.
import * as XLSX from 'xlsx'
import { formatTime, getMonday, entryMinutes, isNachbuchung } from './timeFormat'

/**
 * Build and download the full workbook.
 * @param entries            all time_entries rows
 * @param absences           all time_absences rows ({ date:'YYYY-MM-DD', type, half_day, note })
 * @param ownerName          shown in each sheet header and the filename
 * @param year               the "current year" for the summary sheet + filename
 * @param weeklyHours        contract hours per week
 * @param vacationPerYear / vacationUsed / vacationRemaining / sickDays  year-summary numbers
 */
export async function exportTimeXlsx({ entries, absences, ownerName, year, weeklyHours, vacationPerYear, vacationUsed, vacationRemaining, sickDays }) {
  const wb = XLSX.utils.book_new()

  // Collect all months that have entries, plus the current month.
  const monthSet = new Set(
    entries.map(e => {
      const d = new Date(e.checked_in)
      return `${d.getFullYear()}-${String(d.getMonth()).padStart(2, '0')}`
    })
  )
  const today = new Date()
  monthSet.add(`${today.getFullYear()}-${String(today.getMonth()).padStart(2, '0')}`)

  const months = [...monthSet]
    .map(k => { const [y, m] = k.split('-'); return { year: +y, month: +m } })
    .sort((a, b) => a.year !== b.year ? a.year - b.year : a.month - b.month)

  for (const { year: y, month } of months) {
    const mEntries = entries.filter(e => {
      const d = new Date(e.checked_in)
      return d.getFullYear() === y && d.getMonth() === month
    })
    const mAbsences = absences.filter(a => {
      const [ay, am] = a.date.split('-').map(Number)
      return ay === y && (am - 1) === month
    })

    const sheetName = new Date(y, month, 1).toLocaleDateString('de-DE', { month: 'short', year: 'numeric' })
    const ws = buildMonthSheet(y, month, mEntries, mAbsences, ownerName, weeklyHours)

    // Generate the Plotly chart and embed it as a PNG (best-effort).
    try {
      const chartPng = await renderMonthChart(y, month, mEntries, weeklyHours)
      if (chartPng) {
        const dataRow = (ws['!lastrow'] ?? 0) + 3
        if (!ws['!images']) ws['!images'] = []
        ws['!images'].push({
          '!data': chartPng,
          '!ext': '.png',
          '!pos': { r: dataRow, c: 0, x: 0, y: 0, w: 7315200, h: 3200400 },
        })
        // Reserve rows so the chart area is visible
        ws['!rows'] = ws['!rows'] || []
        for (let r = dataRow; r < dataRow + 22; r++) ws['!rows'][r] = { hpt: 18 }
      }
    } catch (_) { /* chart embed failed — sheet still has data */ }

    XLSX.utils.book_append_sheet(wb, ws, sheetName)
  }

  // Final sheet: Year summary
  XLSX.utils.book_append_sheet(wb,
    buildYearSummarySheet({ year, entries, weeklyHours, vacationPerYear, vacationUsed, vacationRemaining, sickDays }),
    `Year ${year}`)

  XLSX.writeFile(wb, `WorkProtocol_${ownerName}_${year}.xlsx`, { bookImages: true })
}

export function buildMonthSheet(year, month, mEntries, mAbsences, ownerName, weeklyHours) {
  const monthLabel = new Date(year, month, 1).toLocaleDateString('de-DE', { month: 'long', year: 'numeric' })
  const dInMonth   = new Date(year, month + 1, 0).getDate()
  const totalH     = mEntries.reduce((s, e) => s + entryMinutes(e), 0) / 60
  const reqH       = weeklyHours * (dInMonth / 7)
  const ot         = totalH - reqH
  const daysWorked = new Set(mEntries.filter(e => e.checked_out).map(e =>
    new Date(e.checked_in).toISOString().split('T')[0]
  )).size
  const mSick = mAbsences.filter(a => a.type === 'sick').reduce((s, a) => s + (a.half_day ? .5 : 1), 0)
  const mVac  = mAbsences.filter(a => a.type === 'vacation').reduce((s, a) => s + (a.half_day ? .5 : 1), 0)

  const DAYS_DE = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa']
  const rows    = []

  // ── Header block ──────────────────────────────────────────────────────────
  rows.push(['ARBEITSZEITPROTOKOLL / WORK TIME PROTOCOL'])
  rows.push([])
  rows.push(['Name / Email:', ownerName])
  rows.push(['Monat / Month:', monthLabel])
  rows.push(['Wochenstunden / Weekly target:', `${weeklyHours} h`])
  rows.push([])

  // ── Monthly summary ────────────────────────────────────────────────────────
  rows.push(['─── MONATSÜBERSICHT / MONTHLY SUMMARY ───'])
  rows.push([
    'Geleistete Stunden', 'Soll-Stunden', 'Überstunden', 'Arbeitstage', 'Kranktage', 'Urlaubstage',
  ])
  rows.push([
    +totalH.toFixed(2),
    +reqH.toFixed(2),
    +ot.toFixed(2),
    daysWorked,
    mSick,
    mVac,
  ])
  rows.push([])

  // ── Daily entries table ────────────────────────────────────────────────────
  rows.push(['─── TAGESEINTRÄGE / DAILY ENTRIES ───'])
  rows.push(['Datum', 'Tag', 'Check-In', 'Check-Out', 'Std.', 'Aufgabe', 'Projekt', 'Notiz', 'NB'])

  let currentWeek = null
  let weekH = 0
  const sortedEntries = [...mEntries].sort((a, b) => new Date(a.checked_in) - new Date(b.checked_in))

  for (const e of sortedEntries) {
    const d    = new Date(e.checked_in)
    const week = getMonday(d).toISOString().split('T')[0]

    if (currentWeek !== null && week !== currentWeek) {
      // Week subtotal separator
      rows.push(['', '', '', 'KW-Summe →', +weekH.toFixed(2), '', '', '', ''])
      rows.push([])
      weekH = 0
    }
    currentWeek = week

    const h = entryMinutes(e) / 60
    weekH += h
    rows.push([
      d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' }),
      DAYS_DE[d.getDay()],
      formatTime(e.checked_in),
      e.checked_out ? formatTime(e.checked_out) : '(laufend)',
      e.checked_out ? +h.toFixed(2) : '',
      e.task,
      e.project || '',
      e.note   || '',
      isNachbuchung(e) ? 'NB' : '',
    ])
  }
  if (currentWeek !== null) {
    rows.push(['', '', '', 'KW-Summe →', +weekH.toFixed(2), '', '', '', ''])
  }
  rows.push([])
  rows.push(['', '', '', 'MONATSSUMME →', +totalH.toFixed(2), '', '', '', ''])
  rows.push([])

  // ── Absences ───────────────────────────────────────────────────────────────
  if (mAbsences.length) {
    rows.push(['─── ABWESENHEITEN / ABSENCES ───'])
    rows.push(['Datum', 'Art', 'Dauer', 'Notiz'])
    for (const a of mAbsences.sort((x, y) => x.date.localeCompare(y.date))) {
      rows.push([
        a.date,
        a.type === 'sick' ? 'Krank / Sick' : 'Urlaub / Vacation',
        a.half_day ? 'Halbtag' : 'Ganztag',
        a.note || '',
      ])
    }
    rows.push([])
  }

  // ── Chart placeholder label ────────────────────────────────────────────────
  rows.push(['─── STUNDENDIAGRAMM / HOURS CHART ───'])

  const ws = XLSX.utils.aoa_to_sheet(rows)
  ws['!lastrow'] = rows.length

  ws['!cols'] = [
    { wch: 12 }, { wch: 5 }, { wch: 9 }, { wch: 9 }, { wch: 7 },
    { wch: 22 }, { wch: 22 }, { wch: 32 }, { wch: 4 },
  ]

  // Merge title cell across columns A–I
  ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 8 } }]

  return ws
}

export async function renderMonthChart(year, month, mEntries, weeklyHours) {
  const dInMonth = new Date(year, month + 1, 0).getDate()
  const days     = Array.from({ length: dInMonth }, (_, i) => i + 1)
  const hours    = days.map(d => {
    const start = new Date(year, month, d)
    const end   = new Date(year, month, d + 1)
    return mEntries
      .filter(e => e.checked_out && new Date(e.checked_in) >= start && new Date(e.checked_in) < end)
      .reduce((s, e) => s + entryMinutes(e), 0) / 60
  })
  const labels   = days.map(d => `${String(d).padStart(2, '0')}.${String(month + 1).padStart(2, '0')}`)
  const dailyReq = weeklyHours / 5

  const Plotly = (await import('plotly.js-dist-min')).default

  const div = document.createElement('div')
  div.style.cssText = 'position:fixed;left:-9999px;top:-9999px;width:800px;height:350px;'
  document.body.appendChild(div)

  try {
    await Plotly.react(div, [
      {
        type: 'bar', x: labels, y: hours.map(h => +h.toFixed(2)), name: 'Hours',
        marker: { color: hours.map(h => h >= dailyReq ? '#10b981' : h > 0 ? '#3b82f6' : '#e5e7eb') },
        hoverinfo: 'none',
      },
      {
        type: 'scatter', mode: 'lines', x: labels, y: Array(dInMonth).fill(dailyReq),
        line: { color: '#ef4444', width: 1.5, dash: 'dot' }, name: 'Target', hoverinfo: 'none',
      },
    ], {
      paper_bgcolor: '#ffffff', plot_bgcolor: '#f9fafb',
      font: { color: '#1f2937', size: 11, family: 'Arial' },
      margin: { l: 55, r: 20, b: 60, t: 30 },
      xaxis: { title: { text: 'Day', font: { size: 11 } }, tickangle: -45, gridcolor: '#e5e7eb' },
      yaxis: { title: { text: 'Hours', font: { size: 11 } }, gridcolor: '#e5e7eb', rangemode: 'tozero' },
      showlegend: true,
      legend: { orientation: 'h', y: 1.1, x: 0 },
      title: {
        text: `Work Hours — ${new Date(year, month, 1).toLocaleDateString('de-DE', { month: 'long', year: 'numeric' })}`,
        font: { size: 13 },
      },
    }, { staticPlot: true })

    const dataUrl = await Plotly.toImage(div, { format: 'png', width: 800, height: 350, scale: 2 })
    return dataUrl.replace(/^data:image\/png;base64,/, '')
  } finally {
    Plotly.purge(div)
    document.body.removeChild(div)
  }
}

export function buildYearSummarySheet({ year, entries, weeklyHours, vacationPerYear, vacationUsed, vacationRemaining, sickDays }) {
  const monday = getMonday(new Date())
  const rows   = []

  rows.push([`JAHRESÜBERSICHT / YEAR SUMMARY ${year}`])
  rows.push([])
  rows.push(['URLAUBSKONTO / VACATION BALANCE'])
  rows.push(['Anspruch / Total',        vacationPerYear])
  rows.push(['Genommen / Used',         vacationUsed])
  rows.push(['Verbleibend / Remaining', vacationRemaining])
  rows.push([])
  rows.push(['Kranktage / Sick days (YTD)', sickDays])
  rows.push([])
  rows.push(['─── WOCHENÜBERSICHT / WEEKLY OVERVIEW ───'])
  rows.push(['Woche / Week', 'Std. geleistet', 'Soll', 'Überstunden'])

  for (let w = 25; w >= 0; w--) {
    const wStart = new Date(monday); wStart.setDate(wStart.getDate() - w * 7)
    const wEnd   = new Date(wStart); wEnd.setDate(wEnd.getDate() + 7)
    const h = entries
      .filter(e => e.checked_out && new Date(e.checked_in) >= wStart && new Date(e.checked_in) < wEnd)
      .reduce((s, e) => s + entryMinutes(e), 0) / 60
    const label = wStart.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
    rows.push([label, +h.toFixed(2), weeklyHours, +(h - weeklyHours).toFixed(2)])
  }

  const ws = XLSX.utils.aoa_to_sheet(rows)
  ws['!cols'] = [{ wch: 20 }, { wch: 16 }, { wch: 10 }, { wch: 14 }]
  ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 3 } }]
  return ws
}

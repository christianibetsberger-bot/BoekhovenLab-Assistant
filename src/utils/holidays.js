// Bavarian public holidays — extracted verbatim from TimeTracker.vue.
//
// The tracker needs these to know which weekdays carry no work-hour target.
// Fixed-date holidays plus the five Easter-derived ones (Karfreitag, Ostermontag,
// Christi Himmelfahrt, Pfingstmontag, Fronleichnam). Dates are compared as local
// 'YYYY-MM-DD' strings, matching how the tracker stores absence dates.

// Anonymous Gregorian algorithm (Meeus/Jones/Butcher) for Easter Sunday.
export function easterDate(year) {
  const a = year % 19
  const b = Math.floor(year / 100), c = year % 100
  const d = Math.floor(b / 4),  e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4),  k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const n = h + l - 7 * m + 114
  return new Date(year, Math.floor(n / 31) - 1, (n % 31) + 1)
}

function fmtDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const holidayCache = new Map()

/** The full set of Bavarian public holidays for a year, as 'YYYY-MM-DD' strings. */
export function getBavarianHolidays(year) {
  if (holidayCache.has(year)) return holidayCache.get(year)
  const set = new Set([
    `${year}-01-01`,  // Neujahr
    `${year}-01-06`,  // Hl. Drei Könige (Bayern)
    `${year}-05-01`,  // Tag der Arbeit
    `${year}-08-15`,  // Mariä Himmelfahrt (Bayern, kath.)
    `${year}-10-03`,  // Tag der Deutschen Einheit
    `${year}-11-01`,  // Allerheiligen (Bayern)
    `${year}-12-25`,  // 1. Weihnachtstag
    `${year}-12-26`,  // 2. Weihnachtstag
  ])
  const easter = easterDate(year)
  for (const off of [-2, 1, 39, 50, 60]) {
    // Karfreitag, Ostermontag, Christi Himmelfahrt, Pfingstmontag, Fronleichnam
    const d = new Date(easter); d.setDate(d.getDate() + off)
    set.add(fmtDate(d))
  }
  holidayCache.set(year, set)
  return set
}

export function isBavarianHoliday(dateStr) {
  const yr = parseInt(dateStr.split('-')[0])
  return getBavarianHolidays(yr).has(dateStr)
}

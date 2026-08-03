// Time-tracker formatting and small date/entry helpers — extracted verbatim from
// TimeTracker.vue. Shared by the component, the Excel export and the charts, so
// they live here rather than being re-derived in each.
//
// An "entry" is a time_entries row: { checked_in, checked_out, created_at, … }.

/** '1h 30m' / '25m' from milliseconds; never negative. */
export function formatDuration(ms) {
  if (!ms || ms <= 0) return '0m'
  const h = Math.floor(ms / 3600000)
  const m = Math.floor((ms % 3600000) / 60000)
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

/** '2h' / '1h 30m' / '-1h 30m' from decimal hours (used for overtime balances). */
export function formatHours(h) {
  const abs = Math.abs(h), sign = h < 0 ? '-' : ''
  const hh = Math.floor(abs), mm = Math.round((abs - hh) * 60)
  return mm > 0 ? `${sign}${hh}h ${mm}m` : `${sign}${hh}h`
}

export function formatDate(ts) {
  return new Date(ts).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' })
}

export function formatTime(ts) {
  return new Date(ts).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
}

/** A timestamp as the value an <input type="datetime-local"> expects (local time). */
export function toDatetimeLocal(ts) {
  if (!ts) return ''
  const d = new Date(ts)
  const p = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

/** Midnight on the Monday of the given date's week (weeks run Mon–Sun). */
export function getMonday(d) {
  const dt = new Date(d)
  const day = dt.getDay()
  dt.setDate(dt.getDate() + (day === 0 ? -6 : 1 - day))
  dt.setHours(0, 0, 0, 0)
  return dt
}

/** Worked minutes of a closed entry; an open entry counts 0 until checkout. */
export function entryMinutes(e) {
  if (!e.checked_out) return 0
  return (new Date(e.checked_out) - new Date(e.checked_in)) / 60000
}

/** True when the entry was logged more than an hour after the fact (Nachbuchung). */
export function isNachbuchung(entry) {
  if (!entry.created_at || !entry.checked_in) return false
  return (new Date(entry.created_at) - new Date(entry.checked_in)) > 3600000
}

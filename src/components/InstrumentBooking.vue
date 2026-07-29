<script setup>
import { ref, computed, onMounted, nextTick, watch } from 'vue'
import { useLabStore } from '../stores/labStore'
import { db } from '../services/supabase'
import { INSTRUMENT_CATEGORIES, mergeInstrumentGroups, isBuiltinInstrument, categoryOf } from '../utils/instruments'
import { protocolHtml, protocolSummary } from '../utils/protocolView'
import { getOrCreateFeedToken, rotateFeedToken, feedUrls, CalendarTokenTableMissing } from '../utils/calendarFeed'

const store = useLabStore()

// ── Instrument catalogue — built-in groups merged with lab-added / hidden rows ──
const instrumentRows = ref([])   // from the shared `instruments` table
async function loadInstruments() {
  try {
    const { data, error } = await db.from('instruments').select('*').order('created_at')
    if (!error && data) instrumentRows.value = data
  } catch { /* table may not exist yet — built-ins still work */ }
}
onMounted(loadInstruments)
async function refreshAll() { await Promise.all([loadBookings(), loadMeetings(), loadErrors(), loadProtocols(), loadInstruments()]) }
const groups = computed(() => mergeInstrumentGroups(instrumentRows.value))
const allInstruments = computed(() => groups.value.flatMap(g => g.instruments))
const category = ref('All')
const categories = computed(() => ['All', ...groups.value.map(g => g.name)])
const instrSearch = ref('')
const columns = computed(() => {
  const q = instrSearch.value.trim().toLowerCase()
  if (q) return allInstruments.value.filter(n => n.toLowerCase().includes(q))
  return category.value === 'All' ? allInstruments.value : (groups.value.find(g => g.name === category.value)?.instruments || [])
})

// ── Add / remove instruments (lab-shared) ──
const showInstrMgr = ref(false)
const newInstr = ref({ name: '', category: 'Instruments' })
const instrMsg = ref('')
const hiddenInstruments = computed(() => instrumentRows.value.filter(r => r.hidden).map(r => r.name))
async function addInstrument() {
  const name = newInstr.value.name.trim()
  if (!name) { instrMsg.value = 'Give it a name.'; return }
  if (allInstruments.value.includes(name)) { instrMsg.value = 'That instrument already exists.'; return }
  const tomb = instrumentRows.value.find(r => r.hidden && r.name === name)   // un-hide instead of duplicating
  let error
  if (tomb) ({ error } = await db.from('instruments').delete().eq('id', tomb.id))
  else ({ error } = await db.from('instruments').insert({ name, category: (newInstr.value.category || 'Instruments').trim() || 'Instruments', hidden: false, owner_id: store.user.id }))
  if (error) { instrMsg.value = 'Failed: ' + error.message; return }
  newInstr.value = { name: '', category: newInstr.value.category }
  instrMsg.value = ''
  await loadInstruments(); store.toast('Instrument added')
}
async function removeInstrument(name) {
  if (!confirm(`Remove "${name}" from the instrument list?\nIts past bookings and logs stay in the logbook.`)) return
  const custom = instrumentRows.value.find(r => !r.hidden && r.name === name)
  let error
  if (custom) ({ error } = await db.from('instruments').delete().eq('id', custom.id))   // delete a lab-added one
  else ({ error } = await db.from('instruments').insert({ name, category: categoryOf(name, instrumentRows.value), hidden: true, owner_id: store.user.id }))   // tombstone a built-in
  if (error) { store.toast('Failed: ' + error.message); return }
  await loadInstruments(); store.toast('Instrument removed')
}
async function restoreInstrument(name) {
  const tomb = instrumentRows.value.find(r => r.hidden && r.name === name)
  if (!tomb) return
  const { error } = await db.from('instruments').delete().eq('id', tomb.id)
  if (error) { store.toast('Failed: ' + error.message); return }
  await loadInstruments(); store.toast('Instrument restored')
}

const view = ref('calendar') // 'calendar' | 'meetings' | 'stats' | 'logbook'

// ── Day navigation (one day per page) ──
const currentDay = ref((() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d })())
function shiftDay(n) { const d = new Date(currentDay.value); d.setDate(d.getDate() + n); currentDay.value = d }
function goToday() { const d = new Date(); d.setHours(0, 0, 0, 0); currentDay.value = d }
const dayLabel = computed(() => currentDay.value.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' }))
const isTodayView = computed(() => { const t = new Date(); t.setHours(0, 0, 0, 0); return +t === +currentDay.value })

// ── Hourly grid (default window 07:00–20:00; scroll for earlier/later) ──
const HOUR_H = 46
const HOURS = Array.from({ length: 24 }, (_, h) => h)
const hourLabel = (h) => String(h).padStart(2, '0') + ':00'
const calEl = ref(null)
function scrollToMorning() { nextTick(() => { if (calEl.value) calEl.value.scrollTop = 7 * HOUR_H }) }
onMounted(scrollToMorning)

// ── Bookings ──
const bookings = ref([])
const loading = ref(false)
const loadError = ref('')
async function loadBookings() {
  loading.value = true; loadError.value = ''
  const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 120)
  const { data, error } = await db.from('instrument_bookings')
    .select('*').gte('ends_at', cutoff.toISOString()).order('starts_at')
  if (error) loadError.value = error.message
  else bookings.value = data || []
  loading.value = false
}
onMounted(loadBookings)

function dayBookings(instrument) {
  const s = new Date(currentDay.value); const e = new Date(s); e.setDate(e.getDate() + 1)
  return bookings.value.filter(b => b.instrument === instrument &&
    new Date(b.starts_at) < e && new Date(b.ends_at) > s)
}
function bandStyle(b) {
  const dayS = new Date(currentDay.value)
  const s = new Date(b.starts_at), e = new Date(b.ends_at)
  const startMin = Math.max(0, (s - dayS) / 60000)
  const endMin = Math.min(24 * 60, (e - dayS) / 60000)
  return {
    top: (startMin / 60 * HOUR_H) + 'px',
    height: Math.max(15, (endMin - startMin) / 60 * HOUR_H - 2) + 'px',
    background: ownerColor(b.owner_email),
  }
}
const fmtT = (iso) => new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
const fmtRange = (b) => `${fmtT(b.starts_at)}–${fmtT(b.ends_at)}`
const initials = (email) => {
  const l = (email || '').split('@')[0]
  const p = l.split(/[.\-_]+/).filter(Boolean)
  return ((p.length >= 2 ? p[0][0] + p[1][0] : l.slice(0, 2)) || '?').toUpperCase()
}
// Each user gets their own colour — assigned by (stable, sorted) first-seen order
// so distinct users get distinct colours, with a legend on the calendar.
const OI = ['#0072B2', '#E69F00', '#009E73', '#CC79A7', '#D55E00', '#56B4E9', '#8E63C0', '#4C9F70', '#B84A5A', '#7C7C82']
const userColors = computed(() => {
  const emails = [...new Set([
    ...bookings.value.map(b => b.owner_email).filter(Boolean),
    store.user?.email,
  ].filter(Boolean))].sort()
  const map = {}
  emails.forEach((e, i) => { map[e] = OI[i % OI.length] })
  return map
})
function ownerColor(email) {
  if (userColors.value[email]) return userColors.value[email]
  let h = 0; const s = String(email || '')
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0
  return OI[h % OI.length]
}

// ── Booking dialog ──
const dialog = ref(null)
const saveMsg = ref('')
function toLocalInput(d) {
  const p = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}
const nowLocal = () => toLocalInput(new Date())
function bookAt(instrument, hour) {
  let start = new Date(currentDay.value); start.setHours(hour, 0, 0, 0)
  const now = new Date()
  if (start < now) { start = new Date(now); start.setMinutes(0, 0, 0); start.setHours(start.getHours() + 1) }
  const end = new Date(start.getTime() + 3600000)
  dialog.value = { mode: 'new', instrument, start: toLocalInput(start), end: toLocalInput(end), reason: '', notes: '' }
  saveMsg.value = ''
}
function openDetail(b) {
  dialog.value = { mode: 'view', booking: b, instrument: b.instrument, start: toLocalInput(new Date(b.starts_at)), end: toLocalInput(new Date(b.ends_at)), reason: b.reason || '', notes: b.notes || '' }
  saveMsg.value = ''
}
const isOwner = computed(() => dialog.value?.booking?.owner_id === store.user?.id)
function editBooking() { dialog.value.mode = 'edit' }
function closeDialog() { dialog.value = null }
function overlaps(instrument, startsAt, endsAt, ignoreId) {
  const s = new Date(startsAt), e = new Date(endsAt)
  return bookings.value.some(b => b.instrument === instrument && b.id !== ignoreId &&
    new Date(b.starts_at) < e && new Date(b.ends_at) > s)
}
async function saveBooking() {
  const d = dialog.value
  const starts = new Date(d.start), ends = new Date(d.end)
  if (isNaN(starts) || isNaN(ends)) { saveMsg.value = 'Pick a start and end time.'; return }
  if (ends <= starts) { saveMsg.value = 'End must be after start.'; return }
  if (d.mode === 'new' && starts < new Date(Date.now() - 60000)) { saveMsg.value = 'No retroactive bookings — pick a future time.'; return }
  const ignoreId = d.mode === 'edit' ? d.booking.id : null
  if (overlaps(d.instrument, starts.toISOString(), ends.toISOString(), ignoreId)) { saveMsg.value = 'That slot overlaps an existing booking.'; return }
  saveMsg.value = 'Saving…'
  const payload = { instrument: d.instrument, starts_at: starts.toISOString(), ends_at: ends.toISOString(), reason: (d.reason || '').trim(), notes: (d.notes || '').trim() }
  let error
  if (d.mode === 'edit') ({ error } = await db.from('instrument_bookings').update(payload).eq('id', d.booking.id))
  else ({ error } = await db.from('instrument_bookings').insert({ ...payload, owner_id: store.user.id, owner_email: store.user.email }))
  if (error) { saveMsg.value = 'Save failed: ' + error.message; return }
  await loadBookings(); closeDialog(); store.toast(d.mode === 'edit' ? 'Booking updated' : 'Instrument booked')
}
async function removeBooking() {
  if (!confirm('Delete this booking? (removes it from the logbook too)')) return
  const { error } = await db.from('instrument_bookings').delete().eq('id', dialog.value.booking.id)
  if (error) { saveMsg.value = 'Delete failed: ' + error.message; return }
  await loadBookings(); closeDialog(); store.toast('Booking removed')
}

// ── Statistics — utilization ──
const statsPeriod = ref('30d') // '7d' | '30d' | 'all'
const utilization = computed(() => {
  const now = Date.now()
  const cutoff = statsPeriod.value === '7d' ? now - 7 * 864e5 : statsPeriod.value === '30d' ? now - 30 * 864e5 : 0
  const hrs = {}, cnt = {}
  for (const b of bookings.value) {
    const s = new Date(b.starts_at).getTime(), e = new Date(b.ends_at).getTime()
    if (e < cutoff) continue
    const cs = Math.max(s, cutoff)
    hrs[b.instrument] = (hrs[b.instrument] || 0) + Math.max(0, (e - cs)) / 3600000
    cnt[b.instrument] = (cnt[b.instrument] || 0) + 1
  }
  return allInstruments.value
    .map(inst => ({ inst, hours: hrs[inst] || 0, count: cnt[inst] || 0 }))
    .filter(x => x.hours > 0)
    .sort((a, b) => b.hours - a.hours)
})
const maxUtil = computed(() => Math.max(1, ...utilization.value.map(u => u.hours)))

function fmtDateTime(iso) { return new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) }

// ── Protocols (linked to instruments in the Lab Journal) ──
const protocols = ref([])
async function loadProtocols() {
  try {
    const { data, error } = await db.from('protocols').select('*')
    if (!error && data) protocols.value = (data || []).map(r => ({ ...r.data, owner_id: r.owner_id }))
  } catch { /* table may not exist yet */ }
}
onMounted(loadProtocols)
function protocolsFor(inst) { return protocols.value.filter(p => p.instrument === inst) }
const protocolCount = computed(() => {
  const m = {}
  for (const p of protocols.value) if (p.instrument) m[p.instrument] = (m[p.instrument] || 0) + 1
  return m
})

// ── Logbook — one collapsible section per instrument (its own logs + protocols) ──
const logSearch = ref('')
const expandedLog = ref('')
const expandedProto = ref('')
function toggleLog(inst) { expandedLog.value = expandedLog.value === inst ? '' : inst }
function toggleProto(id) { expandedProto.value = expandedProto.value === id ? '' : id }
function openInstrumentLog(inst) { view.value = 'logbook'; logSearch.value = ''; expandedLog.value = inst }
const logInstruments = computed(() => {
  const q = logSearch.value.trim().toLowerCase()
  let names
  if (q) {
    // While searching, match across the whole catalogue (even instruments with no logs yet)
    names = [...new Set([
      ...allInstruments.value,
      ...bookings.value.map(b => b.instrument),
      ...errors.value.map(e => e.instrument),
      ...protocols.value.map(p => p.instrument).filter(Boolean),
    ])].filter(n => n && n.toLowerCase().includes(q))
  } else {
    // Otherwise show only instruments that actually have activity
    const set = new Set()
    for (const b of bookings.value) set.add(b.instrument)
    for (const e of errors.value) set.add(e.instrument)
    for (const p of protocols.value) if (p.instrument) set.add(p.instrument)
    names = [...set]
  }
  return names.filter(Boolean).sort((a, b) => a.localeCompare(b)).map(inst => ({
    inst,
    bookings: bookings.value.filter(b => b.instrument === inst).sort((a, b) => new Date(b.starts_at) - new Date(a.starts_at)),
    errs: errors.value.filter(e => e.instrument === inst).sort((a, b) => (a.resolved ? 1 : 0) - (b.resolved ? 1 : 0) || new Date(b.occurred_at) - new Date(a.occurred_at)),
    protos: protocolsFor(inst),
    openErrors: openErrorsByInstrument.value[inst] || 0,
  }))
})

// ══ Meetings — own calendar, shared with invitees (by email) or lab-wide ══
// Row visibility is enforced by RLS: lab-wide, owner, or invited (jwt email).
const meetings = ref([])
async function loadMeetings() {
  try {
    const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 120)
    const { data, error } = await db.from('meetings').select('*').gte('ends_at', cutoff.toISOString()).order('starts_at')
    if (!error && data) meetings.value = data
  } catch { /* table may not exist yet */ }
}
onMounted(loadMeetings)
const dayMeetings = computed(() => {
  const s = new Date(currentDay.value); const e = new Date(s); e.setDate(e.getDate() + 1)
  return meetings.value.filter(m => new Date(m.starts_at) < e && new Date(m.ends_at) > s)
})
const knownEmails = computed(() => [...new Set([
  ...bookings.value.map(b => b.owner_email),
  ...meetings.value.flatMap(m => [m.owner_email, ...(m.invitees || [])]),
].filter(Boolean))].sort())

const mtgEl = ref(null)
const mtgDialog = ref(null)
const mtgMsg = ref('')
const inviteeInput = ref('')
function newMeetingAt(hour) {
  let start = new Date(currentDay.value)
  if (hour == null) { start.setHours(10, 0, 0, 0) } else { start.setHours(hour, 0, 0, 0) }
  const now = new Date()
  if (start < now) { start = new Date(now); start.setMinutes(0, 0, 0); start.setHours(start.getHours() + 1) }
  const end = new Date(start.getTime() + 3600000)
  mtgDialog.value = { mode: 'new', title: '', location: '', start: toLocalInput(start), end: toLocalInput(end), scope: 'invited', invitees: [], notes: '' }
  mtgMsg.value = ''; inviteeInput.value = ''
}
function openMeeting(m) {
  mtgDialog.value = { mode: 'view', meeting: m, title: m.title, location: m.location, start: toLocalInput(new Date(m.starts_at)), end: toLocalInput(new Date(m.ends_at)), scope: m.scope, invitees: [...(m.invitees || [])], notes: m.notes || '' }
  mtgMsg.value = ''
}
const isMtgOwner = computed(() => mtgDialog.value?.meeting?.owner_id === store.user?.id)
function editMeeting() { mtgDialog.value.mode = 'edit' }
function closeMtg() { mtgDialog.value = null }
function addInvitee() {
  const e = (inviteeInput.value || '').trim().toLowerCase()
  if (e && !mtgDialog.value.invitees.includes(e)) mtgDialog.value.invitees.push(e)
  inviteeInput.value = ''
}
function removeInvitee(e) { mtgDialog.value.invitees = mtgDialog.value.invitees.filter(x => x !== e) }
async function saveMeeting() {
  const d = mtgDialog.value
  if (!d.title.trim()) { mtgMsg.value = 'Add a title.'; return }
  const starts = new Date(d.start), ends = new Date(d.end)
  if (isNaN(starts) || isNaN(ends)) { mtgMsg.value = 'Pick a start and end time.'; return }
  if (ends <= starts) { mtgMsg.value = 'End must be after start.'; return }
  if (d.mode === 'new' && starts < new Date(Date.now() - 60000)) { mtgMsg.value = 'No retroactive meetings.'; return }
  if (d.scope === 'invited' && !d.invitees.length) { mtgMsg.value = 'Add at least one invitee, or set it lab-wide.'; return }
  mtgMsg.value = 'Saving…'
  const payload = {
    title: d.title.trim(), location: (d.location || '').trim(),
    starts_at: starts.toISOString(), ends_at: ends.toISOString(),
    scope: d.scope, invitees: d.scope === 'lab' ? [] : d.invitees, notes: (d.notes || '').trim(),
  }
  let error
  if (d.mode === 'edit') ({ error } = await db.from('meetings').update(payload).eq('id', d.meeting.id))
  else ({ error } = await db.from('meetings').insert({ ...payload, owner_id: store.user.id, owner_email: store.user.email }))
  if (error) { mtgMsg.value = 'Save failed: ' + error.message; return }
  await loadMeetings(); closeMtg(); store.toast(d.mode === 'edit' ? 'Meeting updated' : 'Meeting created')
}
async function removeMeeting() {
  if (!confirm('Delete this meeting?')) return
  const { error } = await db.from('meetings').delete().eq('id', mtgDialog.value.meeting.id)
  if (error) { mtgMsg.value = 'Delete failed: ' + error.message; return }
  await loadMeetings(); closeMtg(); store.toast('Meeting removed')
}
function scrollMtgMorning() { nextTick(() => { if (mtgEl.value) mtgEl.value.scrollTop = 7 * HOUR_H }) }

// ── Calendar sync — subscribe Apple/Google Calendar to a personal meetings feed ──
// The feed is served by the `calendar-feed` Edge Function; the app only ever hands
// the user their private link. Subscribing is opt-in and per person.
const syncDialog = ref(false)
const syncBusy = ref(false)
const syncUrls = ref(null)      // { https, webcal, google } once a token is loaded
const syncErr = ref('')         // '' | 'setup' | error message
const copiedKey = ref('')       // which link was last copied (for the ✓ flash)
async function openSync() {
  syncDialog.value = true; syncErr.value = ''; copiedKey.value = ''
  if (syncUrls.value) return
  await loadFeed()
}
async function loadFeed() {
  if (!store.user?.id) { syncErr.value = 'Sign in to get your calendar link.'; return }
  syncBusy.value = true; syncErr.value = ''
  try {
    const token = await getOrCreateFeedToken(store.user)
    syncUrls.value = feedUrls(token)
  } catch (e) {
    syncErr.value = e instanceof CalendarTokenTableMissing ? 'setup' : ('Couldn’t load your link: ' + (e.message || e))
  } finally { syncBusy.value = false }
}
async function regenerateFeed() {
  if (!confirm('Generate a new link and revoke the old one?\nCalendars still using the old link will stop updating until re-added.')) return
  syncBusy.value = true; syncErr.value = ''; copiedKey.value = ''
  try {
    const token = await rotateFeedToken(store.user)
    syncUrls.value = feedUrls(token)
    store.toast('New calendar link generated')
  } catch (e) {
    syncErr.value = e instanceof CalendarTokenTableMissing ? 'setup' : ('Couldn’t regenerate: ' + (e.message || e))
  } finally { syncBusy.value = false }
}
async function copyLink(key) {
  const url = syncUrls.value?.[key]
  if (!url) return
  try {
    await navigator.clipboard.writeText(url)
    copiedKey.value = key
    setTimeout(() => { if (copiedKey.value === key) copiedKey.value = '' }, 1800)
  } catch { window.prompt('Copy this link:', url) }
}
function closeSync() { syncDialog.value = false }

// ══ Instrument errors / maintenance log ══
const errors = ref([])
async function loadErrors() {
  try {
    const { data, error } = await db.from('instrument_errors').select('*').order('occurred_at', { ascending: false })
    if (!error && data) errors.value = data
  } catch { /* table may not exist yet */ }
}
onMounted(loadErrors)
// Status: 'open' → 'in_repair' → 'resolved'. Falls back to the older `resolved`
// boolean for rows saved before the status column existed.
function errStatus(e) { return e.status || (e.resolved ? 'resolved' : 'open') }
const openErrorsByInstrument = computed(() => {
  const m = {}
  for (const e of errors.value) if (errStatus(e) !== 'resolved') m[e.instrument] = (m[e.instrument] || 0) + 1
  return m
})
// Worst active status per instrument for the column-header flag ('open' wins).
const worstStatusByInstrument = computed(() => {
  const m = {}
  for (const e of errors.value) {
    const s = errStatus(e)
    if (s === 'open') m[e.instrument] = 'open'
    else if (s === 'in_repair' && m[e.instrument] !== 'open') m[e.instrument] = 'in_repair'
  }
  return m
})
// Active (unresolved / in-repair) errors on instruments currently in view — shown
// as a banner above the booking calendar until they are resolved.
const bannerErrors = computed(() => {
  const cols = new Set(columns.value)
  return errors.value
    .filter(e => errStatus(e) !== 'resolved' && cols.has(e.instrument))
    .map(e => ({ ...e, _status: errStatus(e) }))
    .sort((a, b) => (a._status === 'open' ? 0 : 1) - (b._status === 'open' ? 0 : 1) || new Date(b.occurred_at) - new Date(a.occurred_at))
})

// Update helper that gracefully retries without `status` if that column has not
// been added to the table yet, so resolve/reopen keep working either way.
async function updateErr(id, payload) {
  const res = await db.from('instrument_errors').update(payload).eq('id', id)
  if (res.error && 'status' in payload && /status|column|schema/i.test(res.error.message)) {
    const { status, ...rest } = payload
    const res2 = await db.from('instrument_errors').update(rest).eq('id', id)
    return { error: res2.error, stripped: !res2.error }
  }
  return { error: res.error, stripped: false }
}

const errDialog = ref(null)
const errMsg = ref('')
function reportError(instrument) {
  errDialog.value = { instrument: instrument || columns.value[0] || allInstruments.value[0] || '', description: '', occurred_at: toLocalInput(new Date()) }
  errMsg.value = ''
}
async function saveError() {
  const d = errDialog.value
  if (!d.instrument) { errMsg.value = 'Pick an instrument.'; return }
  if (!d.description.trim()) { errMsg.value = 'Describe the error.'; return }
  errMsg.value = 'Saving…'
  const payload = {
    instrument: d.instrument, description: d.description.trim(),
    occurred_at: new Date(d.occurred_at).toISOString(),
    reporter_id: store.user.id, reporter_email: store.user.email, resolved: false, status: 'open',
  }
  let { error } = await db.from('instrument_errors').insert(payload)
  if (error && /status|column|schema/i.test(error.message)) { const { status, ...rest } = payload; ({ error } = await db.from('instrument_errors').insert(rest)) }
  if (error) { errMsg.value = 'Save failed: ' + error.message; return }
  await loadErrors(); errDialog.value = null; store.toast('Error reported')
}
async function setInRepair(e) {
  const { error, stripped } = await updateErr(e.id, { status: 'in_repair', resolved: false })
  if (error) { store.toast('Failed — ' + error.message); return }
  await loadErrors()
  store.toast(stripped ? 'Add the "status" column to enable In-repair (SQL provided)' : 'Marked as in repair')
}
async function resolveError(e) {
  const note = prompt('Resolution note (how was it fixed?):', '')
  if (note === null) return
  const { error } = await updateErr(e.id, {
    status: 'resolved', resolved: true, resolved_note: note, resolved_by_email: store.user.email, resolved_at: new Date().toISOString(),
  })
  if (error) { store.toast('Failed to resolve — ' + error.message); return }
  await loadErrors(); store.toast('Marked resolved')
}
async function reopenError(e) {
  await updateErr(e.id, { status: 'open', resolved: false, resolved_note: null, resolved_by_email: null, resolved_at: null })
  await loadErrors()
}

watch(view, (v) => { if (v === 'calendar') scrollToMorning(); if (v === 'meetings') scrollMtgMorning() })
</script>

<template>
  <div class="card">
    <h2><i class="fas fa-calendar-check"></i> Instrument Booking</h2>

    <div class="bk-toolbar">
      <div class="scope-chips">
        <button class="scope-chip" :class="{ active: view === 'calendar' }" @click="view = 'calendar'">Instruments</button>
        <button class="scope-chip" :class="{ active: view === 'meetings' }" @click="view = 'meetings'">Meetings</button>
        <button class="scope-chip" :class="{ active: view === 'stats' }" @click="view = 'stats'">Statistics</button>
        <button class="scope-chip" :class="{ active: view === 'logbook' }" @click="view = 'logbook'">Logbook</button>
      </div>
      <span class="bk-hint"><i class="fas fa-circle-info"></i> Shared with the whole lab · no retroactive bookings</span>
      <button class="secondary small" style="margin-left:auto;" @click="showInstrMgr = true"><i class="fas fa-sliders"></i> Manage instruments</button>
      <button class="secondary small" @click="refreshAll" :disabled="loading"><i class="fas fa-rotate"></i> Refresh</button>
    </div>

    <div v-if="loadError" class="bk-error"><i class="fas fa-triangle-exclamation"></i> {{ loadError }} — is the <code>instrument_bookings</code> table set up?</div>

    <!-- ════ CALENDAR — single day, hourly, booking bands ════ -->
    <template v-if="view === 'calendar'">
      <div class="bk-daybar">
        <button class="secondary small" @click="shiftDay(-1)"><i class="fas fa-chevron-left"></i></button>
        <button class="secondary small" @click="goToday" :class="{ 'is-today': isTodayView }">Today</button>
        <button class="secondary small" @click="shiftDay(1)"><i class="fas fa-chevron-right"></i></button>
        <span class="bk-daylabel">{{ dayLabel }}</span>
      </div>

      <div class="bk-cats">
        <button v-for="c in categories" :key="c" class="bk-cat" :class="{ active: category === c && !instrSearch }" @click="category = c; instrSearch = ''">{{ c }}</button>
        <div class="bk-search"><i class="fas fa-search"></i><input v-model="instrSearch" placeholder="Search instruments…"><button v-if="instrSearch" class="bk-search-x" @click="instrSearch = ''">✕</button></div>
      </div>

      <div v-if="Object.keys(userColors).length" class="bk-legend">
        <span v-for="(color, email) in userColors" :key="email" class="bk-legend-item">
          <span class="bk-legend-dot" :style="{ background: color }"></span>{{ email.split('@')[0] }}
        </span>
      </div>

      <!-- Active instrument errors — visible in the booking until resolved -->
      <div v-if="bannerErrors.length" class="bk-alerts">
        <div v-for="e in bannerErrors" :key="e.id" class="bk-alert" :class="e._status">
          <span class="bk-alert-tag"><i :class="e._status === 'in_repair' ? 'fas fa-screwdriver-wrench' : 'fas fa-triangle-exclamation'"></i> {{ e._status === 'in_repair' ? 'In repair' : 'Error' }}</span>
          <span class="bk-alert-inst">{{ e.instrument }}</span>
          <span class="bk-alert-desc" :title="e.description">{{ e.description }}</span>
          <span class="bk-alert-meta">{{ initials(e.reporter_email) }} · {{ fmtDateTime(e.occurred_at) }}</span>
          <span class="bk-alert-actions">
            <button v-if="e._status !== 'in_repair'" class="secondary small" @click="setInRepair(e)"><i class="fas fa-screwdriver-wrench"></i> In repair</button>
            <button class="small" @click="resolveError(e)"><i class="fas fa-circle-check"></i> Resolved</button>
          </span>
        </div>
      </div>

      <div ref="calEl" class="cal">
        <div class="cal-headrow">
          <div class="cal-corner"></div>
          <div v-for="inst in columns" :key="'h' + inst" class="cal-colhead" :title="inst">
            <span>{{ inst }}</span>
            <i v-if="protocolCount[inst]" class="fas fa-file-lines cal-protoflag" :title="protocolCount[inst] + ' protocol(s) — open logbook'" @click.stop="openInstrumentLog(inst)"></i>
            <i v-if="worstStatusByInstrument[inst] === 'open'" class="fas fa-triangle-exclamation cal-errflag" :title="openErrorsByInstrument[inst] + ' open error(s) reported'"></i>
            <i v-else-if="worstStatusByInstrument[inst] === 'in_repair'" class="fas fa-screwdriver-wrench cal-repairflag" title="Under repair"></i>
          </div>
        </div>
        <div class="cal-bodyrow">
          <div class="cal-timecol">
            <div v-for="h in HOURS" :key="'t' + h" class="cal-hl" :style="{ height: HOUR_H + 'px' }">{{ hourLabel(h) }}</div>
          </div>
          <div v-for="inst in columns" :key="'c' + inst" class="cal-col" :style="{ height: 24 * HOUR_H + 'px' }">
            <div v-for="h in HOURS" :key="inst + h" class="cal-slot" :style="{ height: HOUR_H + 'px' }" @click="bookAt(inst, h)"></div>
            <div v-for="b in dayBookings(inst)" :key="b.id" class="cal-band" :style="bandStyle(b)"
                 @click.stop="openDetail(b)" :title="`${fmtRange(b)} · ${b.owner_email} · ${b.reason || ''}`">
              <div class="cal-band-time">{{ fmtRange(b) }}</div>
              <div class="cal-band-reason">{{ b.reason || 'Booked' }}</div>
              <div class="cal-band-who">{{ initials(b.owner_email) }}</div>
            </div>
          </div>
        </div>
      </div>
    </template>

    <!-- ════ MEETINGS — day timeline, invitee/lab-wide ════ -->
    <template v-else-if="view === 'meetings'">
      <div class="bk-daybar">
        <button class="secondary small" @click="shiftDay(-1)"><i class="fas fa-chevron-left"></i></button>
        <button class="secondary small" @click="goToday" :class="{ 'is-today': isTodayView }">Today</button>
        <button class="secondary small" @click="shiftDay(1)"><i class="fas fa-chevron-right"></i></button>
        <span class="bk-daylabel">{{ dayLabel }}</span>
        <button class="secondary small" style="margin-left:auto;" @click="openSync"><i class="fas fa-calendar-plus"></i> Sync to calendar</button>
        <button class="small" @click="newMeetingAt(null)"><i class="fas fa-plus"></i> New meeting</button>
      </div>
      <div ref="mtgEl" class="cal">
        <div class="cal-bodyrow">
          <div class="cal-timecol">
            <div v-for="h in HOURS" :key="'mt' + h" class="cal-hl" :style="{ height: HOUR_H + 'px' }">{{ hourLabel(h) }}</div>
          </div>
          <div class="cal-col mtg-col" :style="{ height: 24 * HOUR_H + 'px' }">
            <div v-for="h in HOURS" :key="'ms' + h" class="cal-slot" :style="{ height: HOUR_H + 'px' }" @click="newMeetingAt(h)"></div>
            <div v-for="m in dayMeetings" :key="m.id" class="cal-band mtg-band" :style="bandStyle(m)" @click.stop="openMeeting(m)">
              <div class="mtg-band-title">{{ m.title }}</div>
              <div v-if="m.location" class="mtg-band-loc"><i class="fas fa-location-dot"></i> {{ m.location }}</div>
              <div class="mtg-band-meta">{{ fmtRange(m) }} · <i :class="m.scope === 'lab' ? 'fas fa-globe' : 'fas fa-lock'"></i> {{ m.scope === 'lab' ? 'Lab' : (m.invitees?.length || 0) + ' invited' }}</div>
            </div>
          </div>
        </div>
      </div>
    </template>

    <!-- ════ STATISTICS — utilization ════ -->
    <template v-else-if="view === 'stats'">
      <div class="bk-cats">
        <button v-for="p in [['7d','This week'],['30d','30 days'],['all','All time']]" :key="p[0]" class="bk-cat" :class="{ active: statsPeriod === p[0] }" @click="statsPeriod = p[0]">{{ p[1] }}</button>
      </div>
      <div class="bk-stats">
        <div v-for="u in utilization" :key="u.inst" class="bk-statrow">
          <span class="bk-stat-name" :title="u.inst">{{ u.inst }}</span>
          <div class="bk-stat-track"><div class="bk-stat-bar" :style="{ width: (u.hours / maxUtil * 100) + '%' }"></div></div>
          <span class="bk-stat-val">{{ u.hours.toFixed(1) }} h · {{ u.count }}×</span>
        </div>
        <div v-if="!utilization.length" class="bk-empty">No usage recorded in this period.</div>
      </div>
    </template>

    <!-- ════ LOGBOOK — one section per instrument (its own logs + protocols) ════ -->
    <template v-else>
      <div class="bk-logbar">
        <div class="bk-search grow"><i class="fas fa-search"></i><input v-model="logSearch" placeholder="Search instruments…"><button v-if="logSearch" class="bk-search-x" @click="logSearch = ''">✕</button></div>
        <button class="danger small" @click="reportError(null)"><i class="fas fa-triangle-exclamation"></i> Report error</button>
      </div>

      <div class="lb-list">
        <div v-for="row in logInstruments" :key="row.inst" class="lb-inst" :class="{ open: expandedLog === row.inst }">
          <button class="lb-head" @click="toggleLog(row.inst)">
            <i class="fas lb-chev" :class="expandedLog === row.inst ? 'fa-chevron-down' : 'fa-chevron-right'"></i>
            <span class="lb-name">{{ row.inst }}</span>
            <span v-if="row.openErrors" class="lb-flag"><i class="fas fa-triangle-exclamation"></i> {{ row.openErrors }}</span>
            <span class="lb-counts">
              <span><i class="fas fa-calendar-check"></i> {{ row.bookings.length }}</span>
              <span v-if="row.protos.length"><i class="fas fa-file-lines"></i> {{ row.protos.length }}</span>
              <span v-if="row.errs.length"><i class="fas fa-triangle-exclamation"></i> {{ row.errs.length }}</span>
            </span>
          </button>

          <div v-if="expandedLog === row.inst" class="lb-body">
            <!-- Attached protocols -->
            <template v-if="row.protos.length">
              <div class="lb-sectitle"><i class="fas fa-file-lines"></i> Protocols</div>
              <div v-for="p in row.protos" :key="p.id" class="lb-proto">
                <button class="lb-proto-head" @click="toggleProto(p.id)">
                  <i class="fas" :class="expandedProto === p.id ? 'fa-caret-down' : 'fa-caret-right'"></i>
                  <span class="pr-type">{{ p.type }}</span>
                  <span class="lb-proto-name">{{ p.name }}</span>
                  <span class="lb-proto-sum">{{ protocolSummary(p) }}</span>
                </button>
                <div v-if="expandedProto === p.id" class="lb-proto-body" v-html="protocolHtml(p)"></div>
              </div>
            </template>

            <!-- Errors for this instrument -->
            <template v-if="row.errs.length">
              <div class="lb-sectitle"><i class="fas fa-triangle-exclamation"></i> Errors &amp; maintenance</div>
              <div class="bk-errs">
                <div v-for="e in row.errs" :key="e.id" class="bk-err" :class="errStatus(e)">
                  <span class="bk-err-tag" :class="errStatus(e) === 'resolved' ? 'ok' : errStatus(e) === 'in_repair' ? 'warn' : 'bad'">
                    <i :class="errStatus(e) === 'resolved' ? 'fas fa-circle-check' : errStatus(e) === 'in_repair' ? 'fas fa-screwdriver-wrench' : 'fas fa-triangle-exclamation'"></i>
                    {{ errStatus(e) === 'resolved' ? 'Resolved' : errStatus(e) === 'in_repair' ? 'In repair' : 'Error' }}
                  </span>
                  <div class="bk-err-body">
                    <div class="bk-err-desc">{{ e.description }}</div>
                    <div class="bk-err-meta">
                      Reported by {{ initials(e.reporter_email) }} · {{ fmtDateTime(e.occurred_at) }}
                      <template v-if="e.resolved && e.resolved_note"> · fixed by {{ initials(e.resolved_by_email) }}: {{ e.resolved_note }}</template>
                    </div>
                  </div>
                  <button v-if="errStatus(e) === 'open'" class="secondary small" @click="setInRepair(e)" title="Mark under repair"><i class="fas fa-screwdriver-wrench"></i></button>
                  <button v-if="errStatus(e) !== 'resolved'" class="small" @click="resolveError(e)">Resolve</button>
                  <button v-else class="secondary small" @click="reopenError(e)" title="Reopen"><i class="fas fa-rotate-left"></i></button>
                </div>
              </div>
            </template>

            <!-- Booking log for this instrument -->
            <div class="lb-sectitle"><i class="fas fa-calendar-check"></i> Bookings</div>
            <div class="bk-table-wrap">
              <table class="bk-table">
                <thead><tr><th>When</th><th>Duration</th><th>By</th><th>Reason</th><th>Notes</th></tr></thead>
                <tbody>
                  <tr v-for="b in row.bookings" :key="b.id" @click="openDetail(b)">
                    <td>{{ fmtDateTime(b.starts_at) }}</td><td>{{ fmtRange(b) }}</td>
                    <td><span class="bk-who-pill" :style="{ background: ownerColor(b.owner_email) }">{{ initials(b.owner_email) }}</span></td>
                    <td>{{ b.reason }}</td><td class="bk-notes-cell">{{ b.notes }}</td>
                  </tr>
                  <tr v-if="!row.bookings.length"><td colspan="5" style="text-align:center; opacity:.5; padding:14px;">No bookings logged.</td></tr>
                </tbody>
              </table>
            </div>
            <div class="lb-inst-actions">
              <button class="danger small" @click="reportError(row.inst)"><i class="fas fa-triangle-exclamation"></i> Report error on {{ row.inst }}</button>
            </div>
          </div>
        </div>
        <div v-if="!logInstruments.length" class="bk-empty">{{ logSearch ? 'No instruments match your search.' : 'No activity logged yet — book an instrument or link a protocol to get started.' }}</div>
      </div>
    </template>

    <!-- ════ DIALOG ════ -->
    <div v-if="dialog" class="bk-modal" @click.self="closeDialog">
      <div class="bk-dialog">
        <div class="bk-dialog-head">
          <span>{{ dialog.mode === 'new' ? 'Book' : dialog.mode === 'edit' ? 'Edit booking' : 'Booking' }} — {{ dialog.instrument }}</span>
          <button class="bk-x" @click="closeDialog">✕</button>
        </div>
        <template v-if="dialog.mode === 'view'">
          <div class="bk-view-row"><span>When</span><b>{{ fmtDateTime(dialog.booking.starts_at) }} → {{ fmtT(dialog.booking.ends_at) }}</b></div>
          <div class="bk-view-row"><span>Booked by</span><b>{{ dialog.booking.owner_email }}</b></div>
          <div class="bk-view-row"><span>Reason</span><b>{{ dialog.booking.reason || '—' }}</b></div>
          <div class="bk-view-row"><span>Notes</span><b>{{ dialog.booking.notes || '—' }}</b></div>
          <div class="bk-dialog-actions">
            <template v-if="isOwner">
              <button class="danger small" @click="removeBooking"><i class="fas fa-trash"></i> Delete</button>
              <button class="small" style="margin-left:auto;" @click="editBooking"><i class="fas fa-pen"></i> Edit</button>
            </template>
            <span v-else class="bk-hint" style="margin-left:auto;">Only the owner can edit this.</span>
          </div>
        </template>
        <template v-else>
          <label class="bk-field"><span>Start</span><input type="datetime-local" v-model="dialog.start" :min="nowLocal()"></label>
          <label class="bk-field"><span>End</span><input type="datetime-local" v-model="dialog.end" :min="dialog.start"></label>
          <label class="bk-field"><span>Reason</span><input type="text" v-model="dialog.reason" placeholder="e.g. CTI-117 kinetics run"></label>
          <label class="bk-field"><span>Notes</span><textarea v-model="dialog.notes" rows="3" placeholder="Method, samples, anything the next user should know…"></textarea></label>
          <div class="bk-dialog-actions">
            <span v-if="saveMsg" class="bk-msg">{{ saveMsg }}</span>
            <button class="small" style="margin-left:auto;" @click="saveBooking"><i class="fas fa-check"></i> {{ dialog.mode === 'edit' ? 'Save' : 'Book' }}</button>
          </div>
        </template>
      </div>
    </div>

    <!-- ════ MEETING DIALOG ════ -->
    <div v-if="mtgDialog" class="bk-modal" @click.self="closeMtg">
      <div class="bk-dialog">
        <div class="bk-dialog-head">
          <span>{{ mtgDialog.mode === 'new' ? 'New meeting' : mtgDialog.mode === 'edit' ? 'Edit meeting' : 'Meeting' }}</span>
          <button class="bk-x" @click="closeMtg">✕</button>
        </div>
        <template v-if="mtgDialog.mode === 'view'">
          <div class="bk-view-row"><span>Title</span><b>{{ mtgDialog.meeting.title }}</b></div>
          <div class="bk-view-row"><span>When</span><b>{{ fmtDateTime(mtgDialog.meeting.starts_at) }} → {{ fmtT(mtgDialog.meeting.ends_at) }}</b></div>
          <div class="bk-view-row"><span>Location</span><b>{{ mtgDialog.meeting.location || '—' }}</b></div>
          <div class="bk-view-row"><span>Shared</span><b>{{ mtgDialog.meeting.scope === 'lab' ? 'Lab-wide' : 'Invited only' }}</b></div>
          <div v-if="mtgDialog.meeting.scope !== 'lab'" class="bk-view-row"><span>Invitees</span><b>{{ (mtgDialog.meeting.invitees || []).join(', ') || '—' }}</b></div>
          <div class="bk-view-row"><span>Organiser</span><b>{{ mtgDialog.meeting.owner_email }}</b></div>
          <div class="bk-view-row"><span>Notes</span><b>{{ mtgDialog.meeting.notes || '—' }}</b></div>
          <div class="bk-dialog-actions">
            <template v-if="isMtgOwner">
              <button class="danger small" @click="removeMeeting"><i class="fas fa-trash"></i> Delete</button>
              <button class="small" style="margin-left:auto;" @click="editMeeting"><i class="fas fa-pen"></i> Edit</button>
            </template>
            <span v-else class="bk-hint" style="margin-left:auto;">Only the organiser can edit.</span>
          </div>
        </template>
        <template v-else>
          <label class="bk-field"><span>Title</span><input type="text" v-model="mtgDialog.title" placeholder="e.g. Subgroup meeting"></label>
          <label class="bk-field"><span>Location</span><input type="text" v-model="mtgDialog.location" placeholder="e.g. Seminar room 2 / Zoom link"></label>
          <div style="display:flex; gap:10px;">
            <label class="bk-field" style="flex:1;"><span>Start</span><input type="datetime-local" v-model="mtgDialog.start" :min="nowLocal()"></label>
            <label class="bk-field" style="flex:1;"><span>End</span><input type="datetime-local" v-model="mtgDialog.end" :min="mtgDialog.start"></label>
          </div>
          <div class="bk-field">
            <span>Shared with</span>
            <div class="scope-chips">
              <button type="button" class="scope-chip" :class="{ active: mtgDialog.scope === 'invited' }" @click="mtgDialog.scope = 'invited'">Invited only</button>
              <button type="button" class="scope-chip" :class="{ active: mtgDialog.scope === 'lab' }" @click="mtgDialog.scope = 'lab'">Lab-wide</button>
            </div>
          </div>
          <div v-if="mtgDialog.scope === 'invited'" class="bk-field">
            <span>Invitees (emails)</span>
            <div v-if="mtgDialog.invitees.length" class="mtg-invitees">
              <span v-for="e in mtgDialog.invitees" :key="e" class="mtg-chip">{{ e }}<button type="button" @click="removeInvitee(e)">×</button></span>
            </div>
            <div style="display:flex; gap:6px;">
              <input type="text" v-model="inviteeInput" list="mtg-emails" placeholder="name@example.com" @keydown.enter.prevent="addInvitee" style="flex:1;">
              <button type="button" class="secondary small" @click="addInvitee">Add</button>
            </div>
            <datalist id="mtg-emails"><option v-for="e in knownEmails" :key="e" :value="e"></option></datalist>
          </div>
          <label class="bk-field"><span>Notes</span><textarea v-model="mtgDialog.notes" rows="2" placeholder="Agenda, dial-in, etc."></textarea></label>
          <div class="bk-dialog-actions">
            <span v-if="mtgMsg" class="bk-msg">{{ mtgMsg }}</span>
            <button class="small" style="margin-left:auto;" @click="saveMeeting"><i class="fas fa-check"></i> {{ mtgDialog.mode === 'edit' ? 'Save' : 'Create' }}</button>
          </div>
        </template>
      </div>
    </div>

    <!-- ════ CALENDAR SYNC DIALOG ════ -->
    <div v-if="syncDialog" class="bk-modal" @click.self="closeSync">
      <div class="bk-dialog">
        <div class="bk-dialog-head"><span><i class="fas fa-calendar-plus"></i> Sync meetings to your calendar</span><button class="bk-x" @click="closeSync">✕</button></div>

        <p class="sy-intro">Subscribe once and your calendar keeps itself up to date — new, changed, and cancelled meetings flow through automatically. The link shows only the meetings shared with you.</p>

        <div v-if="syncBusy" class="sy-state"><i class="fas fa-spinner fa-spin"></i> Loading your link…</div>

        <div v-else-if="syncErr === 'setup'" class="bk-error" style="margin:0;">
          <i class="fas fa-triangle-exclamation"></i> Calendar sync isn’t set up yet. Run <code>supabase/calendar_sync.sql</code> in Supabase and deploy the <code>calendar-feed</code> function (<code>--no-verify-jwt</code>). Details are in the SQL file.
        </div>
        <div v-else-if="syncErr" class="bk-error" style="margin:0;"><i class="fas fa-triangle-exclamation"></i> {{ syncErr }} <button class="secondary small" @click="loadFeed">Retry</button></div>

        <template v-else-if="syncUrls">
          <div class="sy-actions">
            <a class="sy-btn primary" :href="syncUrls.webcal"><i class="fab fa-apple"></i> Add to Apple Calendar</a>
            <a class="sy-btn" :href="syncUrls.google" target="_blank" rel="noopener"><i class="fab fa-google"></i> Add to Google Calendar</a>
          </div>

          <div class="sy-link">
            <span class="sy-link-label">Feed link (paste into any calendar app)</span>
            <div class="sy-link-row">
              <input class="sy-link-input" :value="syncUrls.https" readonly @focus="$event.target.select()">
              <button class="small" @click="copyLink('https')"><i class="fas" :class="copiedKey === 'https' ? 'fa-check' : 'fa-copy'"></i> {{ copiedKey === 'https' ? 'Copied' : 'Copy' }}</button>
            </div>
          </div>

          <details class="sy-help">
            <summary>How to add it manually</summary>
            <p><b>Apple Calendar (iPhone/Mac):</b> the button above opens Calendar and asks you to subscribe. Or: Calendar → File → New Calendar Subscription → paste the feed link.</p>
            <p><b>Google Calendar:</b> the button opens the “from URL” screen. Or: Other calendars → <i class="fas fa-plus"></i> → From URL → paste the link. Google refreshes subscribed URLs every few hours.</p>
          </details>

          <div class="sy-foot">
            <span class="bk-hint"><i class="fas fa-lock"></i> Keep this link private — anyone with it can see your meetings.</span>
            <button class="secondary small" @click="regenerateFeed" :disabled="syncBusy"><i class="fas fa-rotate"></i> Regenerate</button>
          </div>
        </template>
      </div>
    </div>

    <!-- ════ ERROR REPORT DIALOG ════ -->
    <div v-if="errDialog" class="bk-modal" @click.self="errDialog = null">
      <div class="bk-dialog">
        <div class="bk-dialog-head"><span><i class="fas fa-triangle-exclamation" style="color:var(--wr);"></i> Report instrument error</span><button class="bk-x" @click="errDialog = null">✕</button></div>
        <label class="bk-field"><span>Instrument</span><select v-model="errDialog.instrument"><option v-for="inst in allInstruments" :key="inst" :value="inst">{{ inst }}</option></select></label>
        <label class="bk-field"><span>When did it happen</span><input type="datetime-local" v-model="errDialog.occurred_at"></label>
        <label class="bk-field"><span>What went wrong</span><textarea v-model="errDialog.description" rows="3" placeholder="e.g. Pump pressure spikes, leak at column inlet…"></textarea></label>
        <div class="bk-dialog-actions">
          <span v-if="errMsg" class="bk-msg">{{ errMsg }}</span>
          <button class="danger small" style="margin-left:auto;" @click="saveError"><i class="fas fa-triangle-exclamation"></i> Report error</button>
        </div>
      </div>
    </div>

    <!-- ════ INSTRUMENT MANAGER DIALOG ════ -->
    <div v-if="showInstrMgr" class="bk-modal" @click.self="showInstrMgr = false">
      <div class="bk-dialog mgr">
        <div class="bk-dialog-head"><span><i class="fas fa-sliders"></i> Manage instruments</span><button class="bk-x" @click="showInstrMgr = false">✕</button></div>

        <div class="im-add">
          <input v-model="newInstr.name" placeholder="New instrument name" @keydown.enter.prevent="addInstrument">
          <input v-model="newInstr.category" list="im-cats" placeholder="Category" style="max-width:150px;">
          <datalist id="im-cats"><option v-for="c in INSTRUMENT_CATEGORIES" :key="c" :value="c"></option></datalist>
          <button class="small" @click="addInstrument"><i class="fas fa-plus"></i> Add</button>
        </div>
        <div v-if="instrMsg" class="bk-msg" style="margin-bottom:8px;">{{ instrMsg }}</div>

        <div class="im-list">
          <div v-for="g in groups" :key="g.name" class="im-group">
            <div class="im-group-name">{{ g.name }}</div>
            <div v-for="inst in g.instruments" :key="inst" class="im-row">
              <span class="im-name">{{ inst }}</span>
              <span v-if="!isBuiltinInstrument(inst)" class="im-badge">added</span>
              <button class="im-del" @click="removeInstrument(inst)" title="Remove"><i class="fas fa-xmark"></i></button>
            </div>
          </div>
        </div>

        <template v-if="hiddenInstruments.length">
          <div class="im-hidden-title">Removed built-ins (tap to restore)</div>
          <div class="im-hidden">
            <button v-for="name in hiddenInstruments" :key="name" class="im-restore" @click="restoreInstrument(name)"><i class="fas fa-rotate-left"></i> {{ name }}</button>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>

<style scoped>
.bk-toolbar { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; margin-bottom: 12px; }
.bk-hint { font-size: 0.75rem; color: var(--tx2); display: inline-flex; align-items: center; gap: 6px; }
.bk-error { background: var(--wrs); color: var(--wr); border: 1px solid var(--wr); border-radius: var(--rc); padding: 10px 12px; font-size: 0.82rem; margin-bottom: 12px; }
.bk-error code { font-family: ui-monospace, monospace; }

.bk-daybar { display: flex; align-items: center; gap: 8px; margin-bottom: 12px; }
.bk-daybar .is-today { background: var(--acc); color: #fff; border-color: transparent; }
.bk-daylabel { font-size: 1rem; font-weight: 600; color: var(--tx); margin-left: 6px; }

.bk-cats { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 12px; }
.bk-cat { padding: 5px 13px; border-radius: 999px; border: 1px solid var(--ln2); background: var(--fl); color: var(--tx2); font-size: 0.78rem; font-weight: 600; cursor: pointer; box-shadow: none; }
.bk-cat:hover { filter: none; color: var(--tx); }
.bk-cat.active { background: var(--acc); color: #fff; border-color: transparent; box-shadow: 0 2px 6px var(--acsh); }

/* Day calendar (columns = instruments, vertical = hours, bands = bookings) */
.cal { overflow: auto; max-height: 64vh; border: 1px solid var(--ln2); border-radius: var(--rc); background: var(--surface-solid); position: relative; }
.cal-headrow { display: flex; position: sticky; top: 0; z-index: 5; background: var(--surface-solid); }
.cal-corner { position: sticky; left: 0; z-index: 6; width: 56px; flex: none; background: var(--surface-solid); border-right: 1px solid var(--ln2); border-bottom: 1px solid var(--ln2); }
.cal-colhead { flex: none; width: 124px; min-height: 44px; padding: 6px 7px; font-size: 0.72rem; font-weight: 600; color: var(--tx); border-right: 1px solid var(--ln); border-bottom: 1px solid var(--ln2); display: flex; align-items: center; gap: 3px; white-space: normal; overflow-wrap: anywhere; line-height: 1.2; }
.cal-errflag { color: var(--wr); flex: none; font-size: 0.72rem; }
.cal-repairflag { color: #C77700; flex: none; font-size: 0.72rem; }

/* Active-error banner above the calendar */
.bk-alerts { display: flex; flex-direction: column; gap: 8px; margin-bottom: 12px; }
.bk-alert { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; padding: 8px 12px; border: 1px solid var(--wr); border-left-width: 4px; border-radius: var(--rc); background: var(--wrs); }
.bk-alert.in_repair { border-color: #C77700; background: rgba(199, 119, 0, 0.10); }
.bk-alert-tag { display: inline-flex; align-items: center; gap: 5px; font-size: 0.7rem; font-weight: 800; text-transform: uppercase; letter-spacing: .02em; color: var(--wr); flex: none; }
.bk-alert.in_repair .bk-alert-tag { color: #C77700; }
.bk-alert-inst { font-size: 0.86rem; font-weight: 700; color: var(--tx); flex: none; }
.bk-alert-desc { font-size: 0.82rem; color: var(--tx); flex: 1; min-width: 120px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.bk-alert-meta { font-size: 0.72rem; color: var(--tx2); flex: none; }
.bk-alert-actions { display: inline-flex; gap: 6px; flex: none; }
.cal-bodyrow { display: flex; }
.cal-timecol { position: sticky; left: 0; z-index: 3; width: 56px; flex: none; background: var(--surface-solid); border-right: 1px solid var(--ln2); }
.cal-hl { font-size: 0.66rem; color: var(--tx3); padding: 2px 6px; box-sizing: border-box; border-bottom: 1px solid var(--ln); font-variant-numeric: tabular-nums; }
.cal-col { flex: none; width: 124px; position: relative; border-right: 1px solid var(--ln); }
.cal-slot { box-sizing: border-box; border-bottom: 1px solid var(--ln); cursor: pointer; }
.cal-slot:hover { background: var(--acs); }
.cal-band { position: absolute; left: 3px; right: 3px; border-radius: 6px; padding: 3px 6px; color: #fff; overflow: hidden; cursor: pointer; box-shadow: 0 1px 4px rgba(0,0,0,.2); display: flex; flex-direction: column; }
.cal-band-time { font-size: 9.5px; font-weight: 700; font-variant-numeric: tabular-nums; }
.cal-band-reason { font-size: 10px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; opacity: .95; flex: 1; }
.cal-band-who { font-size: 8.5px; font-weight: 700; opacity: .85; align-self: flex-end; }

/* Meetings */
.mtg-col { flex: 1 1 auto; min-width: 320px; }
.mtg-band { left: 4px; right: 4px; padding: 4px 8px; }
.mtg-band-title { font-size: 12px; font-weight: 700; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mtg-band-loc { font-size: 10.5px; opacity: .95; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mtg-band-meta { font-size: 9.5px; font-weight: 600; opacity: .85; font-variant-numeric: tabular-nums; }
.mtg-invitees { display: flex; flex-wrap: wrap; gap: 5px; margin-bottom: 6px; }
.mtg-chip { display: inline-flex; align-items: center; gap: 4px; padding: 2px 4px 2px 8px; border-radius: 999px; background: var(--acs); color: var(--acc); font-size: 0.72rem; font-weight: 600; }
.mtg-chip button { background: none; border: none; box-shadow: none; color: inherit; cursor: pointer; font-size: 0.9rem; line-height: 1; padding: 0 2px; }

/* Statistics */
.bk-stats { display: flex; flex-direction: column; gap: 8px; }
.bk-statrow { display: flex; align-items: center; gap: 10px; }
.bk-stat-name { width: 200px; flex: none; font-size: 0.8rem; color: var(--tx); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.bk-stat-track { flex: 1; height: 14px; background: var(--fl); border-radius: 7px; overflow: hidden; }
.bk-stat-bar { height: 100%; border-radius: 7px; min-width: 3px; background: var(--acc); }

/* Per-user colour legend */
.bk-legend { display: flex; flex-wrap: wrap; gap: 6px 14px; margin-bottom: 12px; }
.bk-legend-item { display: inline-flex; align-items: center; gap: 6px; font-size: 0.75rem; color: var(--tx2); }
.bk-legend-dot { width: 12px; height: 12px; border-radius: 50%; flex: none; }
.bk-stat-val { width: 96px; flex: none; text-align: right; font: 600 0.74rem ui-monospace, Menlo, monospace; color: var(--tx2); }
.bk-empty { font-size: 0.85rem; color: var(--tx3); font-style: italic; padding: 12px 0; }

/* Instrument error log */
.bk-errs { display: flex; flex-direction: column; gap: 8px; margin-bottom: 14px; }
.bk-err { display: flex; align-items: center; gap: 10px; padding: 8px 10px; border: 1px solid var(--wr); border-radius: var(--rc); background: var(--wrs); }
.bk-err.resolved { border-color: var(--ln2); background: var(--fl); }
.bk-err.in_repair { border-color: #C77700; background: rgba(199, 119, 0, 0.10); }
.bk-err-tag { display: inline-flex; align-items: center; gap: 5px; font-size: 0.7rem; font-weight: 700; padding: 3px 8px; border-radius: 999px; flex: none; }
.bk-err-tag.bad { background: var(--wr); color: #fff; }
.bk-err-tag.ok { background: var(--ok); color: #fff; }
.bk-err-tag.warn { background: #C77700; color: #fff; }
.bk-err-inst { font-size: 0.82rem; font-weight: 600; color: var(--tx); flex: none; }
.bk-err-body { flex: 1; min-width: 0; }
.bk-err-desc { font-size: 0.82rem; color: var(--tx); }
.bk-err-meta { font-size: 0.72rem; color: var(--tx2); }

/* Logbook */
.bk-logbar { margin-bottom: 10px; display: flex; align-items: center; gap: 10px; }
.bk-logbar select { max-width: 260px; }
.bk-table-wrap { overflow-x: auto; border: 1px solid var(--ln2); border-radius: var(--rc); }
.bk-table { width: 100%; border-collapse: collapse; font-size: 0.82rem; margin: 0; }
.bk-table th { text-align: left; padding: 8px 10px; color: var(--tx2); background: var(--surface-solid); position: sticky; top: 0; }
.bk-table td { padding: 8px 10px; border-top: 1px solid var(--ln); }
.bk-table tbody tr { cursor: pointer; }
.bk-table tbody tr:hover { background: var(--acs); }
.bk-notes-cell { max-width: 240px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--tx2); }
.bk-who-pill { display: inline-flex; align-items: center; justify-content: center; width: 24px; height: 24px; border-radius: 50%; color: #fff; font-size: 10px; font-weight: 700; }

/* Instrument search box (calendar + logbook) */
.bk-search { display: inline-flex; align-items: center; gap: 6px; padding: 4px 10px; border: 1px solid var(--ln2); border-radius: 999px; background: var(--fl); color: var(--tx2); font-size: 0.8rem; }
.bk-search.grow { flex: 1; max-width: 320px; }
.bk-search i { font-size: 0.75rem; color: var(--tx3); }
.bk-search input { border: none; background: none; outline: none; box-shadow: none; padding: 0; font-size: 0.8rem; color: var(--tx); flex: 1; min-width: 90px; }
.bk-search-x { background: none; border: none; box-shadow: none; color: var(--tx3); cursor: pointer; font-size: 0.8rem; padding: 0; line-height: 1; }
.cal-protoflag { color: var(--acc); flex: none; font-size: 0.72rem; cursor: pointer; }

/* Per-instrument logbook accordion */
.lb-list { display: flex; flex-direction: column; gap: 8px; }
.lb-inst { border: 1px solid var(--ln2); border-radius: var(--rc); background: var(--surface-solid); overflow: hidden; }
.lb-inst.open { border-color: var(--acc); }
.lb-head { display: flex; align-items: center; gap: 10px; width: 100%; padding: 10px 12px; background: none; border: none; box-shadow: none; cursor: pointer; text-align: left; color: var(--tx); }
.lb-head:hover { background: var(--acs); filter: none; }
.lb-chev { font-size: 0.72rem; color: var(--tx3); flex: none; width: 12px; }
.lb-name { font-size: 0.9rem; font-weight: 600; color: var(--tx); flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.lb-flag { display: inline-flex; align-items: center; gap: 4px; font-size: 0.7rem; font-weight: 700; color: #fff; background: var(--wr); border-radius: 999px; padding: 2px 8px; flex: none; }
.lb-counts { display: inline-flex; gap: 10px; flex: none; font-size: 0.74rem; color: var(--tx2); font-variant-numeric: tabular-nums; }
.lb-counts span { display: inline-flex; align-items: center; gap: 4px; }
.lb-counts i { font-size: 0.68rem; color: var(--tx3); }
.lb-body { padding: 4px 12px 14px; border-top: 1px solid var(--ln); }
.lb-sectitle { display: flex; align-items: center; gap: 6px; font-size: 0.72rem; font-weight: 700; text-transform: uppercase; letter-spacing: .03em; color: var(--tx2); margin: 12px 0 6px; }
.lb-sectitle i { color: var(--tx3); }
.lb-proto { border: 1px solid var(--ln2); border-radius: var(--rc); margin-bottom: 6px; background: var(--fl); }
.lb-proto-head { display: flex; align-items: center; gap: 8px; width: 100%; padding: 7px 10px; background: none; border: none; box-shadow: none; cursor: pointer; text-align: left; color: var(--tx); }
.lb-proto-head:hover { filter: none; color: var(--acc); }
.lb-proto-head > i { font-size: 0.8rem; color: var(--tx3); flex: none; width: 10px; }
.lb-proto-name { font-size: 0.84rem; font-weight: 600; flex: none; }
.lb-proto-sum { font-size: 0.74rem; color: var(--tx2); flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.lb-proto-body { padding: 2px 10px 8px; }
.lb-proto-body :deep(h3) { font-size: 0.9rem; }
.lb-inst-actions { margin-top: 12px; }

/* Instrument manager */
.im-add { display: flex; gap: 8px; margin-bottom: 10px; flex-wrap: wrap; }
.im-add input { flex: 1; min-width: 120px; }
.im-list { max-height: 46vh; overflow-y: auto; border: 1px solid var(--ln2); border-radius: var(--rc); padding: 6px 10px; }
.im-group { margin-bottom: 8px; }
.im-group-name { font-size: 0.68rem; font-weight: 700; text-transform: uppercase; letter-spacing: .03em; color: var(--tx2); margin: 6px 0 3px; }
.im-row { display: flex; align-items: center; gap: 8px; padding: 4px 2px; border-bottom: 1px solid var(--ln); }
.im-name { font-size: 0.84rem; color: var(--tx); flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.im-badge { font-size: 0.62rem; font-weight: 700; text-transform: uppercase; color: var(--acc); background: var(--acs); border-radius: 999px; padding: 1px 6px; flex: none; }
.im-del { width: 24px; height: 24px; border-radius: 50%; background: var(--fl); color: var(--wr); border: none; box-shadow: none; cursor: pointer; flex: none; font-size: 0.8rem; }
.im-del:hover { background: var(--wrs); filter: none; }
.im-hidden-title { font-size: 0.72rem; font-weight: 600; color: var(--tx2); margin: 12px 0 6px; }
.im-hidden { display: flex; flex-wrap: wrap; gap: 6px; }
.im-restore { display: inline-flex; align-items: center; gap: 5px; font-size: 0.74rem; color: var(--tx2); background: var(--fl); border: 1px dashed var(--ln2); box-shadow: none; border-radius: 999px; padding: 4px 10px; cursor: pointer; }
.im-restore:hover { border-color: var(--acc); color: var(--acc); filter: none; }

/* Dialog */
.bk-modal { position: fixed; inset: 0; background: rgba(0,0,0,.5); display: flex; align-items: center; justify-content: center; z-index: 1000; padding: 20px; }
.bk-dialog { background: var(--modal); backdrop-filter: blur(30px); -webkit-backdrop-filter: blur(30px); border: 1px solid var(--cdl); border-radius: var(--r); box-shadow: var(--sh); width: 100%; max-width: 440px; padding: 18px; max-height: 90vh; overflow-y: auto; }
/* Instrument manager: fixed header + add row, only the list scrolls */
.bk-dialog.mgr { max-width: 520px; display: flex; flex-direction: column; overflow: hidden; }
.bk-dialog.mgr .im-list { flex: 1 1 auto; min-height: 0; max-height: none; }
.bk-dialog-head { display: flex; align-items: center; justify-content: space-between; font-size: 0.95rem; font-weight: 600; color: var(--tx); margin-bottom: 14px; }
.bk-x { width: 28px; height: 28px; border-radius: 50%; background: var(--fl); color: var(--tx2); border: none; box-shadow: none; cursor: pointer; font-size: 13px; }
.bk-field { display: flex; flex-direction: column; gap: 4px; margin-bottom: 11px; }
.bk-field > span { font-size: 0.72rem; font-weight: 600; color: var(--tx2); }
.bk-view-row { display: flex; gap: 12px; padding: 6px 0; border-bottom: 1px solid var(--ln); font-size: 0.85rem; }
.bk-view-row > span { color: var(--tx2); width: 90px; flex: none; }
.bk-view-row > b { color: var(--tx); }
.bk-dialog-actions { display: flex; align-items: center; gap: 8px; margin-top: 14px; }
.bk-msg { font-size: 0.78rem; color: var(--wr); }

/* Calendar sync dialog */
.sy-intro { font-size: 0.82rem; color: var(--tx2); line-height: 1.5; margin: 0 0 14px; }
.sy-state { display: flex; align-items: center; gap: 8px; font-size: 0.85rem; color: var(--tx2); padding: 10px 0; }
.sy-actions { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 14px; }
.sy-btn { flex: 1; min-width: 150px; display: inline-flex; align-items: center; justify-content: center; gap: 7px; padding: 9px 12px; border-radius: var(--rc); border: 1px solid var(--ln2); background: var(--fl); color: var(--tx); font-size: 0.82rem; font-weight: 600; text-decoration: none; cursor: pointer; }
.sy-btn:hover { border-color: var(--acc); color: var(--acc); }
.sy-btn.primary { background: var(--acc); color: #fff; border-color: transparent; box-shadow: 0 2px 6px var(--acsh); }
.sy-btn.primary:hover { color: #fff; filter: brightness(1.05); }
.sy-link { margin-bottom: 12px; }
.sy-link-label { display: block; font-size: 0.72rem; font-weight: 600; color: var(--tx2); margin-bottom: 4px; }
.sy-link-row { display: flex; gap: 6px; }
.sy-link-input { flex: 1; min-width: 0; font: 0.76rem ui-monospace, Menlo, monospace; color: var(--tx2); }
.sy-help { font-size: 0.8rem; color: var(--tx2); border-top: 1px solid var(--ln); padding-top: 10px; }
.sy-help summary { cursor: pointer; font-weight: 600; color: var(--tx); }
.sy-help p { margin: 8px 0 0; line-height: 1.5; }
.sy-foot { display: flex; align-items: center; gap: 10px; margin-top: 14px; }
.sy-foot .bk-hint { flex: 1; }
</style>

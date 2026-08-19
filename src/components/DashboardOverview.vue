<script setup>
import { ref, computed, onMounted } from 'vue'
import { useLabStore } from '../stores/labStore'
import { db } from '../services/supabase'
import { MODULE_ICONS } from '../utils/moduleIcons.js'

const store = useLabStore()
const emit = defineEmits(['open'])
function open(id) { emit('open', id) }

// ── Hero ──
const greetingWord = computed(() => {
  const h = new Date().getHours()
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'
})
const today = computed(() => new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' }))

// ── My loaned-out chemicals ──
// Stocks THIS user took out (Storage tab: take-out button or a Quick-take scan)
// and hasn't returned. Return is one tap and writes straight to the item, so
// other clients (and the Storage tab) see it flip immediately.
const myEmail = computed(() => (store.user?.email || '').toLowerCase())
const myLoans = computed(() => (store.inventory || [])
  .filter(i => i.storage?.taken && String(i.storage.taken.by || '').toLowerCase() === myEmail.value)
  .sort((a, b) => new Date(b.storage.taken.at || 0) - new Date(a.storage.taken.at || 0)))
const loanSince = (t) => {
  const d = new Date(t?.at || 0)
  if (isNaN(d)) return ''
  const days = Math.floor((Date.now() - d) / 864e5)
  return days === 0 ? 'today' : days === 1 ? 'yesterday' : `${days} days ago`
}
const loanHome = (it) => [it.location, it.sublocation].filter(Boolean).join(' / ') || 'no recorded position'
function returnLoan(it) {
  delete it.storage.taken
  store.saveItemToCloud(it)
  store.toast?.(`[${it.code}] returned — ${loanHome(it)}`)
}

// ── Lab-wide (Global) resources ──
const isLab = (x) => (x?.scope || 'Global') === 'Global'
const labStocks = computed(() => (store.inventory || []).filter(isLab))
const labProtocols = computed(() => {
  const tag = (arr, type, module) => (arr || []).filter(x => x.scope === 'Global').map(x => ({ id: x.id, name: x.name, type, module }))
  return [
    ...tag(store.cloudReactions, 'Reaction', 'reactionPlan'),
    ...tag(store.cloudMatrices, 'Matrix', 'matrixPlanner'),
    ...tag(store.cloudReverseMatrices, 'Screening', 'screeningPlanner'),
  ]
})
const sharedPlates = computed(() => (store.cloudPlates || []).filter(p => p.scope === 'Global'))

const stats = computed(() => [
  { label: 'Lab stocks', value: labStocks.value.length, module: 'inventoryManager' },
  { label: 'Shared protocols', value: labProtocols.value.length, module: 'reactionPlan' },
  { label: 'Shared plates', value: sharedPlates.value.length, module: 'wellPlateEditor' },
  { label: 'Journal entries', value: (store.journal.entries || []).length, module: 'labJournal' },
])

// ── Instrument booking — upcoming (shared, lab-wide) ──
const OI = ['#0072B2', '#E69F00', '#009E73', '#CC79A7', '#D55E00', '#56B4E9', '#8E63C0', '#4C9F70', '#B84A5A', '#7C7C82']
function ownerColor(email) { let h = 0; const s = String(email || ''); for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return OI[h % OI.length] }
const upcoming = ref([])
async function loadUpcoming() {
  try {
    const { data } = await db.from('instrument_bookings').select('*')
      .gte('ends_at', new Date().toISOString()).order('starts_at').limit(6)
    if (data) upcoming.value = data
  } catch { /* table may not exist yet */ }
}
onMounted(loadUpcoming)
function fmtWhen(b) {
  const s = new Date(b.starts_at), now = new Date()
  const tmr = new Date(now); tmr.setDate(now.getDate() + 1)
  const day = s.toDateString() === now.toDateString() ? 'Today'
    : s.toDateString() === tmr.toDateString() ? 'Tomorrow'
    : s.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  return `${day} ${s.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}`
}

// ── Meetings — upcoming (RLS already scopes to lab-wide + your invites) ──
const meetings = ref([])
async function loadMeetings() {
  try {
    const { data } = await db.from('meetings').select('*')
      .gte('ends_at', new Date().toISOString()).order('starts_at').limit(6)
    if (data) meetings.value = data
  } catch { /* table may not exist yet */ }
}
onMounted(loadMeetings)

// ── Journal — recent entries + latest preview (prominent) ──
const recentEntries = computed(() => (store.journal.entries || []).slice(0, 7))
function stripHtml(html) { const d = document.createElement('div'); d.innerHTML = html || ''; return (d.textContent || '').replace(/\s+/g, ' ').trim() }
function entrySnippet(e) { return stripHtml(e?.content).slice(0, 52) }
function entryDate(e) {
  const d = e?.date || e?.updated_at || e?.created_at
  return d ? new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : ''
}

// ── Time Tracker — hours worked this week (personal) ──
const DAY_LABELS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']
const weekHours = ref([0, 0, 0, 0, 0, 0, 0])
const todayIdx = computed(() => (new Date().getDay() + 6) % 7)
const maxHour = computed(() => Math.max(1, ...weekHours.value))
const weekTotal = computed(() => weekHours.value.reduce((a, b) => a + b, 0))
async function loadWeek() {
  try {
    const { data } = await db.from('time_entries').select('checked_in, checked_out')
    if (!data) return
    const now = new Date(), monday = new Date(now)
    monday.setDate(now.getDate() - ((now.getDay() + 6) % 7)); monday.setHours(0, 0, 0, 0)
    const hrs = [0, 0, 0, 0, 0, 0, 0]
    for (const e of data) {
      if (!e.checked_in || !e.checked_out) continue
      const ci = new Date(e.checked_in)
      const idx = Math.floor((ci - monday) / 86400000)
      if (idx >= 0 && idx < 7) hrs[idx] += (new Date(e.checked_out) - ci) / 3600000
    }
    weekHours.value = hrs
  } catch { /* peek only */ }
}
onMounted(loadWeek)

const MORE = [
  { id: 'standardStock', label: 'Stock Calc' }, { id: 'sequenceCalc', label: 'DNA Calc' },
  { id: 'matrixPlanner', label: 'Matrix' }, { id: 'screeningPlanner', label: 'Screening' },
  { id: 'phasePredictor', label: 'Phase Map' }, { id: 'archiveManager', label: 'Archive' },
  { id: 'globalSettings', label: 'Settings' },
]
</script>

<template>
  <div class="dash">
    <div class="dash-hero">
      <div class="dash-hi">{{ greetingWord }}</div>
      <div class="dash-date">{{ today }}</div>
    </div>

    <!-- Lab-wide stat tiles -->
    <div class="dash-stats">
      <button v-for="s in stats" :key="s.label" class="dash-stat" @click="open(s.module)">
        <span class="dash-stat-val">{{ s.value }}</span>
        <span class="dash-stat-label">{{ s.label }}</span>
      </button>
    </div>

    <div class="dash-grid">
      <!-- Lab Journal — prominent -->
      <button class="dc dc-journal" style="grid-column: span 8;" @click="open('labJournal')">
        <div class="dc-head">
          <span class="dc-ic" v-html="MODULE_ICONS.labJournal"></span>
          <span class="dc-title">Lab Journal</span>
          <span class="dc-arrow">›</span>
        </div>
        <div class="dc-body">
          <template v-if="recentEntries.length">
            <div v-for="e in recentEntries" :key="e.id" class="dc-jrow">
              <div class="dc-jrow-top">
                <span class="dc-row-title">{{ e.expId || 'Untitled entry' }}</span>
                <span class="dc-row-meta">{{ entryDate(e) }}</span>
              </div>
              <div v-if="entrySnippet(e)" class="dc-jsnippet">{{ entrySnippet(e) }}</div>
            </div>
          </template>
          <div v-else class="dc-empty">Open your journal to see recent entries.</div>
        </div>
      </button>

      <!-- Time Tracker (personal) — visual -->
      <button class="dc" style="grid-column: span 4;" @click="open('timeTracker')">
        <div class="dc-head">
          <span class="dc-ic" v-html="MODULE_ICONS.timeTracker"></span>
          <span class="dc-title">Time Tracker</span>
          <span class="scope-badge private">You</span>
          <span class="dc-arrow">›</span>
        </div>
        <div class="dc-body">
          <div class="dc-week-total">{{ weekTotal.toFixed(1) }} <small>h this week</small></div>
          <div class="tt-week">
            <div v-for="(h, i) in weekHours" :key="i" class="tt-col">
              <span class="tt-val">{{ h >= 0.1 ? h.toFixed(1) : '' }}</span>
              <div class="tt-bar" :class="{ 'is-today': i === todayIdx }" :style="{ height: (h / maxHour * 84) + 'px' }"></div>
              <span class="tt-day" :class="{ 'is-today': i === todayIdx }">{{ DAY_LABELS[i] }}</span>
            </div>
          </div>
        </div>
      </button>

      <!-- Instrument booking — upcoming -->
      <button class="dc" style="grid-column: span 4;" @click="open('instrumentBooking')">
        <div class="dc-head">
          <span class="dc-ic" v-html="MODULE_ICONS.instrumentBooking"></span>
          <span class="dc-title">Calendar — Bookings</span>
          <span class="scope-badge lab">Lab</span>
          <span class="dc-arrow">›</span>
        </div>
        <div class="dc-body">
          <div v-for="b in upcoming" :key="b.id" class="dc-book">
            <span class="dc-book-dot" :style="{ background: ownerColor(b.owner_email) }"></span>
            <span class="dc-book-inst">{{ b.instrument }}</span>
            <span class="dc-book-when">{{ fmtWhen(b) }}</span>
          </div>
          <div v-if="!upcoming.length" class="dc-empty">No upcoming bookings.</div>
        </div>
      </button>

      <!-- Meetings — upcoming (lab-wide + your invites) -->
      <button class="dc" style="grid-column: span 4;" @click="open('instrumentBooking')">
        <div class="dc-head">
          <span class="dc-ic" v-html="MODULE_ICONS.instrumentBooking"></span>
          <span class="dc-title">Meetings</span>
          <span class="dc-arrow">›</span>
        </div>
        <div class="dc-body">
          <div v-for="m in meetings" :key="m.id" class="dc-book">
            <span class="dc-book-dot" :style="{ background: m.scope === 'lab' ? 'var(--acc)' : ownerColor(m.owner_email) }"></span>
            <span class="dc-book-inst">{{ m.title }}<template v-if="m.location"> · {{ m.location }}</template></span>
            <span class="dc-book-when">{{ fmtWhen(m) }}</span>
          </div>
          <div v-if="!meetings.length" class="dc-empty">No upcoming meetings.</div>
        </div>
      </button>

      <!-- My loaned-out chemicals — taken out and not yet returned -->
      <button class="dc" style="grid-column: span 4;" @click="open('inventoryManager')">
        <div class="dc-head">
          <span class="dc-ic" v-html="MODULE_ICONS.inventoryManager"></span>
          <span class="dc-title">Loaned out</span>
          <span class="scope-badge private">You</span>
          <span v-if="myLoans.length" class="dc-loan-count">{{ myLoans.length }}</span>
          <span class="dc-arrow">›</span>
        </div>
        <div class="dc-body">
          <div v-for="it in myLoans.slice(0, 6)" :key="it.id" class="dc-loan">
            <span class="dc-loan-code">{{ it.code }}</span>
            <span class="dc-loan-name">{{ it.name }}</span>
            <span class="dc-loan-meta">{{ loanSince(it.storage.taken) }} · {{ loanHome(it) }}</span>
            <span class="dc-loan-return" @click.stop="returnLoan(it)" title="Mark as returned to its place">
              <i class="fas fa-rotate-left"></i> Return
            </span>
          </div>
          <div v-if="myLoans.length > 6" class="dc-empty" style="padding-top: 4px;">… {{ myLoans.length - 6 }} more in Inventory → Storage</div>
          <div v-if="!myLoans.length" class="dc-empty">Nothing loaned out. Scan a tube in Inventory → Storage → Quick take to check it out.</div>
        </div>
      </button>

      <!-- Recently added stocks (Lab) -->
      <button class="dc" style="grid-column: span 4;" @click="open('inventoryManager')">
        <div class="dc-head">
          <span class="dc-ic" v-html="MODULE_ICONS.inventoryManager"></span>
          <span class="dc-title">Recently added</span>
          <span class="scope-badge lab">Lab</span>
          <span class="dc-arrow">›</span>
        </div>
        <div class="dc-body">
          <div v-for="it in labStocks.slice(0, 6)" :key="it.id" class="dc-stock">
            <span class="dc-code">{{ it.code }}</span>
            <span class="dc-stock-name">{{ it.name }}</span>
          </div>
          <div v-if="!labStocks.length" class="dc-empty">No shared stocks yet.</div>
        </div>
      </button>

      <!-- Shared Protocols (published) -->
      <button class="dc" style="grid-column: span 4;" @click="open('reactionPlan')">
        <div class="dc-head">
          <span class="dc-ic" v-html="MODULE_ICONS.reactionPlan"></span>
          <span class="dc-title">Shared Protocols</span>
          <span class="scope-badge lab">Lab</span>
          <span class="dc-arrow">›</span>
        </div>
        <div class="dc-body">
          <div v-for="p in labProtocols.slice(0, 6)" :key="p.type + p.id" class="dc-proto" @click.stop="open(p.module)">
            <span class="dc-proto-type">{{ p.type }}</span>
            <span class="dc-proto-name">{{ p.name || 'Untitled' }}</span>
          </div>
          <div v-if="!labProtocols.length" class="dc-empty">Nothing published to the lab yet.</div>
        </div>
      </button>
    </div>

    <!-- Quick access (no alpha modules) -->
    <div class="dash-more-label">All modules</div>
    <div class="dash-more">
      <button v-for="m in MORE" :key="m.id" class="dash-mini" @click="open(m.id)">
        <span class="dash-mini-ic" v-html="MODULE_ICONS[m.id]"></span>
        <span class="dash-mini-label">{{ m.label }}</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.dash { max-width: 1280px; margin: 0 auto; }
.dash-hero { margin-bottom: 16px; }
.dash-hi { font-size: 22px; font-weight: 700; letter-spacing: -0.02em; color: var(--tx); }
.dash-date { font-size: 13px; color: var(--tx2); margin-top: 2px; }

.dash-stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 14px; }
.dash-stat { display: flex; flex-direction: column; align-items: flex-start; gap: 2px; text-align: left; padding: 14px 16px; border-radius: var(--r); background: var(--cd); border: 1px solid var(--cdl); box-shadow: var(--sh); cursor: pointer; }
.dash-stat:hover { filter: none; border-color: var(--acc); }
.dash-stat-val { font-size: 24px; font-weight: 700; color: var(--acc); font-variant-numeric: tabular-nums; }
.dash-stat-label { font-size: 12px; color: var(--tx2); font-weight: 600; }

.dash-grid { display: grid; grid-template-columns: repeat(12, 1fr); gap: 14px; align-items: start; }

.dc { grid-column: span 12; display: flex; flex-direction: column; text-align: left; min-width: 0; background: var(--cd); backdrop-filter: blur(24px); -webkit-backdrop-filter: blur(24px); border: 1px solid var(--cdl); border-radius: var(--r); box-shadow: var(--sh); padding: 0; overflow: hidden; cursor: pointer; transition: transform 0.12s ease, box-shadow 0.12s ease; }
.dc:hover { filter: none; transform: translateY(-1px); box-shadow: 0 12px 34px rgba(20,30,60,.14); }
.dc-head { display: flex; align-items: center; gap: 9px; padding: 10px 12px; border-bottom: 1px solid var(--ln); }
.dc-ic { width: 24px; height: 24px; border-radius: 8px; flex: none; background: var(--acc); color: #fff; display: inline-flex; align-items: center; justify-content: center; box-shadow: 0 2px 5px var(--acsh); }
.dc-ic :deep(svg) { width: 14px; height: 14px; }
.dc-title { font-size: 13px; font-weight: 600; color: var(--tx); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dc-head .scope-badge { flex: none; }
.dc-arrow { margin-left: auto; font-size: 15px; color: var(--tx3); flex: none; padding-left: 4px; }
.dc-body { padding: 11px 12px; display: flex; flex-direction: column; gap: 7px; min-width: 0; overflow: hidden; }

/* Journal card: 2-column entry grid so it fills the wide card (no empty side bars) */
.dc-journal .dc-body { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 22px; align-content: start; }
@media (max-width: 1200px) { .dc-journal .dc-body { grid-template-columns: 1fr; } }

/* Journal rows (title + snippet) */
.dc-jrow { display: flex; flex-direction: column; gap: 2px; padding-bottom: 8px; border-bottom: 1px solid var(--ln); min-width: 0; }
.dc-jrow-top { display: flex; align-items: baseline; gap: 8px; min-width: 0; }
.dc-row-title { font-size: 12.5px; font-weight: 600; color: var(--tx); flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dc-row-meta { font-size: 11px; color: var(--tx2); flex: none; }
.dc-jsnippet { font-size: 11.5px; color: var(--tx2); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.dc-stock { display: flex; align-items: center; gap: 7px; min-width: 0; }
.dc-code { font: 600 10px ui-monospace, Menlo, monospace; padding: 2px 6px; border-radius: 6px; background: var(--acs); color: var(--acc); flex: none; }
.dc-stock-name { font-size: 12px; color: var(--tx); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; min-width: 0; }

.dc-proto { display: flex; align-items: center; gap: 8px; min-width: 0; }
.dc-proto:hover { filter: none; }
.dc-proto-type { font-size: 9.5px; font-weight: 700; color: var(--tx2); background: var(--fl); border-radius: 6px; padding: 2px 6px; flex: none; }
.dc-proto-name { font-size: 12px; color: var(--tx); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; min-width: 0; }

/* Upcoming bookings */
.dc-book { display: flex; align-items: center; gap: 8px; min-width: 0; }
.dc-book-dot { width: 9px; height: 9px; border-radius: 50%; flex: none; }
.dc-book-inst { font-size: 12px; color: var(--tx); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; min-width: 0; }
.dc-book-when { font-size: 11px; color: var(--tx2); font-variant-numeric: tabular-nums; flex: none; }

.dc-week-total { font-size: 18px; font-weight: 700; color: var(--tx); }
.dc-week-total small { font-size: 11px; font-weight: 500; color: var(--tx2); }
.tt-week { display: flex; align-items: flex-end; gap: 6px; height: 108px; margin-top: 4px; }
.tt-col { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: flex-end; gap: 4px; height: 100%; }
.tt-val { font-size: 10px; font-weight: 600; color: var(--tx2); font-variant-numeric: tabular-nums; height: 12px; line-height: 12px; }
.tt-bar { width: 100%; max-width: 20px; min-height: 2px; border-radius: 5px 5px 0 0; background: color-mix(in srgb, var(--acc) 42%, transparent); }
.tt-bar.is-today { background: var(--acc); }
.tt-day { font-size: 10px; color: var(--tx2); }
.tt-day.is-today { color: var(--acc); font-weight: 700; }

.dc-empty { font-size: 12px; color: var(--tx3); font-style: italic; }

/* Loaned-out chemicals rows */
.dc-loan { display: grid; grid-template-columns: auto 1fr auto; gap: 3px 8px; align-items: center; min-width: 0; padding: 3px 0; border-bottom: 1px solid var(--ln2, rgba(0,0,0,.06)); }
.dc-loan:last-of-type { border-bottom: none; }
.dc-loan-code { font-size: 10.5px; font-weight: 700; padding: 1px 6px; border-radius: 8px; background: var(--acs, rgba(37,99,235,.12)); color: var(--acc, #2563eb); white-space: nowrap; }
.dc-loan-name { font-size: 12px; font-weight: 600; color: var(--tx); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
.dc-loan-return { font-size: 11px; font-weight: 700; color: var(--acc, #2563eb); white-space: nowrap; cursor: pointer; padding: 2px 6px; border-radius: 7px; }
.dc-loan-return:hover { background: var(--acs, rgba(37,99,235,.12)); }
.dc-loan-meta { grid-column: 1 / 3; font-size: 10.5px; color: var(--tx3); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dc-loan-count { font-size: 10.5px; font-weight: 800; background: #d97706; color: #fff; border-radius: 9px; padding: 1px 7px; }

.dash-more-label { font-size: 12px; font-weight: 700; color: var(--tx2); margin: 20px 2px 10px; }
.dash-more { display: grid; grid-template-columns: repeat(auto-fill, minmax(96px, 1fr)); gap: 8px; }
.dash-mini { display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 14px 6px; border-radius: var(--r); background: var(--cd); border: 1px solid var(--cdl); box-shadow: none; cursor: pointer; }
.dash-mini:hover { filter: none; border-color: var(--acc); }
.dash-mini-ic { width: 34px; height: 34px; border-radius: 10px; background: var(--fl); color: var(--acc); display: inline-flex; align-items: center; justify-content: center; }
.dash-mini-ic :deep(svg) { width: 19px; height: 19px; }
.dash-mini-label { font-size: 11px; font-weight: 500; color: var(--tx2); text-align: center; }

@media (max-width: 1000px) {
  .dc { grid-column: span 12 !important; }
  .dash-stats { grid-template-columns: repeat(2, 1fr); }
}
</style>

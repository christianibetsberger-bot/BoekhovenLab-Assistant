<script setup>
// Planner — a Structured-style day planner: an inbox of saved todos on the left,
// a vertical timeline of the selected day on the right, a week strip to move
// between days. Tasks carry an icon, a colour-coded category, a duration and a
// done-circle. Everything is per-user in Supabase (todo_items/todo_categories —
// run supabase/todo_planner.sql once).
import { ref, computed, onMounted, onBeforeUnmount, nextTick, watch } from 'vue'
import { useLabStore } from '../stores/labStore'
import { db } from '../services/supabase'
import { getOrCreateFeedToken, feedUrls, CalendarTokenTableMissing } from '../utils/calendarFeed'

const store = useLabStore()

// Rendered as the Planner tab of the Calendar module: `embedded` drops the own
// card chrome so it sits flush inside the host module.
const props = defineProps({ embedded: { type: Boolean, default: false } })

// ── Icon catalogue: science first, then office, then everything else a day has ──
const ICON_GROUPS = [
  { label: 'Science', icons: [
    'fa-flask', 'fa-flask-vial', 'fa-vial', 'fa-vials', 'fa-microscope', 'fa-dna',
    'fa-atom', 'fa-magnet', 'fa-radiation', 'fa-biohazard', 'fa-syringe', 'fa-eye-dropper',
    'fa-droplet', 'fa-temperature-half', 'fa-snowflake', 'fa-fire', 'fa-bolt', 'fa-filter',
    'fa-bacterium', 'fa-virus', 'fa-disease', 'fa-seedling', 'fa-mortar-pestle', 'fa-pills',
    'fa-capsules', 'fa-prescription-bottle', 'fa-scale-balanced', 'fa-border-all',
    'fa-magnifying-glass-chart', 'fa-chart-line', 'fa-square-poll-vertical', 'fa-brain',
    'fa-robot', 'fa-video', 'fa-camera', 'fa-wave-square',
  ]},
  { label: 'Office', icons: [
    'fa-laptop', 'fa-keyboard', 'fa-pen', 'fa-pen-to-square', 'fa-file-lines', 'fa-file-signature',
    'fa-book', 'fa-book-open', 'fa-graduation-cap', 'fa-person-chalkboard', 'fa-chalkboard-user',
    'fa-users', 'fa-user-group', 'fa-comments', 'fa-phone', 'fa-envelope', 'fa-calendar-check',
    'fa-clipboard-list', 'fa-clipboard-check', 'fa-list-check', 'fa-print', 'fa-folder-open',
    'fa-box-archive', 'fa-chart-pie', 'fa-table', 'fa-calculator', 'fa-lightbulb', 'fa-gears',
    'fa-wrench', 'fa-screwdriver-wrench', 'fa-paperclip', 'fa-thumbtack',
  ]},
  { label: 'Life', icons: [
    'fa-mug-hot', 'fa-utensils', 'fa-cart-shopping', 'fa-dumbbell', 'fa-heart', 'fa-car',
    'fa-house', 'fa-plane', 'fa-gift', 'fa-broom', 'fa-shirt', 'fa-bed', 'fa-music',
    'fa-gamepad', 'fa-dog', 'fa-baby-carriage', 'fa-sun', 'fa-moon',
  ]},
]

// Default colour code, written to todo_categories the first time the module
// runs for a user. Editable afterwards — these are just the starting shelves.
const DEFAULT_CATEGORIES = [
  { name: 'Lab',      color: '#2563eb' },
  { name: 'Analysis', color: '#8b5cf6' },
  { name: 'Writing',  color: '#059669' },
  { name: 'Meeting',  color: '#d97706' },
  { name: 'Office',   color: '#64748b' },
  { name: 'Personal', color: '#ef4444' },
]

// ── Data ──
const tasks = ref([])          // all rows of this user (inbox + scheduled)
const categories = ref([])
const loadError = ref('')

const catColor = (name) => categories.value.find(c => c.name === name)?.color || '#64748b'

async function loadAll() {
  loadError.value = ''
  const [t, c] = await Promise.all([
    db.from('todo_items').select('*').order('start_min', { ascending: true, nullsFirst: false }),
    db.from('todo_categories').select('*').order('position'),
  ])
  if (t.error || c.error) { loadError.value = (t.error || c.error).message; return }
  tasks.value = t.data || []
  categories.value = c.data || []
  if (!categories.value.length && store.user?.id) {
    // First run: seed the default colour code so the picker is never empty.
    const rows = DEFAULT_CATEGORIES.map((d, i) => ({ ...d, position: i, owner_id: store.user.id }))
    const { error } = await db.from('todo_categories').insert(rows)
    if (!error) { const r = await db.from('todo_categories').select('*').order('position'); categories.value = r.data || [] }
  }
}
onMounted(loadAll)

// ── Meetings on the timeline ──
// The Calendar module's meetings (lab-wide, own, invited — RLS decides) render
// as read-only bands behind the tasks, so the planner and the Meetings tab
// always tell the same story about the day. Todos stay the editable layer.
const meetings = ref([])
async function loadMeetings() {
  try {
    const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 7)
    const { data } = await db.from('meetings').select('*').gte('ends_at', cutoff.toISOString()).order('starts_at')
    meetings.value = data || []
  } catch { /* meetings table may not exist yet — the planner works without it */ }
}
onMounted(loadMeetings)

// ── Day selection + week strip ──
const toISO = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const todayISO = () => toISO(new Date())
const selectedDate = ref(todayISO())

const parseISO = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d) }
// Monday-start week around the selected day.
const weekDays = computed(() => {
  const d = parseISO(selectedDate.value)
  const monday = new Date(d); monday.setDate(d.getDate() - ((d.getDay() + 6) % 7))
  return Array.from({ length: 7 }, (_, i) => {
    const day = new Date(monday); day.setDate(monday.getDate() + i)
    return { iso: toISO(day), num: day.getDate(), wd: day.toLocaleDateString(undefined, { weekday: 'short' }) }
  })
})
function shiftWeek(n) { const d = parseISO(selectedDate.value); d.setDate(d.getDate() + 7 * n); selectedDate.value = toISO(d) }
const headerLabel = computed(() =>
  parseISO(selectedDate.value).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' }))
const isToday = computed(() => selectedDate.value === todayISO())

// Category dots under each day of the strip (what the day holds, at a glance).
const dayDots = (iso) => {
  const seen = []
  for (const t of tasks.value) {
    if (t.date !== iso || t.start_min == null) continue
    const col = catColor(t.category)
    if (!seen.includes(col)) seen.push(col)
    if (seen.length >= 4) break
  }
  return seen
}

// ── The timeline ──
const HOUR_H = 52
const CAP_X = 60      // where the capsule column starts (px, after the hour labels)
const CAP_W = 40      // capsule width — the "vertical line" the tasks sit on
const timelineEl = ref(null)
const nowMin = ref(new Date().getHours() * 60 + new Date().getMinutes())
let tick = null
onMounted(() => { tick = setInterval(() => { const n = new Date(); nowMin.value = n.getHours() * 60 + n.getMinutes() }, 30000) })
onBeforeUnmount(() => clearInterval(tick))

// Meetings overlapping the selected day, clipped to it, in local minutes.
const dayMeetings = computed(() => {
  const dayStart = parseISO(selectedDate.value)
  const dayEnd = new Date(dayStart); dayEnd.setDate(dayEnd.getDate() + 1)
  return meetings.value
    .filter(m => new Date(m.starts_at) < dayEnd && new Date(m.ends_at) > dayStart)
    .map(m => ({
      ...m,
      startMin: Math.max(0, (new Date(m.starts_at) - dayStart) / 60000),
      endMin: Math.min(24 * 60, (new Date(m.ends_at) - dayStart) / 60000),
    }))
})

const dayTasks = computed(() =>
  tasks.value.filter(t => t.date === selectedDate.value && t.start_min != null)
    .slice().sort((a, b) => a.start_min - b.start_min || a.duration_min - b.duration_min))
const inboxTasks = computed(() => tasks.value.filter(t => t.date == null || t.start_min == null))

// Overlapping tasks share the width: assign each task a lane within its overlap
// group, so two parallel commitments sit side by side instead of on top of each other.
const laidOut = computed(() => {
  const out = []
  let group = [], groupEnd = -1
  const flush = () => {
    const lanes = []          // per-lane end time (min)
    const placed = []
    for (const t of group) {
      let li = lanes.findIndex(end => end <= t.start_min)
      if (li === -1) { li = lanes.length; lanes.push(0) }
      lanes[li] = t.start_min + t.duration_min
      placed.push({ ...t, lane: li })
    }
    placed.forEach(p => out.push({ ...p, lanes: lanes.length }))
    group = []
  }
  for (const t of dayTasks.value) {
    if (group.length && t.start_min >= groupEnd) flush()
    group.push(t)
    groupEnd = Math.max(groupEnd, t.start_min + t.duration_min)
  }
  if (group.length) flush()
  return out
})

// ── Time progression inside a capsule ──
// The future part of a task is desaturated; as the now-line clears it, the
// cleared part fills in with the full category colour (a saturated overlay whose
// height is the elapsed fraction). Past days are fully coloured, future days
// fully muted.
const _desatCache = {}
function desatColor(color) {
  if (_desatCache[color]) return _desatCache[color]
  const m = /^#([0-9a-f]{6})$/i.exec(color || '')
  if (!m) return color
  const n = parseInt(m[1], 16)
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255
  const gray = 0.299 * r + 0.587 * g + 0.114 * b
  const mix = (c) => Math.round(c * 0.35 + gray * 0.65)
  return (_desatCache[color] = `rgb(${mix(r)}, ${mix(g)}, ${mix(b)})`)
}
function progressOf(t) {
  const today = todayISO()
  if (selectedDate.value < today) return 1
  if (selectedDate.value > today) return 0
  return Math.max(0, Math.min(1, (nowMin.value - effStart(t)) / (t.duration_min || 1)))
}

const fmtTime = (min) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`
const fmtDur = (min) => {
  const h = Math.floor(min / 60), m = min % 60
  return h && m ? `${h} h ${m} min` : h ? `${h} h` : `${m} min`
}
const taskRange = (t) => `${fmtTime(t.start_min)}–${fmtTime(t.start_min + t.duration_min)} (${fmtDur(t.duration_min)})`
// "32 min left" on the task running right now — the little Structured touch.
const remaining = (t) => {
  if (!isToday.value || t.done) return null
  const left = t.start_min + t.duration_min - nowMin.value
  return (nowMin.value >= t.start_min && left > 0) ? left : null
}

function scrollToDay() {
  nextTick(() => {
    if (!timelineEl.value) return
    const target = isToday.value ? Math.max(0, nowMin.value - 90) : (dayTasks.value[0]?.start_min ?? 7 * 60) - 30
    timelineEl.value.scrollTop = Math.max(0, target) / 60 * HOUR_H
  })
}
onMounted(scrollToDay)
watch(selectedDate, scrollToDay)

// ── CRUD ──
const dialog = ref(null)   // { mode:'new'|'edit', task:{...} }
const showIconPicker = ref(false)
const showCatMgr = ref(false)

function blankTask(over = {}) {
  return { title: '', notes: '', icon: 'fa-list-check', category: categories.value[0]?.name || '',
           date: selectedDate.value, start_min: null, duration_min: 30, done: false, ...over }
}
function openNew(startMin = null) {
  const next = startMin ?? (isToday.value ? Math.ceil((nowMin.value + 30) / 30) * 30 : 9 * 60)
  dialog.value = { mode: 'new', task: blankTask({ start_min: next }) }
}
function openNewInbox() { dialog.value = { mode: 'new', task: blankTask({ date: null, start_min: null }) } }
function openEdit(t) { dialog.value = { mode: 'edit', task: { ...t } } }
// Click an empty timeline spot → new task at that (half-)hour.
function timelineClick(e) {
  if (e.target !== e.currentTarget) return
  const min = Math.floor((e.offsetY / HOUR_H) * 60 / 30) * 30
  openNew(Math.max(0, Math.min(23 * 60 + 30, min)))
}

const dlgTime = computed({
  get: () => dialog.value?.task.start_min == null ? '' : fmtTime(dialog.value.task.start_min),
  set: (v) => {
    if (!dialog.value) return
    if (!v) { dialog.value.task.start_min = null; return }
    const [h, m] = v.split(':').map(Number)
    dialog.value.task.start_min = (h || 0) * 60 + (m || 0)
  },
})

async function saveTask() {
  const d = dialog.value
  if (!d) return
  const t = d.task
  if (!t.title.trim()) { alert('Give the task a title.'); return }
  // No time → inbox; a time needs a date to live on.
  if (t.start_min != null && !t.date) t.date = selectedDate.value
  if (t.start_min == null) t.date = null
  const payload = { title: t.title.trim(), notes: t.notes || '', icon: t.icon, category: t.category,
                    date: t.date, start_min: t.start_min, duration_min: Math.max(5, Number(t.duration_min) || 30), done: !!t.done }
  let error
  if (d.mode === 'edit') ({ error } = await db.from('todo_items').update(payload).eq('id', t.id))
  else ({ error } = await db.from('todo_items').insert({ ...payload, owner_id: store.user.id }))
  if (error) { alert('Could not save: ' + error.message); return }
  dialog.value = null; showIconPicker.value = false
  await loadAll()
}
async function deleteTask() {
  const t = dialog.value?.task
  if (!t?.id || !confirm(`Delete "${t.title}"?`)) return
  const { error } = await db.from('todo_items').delete().eq('id', t.id)
  if (error) { alert('Could not delete: ' + error.message); return }
  dialog.value = null
  await loadAll()
}
async function toggleDone(t) {
  // `t` may be a display copy from laidOut — toggle the SOURCE row, otherwise the
  // next re-layout rebuilds from unchanged rows and earlier checks visually vanish.
  const row = tasks.value.find(x => x.id === t.id) || t
  const next = !row.done
  const { error } = await db.from('todo_items').update({ done: next }).eq('id', row.id)
  if (error) { alert('Could not save: ' + error.message); return }
  row.done = next
}
// ── Drag & drop ──
// A capsule (or its text row) can be picked up and slid along the day: pointer-
// based so it works with mouse and touch, snapping to 15 min. A press that never
// moves more than a few pixels stays a click and opens the editor as before.
const SNAP = 15
const drag = ref(null)   // { id, duration, startMin (live), grabOffsetMin, moved }
let dragJustEnded = false

const effStart = (t) => (drag.value?.id === t.id ? drag.value.startMin : t.start_min)
const liveRange = (t) => {
  const s = effStart(t)
  return `${fmtTime(s)}–${fmtTime(s + t.duration_min)} (${fmtDur(t.duration_min)})`
}

function canvasMin(clientY) {
  const rect = timelineEl.value.querySelector('.tp-canvas').getBoundingClientRect()
  return (clientY - rect.top) / HOUR_H * 60
}
function startDrag(t, e) {
  if (e.button !== undefined && e.button !== 0) return
  const origin = canvasMin(e.clientY)
  drag.value = { id: t.id, duration: t.duration_min, startMin: t.start_min, grabOffsetMin: origin - t.start_min, moved: false }
  const move = (ev) => {
    const min = canvasMin(ev.clientY) - drag.value.grabOffsetMin
    const snapped = Math.round(min / SNAP) * SNAP
    const clamped = Math.max(0, Math.min(24 * 60 - drag.value.duration, snapped))
    if (clamped !== drag.value.startMin) drag.value.moved = true
    drag.value.startMin = clamped
    ev.preventDefault()
  }
  const up = async () => {
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', up)
    const d = drag.value
    drag.value = null
    if (!d?.moved) return
    dragJustEnded = true
    setTimeout(() => { dragJustEnded = false }, 150)
    const { error } = await db.from('todo_items').update({ start_min: d.startMin }).eq('id', d.id)
    if (error) { alert('Could not move: ' + error.message); await loadAll(); return }
    const row = tasks.value.find(x => x.id === d.id)
    if (row) row.start_min = d.startMin
  }
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', up)
}
// The click that ends a drag must not open the editor.
function onTaskClick(t) { if (!dragJustEnded) openEdit(t) }

// Inbox items are HTML5-draggable straight onto the timeline: dropping schedules
// them on the selected day at the time under the cursor.
function inboxDragStart(t, e) { e.dataTransfer.setData('text/tp-task', t.id); e.dataTransfer.effectAllowed = 'move' }
async function timelineDrop(e) {
  const id = e.dataTransfer.getData('text/tp-task')
  if (!id) return
  const t = tasks.value.find(x => x.id === id)
  if (!t) return
  const min = Math.round(canvasMin(e.clientY) / SNAP) * SNAP
  const start = Math.max(0, Math.min(24 * 60 - t.duration_min, min))
  const { error } = await db.from('todo_items').update({ date: selectedDate.value, start_min: start }).eq('id', id)
  if (error) { alert('Could not schedule: ' + error.message); return }
  await loadAll()
}

// The inbox "+" — put a saved todo onto the selected day, after the last task
// (or at the next half hour today, or 09:00 on an empty other day).
async function scheduleInboxTask(t) {
  const last = dayTasks.value[dayTasks.value.length - 1]
  const start = last ? last.start_min + last.duration_min
    : isToday.value ? Math.ceil((nowMin.value + 30) / 30) * 30 : 9 * 60
  const { error } = await db.from('todo_items')
    .update({ date: selectedDate.value, start_min: Math.min(start, 23 * 60) }).eq('id', t.id)
  if (error) { alert('Could not schedule: ' + error.message); return }
  await loadAll()
}

// ── Calendar link ──
// The same personal feed the Booking module offers (calendar_tokens + the
// calendar-feed Edge Function), with a per-user opt-in to include Planner todos.
// The feed token identifies exactly one user and the function only ever serves
// that user's own todos — they never appear lab-wide or in anyone else's feed.
const showCalPanel = ref(false)
const calState = ref(null)   // { token, includeTodos, urls }
const calError = ref('')
async function openCalPanel() {
  showCalPanel.value = !showCalPanel.value
  if (!showCalPanel.value || calState.value) return
  calError.value = ''
  try {
    const token = await getOrCreateFeedToken(store.user)
    const { data } = await db.from('calendar_tokens').select('include_todos').eq('user_id', store.user.id).maybeSingle()
    calState.value = { token, includeTodos: !!data?.include_todos, urls: feedUrls(token) }
  } catch (e) {
    calError.value = e instanceof CalendarTokenTableMissing
      ? 'The calendar feed is not set up yet — run supabase/calendar_sync.sql and deploy the calendar-feed Edge Function first.'
      : 'Could not load the calendar link: ' + ((e && e.message) || e)
  }
}
async function setIncludeTodos(on) {
  const { error } = await db.from('calendar_tokens').update({ include_todos: on }).eq('user_id', store.user.id)
  if (error) {
    calError.value = /include_todos|column/i.test(error.message)
      ? 'The include_todos column is missing — re-run supabase/todo_planner.sql (and redeploy calendar-feed).'
      : 'Could not save: ' + error.message
    if (calState.value) calState.value.includeTodos = !on
    return
  }
  if (calState.value) calState.value.includeTodos = on
  store.toast(on ? 'Your todos now appear in your personal calendar feed' : 'Todos removed from your calendar feed')
}
async function copyCalLink() {
  try { await navigator.clipboard.writeText(calState.value.urls.https); store.toast('Feed link copied') } catch {}
}

// ── Categories ──
const newCat = ref({ name: '', color: '#2563eb' })
async function addCategory() {
  const name = newCat.value.name.trim()
  if (!name) return
  if (categories.value.some(c => c.name.toLowerCase() === name.toLowerCase())) { alert('That category already exists.'); return }
  const { error } = await db.from('todo_categories')
    .insert({ name, color: newCat.value.color, position: categories.value.length, owner_id: store.user.id })
  if (error) { alert('Could not add: ' + error.message); return }
  newCat.value = { name: '', color: '#2563eb' }
  await loadAll()
}
async function removeCategory(c) {
  if (!confirm(`Remove category "${c.name}"? Tasks keep it as plain text.`)) return
  const { error } = await db.from('todo_categories').delete().eq('id', c.id)
  if (error) { alert('Could not remove: ' + error.message); return }
  await loadAll()
}
async function recolorCategory(c, color) {
  const { error } = await db.from('todo_categories').update({ color }).eq('id', c.id)
  if (!error) c.color = color
}
</script>

<template>
  <div :class="props.embedded ? '' : 'card'">
    <div class="flex-between" :style="`padding-bottom: 12px; margin-bottom: 16px; display: flex; justify-content: space-between; align-items: center; ${props.embedded ? '' : 'border-bottom: 1px solid var(--ln);'}`">
      <h2 v-if="!props.embedded" style="border: none; padding: 0; margin: 0;"><i class="fas fa-calendar-day"></i> Planner</h2>
      <span v-else></span>
      <div class="plate-toolbar" style="display: flex; gap: 6px; align-items: center;">
        <button class="tp-btn" :class="{ on: showCalPanel }" @click="openCalPanel" title="Show your todos in your own calendar (personal feed — never lab-wide)"><i class="fas fa-calendar-plus"></i> Calendar</button>
        <button class="tp-btn" :class="{ on: showCatMgr }" @click="showCatMgr = !showCatMgr" title="Colour-coded categories"><i class="fas fa-palette"></i> Categories</button>
        <button class="tp-btn" @click="selectedDate = todayISO()" :disabled="isToday" title="Jump to today"><i class="fas fa-calendar-day"></i> Today</button>
        <button class="tp-btn primary" @click="openNew()" title="New task on the selected day"><i class="fas fa-plus"></i> New task</button>
      </div>
    </div>

    <div v-if="loadError" style="padding: 10px 14px; border: 1px solid #ef4444; border-radius: var(--radius); color: #ef4444; font-size: 0.85rem; margin-bottom: 14px;">
      <i class="fas fa-triangle-exclamation"></i> {{ loadError }} — are the <code>todo_items</code> / <code>todo_categories</code> tables set up? Run <code>supabase/todo_planner.sql</code> once.
    </div>

    <!-- Calendar link: personal feed, todos strictly per-user -->
    <div v-if="showCalPanel" style="margin-bottom: 16px; padding: 12px 14px; background: var(--panel-bg); border: 1px solid var(--border); border-radius: var(--radius); font-size: 0.85rem;">
      <div v-if="calError" style="color: #ef4444;"><i class="fas fa-triangle-exclamation"></i> {{ calError }}</div>
      <template v-else-if="calState">
        <label style="display: flex; gap: 8px; align-items: center; font-weight: 600; cursor: pointer;">
          <input type="checkbox" :checked="calState.includeTodos" @change="setIncludeTodos($event.target.checked)" style="width: 16px; height: 16px;">
          Show my todos in my calendar
        </label>
        <div style="font-size: 0.75rem; opacity: 0.65; margin: 6px 0 10px;">
          Your personal subscription feed gains your scheduled todos. The link is yours alone —
          only <em>your</em> todos are served, never anyone else's, and they are not visible lab-wide.
          Calendars re-poll the feed on their own (typically every 30–60 min).
        </div>
        <div style="display: flex; gap: 8px; flex-wrap: wrap;">
          <a class="tp-btn" :href="calState.urls.webcal" style="text-decoration: none;"><i class="fas fa-calendar-plus"></i> Apple Calendar</a>
          <a class="tp-btn" :href="calState.urls.google" target="_blank" rel="noopener" style="text-decoration: none;"><i class="fab fa-google"></i> Google Calendar</a>
          <button class="tp-btn" @click="copyCalLink"><i class="fas fa-link"></i> Copy feed link</button>
        </div>
      </template>
      <div v-else style="opacity: 0.6;"><i class="fas fa-spinner fa-spin"></i> Loading your calendar link…</div>
    </div>

    <!-- Category manager -->
    <div v-if="showCatMgr" style="margin-bottom: 16px; padding: 12px 14px; background: var(--panel-bg); border: 1px solid var(--border); border-radius: var(--radius);">
      <div style="display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 10px;">
        <span v-for="c in categories" :key="c.id" style="display: inline-flex; align-items: center; gap: 6px; padding: 4px 8px; border: 1px solid var(--border); border-radius: 14px; font-size: 0.8rem;">
          <input type="color" :value="c.color" @change="recolorCategory(c, $event.target.value)" style="width: 18px; height: 18px; padding: 0; border: none; background: none; cursor: pointer;" title="Change colour">
          {{ c.name }}
          <i class="fas fa-times" style="opacity: 0.45; cursor: pointer;" @click="removeCategory(c)" title="Remove"></i>
        </span>
      </div>
      <div style="display: flex; gap: 8px; align-items: center;">
        <input type="color" v-model="newCat.color" style="width: 26px; height: 26px; padding: 0; border: none; background: none; cursor: pointer;">
        <input type="text" v-model="newCat.name" placeholder="New category…" style="width: 180px; padding: 4px 8px;" @keyup.enter="addCategory">
        <button class="small" @click="addCategory"><i class="fas fa-plus"></i> Add</button>
      </div>
    </div>

    <div class="tp-layout">
      <!-- ── Inbox: saved, unscheduled todos ── -->
      <div class="tp-inbox">
        <div class="tp-inbox-head">
          <span><i class="fas fa-inbox" style="opacity: 0.6;"></i> Inbox</span>
          <button class="tp-btn tp-icon" @click="openNewInbox()" title="New unscheduled todo"><i class="fas fa-plus"></i></button>
        </div>
        <div v-for="t in inboxTasks" :key="t.id" class="tp-inbox-item" @click="openEdit(t)"
             draggable="true" @dragstart="inboxDragStart(t, $event)"
             title="Drag onto the timeline to schedule it">
          <span class="tp-bubble" :style="{ background: catColor(t.category) }"><i class="fas" :class="t.icon"></i></span>
          <div style="flex: 1; min-width: 0;">
            <div style="font-size: 0.72rem; opacity: 0.6;">{{ fmtDur(t.duration_min) }}<span v-if="t.category"> · {{ t.category }}</span></div>
            <div style="font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" :style="t.done ? 'text-decoration: line-through; opacity: 0.5;' : ''">{{ t.title }}</div>
          </div>
          <button class="tp-btn tp-icon" @click.stop="scheduleInboxTask(t)" :title="`Schedule on ${headerLabel}`"><i class="fas fa-plus"></i></button>
        </div>
        <div v-if="!inboxTasks.length" style="font-size: 0.8rem; opacity: 0.45; font-style: italic; padding: 8px 4px;">
          Nothing waiting. Todos without a time land here.
        </div>
      </div>

      <!-- ── Day view ── -->
      <div class="tp-day">
        <div class="tp-day-head">
          <button class="tp-btn tp-icon" @click="shiftWeek(-1)" title="Previous week"><i class="fas fa-chevron-left"></i></button>
          <div class="tp-week">
            <button v-for="d in weekDays" :key="d.iso" class="tp-wday" :class="{ sel: d.iso === selectedDate, today: d.iso === todayISO() }" @click="selectedDate = d.iso">
              <span class="tp-wd">{{ d.wd }}</span>
              <span class="tp-wnum">{{ d.num }}</span>
              <span class="tp-dots"><i v-for="(c, i) in dayDots(d.iso)" :key="i" :style="{ background: c }"></i></span>
            </button>
          </div>
          <button class="tp-btn tp-icon" @click="shiftWeek(1)" title="Next week"><i class="fas fa-chevron-right"></i></button>
        </div>
        <div style="text-align: center; font-weight: 700; font-size: 1.05rem; margin: 4px 0 10px;">{{ headerLabel }}</div>

        <!-- Structured-style flow: one vertical spine; each task is a rounded
             capsule ON the line whose length is its duration, icon at its head.
             Text sits to the right of the line; free time shows the dashed spine. -->
        <div class="tp-timeline" ref="timelineEl">
          <div class="tp-canvas" :style="{ height: 24 * HOUR_H + 'px' }" @click="timelineClick"
               @dragover.prevent @drop="timelineDrop" title="Click an empty slot to add a task there">
            <!-- hour marks -->
            <template v-for="h in 24" :key="h">
              <div class="tp-hour" :style="{ top: (h - 1) * HOUR_H + 'px' }">
                <span>{{ String(h - 1).padStart(2, '0') }}:00</span>
              </div>
            </template>
            <!-- meetings from the Calendar module: read-only busy-time bands behind the tasks -->
            <div v-for="m in dayMeetings" :key="'mtg' + m.id" class="tp-meeting"
                 :style="{ top: m.startMin / 60 * HOUR_H + 'px', height: Math.max(20, (m.endMin - m.startMin) / 60 * HOUR_H - 2) + 'px' }">
              <span class="tp-meeting-label">
                <i class="fas fa-users"></i> {{ m.title }}<template v-if="m.location"> · {{ m.location }}</template>
              </span>
            </div>

            <!-- the spine: dashed = free time; capsules cover it where the day is planned -->
            <div class="tp-spine"></div>
            <!-- now line -->
            <div v-if="isToday" class="tp-now" :style="{ top: nowMin / 60 * HOUR_H + 'px' }"></div>

            <!-- capsules on the line (overlaps step sideways into lanes) -->
            <div v-for="t in laidOut" :key="'c' + t.id" class="tp-capsule"
                 :class="{ done: t.done, active: remaining(t), dragging: drag && drag.id === t.id }"
                 :style="{ top: effStart(t) / 60 * HOUR_H + 'px',
                           height: Math.max(38, t.duration_min / 60 * HOUR_H - 3) + 'px',
                           left: (CAP_X + t.lane * (CAP_W + 6)) + 'px',
                           background: desatColor(catColor(t.category)) }"
                 @pointerdown="startDrag(t, $event)"
                 @click.stop="onTaskClick(t)" :title="t.title">
              <span class="tp-cap-fill" :style="{ height: (progressOf(t) * 100) + '%', background: catColor(t.category) }"></span>
              <i class="fas" :class="t.icon" style="position: relative; z-index: 1;"></i>
            </div>

            <!-- text rows beside the line, aligned with each capsule's head.
                 The text area starts after ALL capsule lanes and is split into
                 one column per lane, so parallel tasks read side by side instead
                 of printing over each other. -->
            <div v-for="t in laidOut" :key="'t' + t.id" class="tp-task"
                 :class="{ done: t.done, dragging: drag && drag.id === t.id, laned: t.lanes > 1 }"
                 :style="{ top: effStart(t) / 60 * HOUR_H + 'px',
                           left: `calc(${CAP_X + t.lanes * (CAP_W + 6) + 8}px + ${t.lane} * ((100% - ${CAP_X + t.lanes * (CAP_W + 6) + 16}px) / ${t.lanes}))`,
                           width: `calc((100% - ${CAP_X + t.lanes * (CAP_W + 6) + 16}px) / ${t.lanes} - 6px)`,
                           minHeight: Math.max(38, t.duration_min / 60 * HOUR_H - 3) + 'px' }"
                 @pointerdown="startDrag(t, $event)"
                 @click.stop="onTaskClick(t)">
              <div class="tp-task-body">
                <div class="tp-task-meta">
                  <template v-if="remaining(t)">{{ remaining(t) }} min left · </template>{{ liveRange(t) }}<span v-if="t.category"> · {{ t.category }}</span>
                </div>
                <div class="tp-task-title">{{ t.title }}</div>
              </div>
              <span class="tp-check" :style="{ borderColor: catColor(t.category), background: t.done ? catColor(t.category) : 'transparent' }"
                    @pointerdown.stop @click.stop="toggleDone(t)" :title="t.done ? 'Mark as open' : 'Mark as done'">
                <i v-if="t.done" class="fas fa-check"></i>
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- ── Task dialog ── -->
    <div v-if="dialog" style="position: fixed; inset: 0; background: rgba(0,0,0,0.6); display: flex; align-items: center; justify-content: center; z-index: 2000;" @click.self="dialog = null; showIconPicker = false">
      <div style="background: var(--surface); padding: 22px; border-radius: var(--radius); border: 1px solid var(--border); max-width: 480px; width: 92%; max-height: 85vh; overflow-y: auto;">
        <div class="flex-between" style="border-bottom: 1px solid var(--ln); padding-bottom: 10px; margin-bottom: 14px; display: flex; justify-content: space-between; align-items: center;">
          <h3 style="margin: 0; color: var(--primary);">{{ dialog.mode === 'edit' ? 'Edit task' : 'New task' }}</h3>
          <button class="danger small" @click="dialog = null; showIconPicker = false"><i class="fas fa-times"></i></button>
        </div>

        <div style="display: flex; gap: 10px; align-items: center; margin-bottom: 12px;">
          <span class="tp-bubble" style="width: 40px; height: 40px; font-size: 1.05rem; cursor: pointer;" :style="{ background: catColor(dialog.task.category) }"
                @click="showIconPicker = !showIconPicker" title="Pick an icon">
            <i class="fas" :class="dialog.task.icon"></i>
          </span>
          <input type="text" v-model="dialog.task.title" placeholder="What is to be done?" style="flex: 1; font-size: 1rem; padding: 8px;" @keyup.enter="saveTask">
        </div>

        <div v-if="showIconPicker" style="border: 1px solid var(--border); border-radius: var(--radius); padding: 10px; margin-bottom: 12px; max-height: 220px; overflow-y: auto;">
          <div v-for="g in ICON_GROUPS" :key="g.label">
            <div style="font-size: 0.68rem; font-weight: 700; opacity: 0.5; text-transform: uppercase; letter-spacing: 0.05em; margin: 6px 0 4px;">{{ g.label }}</div>
            <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(34px, 1fr)); gap: 4px;">
              <button v-for="ic in g.icons" :key="ic" class="tp-ic-pick" :class="{ sel: dialog.task.icon === ic }"
                      @click="dialog.task.icon = ic; showIconPicker = false"><i class="fas" :class="ic"></i></button>
            </div>
          </div>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 12px;">
          <div class="input-group" style="margin: 0;">
            <label style="font-size: 0.75rem; font-weight: bold;">Category</label>
            <select v-model="dialog.task.category" style="width: 100%; padding: 6px;">
              <option value="">— none —</option>
              <option v-for="c in categories" :key="c.id" :value="c.name">{{ c.name }}</option>
            </select>
          </div>
          <div class="input-group" style="margin: 0;">
            <label style="font-size: 0.75rem; font-weight: bold;">Date</label>
            <input type="date" v-model="dialog.task.date" style="width: 100%; padding: 6px;">
          </div>
          <div class="input-group" style="margin: 0;">
            <label style="font-size: 0.75rem; font-weight: bold;">Start (empty = Inbox)</label>
            <input type="time" v-model="dlgTime" style="width: 100%; padding: 6px;">
          </div>
          <div class="input-group" style="margin: 0;">
            <label style="font-size: 0.75rem; font-weight: bold;">Duration</label>
            <div style="display: flex; gap: 4px; align-items: center;">
              <input type="number" min="5" step="5" v-model.number="dialog.task.duration_min" style="width: 70px; padding: 6px;"> min
            </div>
            <div style="display: flex; gap: 4px; margin-top: 4px;">
              <button v-for="m in [15, 30, 60, 90, 120]" :key="m" class="tp-chip" :class="{ sel: dialog.task.duration_min === m }"
                      @click="dialog.task.duration_min = m">{{ m >= 60 ? (m / 60) + ' h' : m + ' m' }}</button>
            </div>
          </div>
        </div>

        <div class="input-group" style="margin: 0 0 14px;">
          <label style="font-size: 0.75rem; font-weight: bold;">Notes</label>
          <textarea v-model="dialog.task.notes" rows="2" style="width: 100%; padding: 6px; resize: vertical;"></textarea>
        </div>

        <div style="display: flex; justify-content: space-between; align-items: center;">
          <button v-if="dialog.mode === 'edit'" class="danger small" @click="deleteTask"><i class="fas fa-trash"></i> Delete</button>
          <span v-else></span>
          <div style="display: flex; gap: 8px; align-items: center;">
            <label v-if="dialog.mode === 'edit'" style="font-size: 0.8rem; display: flex; gap: 5px; align-items: center; opacity: 0.8;">
              <input type="checkbox" v-model="dialog.task.done"> done
            </label>
            <button class="small" @click="saveTask"><i class="fas fa-check"></i> Save</button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.tp-layout { display: flex; gap: 16px; align-items: stretch; }
.tp-inbox { flex: 0 0 240px; display: flex; flex-direction: column; gap: 8px; }
.tp-day { flex: 1; min-width: 0; display: flex; flex-direction: column; }
@media (max-width: 800px) { .tp-layout { flex-direction: column; } .tp-inbox { flex: none; } }

.tp-btn {
  height: 30px; padding: 0 11px; border-radius: 8px; font-size: 0.74rem; font-weight: 600;
  display: inline-flex; align-items: center; justify-content: center; gap: 6px;
  background: var(--btn2, rgba(0,0,0,.05)); color: var(--tx, inherit);
  border: 1px solid var(--ln2, rgba(0,0,0,.12)); cursor: pointer; box-shadow: none;
}
.tp-btn:hover:not(:disabled) { filter: brightness(1.06); }
.tp-btn:disabled { opacity: .55; cursor: default; }
.tp-btn.primary { background: var(--acc, #2563eb); border-color: transparent; color: #fff; }
.tp-btn.on { background: var(--acs, rgba(37,99,235,.14)); border-color: var(--acc, #2563eb); color: var(--acc, #2563eb); }
.tp-icon { width: 30px; padding: 0; }

.tp-inbox-head { display: flex; justify-content: space-between; align-items: center; font-weight: 700; font-size: 0.9rem; padding-bottom: 4px; border-bottom: 1px solid var(--ln); }
.tp-inbox-item {
  display: flex; gap: 10px; align-items: center; padding: 9px 10px;
  background: var(--panel-bg); border: 1px solid var(--border); border-radius: 12px; cursor: pointer;
}
.tp-inbox-item:hover { filter: brightness(1.04); }

.tp-bubble {
  flex: none; width: 32px; height: 32px; border-radius: 10px; color: #fff;
  display: inline-flex; align-items: center; justify-content: center; font-size: 0.85rem;
}

.tp-day-head { display: flex; gap: 8px; align-items: center; }
.tp-week { flex: 1; display: grid; grid-template-columns: repeat(7, 1fr); gap: 4px; }
.tp-wday {
  display: flex; flex-direction: column; align-items: center; gap: 2px; padding: 6px 2px;
  background: transparent; border: 1px solid transparent; border-radius: 10px; cursor: pointer; box-shadow: none; color: inherit;
}
.tp-wday:hover { background: var(--panel-bg); }
.tp-wday .tp-wd { font-size: 0.68rem; opacity: 0.55; }
.tp-wday .tp-wnum { font-size: 0.95rem; font-weight: 700; width: 28px; height: 28px; line-height: 28px; text-align: center; border-radius: 50%; }
.tp-wday.today .tp-wnum { color: var(--acc, #2563eb); }
.tp-wday.sel .tp-wnum { background: var(--acc, #2563eb); color: #fff; }
.tp-dots { display: flex; gap: 2px; height: 5px; }
.tp-dots i { width: 5px; height: 5px; border-radius: 50%; display: inline-block; }

.tp-timeline { position: relative; overflow-y: auto; max-height: 640px; border: 1px solid var(--border); border-radius: var(--radius); background: var(--panel-bg); }
.tp-canvas { position: relative; }
.tp-hour { position: absolute; left: 0; right: 0; border-top: 1px solid var(--ln, rgba(0,0,0,.06)); }
.tp-hour span { position: absolute; left: 6px; top: -0.6em; font-size: 0.68rem; opacity: 0.5; background: var(--panel-bg); padding: 0 3px; }
/* The spine: a dashed line through the capsule column — visible where the day
   is free, covered by capsules where it is planned (the Structured look). */
.tp-spine { position: absolute; top: 0; bottom: 0; left: 79px; width: 0; border-left: 2px dashed var(--ln2, rgba(0,0,0,.16)); }
.tp-now { position: absolute; left: 52px; right: 8px; height: 0; border-top: 2px solid #ef4444; z-index: 4; pointer-events: none; }
.tp-now::before { content: ''; position: absolute; left: -5px; top: -5px; width: 8px; height: 8px; border-radius: 50%; background: #ef4444; }

/* Meetings: read-only busy-time behind the tasks — visible, never in the way. */
.tp-meeting {
  position: absolute; left: 52px; right: 4px; z-index: 1; pointer-events: none;
  background: var(--acs, rgba(37,99,235,.08));
  border-left: 3px solid var(--acc, #2563eb); border-radius: 6px;
  padding: 2px 8px; overflow: hidden; box-sizing: border-box;
}
.tp-meeting-label {
  float: right; max-width: 70%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  font-size: 0.68rem; font-weight: 600; color: var(--acc, #2563eb); opacity: 0.9;
}

/* The task capsule ON the line: length = duration, icon at its head. */
.tp-capsule {
  position: absolute; width: 40px; border-radius: 20px; z-index: 2; box-sizing: border-box;
  display: flex; justify-content: center; align-items: center; overflow: hidden;
  color: #fff; font-size: 0.9rem; cursor: grab; touch-action: none; user-select: none;
  box-shadow: 0 1px 3px rgba(0,0,0,.18);
}
/* The elapsed part of the task, filling top-down as the now-line clears it. */
.tp-cap-fill { position: absolute; top: 0; left: 0; right: 0; z-index: 0; transition: height 0.6s linear; }
.tp-capsule.active { box-shadow: 0 0 0 2px var(--surface), 0 0 0 4px currentColor, 0 1px 3px rgba(0,0,0,.2); }
.tp-capsule.done { opacity: 0.45; }
.tp-capsule.dragging { z-index: 10; cursor: grabbing; box-shadow: 0 6px 16px rgba(0,0,0,.3); }

/* The text row beside the line, aligned with the capsule's head. */
.tp-task {
  position: absolute; display: flex; gap: 10px; align-items: flex-start; padding: 4px 6px;
  background: transparent; border: none; border-radius: 10px;
  cursor: grab; overflow: hidden; z-index: 2; box-sizing: border-box;
  touch-action: none; user-select: none;
}
.tp-task:hover { background: var(--surface); }
.tp-task.dragging { z-index: 10; cursor: grabbing; background: var(--surface); }
/* Parallel tasks: each lane's text is its own little card so neither bleeds into the other. */
.tp-task.laned { background: var(--surface); border: 1px solid var(--border); }
.tp-task.done { opacity: 0.55; }
.tp-task.done .tp-task-title { text-decoration: line-through; }
.tp-task-body { flex: 1; min-width: 0; }
.tp-task-meta { font-size: 0.68rem; opacity: 0.6; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.tp-task-title { font-weight: 700; font-size: 0.88rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.tp-check {
  flex: none; width: 20px; height: 20px; border-radius: 50%; border: 2px solid; margin-top: 4px;
  display: inline-flex; align-items: center; justify-content: center; color: #fff; font-size: 0.6rem; cursor: pointer;
}

.tp-ic-pick {
  height: 32px; border-radius: 8px; background: transparent; border: 1px solid var(--border);
  color: inherit; cursor: pointer; box-shadow: none; display: inline-flex; align-items: center; justify-content: center;
}
.tp-ic-pick:hover { background: var(--panel-bg); }
.tp-ic-pick.sel { background: var(--acs, rgba(37,99,235,.14)); border-color: var(--acc, #2563eb); color: var(--acc, #2563eb); }

.tp-chip {
  padding: 2px 8px; font-size: 0.7rem; border-radius: 10px; background: transparent;
  border: 1px solid var(--border); color: inherit; cursor: pointer; box-shadow: none;
}
.tp-chip.sel { background: var(--acc, #2563eb); border-color: transparent; color: #fff; }
</style>

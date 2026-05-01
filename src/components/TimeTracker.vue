<template>
  <div class="card">
    <!-- ── Header ── -->
    <div class="tt-header">
      <h2><i class="fas fa-clock"></i> Time Tracker</h2>
      <div v-if="activeEntry" class="tt-live-badge">
        <span class="tt-live-dot"></span>
        CHECKED IN · {{ formatDuration(currentDuration) }}
      </div>
    </div>

    <div class="tt-layout">
      <!-- ══════════════ LEFT COLUMN ══════════════ -->
      <div class="tt-col">

        <!-- Check-in / out panel -->
        <section class="tt-section">
          <h3><i class="fas fa-toggle-on icon-muted"></i> Clock In / Out</h3>
          <div class="tt-form">
            <div class="tt-form-row">
              <div class="input-group" style="flex:1;">
                <label>Task</label>
                <select v-model="pendingTask">
                  <option v-for="t in settings.custom_tasks" :key="t" :value="t">{{ t }}</option>
                </select>
              </div>
              <div class="input-group" style="flex:1;">
                <label>Project</label>
                <input type="text" v-model="pendingProject" placeholder="Project name…" list="tt-projects" />
                <datalist id="tt-projects">
                  <option v-for="p in projectSuggestions" :key="p" :value="p" />
                </datalist>
              </div>
            </div>
            <div class="input-group">
              <label>Note (optional)</label>
              <input type="text" v-model="pendingNote" placeholder="What are you working on?" />
            </div>

            <!-- Active session info -->
            <div v-if="activeEntry" class="tt-active-info">
              <i class="fas fa-circle-dot" style="color:var(--success);"></i>
              <span>
                <strong>{{ activeEntry.task }}</strong>
                <span v-if="activeEntry.project"> · {{ activeEntry.project }}</span>
                &nbsp;since {{ formatTime(activeEntry.checked_in) }}
              </span>
            </div>

            <button
              class="tt-checkin-btn"
              :class="activeEntry ? 'checkout' : 'checkin'"
              @click="toggleCheckIn"
              :disabled="isSaving"
            >
              <i class="fas" :class="activeEntry ? 'fa-stop-circle' : 'fa-play-circle'"></i>
              {{ activeEntry ? 'CHECK OUT' : 'CHECK IN' }}
            </button>
          </div>
        </section>

        <!-- This-week summary -->
        <section class="tt-section">
          <h3><i class="fas fa-chart-simple icon-muted"></i> This Week</h3>
          <div class="tt-week-grid">
            <div class="tt-stat">
              <div class="tt-stat-value">{{ formatHours(thisWeekHours) }}</div>
              <div class="tt-stat-label">Logged</div>
            </div>
            <div class="tt-stat">
              <div class="tt-stat-value">{{ settings.weekly_hours }}h</div>
              <div class="tt-stat-label">Required</div>
            </div>
            <div class="tt-stat" :class="overtime >= 0 ? 'positive' : 'negative'">
              <div class="tt-stat-value">{{ overtime >= 0 ? '+' : '' }}{{ formatHours(overtime) }}</div>
              <div class="tt-stat-label">{{ overtime >= 0 ? 'Overtime' : 'Deficit' }}</div>
            </div>
            <div class="tt-stat">
              <div class="tt-stat-value">{{ todayHours }}</div>
              <div class="tt-stat-label">Today (h)</div>
            </div>
          </div>
          <div class="tt-progress-bar">
            <div class="tt-progress-fill" :style="{ width: Math.min(100, weekPercent) + '%', background: weekPercent >= 100 ? 'var(--success)' : 'var(--primary)' }"></div>
          </div>
          <div style="font-size:0.72rem; opacity:0.6; margin-top:4px; text-align:right;">
            {{ Math.round(weekPercent) }}% of weekly target
          </div>
        </section>

        <!-- History log -->
        <section class="tt-section">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
            <h3 style="margin:0;"><i class="fas fa-list icon-muted"></i> History</h3>
            <div style="display:flex; gap:6px; align-items:center; font-size:0.8rem;">
              <input type="date" v-model="filterFrom" style="padding:3px 6px; font-size:0.75rem;" />
              <span style="opacity:0.5;">–</span>
              <input type="date" v-model="filterTo" style="padding:3px 6px; font-size:0.75rem;" />
              <button class="small" @click="filterFrom=''; filterTo='';" title="Clear filter">
                <i class="fas fa-times"></i>
              </button>
            </div>
          </div>
          <div class="tt-table-wrap">
            <table class="tt-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>In</th>
                  <th>Out</th>
                  <th>Duration</th>
                  <th>Task</th>
                  <th>Project</th>
                  <th>Note</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                <template v-for="entry in filteredEntries" :key="entry.id">
                  <tr :class="{ 'tt-row-active': entry.id === activeEntry?.id }">
                    <td>{{ formatDate(entry.checked_in) }}</td>
                    <td>{{ formatTime(entry.checked_in) }}</td>
                    <td>{{ entry.checked_out ? formatTime(entry.checked_out) : '—' }}</td>
                    <td>{{ entry.checked_out ? formatDuration(new Date(entry.checked_out) - new Date(entry.checked_in)) : formatDuration(currentDuration) }}</td>
                    <td>
                      <span class="tt-task-chip">{{ entry.task }}</span>
                    </td>
                    <td class="tt-project-cell">{{ entry.project || '—' }}</td>
                    <td class="tt-note-cell" :title="entry.note">{{ entry.note || '' }}</td>
                    <td>
                      <div style="display:flex; gap:4px;">
                        <button class="small" @click="startEdit(entry)" title="Edit"><i class="fas fa-pen"></i></button>
                        <button class="small danger" @click="deleteEntry(entry.id)" title="Delete"><i class="fas fa-trash"></i></button>
                      </div>
                    </td>
                  </tr>
                  <!-- Inline edit row -->
                  <tr v-if="editingId === entry.id" class="tt-edit-row">
                    <td colspan="8">
                      <div class="tt-edit-form">
                        <div class="input-group" style="margin:0;">
                          <label>In</label>
                          <input type="datetime-local" v-model="editIn" style="font-size:0.8rem;" />
                        </div>
                        <div class="input-group" style="margin:0;">
                          <label>Out</label>
                          <input type="datetime-local" v-model="editOut" style="font-size:0.8rem;" />
                        </div>
                        <div class="input-group" style="margin:0;">
                          <label>Task</label>
                          <select v-model="editTask" style="font-size:0.8rem;">
                            <option v-for="t in settings.custom_tasks" :key="t" :value="t">{{ t }}</option>
                          </select>
                        </div>
                        <div class="input-group" style="margin:0;">
                          <label>Project</label>
                          <input type="text" v-model="editProject" style="font-size:0.8rem;" />
                        </div>
                        <div class="input-group" style="margin:0; flex:2;">
                          <label>Note</label>
                          <input type="text" v-model="editNote" style="font-size:0.8rem;" />
                        </div>
                        <div style="display:flex; gap:6px; align-items:flex-end;">
                          <button class="small success" @click="saveEdit(entry.id)"><i class="fas fa-check"></i></button>
                          <button class="small" @click="editingId=null"><i class="fas fa-times"></i></button>
                        </div>
                      </div>
                    </td>
                  </tr>
                </template>
                <tr v-if="!filteredEntries.length">
                  <td colspan="8" style="text-align:center; opacity:0.5; padding:20px;">No entries yet.</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div v-if="filteredEntries.length > 0" style="font-size:0.75rem; opacity:0.6; margin-top:6px; text-align:right;">
            {{ filteredEntries.length }} entries · {{ formatHours(filteredTotalHours) }} total
          </div>
        </section>
      </div>

      <!-- ══════════════ RIGHT COLUMN ══════════════ -->
      <div class="tt-col">

        <!-- Daily hours chart -->
        <section class="tt-section">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
            <h3 style="margin:0;"><i class="fas fa-chart-bar icon-muted"></i> Daily Hours</h3>
            <select v-model="chartPeriod" style="font-size:0.78rem; padding:3px 8px; width:auto;">
              <option value="week">This week</option>
              <option value="14">Last 14 days</option>
              <option value="30">Last 30 days</option>
            </select>
          </div>
          <div ref="dailyChartEl" class="tt-chart"></div>
        </section>

        <!-- Breakdown charts side by side -->
        <section class="tt-section">
          <h3><i class="fas fa-chart-pie icon-muted"></i> Breakdown ({{ chartPeriodLabel }})</h3>
          <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px;">
            <div>
              <div style="font-size:0.75rem; opacity:0.7; margin-bottom:4px; text-align:center;">By Task</div>
              <div ref="taskChartEl" class="tt-chart-sm"></div>
            </div>
            <div>
              <div style="font-size:0.75rem; opacity:0.7; margin-bottom:4px; text-align:center;">By Project</div>
              <div ref="projectChartEl" class="tt-chart-sm"></div>
            </div>
          </div>
        </section>

        <!-- Weekly trend -->
        <section class="tt-section">
          <h3><i class="fas fa-chart-line icon-muted"></i> Weekly Trend (last 8 weeks)</h3>
          <div ref="trendChartEl" class="tt-chart"></div>
        </section>

        <!-- Settings -->
        <section class="tt-section">
          <h3><i class="fas fa-gear icon-muted"></i> Settings</h3>
          <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-bottom:10px;">
            <div class="input-group">
              <label>Weekly target (hours)</label>
              <input type="number" min="1" max="80" v-model.number="settings.weekly_hours" @change="saveSettings" />
            </div>
            <div class="input-group">
              <label>Timezone</label>
              <input type="text" v-model="settings.timezone" placeholder="Europe/Berlin" @change="saveSettings" />
            </div>
          </div>
          <div class="input-group">
            <label>Task categories (one per line)</label>
            <textarea
              :value="settings.custom_tasks.join('\n')"
              @change="e => { settings.custom_tasks = e.target.value.split('\n').map(s => s.trim()).filter(Boolean); saveSettings() }"
              rows="5"
              style="font-size:0.8rem; font-family:monospace;"
            ></textarea>
          </div>
        </section>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import Plotly from 'plotly.js-dist-min'
import { db } from '../services/supabase'
import { useLabStore } from '../stores/labStore'

const store = useLabStore()

// ── State ─────────────────────────────────────────────────────────────────────

const entries = ref([])
const settings = reactive({
  weekly_hours: 40,
  timezone: 'Europe/Berlin',
  custom_tasks: ['Lab Work', 'Meeting', 'Data Analysis', 'Writing', 'Admin', 'Other'],
})

const pendingTask    = ref('Lab Work')
const pendingProject = ref('')
const pendingNote    = ref('')
const isSaving       = ref(false)

const editingId  = ref(null)
const editIn     = ref('')
const editOut    = ref('')
const editTask   = ref('')
const editProject = ref('')
const editNote   = ref('')

const filterFrom = ref('')
const filterTo   = ref('')
const chartPeriod = ref('week')

// Live clock — ticks every 30 s to update the active-session duration badge.
const now = ref(new Date())
let clockTimer = null

const dailyChartEl   = ref(null)
const taskChartEl    = ref(null)
const projectChartEl = ref(null)
const trendChartEl   = ref(null)

// ── Derived ───────────────────────────────────────────────────────────────────

const activeEntry = computed(() =>
  entries.value.find(e => !e.checked_out) || null
)

const currentDuration = computed(() =>
  activeEntry.value ? now.value - new Date(activeEntry.value.checked_in) : 0
)

const projectSuggestions = computed(() => {
  const s = new Set(entries.value.map(e => e.project).filter(Boolean))
  return [...s].sort()
})

function getMonday(d) {
  const dt = new Date(d)
  const day = dt.getDay()
  const diff = (day === 0 ? -6 : 1 - day)
  dt.setDate(dt.getDate() + diff)
  dt.setHours(0, 0, 0, 0)
  return dt
}

function entryMinutes(e) {
  if (!e.checked_out) return 0
  return (new Date(e.checked_out) - new Date(e.checked_in)) / 60000
}

const thisWeekStart = computed(() => getMonday(now.value))

const thisWeekEntries = computed(() =>
  entries.value.filter(e => new Date(e.checked_in) >= thisWeekStart.value)
)

const thisWeekHours = computed(() => {
  const mins = thisWeekEntries.value.reduce((s, e) => s + entryMinutes(e), 0)
  return mins / 60
})

const todayHours = computed(() => {
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const mins = entries.value
    .filter(e => new Date(e.checked_in) >= today)
    .reduce((s, e) => s + entryMinutes(e), 0)
  return (mins / 60).toFixed(1)
})

const overtime = computed(() => thisWeekHours.value - settings.weekly_hours)

const weekPercent = computed(() =>
  settings.weekly_hours > 0 ? (thisWeekHours.value / settings.weekly_hours) * 100 : 0
)

const chartPeriodLabel = computed(() => {
  if (chartPeriod.value === 'week') return 'this week'
  return `last ${chartPeriod.value} days`
})

const filteredEntries = computed(() => {
  let list = [...entries.value].sort((a, b) =>
    new Date(b.checked_in) - new Date(a.checked_in)
  )
  if (filterFrom.value) {
    const from = new Date(filterFrom.value)
    list = list.filter(e => new Date(e.checked_in) >= from)
  }
  if (filterTo.value) {
    const to = new Date(filterTo.value); to.setHours(23, 59, 59, 999)
    list = list.filter(e => new Date(e.checked_in) <= to)
  }
  return list
})

const filteredTotalHours = computed(() =>
  filteredEntries.value.reduce((s, e) => s + entryMinutes(e), 0) / 60
)

// ── Formatters ────────────────────────────────────────────────────────────────

function formatDuration(ms) {
  if (!ms || ms <= 0) return '0m'
  const totalMin = Math.floor(ms / 60000)
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

function formatHours(h) {
  const abs = Math.abs(h)
  const sign = h < 0 ? '-' : ''
  const hh = Math.floor(abs)
  const mm = Math.round((abs - hh) * 60)
  return mm > 0 ? `${sign}${hh}h ${mm}m` : `${sign}${hh}h`
}

function formatDate(ts) {
  return new Date(ts).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' })
}

function formatTime(ts) {
  return new Date(ts).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
}

function toDatetimeLocal(ts) {
  if (!ts) return ''
  const d = new Date(ts)
  const pad = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

// ── Supabase ──────────────────────────────────────────────────────────────────

async function loadEntries() {
  if (!store.user) return
  const { data } = await db.from('time_entries')
    .select('*')
    .eq('owner_id', store.user.id)
    .order('checked_in', { ascending: false })
    .limit(500)
  if (data) entries.value = data
}

async function loadSettings() {
  if (!store.user) return
  const { data } = await db.from('time_settings')
    .select('*')
    .eq('owner_id', store.user.id)
    .single()
  if (data) {
    settings.weekly_hours  = data.weekly_hours ?? 40
    settings.timezone      = data.timezone ?? 'Europe/Berlin'
    settings.custom_tasks  = data.custom_tasks ?? settings.custom_tasks
  }
}

async function saveSettings() {
  if (!store.user) return
  await db.from('time_settings').upsert({
    owner_id:     store.user.id,
    weekly_hours: settings.weekly_hours,
    timezone:     settings.timezone,
    custom_tasks: settings.custom_tasks,
  }, { onConflict: 'owner_id' })
}

async function toggleCheckIn() {
  if (!store.user) return
  isSaving.value = true
  if (activeEntry.value) {
    // Check out
    await db.from('time_entries')
      .update({ checked_out: new Date().toISOString() })
      .eq('id', activeEntry.value.id)
  } else {
    // Check in
    await db.from('time_entries').insert({
      owner_id:   store.user.id,
      checked_in: new Date().toISOString(),
      task:       pendingTask.value,
      project:    pendingProject.value.trim(),
      note:       pendingNote.value.trim(),
    })
    pendingNote.value = ''
  }
  await loadEntries()
  isSaving.value = false
  renderCharts()
}

async function deleteEntry(id) {
  if (!confirm('Delete this entry?')) return
  await db.from('time_entries').delete().eq('id', id)
  entries.value = entries.value.filter(e => e.id !== id)
  renderCharts()
}

function startEdit(entry) {
  editingId.value   = entry.id
  editIn.value      = toDatetimeLocal(entry.checked_in)
  editOut.value     = toDatetimeLocal(entry.checked_out)
  editTask.value    = entry.task
  editProject.value = entry.project
  editNote.value    = entry.note
}

async function saveEdit(id) {
  const patch = {
    checked_in:  new Date(editIn.value).toISOString(),
    checked_out: editOut.value ? new Date(editOut.value).toISOString() : null,
    task:        editTask.value,
    project:     editProject.value.trim(),
    note:        editNote.value.trim(),
  }
  await db.from('time_entries').update(patch).eq('id', id)
  const idx = entries.value.findIndex(e => e.id === id)
  if (idx >= 0) Object.assign(entries.value[idx], patch)
  editingId.value = null
  renderCharts()
}

// ── Charts ────────────────────────────────────────────────────────────────────

function plotLayout(title) {
  const dark = store.isDarkMode
  return {
    paper_bgcolor: dark ? '#111827' : '#ffffff',
    plot_bgcolor:  dark ? '#111827' : '#ffffff',
    font: { color: dark ? '#f3f4f6' : '#1f2937', size: 11 },
    margin: { l: 40, r: 10, b: 40, t: title ? 24 : 10 },
    title: title ? { text: title, font: { size: 12 } } : undefined,
    xaxis: { gridcolor: dark ? '#374151' : '#e5e7eb' },
    yaxis: { gridcolor: dark ? '#374151' : '#e5e7eb' },
    showlegend: false,
  }
}

function getPeriodEntries() {
  const cutoff = new Date()
  if (chartPeriod.value === 'week') {
    cutoff.setTime(thisWeekStart.value.getTime())
  } else {
    cutoff.setDate(cutoff.getDate() - parseInt(chartPeriod.value))
    cutoff.setHours(0, 0, 0, 0)
  }
  return entries.value.filter(e => e.checked_out && new Date(e.checked_in) >= cutoff)
}

function renderCharts() {
  nextTick(() => {
    renderDailyChart()
    renderBreakdownCharts()
    renderTrendChart()
  })
}

function renderDailyChart() {
  if (!dailyChartEl.value) return
  const periodEntries = getPeriodEntries()

  // Build day buckets
  const dayMap = new Map()
  const cutoff = new Date()
  const days = chartPeriod.value === 'week' ? 7 : parseInt(chartPeriod.value)
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i); d.setHours(0,0,0,0)
    const key = d.toISOString().split('T')[0]
    dayMap.set(key, 0)
  }

  for (const e of periodEntries) {
    const key = new Date(e.checked_in).toISOString().split('T')[0]
    if (dayMap.has(key)) {
      dayMap.set(key, (dayMap.get(key) || 0) + entryMinutes(e) / 60)
    }
  }

  const xDays = [...dayMap.keys()]
  const yHours = [...dayMap.values()].map(h => +h.toFixed(2))
  const colors = xDays.map(d => d === new Date().toISOString().split('T')[0] ? 'var(--primary)' : 'rgba(99,102,241,0.5)')

  const reqLine = settings.weekly_hours / 5

  const layout = plotLayout(null)
  layout.xaxis.tickformat = '%d.%m'
  layout.yaxis.title = { text: 'Hours', font: { size: 10 } }
  layout.shapes = [{
    type: 'line', x0: xDays[0], x1: xDays[xDays.length-1],
    y0: reqLine, y1: reqLine,
    line: { color: 'rgba(239,68,68,0.6)', width: 1.5, dash: 'dot' },
  }]

  Plotly.react(dailyChartEl.value, [{
    type: 'bar', x: xDays, y: yHours,
    marker: { color: yHours.map((h, i) => h >= reqLine ? 'rgba(16,185,129,0.7)' : 'rgba(99,102,241,0.55)') },
    hovertemplate: '%{x|%a %d.%m}<br>%{y:.1f}h<extra></extra>',
  }], layout, { responsive: true, displayModeBar: false })
}

function renderBreakdownCharts() {
  if (!taskChartEl.value || !projectChartEl.value) return
  const pEntries = getPeriodEntries()

  const taskTotals = {}
  const projTotals = {}
  for (const e of pEntries) {
    const h = entryMinutes(e) / 60
    taskTotals[e.task] = (taskTotals[e.task] || 0) + h
    if (e.project) projTotals[e.project] = (projTotals[e.project] || 0) + h
  }

  const pieLayout = { ...plotLayout(null), margin: { l: 5, r: 5, t: 5, b: 5 }, showlegend: true,
    legend: { orientation: 'h', y: -0.2, font: { size: 9 } } }

  Plotly.react(taskChartEl.value, [{
    type: 'pie',
    labels: Object.keys(taskTotals),
    values: Object.values(taskTotals).map(h => +h.toFixed(2)),
    hovertemplate: '%{label}: %{value:.1f}h<extra></extra>',
    textinfo: 'percent', hole: 0.4,
  }], pieLayout, { responsive: true, displayModeBar: false })

  const projLabels = Object.keys(projTotals)
  Plotly.react(projectChartEl.value, [{
    type: 'pie',
    labels: projLabels.length ? projLabels : ['(no project)'],
    values: projLabels.length ? Object.values(projTotals).map(h => +h.toFixed(2)) : [0.01],
    hovertemplate: '%{label}: %{value:.1f}h<extra></extra>',
    textinfo: 'percent', hole: 0.4,
  }], pieLayout, { responsive: true, displayModeBar: false })
}

function renderTrendChart() {
  if (!trendChartEl.value) return

  // Build 8-week buckets (Mon–Sun)
  const weekLabels = []
  const weekHours  = []
  const monday = getMonday(new Date())

  for (let w = 7; w >= 0; w--) {
    const wStart = new Date(monday); wStart.setDate(wStart.getDate() - w * 7)
    const wEnd   = new Date(wStart); wEnd.setDate(wEnd.getDate() + 7)
    const label  = `${String(wStart.getDate()).padStart(2,'0')}.${String(wStart.getMonth()+1).padStart(2,'0')}`
    const hours  = entries.value
      .filter(e => e.checked_out && new Date(e.checked_in) >= wStart && new Date(e.checked_in) < wEnd)
      .reduce((s, e) => s + entryMinutes(e), 0) / 60
    weekLabels.push(label)
    weekHours.push(+hours.toFixed(2))
  }

  const layout = plotLayout(null)
  layout.yaxis.title = { text: 'Hours', font: { size: 10 } }
  layout.shapes = [{
    type: 'line', x0: weekLabels[0], x1: weekLabels[weekLabels.length-1],
    y0: settings.weekly_hours, y1: settings.weekly_hours,
    line: { color: 'rgba(239,68,68,0.6)', width: 1.5, dash: 'dot' },
  }]

  Plotly.react(trendChartEl.value, [
    {
      type: 'bar', x: weekLabels, y: weekHours, name: 'Hours',
      marker: { color: weekHours.map(h => h >= settings.weekly_hours ? 'rgba(16,185,129,0.65)' : 'rgba(99,102,241,0.55)') },
      hovertemplate: 'Week of %{x}: %{y:.1f}h<extra></extra>',
    },
    {
      type: 'scatter', mode: 'lines+markers', x: weekLabels, y: weekHours,
      line: { color: 'var(--primary)', width: 2 },
      marker: { size: 6 },
      hoverinfo: 'skip',
    },
  ], layout, { responsive: true, displayModeBar: false })
}

// ── Lifecycle ─────────────────────────────────────────────────────────────────

watch(() => store.isDarkMode, renderCharts)
watch(chartPeriod, renderCharts)
watch(entries, () => nextTick(renderCharts), { deep: false })

onMounted(async () => {
  await loadSettings()
  await loadEntries()
  renderCharts()
  clockTimer = setInterval(() => { now.value = new Date() }, 30000)
})

onBeforeUnmount(() => {
  clearInterval(clockTimer)
  ;[dailyChartEl, taskChartEl, projectChartEl, trendChartEl]
    .forEach(el => { if (el.value) Plotly.purge(el.value) })
})
</script>

<style scoped>
.tt-header {
  display: flex;
  align-items: center;
  gap: 14px;
  border-bottom: 2px solid var(--bg);
  padding-bottom: 12px;
  margin-bottom: 15px;
  flex-wrap: wrap;
}
.tt-header h2 { margin: 0; border: none; padding: 0; display: flex; align-items: center; gap: 10px; }

.tt-live-badge {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 5px 12px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--success) 15%, transparent);
  border: 1px solid var(--success);
  font-size: 0.78rem;
  font-weight: 700;
  color: var(--success);
  letter-spacing: 0.4px;
}
.tt-live-dot {
  width: 8px; height: 8px;
  border-radius: 50%;
  background: var(--success);
  animation: tt-pulse 1.6s ease-in-out infinite;
}
@keyframes tt-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }

.tt-layout {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 15px;
}
@media (max-width: 1100px) { .tt-layout { grid-template-columns: 1fr; } }
.tt-col { display: flex; flex-direction: column; gap: 15px; min-width: 0; }

.tt-section {
  background: var(--panel-bg);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 12px;
}
.tt-section h3 {
  font-size: 0.9rem;
  color: var(--primary);
  margin: 0 0 10px;
  display: flex; align-items: center; gap: 8px;
  border-bottom: 1px solid var(--border);
  padding-bottom: 6px;
}

.tt-form { display: flex; flex-direction: column; gap: 8px; }
.tt-form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }

.tt-active-info {
  display: flex; align-items: center; gap: 8px;
  padding: 6px 10px;
  border-radius: var(--radius);
  background: color-mix(in srgb, var(--success) 10%, transparent);
  border: 1px solid color-mix(in srgb, var(--success) 40%, transparent);
  font-size: 0.8rem;
}

.tt-checkin-btn {
  width: 100%;
  padding: 12px;
  border: none;
  border-radius: var(--radius);
  font-size: 1rem;
  font-weight: 700;
  letter-spacing: 1px;
  cursor: pointer;
  display: flex; align-items: center; justify-content: center; gap: 10px;
  transition: filter 0.15s;
}
.tt-checkin-btn:hover:not(:disabled) { filter: brightness(0.9); }
.tt-checkin-btn:disabled { opacity: 0.55; cursor: not-allowed; }
.tt-checkin-btn.checkin  { background: var(--success); color: #fff; }
.tt-checkin-btn.checkout { background: var(--danger,#ef4444); color: #fff; }

.tt-week-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
  margin-bottom: 10px;
}
.tt-stat {
  text-align: center;
  padding: 8px 4px;
  border-radius: var(--radius);
  background: var(--input-bg);
  border: 1px solid var(--border);
}
.tt-stat-value { font-size: 1.1rem; font-weight: 700; }
.tt-stat-label { font-size: 0.68rem; opacity: 0.65; text-transform: uppercase; letter-spacing: 0.4px; margin-top: 2px; }
.tt-stat.positive .tt-stat-value { color: var(--success); }
.tt-stat.negative .tt-stat-value { color: var(--danger, #ef4444); }

.tt-progress-bar {
  height: 8px;
  border-radius: 4px;
  background: var(--input-bg);
  border: 1px solid var(--border);
  overflow: hidden;
}
.tt-progress-fill { height: 100%; border-radius: 4px; transition: width 0.4s; }

.tt-table-wrap { max-height: 360px; overflow-y: auto; border: 1px solid var(--border); border-radius: var(--radius); }
.tt-table { width: 100%; border-collapse: collapse; font-size: 0.75rem; }
.tt-table th {
  position: sticky; top: 0; background: var(--input-bg); z-index: 1;
  padding: 6px 8px; text-align: left;
  border-bottom: 1px solid var(--border);
  font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.4px; opacity: 0.8;
}
.tt-table td { padding: 5px 8px; border-bottom: 1px solid var(--border); }
.tt-row-active td { background: color-mix(in srgb, var(--success) 8%, transparent); }
.tt-edit-row td { background: var(--summary-bg, #f8fafc); }
.tt-task-chip {
  display: inline-block;
  padding: 1px 7px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--primary) 12%, transparent);
  border: 1px solid color-mix(in srgb, var(--primary) 30%, transparent);
  font-size: 0.7rem;
  white-space: nowrap;
}
.tt-project-cell { max-width: 90px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; opacity: 0.85; }
.tt-note-cell    { max-width: 120px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; opacity: 0.7; }
.tt-edit-form {
  display: flex; gap: 6px; flex-wrap: wrap; align-items: flex-end; padding: 8px 0;
}
.tt-edit-form .input-group { min-width: 120px; }

.tt-chart    { width: 100%; height: 220px; }
.tt-chart-sm { width: 100%; height: 180px; }

.icon-muted { opacity: 0.65; }
</style>

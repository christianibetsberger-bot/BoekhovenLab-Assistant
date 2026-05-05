<template>
  <div class="tbc" :class="clockClass" v-if="loaded" @click="markActive">

    <!-- ── CHECKED IN ── -->
    <template v-if="activeEntry">
      <span class="tbc-dot"></span>
      <span class="tbc-timer">{{ liveClock }}</span>
      <span class="tbc-sep">·</span>

      <!-- Task -->
      <span v-if="privacyMode" class="tbc-private-label">Task</span>
      <template v-else-if="!addingNewTask">
        <select :value="activeEntry.task" @change="e => onTaskSelect(e.target.value, true)"
          class="tbc-select" :disabled="switching" title="Switch task">
          <option v-for="t in taskList" :key="t" :value="t">{{ t }}</option>
          <option value="__new__">+ Add new task…</option>
        </select>
      </template>
      <template v-else>
        <input v-model="newTaskName" placeholder="New task" class="tbc-select" @keyup.enter="confirmNewTask(true)" autofocus />
        <button class="tbc-btn tbc-start" @click="confirmNewTask(true)"><i class="fas fa-check"></i></button>
        <button class="tbc-btn" @click="cancelNewTask" style="background:#94a3b8;color:#fff;"><i class="fas fa-times"></i></button>
      </template>

      <!-- Project -->
      <span v-if="privacyMode" class="tbc-private-label">Project</span>
      <template v-else-if="!addingNewProject">
        <select :value="activeEntry.project || ''" @change="e => onProjectSelect(e.target.value, true)"
          class="tbc-select" :disabled="switching" title="Switch project">
          <option value="">— No project —</option>
          <option v-for="p in projectList" :key="p" :value="p">{{ p }}</option>
          <option value="__new__">+ Add new project…</option>
        </select>
      </template>
      <template v-else>
        <input v-model="newProjectName" placeholder="New project" class="tbc-select" @keyup.enter="confirmNewProject(true)" autofocus />
        <button class="tbc-btn tbc-start" @click="confirmNewProject(true)"><i class="fas fa-check"></i></button>
        <button class="tbc-btn" @click="cancelNewProject" style="background:#94a3b8;color:#fff;"><i class="fas fa-times"></i></button>
      </template>

      <span v-if="!privacyMode && todayCompletedH > 0" class="tbc-today">({{ fmtH(todayCompletedH + liveH) }} today)</span>
      <button v-if="!addingNewTask && !addingNewProject" class="tbc-btn tbc-stop" @click="checkOut" title="Check Out">
        <i class="fas fa-stop"></i>
      </button>
      <button v-if="!addingNewTask && !addingNewProject" class="tbc-btn tbc-privacy" @click="togglePrivacy"
        :title="privacyMode ? 'Privacy on — click to show' : 'Hide details (privacy mode)'">
        <i class="fas" :class="privacyMode ? 'fa-eye-slash' : 'fa-eye'"></i>
      </button>
    </template>

    <!-- ── CHECKED OUT ── -->
    <template v-else>
      <span v-if="privacyMode" class="tbc-timer" style="opacity:.45;">00:00:00</span>

      <!-- Task -->
      <span v-if="privacyMode" class="tbc-private-label">Task</span>
      <template v-else-if="!addingNewTask">
        <select :value="pendingTask" @change="e => onTaskSelect(e.target.value, false)" class="tbc-select" title="Select task">
          <option v-for="t in taskList" :key="t" :value="t">{{ t }}</option>
          <option value="__new__">+ Add new task…</option>
        </select>
      </template>
      <template v-else>
        <input v-model="newTaskName" placeholder="New task" class="tbc-select" @keyup.enter="confirmNewTask(false)" autofocus />
        <button class="tbc-btn tbc-start" @click="confirmNewTask(false)"><i class="fas fa-check"></i></button>
        <button class="tbc-btn" @click="cancelNewTask" style="background:#94a3b8;color:#fff;"><i class="fas fa-times"></i></button>
      </template>

      <!-- Project -->
      <span v-if="privacyMode" class="tbc-private-label">Project</span>
      <template v-else-if="!addingNewProject">
        <select :value="pendingProject" @change="e => onProjectSelect(e.target.value, false)" class="tbc-select" title="Select project">
          <option value="">— No project —</option>
          <option v-for="p in projectList" :key="p" :value="p">{{ p }}</option>
          <option value="__new__">+ Add new project…</option>
        </select>
      </template>
      <template v-else>
        <input v-model="newProjectName" placeholder="New project" class="tbc-select" @keyup.enter="confirmNewProject(false)" autofocus />
        <button class="tbc-btn tbc-start" @click="confirmNewProject(false)"><i class="fas fa-check"></i></button>
        <button class="tbc-btn" @click="cancelNewProject" style="background:#94a3b8;color:#fff;"><i class="fas fa-times"></i></button>
      </template>

      <button v-if="!addingNewTask && !addingNewProject" class="tbc-btn tbc-start" @click="checkIn" title="Check In">
        <i class="fas fa-play"></i><span class="tbc-label"> Check In</span>
      </button>
      <button v-if="!addingNewTask && !addingNewProject" class="tbc-btn tbc-privacy" @click="togglePrivacy"
        :title="privacyMode ? 'Privacy on — click to show' : 'Hide details (privacy mode)'">
        <i class="fas" :class="privacyMode ? 'fa-eye-slash' : 'fa-eye'"></i>
      </button>
      <span v-if="!privacyMode && !addingNewTask && !addingNewProject && todayCompletedH > 0" class="tbc-today">{{ fmtH(todayCompletedH) }} today</span>
    </template>

  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue'
import { db } from '../services/supabase'
import { useLabStore } from '../stores/labStore'
import { ttBumpCounter, bumpTT, ttModuleActive, ttProjectList } from '../composables/timeTrackerBus'

const store = useLabStore()

const activeEntry      = ref(null)
const todayCompletedH  = ref(0)
const dailyTargetH     = ref(8)
const privacyMode      = ref(false)
const taskList         = ref(['Lab Work','Meeting','Data Analysis','Writing','Admin','Teaching','Coding','Literature','Break','Conference','Superuser Duties','Group Task','Other'])
const projectList      = ref([])
const pendingTask      = ref('Lab Work')
const pendingProject   = ref('')
const loaded           = ref(false)
const now              = ref(new Date())
let ticker = null

const isWeekend = computed(() => { const d = now.value.getDay(); return d === 0 || d === 6 })

// ── Live derived ──────────────────────────────────────────────────────────────

const liveMs = computed(() =>
  activeEntry.value ? now.value - new Date(activeEntry.value.checked_in) : 0
)
const liveH = computed(() => liveMs.value / 3600000)

const liveClock = computed(() => {
  if (privacyMode.value) return '00:00:00'
  const ms = liveMs.value
  if (ms <= 0) return '00:00:00'
  const h  = Math.floor(ms / 3600000)
  const m  = Math.floor((ms % 3600000) / 60000)
  const s  = Math.floor((ms % 60000) / 1000)
  return `${pad(h)}:${pad(m)}:${pad(s)}`
})

const clockClass = computed(() => {
  if (privacyMode.value) return 'tbc-private'
  const totalH = todayCompletedH.value + liveH.value
  if (isWeekend.value && totalH > 0) return 'tbc-over'
  if (totalH >= dailyTargetH.value) return 'tbc-over'
  if (totalH >= dailyTargetH.value * 0.9) return 'tbc-warn'
  if (activeEntry.value) return 'tbc-active'
  return ''
})

// ── Helpers ───────────────────────────────────────────────────────────────────

const pad = n => String(n).padStart(2, '0')
function fmtH(h) {
  const hh = Math.floor(h), mm = Math.round((h - hh) * 60)
  return mm > 0 ? `${hh}h ${mm}m` : `${hh}h`
}

// ── Idle privacy ──────────────────────────────────────────────────────────────
// If the user doesn't interact with the header for IDLE_MS, automatically
// enable privacy mode. Privacy is only disabled by:
//   (a) clicking the privacy toggle, or
//   (b) opening the TimeTracker module (signalled via ttModuleActive)

const IDLE_MS = 2 * 60 * 1000
let idleTimer = null

function markActive() {
  if (idleTimer) clearTimeout(idleTimer)
  idleTimer = setTimeout(async () => {
    if (!privacyMode.value) await setPrivacy(true)
  }, IDLE_MS)
}

async function setPrivacy(on) {
  if (privacyMode.value === on) return
  privacyMode.value = on
  if (!store.user) return
  const { data } = await db.from('time_settings').select('*').eq('owner_id', store.user.id).maybeSingle()
  const merged = { ...(data || {}), owner_id: store.user.id, privacy_mode: on }
  await db.from('time_settings').upsert(merged, { onConflict: 'owner_id' })
  bumpTT()
}

async function togglePrivacy() {
  markActive()
  await setPrivacy(!privacyMode.value)
}

// ── Data ──────────────────────────────────────────────────────────────────────

async function load() {
  if (!store.user) return
  const { data: active } = await db.from('time_entries')
    .select('*').eq('owner_id', store.user.id).is('checked_out', null).limit(1)
  activeEntry.value = active?.[0] || null

  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0)
  const { data: todayRows } = await db.from('time_entries')
    .select('checked_in,checked_out')
    .eq('owner_id', store.user.id)
    .not('checked_out', 'is', null)
    .gte('checked_in', todayStart.toISOString())
  todayCompletedH.value = (todayRows || [])
    .reduce((s, e) => s + (new Date(e.checked_out) - new Date(e.checked_in)) / 3600000, 0)

  const { data: cfg } = await db.from('time_settings')
    .select('weekly_hours,custom_tasks,custom_projects,privacy_mode')
    .eq('owner_id', store.user.id).maybeSingle()
  if (cfg) {
    dailyTargetH.value = (cfg.weekly_hours ?? 40) / 5
    privacyMode.value  = !!cfg.privacy_mode
    if (cfg.custom_tasks?.length) {
      taskList.value  = cfg.custom_tasks
      if (!cfg.custom_tasks.includes(pendingTask.value)) pendingTask.value = cfg.custom_tasks[0]
    }
    projectList.value = cfg.custom_projects || []
    if (projectList.value.length) ttProjectList.value = projectList.value
  }
  loaded.value = true
}

async function checkIn() {
  markActive()
  if (!store.user) return
  const { data } = await db.from('time_entries').insert({
    owner_id:   store.user.id,
    checked_in: new Date().toISOString(),
    task:       pendingTask.value,
    project:    pendingProject.value || '',
    note:       '',
  }).select().single()
  if (data) activeEntry.value = data
  bumpTT()
}

async function checkOut() {
  markActive()
  if (!store.user || !activeEntry.value) return
  const co = new Date().toISOString()
  await db.from('time_entries').update({ checked_out: co }).eq('id', activeEntry.value.id)
  todayCompletedH.value += (new Date(co) - new Date(activeEntry.value.checked_in)) / 3600000
  activeEntry.value = null
  bumpTT()
}

// ── Task picker ───────────────────────────────────────────────────────────────

const addingNewTask = ref(false)
const newTaskName   = ref('')

async function persistNewTask(name) {
  if (!store.user) return false
  if (taskList.value.includes(name)) return true
  taskList.value = [...taskList.value, name]
  const { data } = await db.from('time_settings').select('*').eq('owner_id', store.user.id).maybeSingle()
  const merged = { ...(data || {}), owner_id: store.user.id, custom_tasks: taskList.value }
  const { error } = await db.from('time_settings').upsert(merged, { onConflict: 'owner_id' })
  if (error) {
    console.error('time_settings upsert failed (persistNewTask):', error)
    // Roll back the optimistic local addition so the UI matches reality.
    taskList.value = taskList.value.filter(t => t !== name)
    return false
  }
  bumpTT()    // keep the TimeTracker module's settings.custom_tasks in sync
  return true
}

function onTaskSelect(val, isActive) {
  markActive()
  if (val === '__new__') {
    addingNewTask.value = true
    newTaskName.value = ''
    return
  }
  if (isActive) switchTask(val)
  else pendingTask.value = val
}

async function confirmNewTask(isActive) {
  markActive()
  const name = newTaskName.value.trim()
  if (!name) { cancelNewTask(); return }
  await persistNewTask(name)
  if (isActive) await switchTask(name)
  else pendingTask.value = name
  addingNewTask.value = false
  newTaskName.value = ''
}

function cancelNewTask() {
  markActive()
  addingNewTask.value = false
  newTaskName.value = ''
}

// ── Project picker ────────────────────────────────────────────────────────────

const addingNewProject = ref(false)
const newProjectName   = ref('')

async function persistNewProject(name) {
  if (!store.user) return false
  if (projectList.value.includes(name)) return true
  projectList.value = [...projectList.value, name].sort()
  ttProjectList.value = projectList.value  // broadcast immediately
  const { data } = await db.from('time_settings').select('*').eq('owner_id', store.user.id).maybeSingle()
  const merged = { ...(data || {}), owner_id: store.user.id, custom_projects: projectList.value }
  await db.from('time_settings').upsert(merged, { onConflict: 'owner_id' })
  bumpTT()
  return true
}

function onProjectSelect(val, isActive) {
  markActive()
  if (val === '__new__') {
    addingNewProject.value = true
    newProjectName.value = ''
    return
  }
  if (isActive) switchProject(val)
  else pendingProject.value = val
}

async function confirmNewProject(isActive) {
  markActive()
  const name = newProjectName.value.trim()
  if (!name) { cancelNewProject(); return }
  await persistNewProject(name)
  if (isActive) await switchProject(name)
  else pendingProject.value = name
  addingNewProject.value = false
  newProjectName.value = ''
}

function cancelNewProject() {
  markActive()
  addingNewProject.value = false
  newProjectName.value = ''
}

// ── Task / project switching while active ─────────────────────────────────────

const switching = ref(false)
async function switchTask(newTask) {
  if (!store.user || !activeEntry.value || activeEntry.value.task === newTask) return
  switching.value = true
  const t = new Date().toISOString()
  await db.from('time_entries').update({ checked_out: t }).eq('id', activeEntry.value.id)
  todayCompletedH.value += (new Date(t) - new Date(activeEntry.value.checked_in)) / 3600000
  const { data } = await db.from('time_entries').insert({
    owner_id:   store.user.id,
    checked_in: t,
    task:       newTask,
    project:    activeEntry.value.project || '',
    note:       '',
  }).select().single()
  activeEntry.value = data || null
  switching.value = false
  bumpTT()
}

async function switchProject(newProject) {
  if (!store.user || !activeEntry.value || (activeEntry.value.project || '') === (newProject || '')) return
  switching.value = true
  const t = new Date().toISOString()
  await db.from('time_entries').update({ checked_out: t }).eq('id', activeEntry.value.id)
  todayCompletedH.value += (new Date(t) - new Date(activeEntry.value.checked_in)) / 3600000
  const { data } = await db.from('time_entries').insert({
    owner_id:   store.user.id,
    checked_in: t,
    task:       activeEntry.value.task,
    project:    newProject || '',
    note:       '',
  }).select().single()
  activeEntry.value = data || null
  switching.value = false
  bumpTT()
}

// ── Lifecycle ─────────────────────────────────────────────────────────────────

onMounted(() => {
  load()
  ticker = setInterval(() => {
    now.value = new Date()
    if (Date.now() % 60000 < 1100) load()
  }, 1000)
  markActive()   // start the 2-min idle timer
})

// React to mutations from the TimeTracker module
watch(ttBumpCounter, () => load())

// Module opened → drop privacy and reset idle timer
watch(ttModuleActive, async () => {
  if (privacyMode.value) await setPrivacy(false)
  markActive()
})

// Auth may resolve after mount — ensure we load as soon as user is available
watch(() => store.user, u => { if (u) load() })

// Mirror the TimeTracker's broadcast — always in sync, no extra DB read needed
watch(ttProjectList, list => { projectList.value = list })

onBeforeUnmount(() => {
  clearInterval(ticker)
  if (idleTimer) clearTimeout(idleTimer)
})
</script>

<style scoped>
.tbc {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 3px 8px;
  border-radius: 999px;
  border: 1px solid var(--border, #e2e8f0);
  background: var(--panel-bg, #f8fafc);
  font-size: 0.78rem;
  transition: background .25s, border-color .25s;
}

.tbc.tbc-active {
  background: color-mix(in srgb, #10b981 10%, var(--panel-bg));
  border-color: #10b981;
}
.tbc.tbc-private {
  background: var(--panel-bg, #f8fafc);
  border-color: var(--border, #e2e8f0);
  opacity: 0.85;
}
.tbc.tbc-private .tbc-timer { opacity: 0.5; color: var(--text, #64748b); letter-spacing: 1px; }
.tbc.tbc-private .tbc-dot { background: #94a3b8; animation: none; }
.tbc.tbc-private .tbc-start,
.tbc.tbc-private .tbc-stop {
  filter: grayscale(0.85);
  opacity: 0.55;
}

/* Static replacement label shown in place of the task / project select while privacy is on. */
.tbc-private-label {
  padding: 2px 8px;
  font-size: 0.78rem;
  border-radius: 4px;
  background: var(--input-bg);
  border: 1px solid var(--border, #e2e8f0);
  color: var(--text, #64748b);
  opacity: 0.65;
  font-style: italic;
}

.tbc-privacy {
  background: transparent;
  border: 1px solid var(--border, #e2e8f0) !important;
  color: var(--text, #64748b);
  padding: 3px 8px;
}
.tbc-privacy:hover { background: var(--input-bg, #f1f5f9); }
.tbc.tbc-private .tbc-privacy {
  background: #64748b;
  color: #fff;
  border-color: #64748b !important;
  filter: none;
  opacity: 1;
}

.tbc.tbc-warn {
  background: color-mix(in srgb, #f59e0b 15%, var(--panel-bg));
  border-color: #f59e0b;
}
.tbc.tbc-over {
  background: color-mix(in srgb, #ef4444 15%, var(--panel-bg));
  border-color: #ef4444;
  animation: tbc-pulse 2s ease-in-out infinite;
}
@keyframes tbc-pulse { 0%,100%{opacity:1} 50%{opacity:.75} }

.tbc-dot {
  width: 8px; height: 8px; border-radius: 50%;
  background: #10b981;
  animation: dot-blink 1.6s ease-in-out infinite;
  flex-shrink: 0;
}
@keyframes dot-blink { 0%,100%{opacity:1} 50%{opacity:.25} }

.tbc-timer {
  font-family: monospace;
  font-size: 0.85rem;
  font-weight: 700;
  letter-spacing: 0.5px;
  white-space: nowrap;
}
.tbc-sep  { opacity: .4; }
.tbc-today { opacity: .6; font-size: .75rem; white-space: nowrap; }

.tbc-select {
  padding: 2px 6px;
  font-size: 0.78rem;
  border: 1px solid var(--border, #e2e8f0);
  border-radius: 4px;
  background: var(--input-bg);
  max-width: 130px;
}

.tbc-btn {
  display: inline-flex; align-items: center; gap: 4px;
  padding: 3px 9px;
  border: none; border-radius: 4px;
  font-size: .78rem; font-weight: 600; cursor: pointer;
  transition: filter .15s;
  white-space: nowrap;
}
.tbc-btn:hover { filter: brightness(.9); }
.tbc-start { background: #10b981; color: #fff; }
.tbc-stop  { background: #ef4444; color: #fff; }

.tbc-label { display: inline; }
@media (max-width: 900px) { .tbc-label { display: none; } }
</style>

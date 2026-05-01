<template>
  <div class="tbc" :class="clockClass" v-if="loaded">

    <!-- ── CHECKED IN ── -->
    <template v-if="activeEntry">
      <span class="tbc-dot"></span>
      <span class="tbc-timer">{{ liveClock }}</span>
      <span class="tbc-sep">·</span>
      <span class="tbc-task" :title="activeEntry.task">{{ shortTask(activeEntry.task) }}</span>
      <span v-if="todayCompletedH > 0" class="tbc-today">({{ fmtH(todayCompletedH + liveH) }} today)</span>
      <button class="tbc-btn tbc-stop" @click="checkOut" title="Check Out">
        <i class="fas fa-stop"></i>
      </button>
    </template>

    <!-- ── CHECKED OUT ── -->
    <template v-else>
      <select v-model="pendingTask" class="tbc-select" title="Select task">
        <option v-for="t in taskList" :key="t" :value="t">{{ t }}</option>
      </select>
      <button class="tbc-btn tbc-start" @click="checkIn" title="Check In">
        <i class="fas fa-play"></i><span class="tbc-label"> Check In</span>
      </button>
      <span v-if="todayCompletedH > 0" class="tbc-today">{{ fmtH(todayCompletedH) }} today</span>
    </template>

  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { db } from '../services/supabase'
import { useLabStore } from '../stores/labStore'

const store = useLabStore()

const activeEntry      = ref(null)
const todayCompletedH  = ref(0)
const dailyTargetH     = ref(8)
const taskList         = ref(['Lab Work','Meeting','Data Analysis','Writing','Admin','Teaching','Coding','Literature','Break','Conference','Superuser Duties','Group Task','Other'])
const pendingTask      = ref('Lab Work')
const loaded           = ref(false)
const now              = ref(new Date())
let ticker = null

// ── Live derived ──────────────────────────────────────────────────────────────

const liveMs = computed(() =>
  activeEntry.value ? now.value - new Date(activeEntry.value.checked_in) : 0
)
const liveH = computed(() => liveMs.value / 3600000)

const liveClock = computed(() => {
  const ms = liveMs.value
  if (ms <= 0) return '00:00:00'
  const h  = Math.floor(ms / 3600000)
  const m  = Math.floor((ms % 3600000) / 60000)
  const s  = Math.floor((ms % 60000) / 1000)
  return `${pad(h)}:${pad(m)}:${pad(s)}`
})

const clockClass = computed(() => {
  const totalH = todayCompletedH.value + liveH.value
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

function shortTask(t) {
  if (!t) return ''
  return t.length > 14 ? t.slice(0, 13) + '…' : t
}

// ── Data ──────────────────────────────────────────────────────────────────────

async function load() {
  if (!store.user) return

  // Load active entry
  const { data: active } = await db.from('time_entries')
    .select('*').eq('owner_id', store.user.id).is('checked_out', null).limit(1)
  activeEntry.value = active?.[0] || null

  // Load today's completed entries
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0)
  const { data: todayRows } = await db.from('time_entries')
    .select('checked_in,checked_out')
    .eq('owner_id', store.user.id)
    .not('checked_out', 'is', null)
    .gte('checked_in', todayStart.toISOString())
  todayCompletedH.value = (todayRows || [])
    .reduce((s, e) => s + (new Date(e.checked_out) - new Date(e.checked_in)) / 3600000, 0)

  // Load settings
  const { data: cfg } = await db.from('time_settings')
    .select('weekly_hours,custom_tasks').eq('owner_id', store.user.id).single()
  if (cfg) {
    dailyTargetH.value = (cfg.weekly_hours ?? 40) / 5
    if (cfg.custom_tasks?.length) {
      taskList.value  = cfg.custom_tasks
      pendingTask.value = cfg.custom_tasks[0]
    }
  }

  loaded.value = true
}

async function checkIn() {
  if (!store.user) return
  const { data } = await db.from('time_entries').insert({
    owner_id:   store.user.id,
    checked_in: new Date().toISOString(),
    task:       pendingTask.value,
    project:    '',
    note:       '',
  }).select().single()
  if (data) activeEntry.value = data
}

async function checkOut() {
  if (!store.user || !activeEntry.value) return
  const co = new Date().toISOString()
  await db.from('time_entries').update({ checked_out: co }).eq('id', activeEntry.value.id)
  const h = (new Date(co) - new Date(activeEntry.value.checked_in)) / 3600000
  todayCompletedH.value += h
  activeEntry.value = null
}

// ── Lifecycle ─────────────────────────────────────────────────────────────────

onMounted(() => {
  load()
  // Tick every second for the live HH:MM:SS clock; re-load data every 60 s
  ticker = setInterval(() => {
    now.value = new Date()
    if (Date.now() % 60000 < 1100) load()   // rough 60 s refresh
  }, 1000)
})

onBeforeUnmount(() => clearInterval(ticker))
</script>

<style scoped>
.tbc {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border-radius: 999px;
  border: 1px solid var(--border, #e2e8f0);
  background: var(--panel-bg, #f8fafc);
  font-size: 0.8rem;
  transition: background .25s, border-color .25s;
}

.tbc.tbc-active {
  background: color-mix(in srgb, #10b981 10%, var(--panel-bg));
  border-color: #10b981;
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
.tbc-task { opacity: .85; white-space: nowrap; max-width: 110px; overflow: hidden; text-overflow: ellipsis; }
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

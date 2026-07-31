<script setup>
import { onMounted, onUnmounted, watch, ref, computed, markRaw, nextTick } from 'vue'
import { db } from './services/supabase'
import { useLabStore } from './stores/labStore'
import { useDynamicIcon } from './composables/useDynamicIcon.js'

import AuthLogin from './components/AuthLogin.vue'
import LabJournal from './components/LabJournal.vue'
import GlobalSettings from './components/GlobalSettings.vue'
import StandardStock from './components/StandardStock.vue'
import SequenceCalc from './components/SequenceCalc.vue'
import InventoryManager from './components/InventoryManager.vue'
import ReactionPlan from './components/ReactionPlan.vue'
import MatrixPlanner from './components/MatrixPlanner.vue'
import ScreeningPlanner from './components/ScreeningPlanner.vue'
import PhasePredictor from './components/PhasePredictor.vue'
import LidaKinetics from './components/LidaKinetics.vue'
import DataFigures from './components/DataFigures.vue'
import WellPlateEditor from './components/WellPlateEditor.vue'
import ArchiveManager from './components/ArchiveManager.vue'
import TimeTracker from './components/TimeTracker.vue'
import InstrumentBooking from './components/InstrumentBooking.vue'
import TopBarClock from './components/TopBarClock.vue'
import DashboardOverview from './components/DashboardOverview.vue'

import lidaIcon from './assets/lida-icon.svg?raw'
import { MODULE_ICONS } from './utils/moduleIcons.js'

const store = useLabStore()
useDynamicIcon()

// Icons match each component's actual <h2> fa- class
const MODULE_META = {
  labJournal:       { label: 'Lab Journal', icon: 'fa-book',              component: markRaw(LabJournal) },
  globalSettings:   { label: 'Settings',    icon: 'fa-sliders',           component: markRaw(GlobalSettings) },
  standardStock:    { label: 'Stock Calc',  icon: 'fa-flask-vial',        component: markRaw(StandardStock) },
  sequenceCalc:     { label: 'DNA Calc',    icon: 'fa-dna',               component: markRaw(SequenceCalc) },
  archiveManager:   { label: 'Archive',     icon: 'fa-box-archive',       component: markRaw(ArchiveManager) },
  inventoryManager: { label: 'Inventory',   icon: 'fa-boxes-stacked',     component: markRaw(InventoryManager) },
  reactionPlan:     { label: 'Reaction',    icon: 'fa-flask',             component: markRaw(ReactionPlan) },
  matrixPlanner:    { label: 'Matrix',      icon: 'fa-table-cells',       component: markRaw(MatrixPlanner) },
  screeningPlanner: { label: 'Screening',   icon: 'fa-table-cells-large', component: markRaw(ScreeningPlanner) },
  phasePredictor:   { label: 'Phase Map',   icon: 'fa-brain',             component: markRaw(PhasePredictor) },
  lidaKinetics:     { label: 'LIDA Kinetics', icon: 'fa-dna',  svgIcon: lidaIcon, alpha: true, component: markRaw(LidaKinetics) },
  dataFigures:      { label: 'Data & Figures', icon: 'fa-chart-line', alpha: true, component: markRaw(DataFigures) },
  wellPlateEditor:  { label: 'Well Plate',  icon: 'fa-border-all',        component: markRaw(WellPlateEditor) },
  timeTracker:      { label: 'Time Tracker', icon: 'fa-clock',             component: markRaw(TimeTracker) },
  instrumentBooking:{ label: 'Booking',      icon: 'fa-calendar-check',    component: markRaw(InstrumentBooking) },
}

// Dashboard (home) line icon for the dock.
const DASHBOARD_ICON = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 7.5 8 2.5 13.5 7.5V13a0.8 0.8 0 0 1-0.8 0.8H3.3a0.8 0.8 0 0 1-0.8-0.8Z"/><line x1="8" y1="10" x2="8" y2="13.8"/></svg>'

// Desktop view router: 'dashboard' (the free-drag grid home) or a module id (full page).
const desktopView = ref('dashboard')

// ── Free-placement grid layout — 12-column absolute grid ───────────────────
const ROW_HEIGHT = 30
const COL_COUNT  = 12
const gridLayout     = ref([])   // [{i, x, y, w, h}] one entry per visible module
const savedPositions = ref({})   // last position for modules that were hidden
const dragState      = ref(null) // live drag preview  {id, x, y}
const resizeState    = ref(null) // live resize preview {id, x, y, w, h}
const bumpedLayout   = ref(null) // collision-resolved layout computed during drag
const gridContainer  = ref(null)
const containerWidth = ref(1200)

function cw() { return containerWidth.value / COL_COUNT }

const containerHeight = computed(() => {
  if (!gridLayout.value.length) return 400
  return Math.max(...gridLayout.value.map(item => {
    const isResized = resizeState.value?.id === item.i
    const h = isResized ? resizeState.value.h : item.h
    let y
    if (dragState.value?.id === item.i) y = dragState.value.y
    else if (isResized) y = resizeState.value.y
    else if (bumpedLayout.value) y = bumpedLayout.value.find(i => i.i === item.i)?.y ?? item.y
    else y = item.y
    return (y + h) * ROW_HEIGHT
  })) + 60
})

function getModuleStyle(item) {
  const isDragged = dragState.value?.id === item.i
  const isResized = resizeState.value?.id === item.i
  let x = item.x, y = item.y, w = item.w, h = item.h
  if (isDragged) {
    x = dragState.value.x; y = dragState.value.y
  } else if (isResized) {
    x = resizeState.value.x; y = resizeState.value.y
    w = resizeState.value.w; h = resizeState.value.h
  } else if (bumpedLayout.value) {
    const bumped = bumpedLayout.value.find(i => i.i === item.i)
    if (bumped) { x = bumped.x; y = bumped.y }
  }
  const active = isDragged || isResized
  return {
    position: 'absolute',
    left: `${x * cw()}px`,
    top:  `${y * ROW_HEIGHT}px`,
    width: `${w * cw()}px`,
    height:`${h * ROW_HEIGHT}px`,
    zIndex: isDragged ? 100 : 1,
    transition: active ? 'none' : 'left 0.12s ease, top 0.12s ease',
  }
}

function getDefaultGridLayout() {
  return [
    { i: 'inventoryManager',  x: 0,  y: 0,   w: 6,  h: 28 },
    { i: 'labJournal',        x: 6,  y: 0,   w: 6,  h: 28 },
    { i: 'reactionPlan',      x: 0,  y: 28,  w: 6,  h: 24 },
    { i: 'matrixPlanner',     x: 6,  y: 28,  w: 6,  h: 24 },
    { i: 'standardStock',     x: 0,  y: 52,  w: 4,  h: 20 },
    { i: 'sequenceCalc',      x: 4,  y: 52,  w: 4,  h: 20 },
    { i: 'screeningPlanner',  x: 8,  y: 52,  w: 4,  h: 20 },
    { i: 'phasePredictor',    x: 0,  y: 72,  w: 12, h: 40 },
    { i: 'lidaKinetics',      x: 0,  y: 112, w: 12, h: 36 },
    { i: 'wellPlateEditor',   x: 0,  y: 148, w: 12, h: 28 },
    { i: 'timeTracker',       x: 0,  y: 176, w: 6,  h: 24 },
    { i: 'archiveManager',    x: 6,  y: 176, w: 6,  h: 24 },
    { i: 'globalSettings',    x: 0,  y: 200, w: 12, h: 20 },
  ]
}

const GL_KEY    = computed(() => store.user?.id ? `gl3_${store.user.id}`   : null)
const GL_KEY_V2 = computed(() => store.user?.id ? `gl2_${store.user.id}`   : null)
const LMETA_KEY = computed(() => store.user?.id ? `lmeta_${store.user.id}` : null)
const DV_KEY    = computed(() => store.user?.id ? `dv_${store.user.id}`    : null)

// Navigate the desktop view router (dock + dashboard-card affordances call this).
function goView(v) {
  desktopView.value = v
  if (DV_KEY.value) localStorage.setItem(DV_KEY.value, v)
  window.scrollTo({ top: 0 })
  // Plotly modules only resize on window resize — nudge one after the switch.
  nextTick(() => setTimeout(() => window.dispatchEvent(new Event('resize')), 60))
}
// Hiding alpha while viewing one → return to the dashboard.
watch(() => store.uiSettings.showAlpha, (on) => {
  if (!on && MODULE_META[desktopView.value]?.alpha) goView('dashboard')
})

function loadGridLayout() {
  if (!GL_KEY.value) return
  const raw = localStorage.getItem(GL_KEY.value)
  try { if (raw) { gridLayout.value = JSON.parse(raw); return } } catch {}
  // Migrate from gl2_ (60px rows → 30px rows): multiply all y and h × 2
  const rawV2 = GL_KEY_V2.value && localStorage.getItem(GL_KEY_V2.value)
  if (rawV2) {
    try {
      const old = JSON.parse(rawV2)
      gridLayout.value = old.map(i => ({ ...i, y: i.y * 2, h: i.h * 2 }))
      saveGridLayout()
      return
    } catch {}
  }
  gridLayout.value = getDefaultGridLayout().filter(i => !isModuleHiddenForUser(i.i))
}
function saveGridLayout() {
  if (GL_KEY.value) localStorage.setItem(GL_KEY.value, JSON.stringify(gridLayout.value))
}

// Layout meta stores sidebar-hidden flags + sidebar position
const layoutMeta = ref({ sidebarHidden: {}, sidebarPosition: 'left' })
function loadLayoutMeta() {
  if (!LMETA_KEY.value) return
  const raw = localStorage.getItem(LMETA_KEY.value)
  if (raw) { try { layoutMeta.value = { ...layoutMeta.value, ...JSON.parse(raw) } } catch {} }
  else {
    // Migrate from old layout key
    const oldKey = store.user?.id ? `layout_${store.user.id}` : null
    if (oldKey) { const or = localStorage.getItem(oldKey); if (or) try {
      const old = JSON.parse(or)
      if (old.sidebarHidden)   layoutMeta.value.sidebarHidden   = old.sidebarHidden
      if (old.sidebarPosition) layoutMeta.value.sidebarPosition = old.sidebarPosition
    } catch {} }
  }
}
function saveLayoutMeta() {
  if (LMETA_KEY.value) localStorage.setItem(LMETA_KEY.value, JSON.stringify(layoutMeta.value))
}

function isInGrid(id)  { return gridLayout.value.some(item => item.i === id) }

function toggleModule(id) {
  if (isInGrid(id)) {
    const item = gridLayout.value.find(i => i.i === id)
    if (item) savedPositions.value[id] = { x: item.x, y: item.y, w: item.w, h: item.h }
    gridLayout.value = gridLayout.value.filter(i => i.i !== id)
  } else {
    const def = getDefaultGridLayout().find(i => i.i === id) || { x: 0, y: 0, w: 6, h: 20 }
    const w   = savedPositions.value[id]?.w ?? def.w
    const h   = savedPositions.value[id]?.h ?? def.h
    // Always re-add at the very top of the page (y=0, full width)
    gridLayout.value = [...gridLayout.value, { i: id, x: 0, y: 0, w, h }]
  }
  saveGridLayout()
}

function resetLayout() {
  gridLayout.value = getDefaultGridLayout().filter(i => !isModuleHiddenForUser(i.i))
  savedPositions.value = {}
  sidebarGroups.value = []
  saveSidebarGroups()
  saveGridLayout()
}

// ── Gravity: each module floats up to fill vertical gaps above it ──
function applyGravity(layout) {
  const result = layout.map(i => ({...i}))
  let changed = true; let iter = 0
  while (changed && iter++ < 100) {
    changed = false
    for (const item of result) {
      // highest bottom-edge of any module that shares x-space and sits above this one
      const ceiling = result
        .filter(o => o.i !== item.i && o.x < item.x + item.w && o.x + o.w > item.x && o.y + o.h <= item.y)
        .reduce((max, o) => Math.max(max, o.y + o.h), 0)
      if (item.y > ceiling) { item.y = ceiling; changed = true }
    }
  }
  return result
}

// ── Collision detection & resolution ──
function overlaps(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x &&
         a.y < b.y + b.h && a.y + a.h > b.y
}

// Push all non-moved modules downward to resolve overlaps with the moved module
// and with each other. The moved module is absolute authority.
function resolveCollisions(layout, movedId) {
  const result = layout.map(i => ({...i}))
  let changed = true
  for (let iter = 0; iter < 50 && changed; iter++) {
    changed = false
    for (const b of result) {
      if (b.i === movedId) continue
      for (const a of result) {
        if (a.i === b.i) continue
        if (!overlaps(a, b)) continue
        // a has priority over b when a is the dragged module or sits higher (lower y)
        if (a.i === movedId || a.y <= b.y) {
          const newY = a.y + a.h
          if (b.y < newY) { b.y = newY; changed = true }
        }
      }
    }
  }
  return result
}

// ── Drag to move ──
function startDrag(id, e) {
  e.preventDefault()
  const item = gridLayout.value.find(i => i.i === id)
  if (!item) return
  const smx = e.clientX, smy = e.clientY, sx = item.x, sy = item.y, scw = cw()
  dragState.value = { id, x: sx, y: sy }
  const onMove = (me) => {
    const nx = Math.max(0, Math.min(COL_COUNT - item.w, Math.round(sx + (me.clientX - smx) / scw)))
    const ny = Math.max(0, Math.round(sy + (me.clientY - smy) / ROW_HEIGHT))
    dragState.value = { id, x: nx, y: ny }
    const preview = gridLayout.value.map(i => i.i === id ? {...i, x: nx, y: ny} : {...i})
    bumpedLayout.value = resolveCollisions(preview, id)
  }
  const onUp = () => {
    if (!dragState.value) return
    const { x, y } = dragState.value; dragState.value = null
    const base = bumpedLayout.value ?? gridLayout.value.map(i => i.i === id ? {...i, x, y} : {...i})
    bumpedLayout.value = null
    gridLayout.value = applyGravity(base)
    saveGridLayout()
    window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp)
  }
  window.addEventListener('mousemove', onMove); window.addEventListener('mouseup', onUp)
}

// ── Resize from any edge or corner ──
// edge: 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw'
function startGridResize(id, edge, e) {
  e.preventDefault(); e.stopPropagation()
  const item = gridLayout.value.find(i => i.i === id)
  if (!item) return
  const smx = e.clientX, smy = e.clientY
  const sx = item.x, sy = item.y, sw = item.w, sh = item.h
  const scw = cw()
  resizeState.value = { id, x: sx, y: sy, w: sw, h: sh }
  const onMove = (me) => {
    const dx = Math.round((me.clientX - smx) / scw)
    const dy = Math.round((me.clientY - smy) / ROW_HEIGHT)
    let nx = sx, ny = sy, nw = sw, nh = sh
    if (edge.includes('e')) nw = Math.max(2, Math.min(COL_COUNT - sx, sw + dx))
    if (edge.includes('w')) {
      const cdx = Math.max(-sx, Math.min(sw - 2, dx))
      nx = sx + cdx; nw = sw - cdx
    }
    if (edge.includes('s')) nh = Math.max(8, sh + dy)
    if (edge.includes('n')) {
      const cdy = Math.max(-sy, Math.min(sh - 8, dy))
      ny = sy + cdy; nh = sh - cdy
    }
    resizeState.value = { id, x: nx, y: ny, w: nw, h: nh }
    const preview = gridLayout.value.map(i => i.i === id ? {...i, x: nx, y: ny, w: nw, h: nh} : {...i})
    bumpedLayout.value = resolveCollisions(preview, id)
  }
  const onUp = () => {
    if (!resizeState.value) return
    const { x, y, w, h } = resizeState.value; resizeState.value = null
    const base = bumpedLayout.value ?? gridLayout.value.map(i => i.i === id ? {...i, x, y, w, h} : {...i})
    bumpedLayout.value = null
    gridLayout.value = applyGravity(base)
    saveGridLayout()
    window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp)
  }
  window.addEventListener('mousemove', onMove); window.addEventListener('mouseup', onUp)
}

// Per-user module visibility overrides — listed users never see these modules
// (TimeTracker is not relevant for the lab head).
const PER_USER_HIDDEN = {
  timeTracker: ['job.boekhoven@tum.de'],
}
function isModuleHiddenForUser(id) {
  const list = PER_USER_HIDDEN[id]
  if (!list) return false
  return list.includes(store.user?.email)
}
const visibleTimeTracker = computed(() => !isModuleHiddenForUser('timeTracker'))

// All module ids visible in the sidebar (all MODULE_META keys, minus sidebarHidden + per-user hidden)
// Alpha-stage modules are hidden unless the user opts in (Settings → Show alpha).
function isAlphaHidden(id) { return MODULE_META[id].alpha && !store.uiSettings.showAlpha }
const allModuleIds = computed(() =>
  Object.keys(MODULE_META).filter(id =>
    !layoutMeta.value.sidebarHidden?.[id] && !isModuleHiddenForUser(id) && !isAlphaHidden(id))
)

// Dock grouping: administrative → lab work → alpha (experimental).
const DOCK_GROUPS = [
  ['globalSettings', 'timeTracker', 'archiveManager'],
  ['labJournal', 'inventoryManager', 'instrumentBooking', 'reactionPlan', 'standardStock', 'sequenceCalc',
   'matrixPlanner', 'screeningPlanner', 'phasePredictor', 'wellPlateEditor'],
  ['dataFigures', 'lidaKinetics'],
]
// Ordered, visible groups; any module not explicitly grouped falls into Lab.
const dockGroups = computed(() => {
  const visible = new Set(allModuleIds.value)
  const listed = new Set(DOCK_GROUPS.flat())
  const groups = DOCK_GROUPS.map(ids => ids.filter(id => visible.has(id)))
  const leftovers = allModuleIds.value.filter(id => !listed.has(id))
  if (leftovers.length) groups[1] = [...groups[1], ...leftovers]
  return groups.filter(g => g.length)
})

// ── Mobile mode — one module at a time with a bottom tab bar ───────────────
// The desktop grid (mouse drag/resize, hover sidebar) is unusable on touch,
// so small screens get a dedicated single-module layout instead.
const isMobile = ref(false)
const activeMobileId = ref(null)
const MOB_KEY = computed(() => store.user?.id ? `mob_${store.user.id}` : null)

const currentMobileId = computed(() => {
  if (activeMobileId.value && allModuleIds.value.includes(activeMobileId.value)) return activeMobileId.value
  return allModuleIds.value[0] ?? null
})

function setMobileModule(id, e) {
  activeMobileId.value = id
  if (MOB_KEY.value) localStorage.setItem(MOB_KEY.value, id)
  window.scrollTo({ top: 0 })
  // Center the tapped tab in the scrollable bottom bar
  e?.currentTarget?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' })
}

// Compact identity for the mobile top bar — just the mailbox name
const mobileEmailLabel = computed(() => (store.user?.email || '').split('@')[0])

// ── iPhone home hub — hub → module → back (replaces the 14-tab bottom bar) ──
// activeMobileId null (or unknown) means we're on the hub; a valid id means that
// module is open full-screen with a back button.
const onHub = computed(() => !activeMobileId.value || !allModuleIds.value.includes(activeMobileId.value))
function openMobileModule(id) {
  activeMobileId.value = id
  if (MOB_KEY.value) localStorage.setItem(MOB_KEY.value, id)
  nextTick(() => { window.scrollTo({ top: 0 }); setTimeout(() => window.dispatchEvent(new Event('resize')), 60) })
}
function backToHub() {
  activeMobileId.value = null
  if (MOB_KEY.value) localStorage.removeItem(MOB_KEY.value)
  window.scrollTo({ top: 0 })
}
const greeting = computed(() => {
  const h = new Date().getHours()
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'
})

// Pinned modules (2-column hub grid), user-editable, persisted per user.
const mobilePinnedKey = computed(() => store.user?.id ? `mobpin_${store.user.id}` : null)
const mobilePinned = ref(['labJournal', 'inventoryManager', 'timeTracker', 'dataFigures'])
function loadMobilePinned() {
  if (!mobilePinnedKey.value) return
  const raw = localStorage.getItem(mobilePinnedKey.value)
  if (raw) { try { mobilePinned.value = JSON.parse(raw) } catch {} }
}
function saveMobilePinned() {
  if (mobilePinnedKey.value) localStorage.setItem(mobilePinnedKey.value, JSON.stringify(mobilePinned.value))
}
function togglePin(id) {
  const i = mobilePinned.value.indexOf(id)
  if (i >= 0) mobilePinned.value.splice(i, 1)
  else mobilePinned.value.push(id)
  saveMobilePinned()
}
const pinnedModules = computed(() => mobilePinned.value.filter(id => allModuleIds.value.includes(id)))

// Plotly charts (Phase Map, LIDA Kinetics, Data & Figures) only resize on
// window resize events. KeepAlive re-attaches them at a stale size when
// switching tabs, so nudge them after the new module is in the DOM.
watch(currentMobileId, () => {
  if (!isMobile.value) return
  nextTick(() => setTimeout(() => window.dispatchEvent(new Event('resize')), 60))
})

// Modules removed from sidebar (can be re-added via redock panel)
const removedModuleIds = computed(() =>
  Object.keys(layoutMeta.value.sidebarHidden || {}).filter(id => layoutMeta.value.sidebarHidden[id])
)

// Sidebar position and dock utilities
const POSITION_CYCLE = ['left', 'bottom', 'right']
const sidebarPosition = computed(() => layoutMeta.value.sidebarPosition || 'left')
const positionIconMap  = { left: 'fa-align-left', bottom: 'fa-align-center', right: 'fa-align-right' }
const positionIcon     = computed(() => positionIconMap[sidebarPosition.value])
function cyclePosition() {
  const cur = layoutMeta.value.sidebarPosition || 'left'
  layoutMeta.value.sidebarPosition = POSITION_CYCLE[(POSITION_CYCLE.indexOf(cur) + 1) % 3]
  saveLayoutMeta()
  // The dock's reserved space changes with position, so the grid's measured
  // width is briefly stale — nudge a resize once the new padding is applied.
  nextTick(() => window.dispatchEvent(new Event('resize')))
}

// Sidebar remove / redock
const showRedockPanel = ref(false)
function removeFromSidebar(id) {
  layoutMeta.value.sidebarHidden = { ...layoutMeta.value.sidebarHidden, [id]: true }
  removeModuleFromGroups(id)
  saveLayoutMeta()
}
function redockModule(id) {
  const h = { ...layoutMeta.value.sidebarHidden }
  delete h[id]
  layoutMeta.value.sidebarHidden = h
  if (!Object.values(h).some(Boolean)) showRedockPanel.value = false
  saveLayoutMeta()
}

let draftSaveTimeout
watch(
  [() => store.reactions, () => store.matrices, () => store.reverseMatrices, () => store.wellPlates],
  () => { clearTimeout(draftSaveTimeout); draftSaveTimeout = setTimeout(() => store.saveLocalDrafts(), 800) },
  { deep: true }
)

// Persist globalSettings (mmReactions, decimals) whenever they change.
// These are mutated directly via v-model in GlobalSettings.vue with no explicit save call.
let _settingsSaveTimeout
watch(
  () => store.globalSettings,
  () => { clearTimeout(_settingsSaveTimeout); _settingsSaveTimeout = setTimeout(() => store.saveUserPreferences(), 400) },
  { deep: true }
)

// ══════════════════════════════════════════════════════════════════════════
// SIDEBAR GROUPS — purely cosmetic grouping of sidebar icons
// ══════════════════════════════════════════════════════════════════════════

const SB_GROUP_ICONS = [
  'fa-flask', 'fa-vial', 'fa-microscope', 'fa-dna', 'fa-atom',
  'fa-fire', 'fa-bolt', 'fa-snowflake', 'fa-temperature-high', 'fa-eye-dropper',
  'fa-magnet', 'fa-chart-line', 'fa-calculator', 'fa-boxes-stacked', 'fa-clock',
  'fa-brain', 'fa-star', 'fa-book', 'fa-layer-group', 'fa-wave-square',
]

// sidebarGroups: Array<{ id, name, icon, moduleIds[] }>
const sidebarGroups = ref([])

// Which groups are expanded (showing their member icons inline)
const expandedGroups = ref(new Set())

function sbGroupsKey() {
  return store.user?.id ? 'sbg_' + store.user.id : null
}

function loadSidebarGroups() {
  const key = sbGroupsKey()
  if (!key) return
  try {
    const raw = localStorage.getItem(key)
    if (raw) sidebarGroups.value = JSON.parse(raw)
  } catch { sidebarGroups.value = [] }
}

function saveSidebarGroups() {
  const key = sbGroupsKey()
  if (!key) return
  localStorage.setItem(key, JSON.stringify(sidebarGroups.value))
}

function generateGroupId() {
  return 'g_' + Math.random().toString(36).slice(2, 9)
}

// Helper: find the group containing a moduleId
function findGroupForModule(moduleId) {
  return sidebarGroups.value.find(g => g.moduleIds.includes(moduleId)) || null
}

// Helper: remove a module from whatever group it is in (and disband if only 1 left)
function removeModuleFromGroups(moduleId) {
  sidebarGroups.value = sidebarGroups.value
    .map(g => ({ ...g, moduleIds: g.moduleIds.filter(m => m !== moduleId) }))
    .filter(g => g.moduleIds.length >= 2)  // disband single-member groups
  saveSidebarGroups()
}

function toggleGroupExpanded(groupId) {
  const s = new Set(expandedGroups.value)
  if (s.has(groupId)) s.delete(groupId)
  else s.add(groupId)
  expandedGroups.value = s
}

// Computed sidebar items: ordered mix of 'module' and 'group' items
const sidebarItems = computed(() => {
  const items = []
  const groupedModuleIds = new Set(sidebarGroups.value.flatMap(g => g.moduleIds))
  const emittedGroupIds = new Set()

  for (const id of allModuleIds.value) {
    if (groupedModuleIds.has(id)) {
      // Find which group owns this id
      const group = sidebarGroups.value.find(g => g.moduleIds.includes(id))
      if (group && !emittedGroupIds.has(group.id)) {
        emittedGroupIds.add(group.id)
        items.push({ type: 'group', group })
      }
      // Module itself is hidden from flat list (represented by the group button)
    } else {
      items.push({ type: 'module', id })
    }
  }
  return items
})

// ── Group editor modal ──
const groupEditor = ref(null)  // { group, anchorEl } | null
const groupEditorName = ref('')
const groupEditorIcon = ref('')

function openGroupEditor(group, event) {
  event?.stopPropagation()
  groupEditorName.value = group.name
  groupEditorIcon.value = group.icon
  groupEditor.value = { group: { ...group } }
}

function closeGroupEditor() {
  groupEditor.value = null
}

function saveGroupEditor() {
  if (!groupEditor.value) return
  const idx = sidebarGroups.value.findIndex(g => g.id === groupEditor.value.group.id)
  if (idx !== -1) {
    sidebarGroups.value[idx] = {
      ...sidebarGroups.value[idx],
      name: groupEditorName.value.trim() || 'Group',
      icon: groupEditorIcon.value,
    }
    saveSidebarGroups()
  }
  closeGroupEditor()
}

function disbandGroup(groupId) {
  sidebarGroups.value = sidebarGroups.value.filter(g => g.id !== groupId)
  expandedGroups.value.delete(groupId)
  saveSidebarGroups()
  closeGroupEditor()
}

function removeMemberFromGroup(groupId, moduleId) {
  const idx = sidebarGroups.value.findIndex(g => g.id === groupId)
  if (idx === -1) return
  const newIds = sidebarGroups.value[idx].moduleIds.filter(m => m !== moduleId)
  if (newIds.length < 2) {
    // Group would have 0 or 1 member — disband it
    disbandGroup(groupId)
  } else {
    sidebarGroups.value[idx] = { ...sidebarGroups.value[idx], moduleIds: newIds }
    saveSidebarGroups()
  }
}

// Close editor on Escape
function onKeydown(e) {
  if (e.key === 'Escape' && groupEditor.value) closeGroupEditor()
}
onMounted(() => document.addEventListener('keydown', onKeydown))
onUnmounted(() => document.removeEventListener('keydown', onKeydown))

// ── Sidebar drag-to-group ──
const sidebarDragging   = ref(null)   // { moduleId }
const sidebarDragOver   = ref(null)   // moduleId being hovered as drop target

function sbDragStart(moduleId, e) {
  e.stopPropagation()
  sidebarDragging.value = { moduleId }
  // Use a minimal drag image so it doesn't conflict with layout dragging
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', moduleId)
  }
}

function sbDragEnd(e) {
  e.stopPropagation()
  sidebarDragging.value = null
  sidebarDragOver.value = null
}

function sbDragOver(targetId, e) {
  e.stopPropagation()
  e.preventDefault()
  if (!sidebarDragging.value) return
  const srcId = sidebarDragging.value.moduleId
  if (srcId === targetId) return
  sidebarDragOver.value = targetId
}

function sbDrop(targetId, e) {
  e.stopPropagation()
  e.preventDefault()
  if (!sidebarDragging.value) return
  const srcId = sidebarDragging.value.moduleId
  sidebarDragging.value = null
  sidebarDragOver.value = null
  if (srcId === targetId) return

  const srcGroup = findGroupForModule(srcId)
  const tgtGroup = findGroupForModule(targetId)

  if (srcGroup && tgtGroup && srcGroup.id === tgtGroup.id) return // same group, no-op

  if (!srcGroup && !tgtGroup) {
    // Neither is in a group — create a new group with both
    const newGroup = {
      id: generateGroupId(),
      name: 'Group',
      icon: 'fa-layer-group',
      moduleIds: [srcId, targetId],
    }
    sidebarGroups.value.push(newGroup)
    saveSidebarGroups()
    // Open editor so the user can name it
    nextTick(() => openGroupEditor(newGroup, null))
  } else if (tgtGroup && !srcGroup) {
    // Target is in a group: add source to that group
    const idx = sidebarGroups.value.findIndex(g => g.id === tgtGroup.id)
    if (idx !== -1 && !sidebarGroups.value[idx].moduleIds.includes(srcId)) {
      sidebarGroups.value[idx].moduleIds.push(srcId)
      saveSidebarGroups()
    }
  } else if (srcGroup && !tgtGroup) {
    // Source is in a group; move it out and create new group with target
    removeModuleFromGroups(srcId)
    const newGroup = {
      id: generateGroupId(),
      name: 'Group',
      icon: 'fa-layer-group',
      moduleIds: [srcId, targetId],
    }
    sidebarGroups.value.push(newGroup)
    saveSidebarGroups()
    nextTick(() => openGroupEditor(newGroup, null))
  } else if (srcGroup && tgtGroup) {
    // Both are in different groups: move src to target's group
    const srcIdx = sidebarGroups.value.findIndex(g => g.id === srcGroup.id)
    if (srcIdx !== -1) {
      sidebarGroups.value[srcIdx].moduleIds = sidebarGroups.value[srcIdx].moduleIds.filter(m => m !== srcId)
      if (sidebarGroups.value[srcIdx].moduleIds.length < 2) {
        // Disband source group
        sidebarGroups.value.splice(srcIdx, 1)
      }
    }
    const tgtIdx = sidebarGroups.value.findIndex(g => g.id === tgtGroup.id)
    if (tgtIdx !== -1 && !sidebarGroups.value[tgtIdx].moduleIds.includes(srcId)) {
      sidebarGroups.value[tgtIdx].moduleIds.push(srcId)
    }
    saveSidebarGroups()
  }
}

// Drop a module onto an existing group button (adds module to that group)
function sbDropOnGroup(groupId, e) {
  e.stopPropagation()
  e.preventDefault()
  if (!sidebarDragging.value) return
  const srcId = sidebarDragging.value.moduleId
  sidebarDragging.value = null
  sidebarDragOver.value = null

  const idx = sidebarGroups.value.findIndex(g => g.id === groupId)
  if (idx === -1) return
  if (sidebarGroups.value[idx].moduleIds.includes(srcId)) return  // already a member

  // Remove from any other group (may disband that group if it shrinks to 1)
  removeModuleFromGroups(srcId)

  // Re-find after potential splice in removeModuleFromGroups
  const idx2 = sidebarGroups.value.findIndex(g => g.id === groupId)
  if (idx2 !== -1 && !sidebarGroups.value[idx2].moduleIds.includes(srcId)) {
    sidebarGroups.value[idx2].moduleIds.push(srcId)
    saveSidebarGroups()
  }
}

// Drag a module OUT of an expanded group onto the sidebar background
function sbGroupMemberDragOver(e) {
  e.stopPropagation()
  e.preventDefault()
  sidebarDragOver.value = null
}

function sbSidebarBackgroundDrop(e) {
  e.stopPropagation()
  e.preventDefault()
  if (!sidebarDragging.value) return
  const srcId = sidebarDragging.value.moduleId
  sidebarDragging.value = null
  sidebarDragOver.value = null
  // If dragging from a group, remove from group (makes it standalone)
  const srcGroup = findGroupForModule(srcId)
  if (srcGroup) removeModuleFromGroups(srcId)
}

async function initSession(user) {
  store.user = user
  await store.loadCloudSettings()
  store.loadCloudInventory()
  store.syncProfile()      // add/refresh this user in the lab directory
  store.loadProfiles()     // load the directory for sharing pickers
  loadLayoutMeta()
  loadGridLayout()
  loadSidebarGroups()
  loadMobilePinned()
  if (DV_KEY.value) { const v = localStorage.getItem(DV_KEY.value); if (v === 'dashboard' || (MODULE_META[v] && !isAlphaHidden(v))) desktopView.value = v }
  if (MOB_KEY.value) activeMobileId.value = localStorage.getItem(MOB_KEY.value)
  // Arriving via a scanned label QR: bring the inventory module into view;
  // InventoryManager resolves the code once the cloud inventory has loaded.
  if (store.pendingQrCode) {
    if (isMobile.value) activeMobileId.value = 'inventoryManager'
    else if (!isInGrid('inventoryManager')) toggleModule('inventoryManager')
  }
}

onMounted(() => {
  // Deep link from a scanned label QR (?qr=CODE). Stash the code and strip the
  // parameter so a later reload doesn't re-trigger the lookup.
  const qrParam = new URLSearchParams(window.location.search).get('qr')
  if (qrParam) {
    store.pendingQrCode = qrParam
    history.replaceState(null, '', window.location.pathname + window.location.hash)
  }
  db.auth.getSession().then(({ data }) => {
    if (data.session) initSession(data.session.user)
  })
  db.auth.onAuthStateChange((event, session) => {
    if (session?.user) initSession(session.user)
    else store.user = null
  })
  // Keep containerWidth in sync so column widths are always accurate
  const onResize = () => { containerWidth.value = (gridContainer.value?.offsetWidth || window.innerWidth) - 4 }
  onResize()
  window.addEventListener('resize', onResize)
  onUnmounted(() => window.removeEventListener('resize', onResize))
  // Mobile breakpoint — must match the @media queries in style.css.
  // The second clause keeps phones in mobile mode when rotated to landscape
  // (iPhone landscape is 844–932px wide) without capturing desktops/iPads.
  const mq = window.matchMedia('(max-width: 820px), ((hover: none) and (pointer: coarse) and (max-width: 950px))')
  const updateMq = () => { isMobile.value = mq.matches }
  updateMq()
  mq.addEventListener('change', updateMq)
  onUnmounted(() => mq.removeEventListener('change', updateMq))
})

const signOut = async () => { await db.auth.signOut(); window.location.reload() }

// ── ⌘K command palette — jump to any module ────────────────────────────────
const paletteOpen  = ref(false)
const paletteQuery = ref('')
const paletteInput = ref(null)
const paletteResults = computed(() => {
  const q = paletteQuery.value.trim().toLowerCase()
  const list = allModuleIds.value.map(id => ({ id, ...MODULE_META[id] }))
  return q ? list.filter(m => m.label.toLowerCase().includes(q)) : list
})
function openPalette() {
  paletteOpen.value = true
  paletteQuery.value = ''
  nextTick(() => paletteInput.value?.focus())
}
function closePalette() { paletteOpen.value = false }
function paletteGo(id) {
  closePalette()
  if (isMobile.value) { openMobileModule(id); return }
  if (!isInGrid(id)) toggleModule(id)
  nextTick(() => document.querySelector(`[data-grid-id="${id}"]`)
    ?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
}
function paletteEnter() { const f = paletteResults.value[0]; if (f) paletteGo(f.id) }
function onPaletteKey(e) {
  if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) {
    e.preventDefault(); paletteOpen.value ? closePalette() : openPalette()
  } else if (e.key === 'Escape' && paletteOpen.value) closePalette()
}
onMounted(() => document.addEventListener('keydown', onPaletteKey))
onUnmounted(() => document.removeEventListener('keydown', onPaletteKey))

// ── Avatar (initials + menu) — replaces the raw e-mail in the toolbar ───────
const avatarMenuOpen = ref(false)
const userInitials = computed(() => {
  const local = (store.user?.email || '').split('@')[0] || ''
  const parts = local.split(/[.\-_]+/).filter(Boolean)
  const s = parts.length >= 2 ? parts[0][0] + parts[1][0] : local.slice(0, 2)
  return (s || '?').toUpperCase()
})
onMounted(() => document.addEventListener('click', () => { avatarMenuOpen.value = false }))

// ── Header-band drag (replaces the visible grip strip) ─────────────────────
// The module's own header doubles as the drag surface; the body and any
// interactive control never start a drag.
function startHeaderDrag(id, e) {
  if (e.button !== 0) return
  if (e.target.closest('button, a, input, select, textarea, label, [contenteditable], .no-drag')) return
  const rect = e.currentTarget.getBoundingClientRect()
  if (e.clientY - rect.top > 56) return  // only the top header band initiates a drag
  startDrag(id, e)
}

// Close redock panel on any click outside the panel or its toggle button
const _closeRedock = () => { showRedockPanel.value = false }
onMounted(() => document.addEventListener('click', _closeRedock))
onUnmounted(() => document.removeEventListener('click', _closeRedock))

// Close group editor on outside click
const groupEditorRef = ref(null)
function onDocClick(e) {
  if (groupEditor.value && groupEditorRef.value && !groupEditorRef.value.contains(e.target)) {
    saveGroupEditor()
  }
}
onMounted(() => document.addEventListener('mousedown', onDocClick))
onUnmounted(() => document.removeEventListener('mousedown', onDocClick))
</script>

<template>
  <div id="body-wrapper" :class="{ 'dark-mode': store.isDarkMode, 'mobile-ui': isMobile }">

    <AuthLogin v-if="!store.user" />

    <template v-else>

      <!-- Auto-hide sidebar dock (desktop only — hover-based, unusable on touch) -->
      <nav v-if="!isMobile" class="module-sidebar" :class="`pos-${sidebarPosition}`"
        @dragover.prevent="sbGroupMemberDragOver"
        @drop.prevent="sbSidebarBackgroundDrop"
      >
        <div class="sidebar-modules">
          <!-- Dashboard (home) -->
          <button class="sidebar-btn" :class="{ 'is-active': desktopView === 'dashboard' }"
                  title="Dashboard" @click="goView('dashboard')">
            <div class="sidebar-icon"><span class="sidebar-svg" v-html="DASHBOARD_ICON"></span></div>
          </button>

          <!-- Modules grouped: administrative → lab → alpha, divider between groups -->
          <template v-for="(group, gi) in dockGroups" :key="gi">
            <span class="sidebar-divider"></span>
            <button v-for="id in group" :key="id" class="sidebar-btn"
                    :class="{ 'is-active': desktopView === id }"
                    :title="MODULE_META[id].label" @click="goView(id)">
              <span v-if="MODULE_META[id].alpha" class="alpha-badge" title="Alpha version">α</span>
              <div class="sidebar-icon"><span class="sidebar-svg" v-html="MODULE_ICONS[id]"></span></div>
            </button>
          </template>
        </div>

        <div class="sidebar-footer">
          <button v-if="removedModuleIds.length" class="sidebar-btn" title="Add hidden modules back"
            @click.stop="showRedockPanel = !showRedockPanel">
            <div class="sidebar-icon sidebar-icon-util"><i class="fas fa-plus"></i></div>
          </button>
          <button class="sidebar-btn" :title="`Dock position: ${sidebarPosition}`" @click="cyclePosition">
            <div class="sidebar-icon sidebar-icon-util"><i class="fas" :class="positionIcon"></i></div>
          </button>
          <button class="sidebar-btn" title="Reset layout" @click="resetLayout">
            <div class="sidebar-icon sidebar-icon-util"><i class="fas fa-rotate-left"></i></div>
          </button>
        </div>
      </nav>

      <!-- Redock picker — rendered at body level so it escapes the sidebar's overflow clip -->
      <Teleport to="body">
        <div v-show="showRedockPanel" class="redock-panel"
          :class="[`panel-${sidebarPosition}`, { 'dark-mode': store.isDarkMode }]"
          @click.stop>
          <p class="redock-title">Hidden modules</p>
          <div class="redock-grid">
            <button v-for="id in removedModuleIds" :key="id" class="redock-item"
              :title="MODULE_META[id].label" @click="redockModule(id)">
              <div class="sidebar-icon redock-icon">
                <span class="sidebar-svg" v-html="MODULE_ICONS[id]"></span>
              </div>
              <span class="redock-label">{{ MODULE_META[id].label }}</span>
            </button>
          </div>
        </div>

        <!-- Group editor floating panel -->
        <div
          v-if="groupEditor"
          ref="groupEditorRef"
          class="sg-editor"
          :class="[`sg-editor-${sidebarPosition}`, { 'dark-mode': store.isDarkMode }]"
          @click.stop
          @mousedown.stop
        >
          <p class="sg-editor-title">Edit Group</p>

          <label class="sg-editor-label">Name</label>
          <input
            class="sg-editor-input"
            v-model="groupEditorName"
            placeholder="Group name"
            maxlength="24"
            @keydown.enter.prevent="saveGroupEditor"
            @keydown.escape.prevent="closeGroupEditor"
          />

          <label class="sg-editor-label">Icon</label>
          <div class="sg-icon-picker">
            <button
              v-for="ic in SB_GROUP_ICONS"
              :key="ic"
              class="sg-icon-option"
              :class="{ 'sg-icon-selected': groupEditorIcon === ic }"
              :title="ic.replace('fa-','')"
              @click="groupEditorIcon = ic"
            >
              <i class="fas" :class="ic"></i>
            </button>
          </div>

          <label class="sg-editor-label">Members</label>
          <div class="sg-member-chips">
            <span
              v-for="mid in (sidebarGroups.find(g => g.id === groupEditor.group.id)?.moduleIds ?? [])"
              :key="mid"
              class="sg-member-chip"
              :title="MODULE_META[mid]?.label"
            >
              <i class="fas" :class="MODULE_META[mid]?.icon" style="font-size:0.7rem;"></i>
              {{ MODULE_META[mid]?.label ?? mid }}
              <button
                class="sg-chip-remove"
                @click="removeMemberFromGroup(groupEditor.group.id, mid)"
                title="Remove from group"
              >×</button>
            </span>
          </div>

          <div class="sg-editor-actions">
            <button class="sg-editor-save" @click="saveGroupEditor">Save</button>
            <button class="sg-editor-disband" @click="disbandGroup(groupEditor.group.id)">Disband</button>
          </div>
        </div>
      </Teleport>

      <!-- Main content -->
      <div class="app-main" :class="[{ 'mobile-main': isMobile }, !isMobile ? `dock-${sidebarPosition}` : '']">

        <div v-if="!isMobile" class="top-bar">
          <TopBarClock v-if="visibleTimeTracker" />

          <!-- ⌘K search (desktop) -->
          <button v-if="!isMobile" class="tb-search" @click="openPalette" title="Search modules (⌘K)">
            <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><circle cx="5" cy="5" r="3.6" fill="none" stroke="currentColor" stroke-width="1.4"/><line x1="7.7" y1="7.7" x2="10.6" y2="10.6" stroke="currentColor" stroke-width="1.4"/></svg>
            <span class="tb-search-text">Search modules, items, entries</span>
            <span class="tb-kbd">⌘K</span>
          </button>

          <div class="tb-right">
            <button class="tb-icon" @click="store.toggleDarkMode()" :title="store.isDarkMode ? 'Light mode' : 'Dark mode'">
              <i class="fas" :class="store.isDarkMode ? 'fa-sun' : 'fa-moon'"></i>
            </button>
            <div class="tb-avatar-wrap">
              <button class="tb-avatar" :title="store.user.email" @click.stop="avatarMenuOpen = !avatarMenuOpen">{{ userInitials }}</button>
              <div v-if="avatarMenuOpen" class="tb-avatar-menu" @click.stop>
                <div class="tb-avatar-email">{{ store.user.email }}</div>
                <button class="tb-avatar-logout" @click="signOut"><i class="fas fa-sign-out-alt"></i> Log out</button>
              </div>
            </div>
          </div>
        </div>

        <!-- Mobile: home hub → module → back -->
        <template v-if="isMobile">
          <!-- ── Home hub ── -->
          <div v-if="onHub" class="hub">
            <div class="hub-head">
              <div class="hub-greeting">
                <span class="hub-hi">{{ greeting }}</span>
                <span class="hub-lab">Boekhoven Lab</span>
              </div>
              <div class="hub-head-actions">
                <button class="hub-icon-btn" @click="store.toggleDarkMode()" :title="store.isDarkMode ? 'Light mode' : 'Dark mode'">
                  <i class="fas" :class="store.isDarkMode ? 'fa-sun' : 'fa-moon'"></i>
                </button>
                <div class="tb-avatar-wrap">
                  <button class="tb-avatar hub-avatar" :title="store.user.email" @click.stop="avatarMenuOpen = !avatarMenuOpen">{{ userInitials }}</button>
                  <div v-if="avatarMenuOpen" class="tb-avatar-menu" @click.stop>
                    <div class="tb-avatar-email">{{ store.user.email }}</div>
                    <button class="tb-avatar-logout" @click="signOut"><i class="fas fa-sign-out-alt"></i> Log out</button>
                  </div>
                </div>
              </div>
            </div>

            <div v-if="visibleTimeTracker" class="hub-timer"><TopBarClock /></div>

            <button class="tb-search hub-search" @click="openPalette">
              <svg width="13" height="13" viewBox="0 0 13 13" aria-hidden="true"><circle cx="5.5" cy="5.5" r="4" fill="none" stroke="currentColor" stroke-width="1.4"/><line x1="8.5" y1="8.5" x2="11.5" y2="11.5" stroke="currentColor" stroke-width="1.4"/></svg>
              <span class="tb-search-text">Search modules…</span>
            </button>

            <template v-if="pinnedModules.length">
              <div class="hub-label">Pinned</div>
              <div class="hub-pinned">
                <button v-for="id in pinnedModules" :key="id" class="hub-tile" @click="openMobileModule(id)">
                  <span class="hub-tile-ic"><span class="sidebar-svg" v-html="MODULE_ICONS[id]"></span></span>
                  <span class="hub-tile-label">{{ MODULE_META[id].label }}</span>
                  <span v-if="MODULE_META[id].alpha" class="hub-tile-alpha">α</span>
                  <span class="hub-pin is-pinned" @click.stop="togglePin(id)" title="Unpin">★</span>
                </button>
              </div>
            </template>

            <div class="hub-label">All modules</div>
            <div class="hub-grid">
              <button v-for="id in allModuleIds" :key="id" class="hub-cell" @click="openMobileModule(id)">
                <span v-if="MODULE_META[id].alpha" class="alpha-badge alpha-badge--hub" title="Alpha version">α</span>
                <span class="hub-cell-ic"><span class="sidebar-svg" v-html="MODULE_ICONS[id]"></span></span>
                <span class="hub-cell-label">{{ MODULE_META[id].label }}</span>
                <span class="hub-pin" :class="{ 'is-pinned': mobilePinned.includes(id) }" @click.stop="togglePin(id)" :title="mobilePinned.includes(id) ? 'Unpin' : 'Pin'">★</span>
              </button>
            </div>
          </div>

          <!-- ── Module full screen ── -->
          <div v-else class="mobile-module">
            <button class="mob-back" @click="backToHub">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><polyline points="9.5,3 5,8 9.5,13"/></svg>
              Home
            </button>
            <KeepAlive>
              <component :is="MODULE_META[activeMobileId].component" :key="activeMobileId" />
            </KeepAlive>
          </div>
        </template>

        <!-- Desktop: Dashboard overview or a single module page -->
        <template v-else>
        <DashboardOverview v-if="desktopView === 'dashboard'" @open="goView" />

        <!-- Single module full page -->
        <div v-else class="module-page">
          <div class="module-page-bar">
            <button class="mp-back" @click="goView('dashboard')">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><polyline points="9.5,3 5,8 9.5,13"/></svg>
              Dashboard
            </button>
            <span class="mp-title">{{ MODULE_META[desktopView]?.label }}</span>
          </div>
          <div class="module-page-body">
            <component :is="MODULE_META[desktopView].component" :key="desktopView" />
          </div>
        </div>
        </template>
      </div>


      <!-- ⌘K command palette -->
      <Teleport to="body">
        <div v-if="paletteOpen" class="cmdk-overlay" :class="{ 'dark-mode': store.isDarkMode }" @click="closePalette">
          <div class="cmdk" @click.stop>
            <div class="cmdk-search">
              <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><circle cx="6" cy="6" r="4.2" fill="none" stroke="currentColor" stroke-width="1.4"/><line x1="9.2" y1="9.2" x2="12.4" y2="12.4" stroke="currentColor" stroke-width="1.4"/></svg>
              <input ref="paletteInput" v-model="paletteQuery" placeholder="Jump to a module…"
                     @keydown.enter.prevent="paletteEnter" @keydown.esc.prevent="closePalette" />
              <span class="tb-kbd">esc</span>
            </div>
            <div class="cmdk-list">
              <button v-for="m in paletteResults" :key="m.id" class="cmdk-item" @click="paletteGo(m.id)">
                <span class="cmdk-ic"><span class="sidebar-svg" v-html="MODULE_ICONS[m.id]"></span></span>
                <span class="cmdk-label">{{ m.label }}</span>
                <span v-if="m.alpha" class="cmdk-alpha">α</span>
                <span v-if="isInGrid(m.id)" class="cmdk-open">open</span>
              </button>
              <div v-if="!paletteResults.length" class="cmdk-empty">No modules match “{{ paletteQuery }}”.</div>
            </div>
          </div>
        </div>
      </Teleport>

      <!-- Toast host -->
      <Teleport to="body">
        <div class="toast-host">
          <div v-for="t in store.toasts" :key="t.id" class="toast">{{ t.message }}</div>
        </div>
      </Teleport>

    </template>
  </div>
</template>

<style>
body { padding: 0 !important; margin: 0 !important; }

/* #app is the Vue mount point inside <body>. Must fill full viewport width. */
#app { width: 100%; }

#body-wrapper { display: flex; min-height: 100vh; min-height: 100dvh; width: 100%; }

/* ══ Sidebar dock — Liquid Glass, three positions ══ */
.module-sidebar {
  position: fixed;
  z-index: 500;
  background: var(--ch);
  backdrop-filter: blur(30px) saturate(140%);
  -webkit-backdrop-filter: blur(30px) saturate(140%);
  box-shadow: 0 10px 32px rgba(20,30,60,0.14);
  display: flex;
  gap: 0;
  transition: transform 0.24s cubic-bezier(0.4, 0, 0.2, 1);
  scrollbar-width: none;
}
.module-sidebar::-webkit-scrollbar { display: none; }

/* ── Left dock — a persistent floating glass dock (always visible) ── */
.module-sidebar.pos-left {
  left: 10px; top: 50%;
  transform: translateY(-50%);
  flex-direction: column;
  padding: 10px 7px;
  width: 56px;
  border-radius: var(--rd, 18px);
  border: 1px solid var(--chl);
  max-height: calc(100vh - 40px);
  overflow-y: auto; overflow-x: hidden;
}

/* ── Right dock ── */
.module-sidebar.pos-right {
  right: 10px; left: auto; top: 50%;
  transform: translateY(-50%);
  flex-direction: column;
  padding: 10px 7px;
  width: 56px;
  border-radius: var(--rd, 18px);
  border: 1px solid var(--chl);
  max-height: calc(100vh - 40px);
  overflow-y: auto; overflow-x: hidden;
}

/* ── Bottom dock ── */
.module-sidebar.pos-bottom {
  bottom: 10px; top: auto; left: 50%;
  transform: translateX(-50%);
  flex-direction: row;
  padding: 7px 10px;
  height: 56px;
  width: auto; max-width: calc(100vw - 40px);
  border-radius: var(--rd, 18px);
  border: 1px solid var(--chl);
  overflow-x: auto; overflow-y: hidden;
}

/* Reserve space so the always-visible dock never overlaps module content. */
.app-main.dock-left   { padding-left: 78px; }
.app-main.dock-right  { padding-right: 78px; }
.app-main.dock-bottom { padding-bottom: 84px; }


/* Sidebar sections */
.sidebar-modules {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 5px;
}
.pos-left .sidebar-modules, .pos-right .sidebar-modules { flex-direction: column; }
.pos-bottom .sidebar-modules { flex-direction: row; }

.sidebar-footer {
  display: flex;
  align-items: center;
  gap: 5px;
}
.pos-left  .sidebar-footer, .pos-right .sidebar-footer {
  flex-direction: column;
  border-top: 1px solid rgba(120,120,140,0.22);
  padding-top: 6px; margin-top: 4px;
}
.pos-bottom .sidebar-footer {
  flex-direction: row;
  border-left: 1px solid rgba(120,120,140,0.22);
  padding-left: 6px; margin-left: 4px;
}
.dark-mode .sidebar-footer { border-color: rgba(255,255,255,0.08) !important; }

/* ── Button ── */
.sidebar-btn {
  display: flex; align-items: center; justify-content: center;
  background: transparent; border: none; border-radius: 10px;
  cursor: pointer; position: relative; padding: 2px; flex-shrink: 0;
}
.sidebar-btn:focus-visible { outline: 2px solid var(--primary); outline-offset: 2px; }

/* Remove ×  (appears on hover over each icon) */
.sidebar-remove {
  position: absolute;
  top: -2px; right: -2px;
  width: 14px; height: 14px;
  border-radius: 50%;
  background: rgba(50,50,70,0.72);
  color: rgba(255,255,255,0.92);
  font-size: 0.52rem;
  display: flex; align-items: center; justify-content: center;
  opacity: 0; pointer-events: none;
  transition: opacity 0.15s;
  z-index: 10; cursor: pointer; line-height: 1;
}
.sidebar-btn:hover .sidebar-remove { opacity: 1; pointer-events: auto; }

/* ── Alpha-version badge — small yellow circle with α on dock tiles ── */
.alpha-badge {
  position: absolute;
  top: -3px; left: -3px;
  width: 15px; height: 15px;
  border-radius: 50%;
  background: linear-gradient(180deg, #ffd83d, #f0b90b);
  color: rgba(60, 42, 0, 0.92);
  font-size: 0.62rem;
  font-weight: 700;
  display: flex; align-items: center; justify-content: center;
  line-height: 1;
  box-shadow: 0 1px 4px rgba(0,0,0,0.28), inset 0 1px 0 rgba(255,255,255,0.45);
  z-index: 11;
  pointer-events: none;
}

/* ── Icon tile — translucent primary-color squircle ── */
/* Dock tile — transparent by default; the active (docked) module fills accent.
   (Per the redesign: active = solid accent + white icon, inactive = muted.) */
.sidebar-icon {
  width: 38px; height: 38px;
  border-radius: 12px;
  display: flex; align-items: center; justify-content: center;
  position: relative; flex-shrink: 0;
  background: transparent;
  color: var(--tx2);
  transition: transform 0.15s ease, background 0.15s ease, color 0.15s ease;
}
.sidebar-icon i { font-size: 0.95rem; position: relative; z-index: 1; }
.sidebar-svg {
  display: inline-flex; align-items: center; justify-content: center;
  width: 20px; height: 20px; position: relative; z-index: 1;
}
.sidebar-svg svg { width: 100%; height: 100%; display: block; }

/* Active module (currently on the dashboard): solid accent + white icon */
.sidebar-btn.is-active .sidebar-icon {
  background: var(--acc); color: #fff;
  box-shadow: 0 3px 10px var(--acsh);
}
/* Inactive module: transparent, tertiary text */
.sidebar-btn.is-hidden .sidebar-icon { background: transparent; color: var(--tx3); }

/* Hover: gentle scale (0.15s transform only) */
.sidebar-btn:hover .sidebar-icon { transform: scale(1.12); }
.sidebar-btn.is-hidden:hover .sidebar-icon { color: var(--tx2); }

/* Utility icons (position toggle, reset, redock add) */
.sidebar-icon-util { background: transparent; color: var(--tx3); }
.sidebar-btn:hover .sidebar-icon-util { color: var(--tx2); transform: scale(1.10); }

/* ── Redock picker panel ── */
.redock-panel {
  position: fixed; z-index: 600;
  background: var(--cd);
  backdrop-filter: blur(48px) saturate(180%);
  -webkit-backdrop-filter: blur(48px) saturate(180%);
  border: 1px solid var(--cdl);
  border-radius: 16px;
  box-shadow: 0 12px 40px rgba(0,0,0,0.20), inset 0 1px 0 rgba(255,255,255,0.55);
  padding: 12px 14px 14px;
  min-width: 160px;
}
.redock-panel.dark-mode {
  background: var(--cd);
  border-color: rgba(255,255,255,0.10);
  box-shadow: 0 12px 40px rgba(0,0,0,0.60), inset 0 1px 0 rgba(255,255,255,0.06);
}
/* Positions relative to each dock edge */
.panel-left   { left: 64px;  bottom: 80px; }
.panel-right  { right: 64px; bottom: 80px; }
.panel-bottom { bottom: 64px; left: 50%; transform: translateX(-50%); }

.redock-title {
  font-size: 0.65rem; font-weight: 600;
  color: var(--text); opacity: 0.55;
  margin: 0 0 10px; text-transform: uppercase; letter-spacing: 0.06em;
}
.redock-grid { display: flex; flex-wrap: wrap; gap: 8px; max-width: 220px; }
.redock-item {
  display: flex; flex-direction: column; align-items: center; gap: 4px;
  background: transparent; border: none; cursor: pointer;
  border-radius: 10px; padding: 6px 4px;
  transition: background 0.15s;
}
.redock-item:hover { background: rgba(0,0,0,0.06); }
.redock-panel.dark-mode .redock-item:hover { background: rgba(255,255,255,0.06); }
.redock-icon { width: 34px !important; height: 34px !important; }
.redock-label {
  font-size: 0.58rem; color: var(--text); opacity: 0.72;
  white-space: nowrap; max-width: 52px;
  overflow: hidden; text-overflow: ellipsis; text-align: center;
}

/* ══ Main content ══ */
.app-main {
  flex: 1;
  min-width: 0;
  padding: 16px 20px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.top-bar {
  display: flex; align-items: center; gap: 12px;
}

/* ⌘K search field */
.tb-search {
  flex: 1; max-width: 380px; margin: 0 auto;
  display: flex; align-items: center; gap: 8px;
  padding: 7px 12px; border-radius: var(--rc);
  background: var(--fl); color: var(--tx3);
  font-size: 12px; font-weight: 500; border: none; box-shadow: none; cursor: pointer;
}
.tb-search:hover { filter: none; color: var(--tx2); }
.tb-search-text { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tb-kbd { margin-left: auto; font: 10px ui-monospace, Menlo, monospace; opacity: .75; padding: 1px 5px; border-radius: 5px; background: var(--ln2); }

.tb-right { margin-left: auto; display: flex; align-items: center; gap: 10px; }
.tb-icon {
  width: 32px; height: 32px; padding: 0; border-radius: var(--rc);
  background: var(--fl); color: var(--tx2); border: none; box-shadow: none;
  display: flex; align-items: center; justify-content: center; cursor: pointer; font-size: 0.9rem;
}
.tb-icon:hover { filter: none; color: var(--tx); background: var(--ln2); }

.tb-avatar-wrap { position: relative; }
.tb-avatar {
  width: 30px; height: 30px; border-radius: 50%; padding: 0;
  background: var(--acc); color: #fff; font-size: 11px; font-weight: 700;
  border: none; box-shadow: 0 1px 4px var(--acsh); cursor: pointer;
  display: flex; align-items: center; justify-content: center;
}
.tb-avatar:hover { filter: brightness(1.08); }
.tb-avatar-menu {
  position: absolute; right: 0; top: 40px; z-index: 600; min-width: 210px;
  background: var(--cd); backdrop-filter: blur(24px); -webkit-backdrop-filter: blur(24px);
  border: 1px solid var(--cdl); border-radius: var(--r); box-shadow: var(--sh); padding: 10px;
}
.tb-avatar-email { font-size: 12px; color: var(--tx2); padding: 2px 6px 9px; word-break: break-all; border-bottom: 1px solid var(--ln); margin-bottom: 7px; }
.tb-avatar-logout {
  width: 100%; justify-content: flex-start; gap: 8px;
  background: transparent; color: var(--danger-color); border: none; box-shadow: none;
  padding: 7px 6px; border-radius: var(--rc); font-size: 12px; font-weight: 600; cursor: pointer;
}
.tb-avatar-logout:hover { filter: none; background: var(--danger-bg); }

/* ── ⌘K command palette ── */
.cmdk-overlay {
  position: fixed; inset: 0; z-index: 900;
  background: rgba(20,30,60,.28); backdrop-filter: blur(2px);
  display: flex; align-items: flex-start; justify-content: center; padding-top: 14vh;
}
.cmdk-overlay.dark-mode { background: rgba(0,0,0,.5); }
.cmdk {
  width: min(560px, 92vw);
  background: var(--cd); backdrop-filter: blur(30px); -webkit-backdrop-filter: blur(30px);
  border: 1px solid var(--cdl); border-radius: var(--r); box-shadow: 0 24px 60px rgba(20,30,60,.28);
  overflow: hidden;
}
.cmdk-search { display: flex; align-items: center; gap: 9px; padding: 12px 14px; border-bottom: 1px solid var(--ln); color: var(--tx3); }
.cmdk-search input { flex: 1; border: none; background: transparent; box-shadow: none !important; color: var(--tx); font-size: 15px; padding: 0; }
.cmdk-search input:focus { box-shadow: none !important; }
.cmdk-list { max-height: 52vh; overflow-y: auto; padding: 6px; }
.cmdk-item {
  width: 100%; display: flex; align-items: center; gap: 10px;
  padding: 8px 10px; border-radius: var(--rc);
  background: transparent; color: var(--tx); border: none; box-shadow: none; cursor: pointer;
  font-size: 13px; font-weight: 500; text-align: left;
}
.cmdk-item:hover { filter: none; background: var(--acs); }
.cmdk-ic { width: 26px; height: 26px; border-radius: 7px; background: var(--acc); color: #fff; display: flex; align-items: center; justify-content: center; flex: none; box-shadow: 0 2px 5px var(--acsh); }
.cmdk-ic .sidebar-svg { width: 15px; height: 15px; }
.cmdk-ic i { font-size: 0.8rem; }
.cmdk-label { flex: 1; }
.cmdk-alpha { font-size: 10px; font-weight: 700; color: var(--wr); background: var(--wrs); border-radius: 8px; padding: 1px 6px; }
.cmdk-open { font-size: 10px; font-weight: 600; color: var(--acc); background: var(--acs); border-radius: 8px; padding: 2px 7px; }
.cmdk-empty { padding: 18px; text-align: center; color: var(--tx3); font-size: 13px; }

/* ══ Free-placement grid workspace ══ */
.grid-workspace {
  position: relative;
  width: 100%;
  max-width: 1280px;   /* dashboard grid, per design */
  margin: 0 auto;
}

/* ── Single module full page (dock navigation target) ── */
.module-page { max-width: 1120px; margin: 0 auto; width: 100%; }
.module-page-bar { display: flex; align-items: center; gap: 12px; margin-bottom: 14px; }
.mp-back {
  display: inline-flex; align-items: center; gap: 5px;
  height: 34px; padding: 0 13px 0 9px; border-radius: var(--rc);
  background: var(--btn2); border: 1px solid var(--ln2); color: var(--tx);
  font-size: 12px; font-weight: 600; box-shadow: none; cursor: pointer;
}
.mp-back:hover { filter: brightness(1.04); }
.mp-title { font-size: 17px; font-weight: 600; color: var(--tx); letter-spacing: -0.01em; }

/* Dock divider (Dashboard | modules) */
.sidebar-divider { display: block; align-self: stretch; height: 1px; background: var(--ln2); margin: 3px 6px; }
.pos-bottom .sidebar-divider { width: 1px; height: auto; margin: 6px 3px; }

.grid-module {
  position: absolute;
  box-sizing: border-box;
  overflow: hidden;
  border-radius: var(--radius);
  container-type: inline-size;
  display: flex;
  flex-direction: column;
}

.grid-module--active { z-index: 100; }

.grid-module-content {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
}

/* The module's own header doubles as the drag surface (grip strip removed). */
.grid-module .card > h2,
.grid-module .data-figures > h2 { cursor: grab; }
.grid-module--active .card > h2 { cursor: grabbing; }

/* ── 8-direction resize handles — invisible; cursor-only (per redesign) ── */
.rh {
  position: absolute;
  z-index: 3;
  opacity: 0;               /* never drawn — the cursor is the only affordance */
  user-select: none;
}

/* Edge strips (a touch wider so they're easy to grab without a visual cue) */
.rh-n { top: 0;    left: 12px; right: 12px; height: 7px; cursor: n-resize; }
.rh-s { bottom: 0; left: 12px; right: 12px; height: 7px; cursor: s-resize; }
.rh-e { right: 0;  top: 12px; bottom: 12px; width: 7px;  cursor: e-resize; }
.rh-w { left: 0;   top: 12px; bottom: 12px; width: 7px;  cursor: w-resize; }

/* Corner squares */
.rh-ne { top: 0;    right: 0;  width: 10px; height: 10px; cursor: ne-resize; }
.rh-nw { top: 0;    left: 0;   width: 10px; height: 10px; cursor: nw-resize; }
.rh-se { bottom: 0; right: 0;  width: 10px; height: 10px; cursor: se-resize; }
.rh-sw { bottom: 0; left: 0;   width: 10px; height: 10px; cursor: sw-resize; }

/* ── Responsive card headers at narrow widths ──
   Targets .flex-between pattern used in all module card headers.
   !important overrides inline display:flex;justify-content:space-between styles. */
@container (max-width: 520px) {
  .flex-between {
    flex-wrap: wrap !important;
    row-gap: 8px !important;
    align-items: flex-start !important;
  }
  /* Button rows inside the header also wrap */
  .flex-between > div {
    flex-wrap: wrap !important;
    row-gap: 6px !important;
  }
  /* Shrink h2 title slightly to give buttons more room */
  .card h2 { font-size: 1.05rem; }
}

.drag-handle {
  display: flex; align-items: center; justify-content: center;
  height: 14px;
  flex-shrink: 0;
  background: var(--panel-bg);
  border: 1px solid var(--border); border-bottom: none;
  border-radius: var(--radius) var(--radius) 0 0;
  cursor: grab; opacity: 0.35;
  transition: opacity 0.15s;
  font-size: 0.65rem; color: var(--text);
  z-index: 2;
  position: relative;
}
.drag-handle:hover  { opacity: 0.9; }
.drag-handle:active { cursor: grabbing; }

/* ══════════════════════════════════════════════════════════════════════
   SIDEBAR GROUPS
   ══════════════════════════════════════════════════════════════════════ */

/* Group wrapper — positions the expanded container relative to the group button */
.sg-group-wrapper {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  flex-shrink: 0;
}

/* Group icon button: same squircle style but with a coloured ring */
.sg-group-item .sidebar-icon.sg-group-icon {
  background: color-mix(in srgb, var(--primary) 38%, rgba(80, 120, 255, 0.18));
  border: 2px solid color-mix(in srgb, var(--primary) 70%, rgba(255,255,255,0.4));
  box-shadow:
    0 2px 8px rgba(0,0,0,0.18),
    0 0 0 1px color-mix(in srgb, var(--primary) 30%, transparent),
    inset 0 1px 0 rgba(255,255,255,0.26);
}

/* Count badge — top-right corner of group button */
.sg-badge {
  position: absolute;
  top: -3px; right: -3px;
  min-width: 16px; height: 16px;
  padding: 0 4px;
  border-radius: 8px;
  background: color-mix(in srgb, var(--primary) 90%, rgba(0,0,0,0.2));
  color: #fff;
  font-size: 0.58rem;
  font-weight: 700;
  line-height: 16px;
  text-align: center;
  box-shadow: 0 1px 4px rgba(0,0,0,0.28);
  z-index: 12;
  pointer-events: none;
}

/* Expanded inline module container */
.sg-expanded {
  display: flex;
  gap: 4px;
  padding: 5px 4px;
  border-radius: 12px;
  background: rgba(200, 200, 220, 0.26);
  border: 1px solid rgba(180, 180, 200, 0.38);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
  box-shadow: 0 2px 10px rgba(0,0,0,0.10);
  margin-top: 3px;
  z-index: 10;
}
.dark-mode .sg-expanded {
  background: rgba(30, 30, 50, 0.52);
  border-color: rgba(255,255,255,0.10);
}

/* Left/right sidebar: expanded container is a column */
.sg-expanded-left,
.sg-expanded-right {
  flex-direction: column;
}

/* Bottom sidebar: expanded container is a row, positioned above */
.sg-expanded-bottom {
  flex-direction: row;
  position: absolute;
  bottom: calc(100% + 4px);
  left: 50%;
  transform: translateX(-50%);
  margin-top: 0;
}

/* Member icon size: slightly smaller than standard for compact appearance */
.sg-member-btn .sidebar-icon.sg-member-icon {
  width: 32px;
  height: 32px;
  font-size: 0.88rem;
}
.sg-member-btn .sidebar-icon.sg-member-icon i {
  font-size: 0.88rem;
}

/* Drop-target glow: shown when a module is dragged over another to group them */
.sg-drop-target .sidebar-icon {
  box-shadow:
    0 0 0 2px #22c55e,
    0 0 14px 3px rgba(34, 197, 94, 0.55),
    inset 0 1px 0 rgba(255,255,255,0.22);
  border-color: #22c55e !important;
  transform: scale(1.10);
}

/* ── Group editor floating panel ── */
.sg-editor {
  position: fixed;
  z-index: 700;
  width: 230px;
  background: var(--cd);
  backdrop-filter: blur(48px) saturate(180%);
  -webkit-backdrop-filter: blur(48px) saturate(180%);
  border: 1px solid var(--cdl);
  border-radius: 16px;
  box-shadow: 0 16px 48px rgba(0,0,0,0.22), inset 0 1px 0 rgba(255,255,255,0.60);
  padding: 14px 14px 12px;
}
.sg-editor.dark-mode {
  background: var(--cd);
  border-color: rgba(255,255,255,0.11);
  box-shadow: 0 16px 48px rgba(0,0,0,0.65), inset 0 1px 0 rgba(255,255,255,0.06);
}

/* Position the editor near the relevant dock edge */
.sg-editor-left   { left: 68px;  top: 50%; transform: translateY(-50%); }
.sg-editor-right  { right: 68px; top: 50%; transform: translateY(-50%); }
.sg-editor-bottom { bottom: 68px; left: 50%; transform: translateX(-50%); }

.sg-editor-title {
  font-size: 0.65rem; font-weight: 700;
  color: var(--text); opacity: 0.50;
  margin: 0 0 10px; text-transform: uppercase; letter-spacing: 0.07em;
}

.sg-editor-label {
  display: block;
  font-size: 0.62rem; font-weight: 600;
  color: var(--text); opacity: 0.55;
  margin-bottom: 5px; text-transform: uppercase; letter-spacing: 0.05em;
}

.sg-editor-input {
  width: 100%;
  box-sizing: border-box;
  padding: 6px 10px;
  border-radius: 8px;
  border: 1px solid rgba(120,120,140,0.28);
  background: rgba(255,255,255,0.55);
  color: var(--text);
  font-size: 0.82rem;
  margin-bottom: 12px;
  outline: none;
  transition: border-color 0.15s, box-shadow 0.15s;
}
.sg-editor-input:focus {
  border-color: var(--primary);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--primary) 24%, transparent);
}
.dark-mode .sg-editor-input {
  background: rgba(30,30,50,0.60);
  border-color: rgba(255,255,255,0.14);
  color: var(--text);
}

/* Icon picker grid */
.sg-icon-picker {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 4px;
  margin-bottom: 12px;
}

.sg-icon-option {
  display: flex; align-items: center; justify-content: center;
  width: 34px; height: 34px;
  border-radius: 8px;
  border: 1px solid transparent;
  background: rgba(120,120,140,0.08);
  cursor: pointer;
  font-size: 0.88rem;
  color: var(--text);
  opacity: 0.65;
  transition: background 0.13s, opacity 0.13s, border-color 0.13s, transform 0.13s;
}
.sg-icon-option:hover {
  background: color-mix(in srgb, var(--primary) 14%, transparent);
  opacity: 1;
  transform: scale(1.10);
}
.sg-icon-option.sg-icon-selected {
  background: color-mix(in srgb, var(--primary) 28%, transparent);
  border-color: color-mix(in srgb, var(--primary) 55%, transparent);
  opacity: 1;
  color: var(--primary);
}

/* Editor action buttons */
.sg-editor-actions {
  display: flex;
  gap: 6px;
}
.sg-editor-save {
  flex: 1;
  padding: 6px 0;
  border-radius: 8px;
  border: none;
  background: var(--primary);
  color: #fff;
  font-size: 0.78rem;
  font-weight: 600;
  cursor: pointer;
  transition: opacity 0.15s, transform 0.15s;
}
.sg-editor-save:hover { opacity: 0.88; transform: translateY(-1px); }

.sg-editor-disband {
  flex: 1;
  padding: 6px 0;
  border-radius: 8px;
  border: 1px solid rgba(220,50,50,0.35);
  background: rgba(220,50,50,0.10);
  color: #e03535;
  font-size: 0.78rem;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s, transform 0.15s;
}
.sg-editor-disband:hover { background: rgba(220,50,50,0.20); transform: translateY(-1px); }
.dark-mode .sg-editor-disband { color: #f87171; border-color: rgba(248,113,113,0.30); background: rgba(248,113,113,0.08); }
.dark-mode .sg-editor-disband:hover { background: rgba(248,113,113,0.18); }

/* Member chips inside group editor */
.sg-member-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-bottom: 12px;
  min-height: 28px;
}
.sg-member-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 6px 3px 7px;
  border-radius: 12px;
  background: color-mix(in srgb, var(--primary) 14%, transparent);
  border: 1px solid color-mix(in srgb, var(--primary) 35%, transparent);
  font-size: 0.68rem;
  font-weight: 600;
  color: var(--text);
  white-space: nowrap;
}
.sg-chip-remove {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 0.75rem;
  line-height: 1;
  padding: 0 1px;
  color: inherit;
  opacity: 0.5;
  transition: opacity 0.12s;
}
.sg-chip-remove:hover { opacity: 1; color: #e03535; }

/* ══════════════════════════════════════════════════════════════════════
   MOBILE LAYOUT (≤ 820px — breakpoint must match matchMedia in script)
   ══════════════════════════════════════════════════════════════════════ */

.mobile-main {
  padding: calc(10px + env(safe-area-inset-top)) 0 calc(28px + env(safe-area-inset-bottom));
  padding-left: calc(14px + env(safe-area-inset-left));
  padding-right: calc(14px + env(safe-area-inset-right));
  gap: 12px;
}

/* ══ iPhone home hub ══ */
.hub { display: flex; flex-direction: column; gap: 16px; }
.hub-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.hub-greeting { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.hub-hi { font-size: 26px; font-weight: 700; color: var(--tx); letter-spacing: -0.02em; }
.hub-lab { font-size: 13px; color: var(--tx2); }
.hub-head-actions { display: flex; align-items: center; gap: 10px; flex: none; }
.hub-icon-btn { width: 44px; height: 44px; border-radius: 50%; background: var(--fl); color: var(--tx2); border: none; box-shadow: none; display: flex; align-items: center; justify-content: center; font-size: 1rem; cursor: pointer; }
.hub-avatar { width: 44px; height: 44px; font-size: 15px; }

.hub-timer .tbc { width: 100%; box-sizing: border-box; flex-wrap: wrap; border-radius: var(--r); }
.hub-search { width: 100%; max-width: none; margin: 0; padding: 13px 15px; font-size: 15px; }
.hub-label { font-size: 13px; font-weight: 700; color: var(--tx2); margin: 4px 2px -6px; }

/* Pinned — 2-column tiles */
.hub-pinned { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.hub-tile { position: relative; display: flex; flex-direction: column; align-items: flex-start; gap: 10px; padding: 15px; border-radius: var(--r); background: var(--cd); border: 1px solid var(--cdl); box-shadow: var(--sh); cursor: pointer; text-align: left; }
.hub-tile:hover { filter: none; }
.hub-tile-ic { width: 40px; height: 40px; border-radius: 11px; background: var(--acc); color: #fff; display: flex; align-items: center; justify-content: center; box-shadow: 0 3px 10px var(--acsh); }
.hub-tile-ic .sidebar-svg { width: 22px; height: 22px; }
.hub-tile-label { font-size: 14px; font-weight: 600; color: var(--tx); }
.hub-tile-alpha { font-size: 10px; font-weight: 700; color: var(--wr); background: var(--wrs); border-radius: 8px; padding: 1px 6px; }

/* All modules — 4-column icon grid (50px tiles, 11px labels) */
.hub-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px 4px; }
.hub-cell { position: relative; display: flex; flex-direction: column; align-items: center; gap: 7px; padding: 8px 2px; background: transparent; border: none; box-shadow: none; cursor: pointer; }
.hub-cell:hover { filter: none; }
.hub-cell-ic { width: 50px; height: 50px; border-radius: 14px; background: var(--fl); color: var(--acc); display: flex; align-items: center; justify-content: center; }
.hub-cell-ic .sidebar-svg { width: 24px; height: 24px; }
.hub-cell-label { font-size: 11px; font-weight: 500; color: var(--tx2); text-align: center; line-height: 1.2; max-width: 72px; }

.hub-pin { position: absolute; top: 4px; right: 6px; font-size: 12px; line-height: 1; color: var(--tx3); opacity: .45; padding: 4px; }
.hub-pin.is-pinned { color: var(--acc); opacity: 1; }
.hub-tile .hub-pin { top: 11px; right: 11px; font-size: 15px; }
.alpha-badge--hub { top: 4px; left: calc(50% - 26px); }

/* Module full-screen back button */
.mob-back { display: inline-flex; align-items: center; gap: 5px; height: 40px; padding: 0 15px 0 9px; margin-bottom: 12px; border-radius: var(--rc); background: var(--cd); backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px); border: 1px solid var(--cdl); color: var(--tx); font-size: 14px; font-weight: 600; box-shadow: none; cursor: pointer; }
.mob-back:hover { filter: none; }

/* ── Sticky frosted top bar ── */
.mobile-top-bar {
  flex-wrap: wrap; row-gap: 8px;
  position: sticky;
  top: 0;
  z-index: 400;
  margin: -10px calc(-12px - env(safe-area-inset-right)) 0 calc(-12px - env(safe-area-inset-left));
  padding: calc(10px + env(safe-area-inset-top)) calc(12px + env(safe-area-inset-right)) 10px calc(12px + env(safe-area-inset-left));
  background: var(--ch);
  backdrop-filter: blur(32px) saturate(180%);
  -webkit-backdrop-filter: blur(32px) saturate(180%);
  border-bottom: 1px solid var(--chl);
}
.dark-mode .mobile-top-bar {
  background: var(--ch);
  border-bottom-color: rgba(255,255,255,0.07);
}

/* Compact identity chip + icon-only logout */
.mobile-top-bar .user-info {
  min-width: 0; flex: 1;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  justify-content: flex-end;
  font-size: 0.82rem;
}
.mobile-ui .logout-label { display: none; }

/* Time-tracker pill: allow its controls to wrap instead of overflowing the viewport */
.mobile-top-bar .tbc { flex-wrap: wrap; max-width: 100%; border-radius: 14px; }

/* Same container as .grid-module so the @container card-header rules apply */
.mobile-module { container-type: inline-size; }
.mobile-module .card { margin-bottom: 16px; }

/* ── Bottom tab bar ── */
.mobile-nav {
  position: fixed;
  left: 0; right: 0; bottom: 0;
  z-index: 500;
  display: flex;
  align-items: flex-start;
  gap: 2px;
  overflow-x: auto; overflow-y: hidden;
  -webkit-overflow-scrolling: touch;
  padding: 8px calc(8px + env(safe-area-inset-right)) calc(8px + env(safe-area-inset-bottom)) calc(8px + env(safe-area-inset-left));
  background: var(--ch);
  backdrop-filter: blur(40px) saturate(180%);
  -webkit-backdrop-filter: blur(40px) saturate(180%);
  border-top: 1px solid var(--chl);
  box-shadow: 0 -6px 30px rgba(0,0,0,0.12);
  scrollbar-width: none;
}
.mobile-nav::-webkit-scrollbar { display: none; }
.dark-mode .mobile-nav {
  background: var(--ch);
  border-top-color: rgba(255,255,255,0.08);
  box-shadow: 0 -6px 30px rgba(0,0,0,0.50);
}

.mobile-nav-btn {
  display: flex; flex-direction: column; align-items: center; gap: 3px;
  background: transparent; border: none; box-shadow: none;
  padding: 2px 4px;
  flex-shrink: 0;
  min-width: 58px;
  position: relative;
  text-transform: none; letter-spacing: 0;
  -webkit-tap-highlight-color: transparent;
  touch-action: manipulation;
}
/* Anchor the alpha badge to the centered 40px icon's top-left corner */
.mobile-nav-btn .alpha-badge--nav { top: -2px; left: calc(50% - 24px); }
.mobile-nav-btn:hover { filter: none; }

.mobile-nav-icon { width: 40px; height: 40px; }
.mobile-nav-btn:not(.is-current) .mobile-nav-icon { opacity: 0.42; filter: saturate(0.4); }
.mobile-nav-btn.is-current .mobile-nav-icon {
  transform: translateY(-3px) scale(1.06);
  box-shadow: 0 8px 18px rgba(0,0,0,0.24), inset 0 1px 0 rgba(255,255,255,0.26);
}

.mobile-nav-label {
  font-size: 0.56rem; font-weight: 600;
  color: var(--text); opacity: 0.60;
  max-width: 62px;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.mobile-nav-btn.is-current .mobile-nav-label { opacity: 1; color: var(--primary); }
</style>
